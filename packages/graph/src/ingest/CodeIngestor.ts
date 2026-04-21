import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, GraphEdge, IngestResult } from '../types.js';

interface ClassContext {
  className: string | null;
  classId: string | null;
  insideClass: boolean;
  braceDepth: number;
}

const SKIP_METHOD_NAMES = new Set(['constructor', 'if', 'for', 'while', 'switch']);

/**
 * Regex patterns for extracting symbols by language.
 * Using lookup tables to keep cyclomatic complexity low.
 */
const FUNCTION_PATTERNS: Record<string, RegExp> = {
  python: /^def\s+(\w+)\s*\(/,
  go: /^func\s+(\w+)\s*[[(]/,
  rust: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
  typescript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  javascript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
};

const CLASS_PATTERNS: Record<string, RegExp> = {
  python: /^class\s+(\w+)/,
  go: /^type\s+(\w+)\s+struct\b/,
  rust: /^(?:pub\s+)?struct\s+(\w+)/,
  java: /(?:public|private|protected)?\s*(?:abstract\s+|final\s+)?class\s+(\w+)/,
  typescript: /(?:export\s+)?class\s+(\w+)/,
  javascript: /(?:export\s+)?class\s+(\w+)/,
};

const INTERFACE_PATTERNS: Record<string, RegExp> = {
  go: /^type\s+(\w+)\s+interface\b/,
  rust: /^(?:pub\s+)?trait\s+(\w+)/,
  java: /(?:public\s+)?interface\s+(\w+)/,
  typescript: /(?:export\s+)?interface\s+(\w+)/,
  javascript: /(?:export\s+)?interface\s+(\w+)/,
};

const METHOD_PATTERNS: Record<string, RegExp> = {
  python: /^\s+def\s+(\w+)\s*\(/,
  rust: /^\s+(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
  java: /^\s+(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/,
  typescript:
    /^\s+(?:(?:public|private|protected|readonly|static|abstract)\s+)*(?:async\s+)?(\w+)\s*\(/,
  javascript:
    /^\s+(?:(?:public|private|protected|readonly|static|abstract)\s+)*(?:async\s+)?(\w+)\s*\(/,
};

// Go receiver methods are matched separately (different capture groups)
const GO_METHOD_PATTERN = /^func\s+\(\w+\s+\*?(\w+)\)\s+(\w+)\s*\(/;

const VARIABLE_PATTERNS: Record<string, RegExp> = {
  python: /^([A-Z]\w*)\s*=/,
  go: /^(?:var|const)\s+(\w+)/,
  rust: /^(?:pub\s+)?(?:const|static)\s+(\w+)/,
  typescript: /(?:export\s+)?(?:const|let|var)\s+(\w+)/,
  javascript: /(?:export\s+)?(?:const|let|var)\s+(\w+)/,
};

/**
 * Determine if a symbol is exported based on language conventions.
 */
function isExported(lang: string, line: string, name: string): boolean {
  if (lang === 'go') return /^[A-Z]/.test(name);
  if (lang === 'rust') return /^\s*pub\b/.test(line);
  if (lang === 'java') return /\bpublic\b/.test(line);
  return line.includes('export');
}

function countBraces(line: string): number {
  let net = 0;
  for (const ch of line) {
    if (ch === '{') net++;
    else if (ch === '}') net--;
  }
  return net;
}

/**
 * Supported source file extensions for multi-language ingestion.
 */
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java']);

const SKIP_EXTENSIONS = new Set(['.d.ts']);

function isSupportedSourceFile(name: string): boolean {
  if (SKIP_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) return false;
  const ext = name.slice(name.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * Ingests source files into the graph via regex-based parsing.
 * Supports TypeScript, JavaScript, Python, Go, Rust, and Java.
 */
export class CodeIngestor {
  constructor(private readonly store: GraphStore) {}

  async ingest(rootDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const files = await this.findSourceFiles(rootDir);

    // Track callable names → defining files for the calls-edge pass
    const nameToFiles = new Map<string, Set<string>>();
    const fileContents: Map<string, string> = new Map();

    for (const filePath of files) {
      try {
        const result = await this.processFile(filePath, rootDir, nameToFiles, fileContents);
        nodesAdded += result.nodesAdded;
        edgesAdded += result.edgesAdded;
      } catch (err) {
        errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Second pass: extract calls edges
    const callsEdges = this.extractCallsEdges(nameToFiles, fileContents);
    for (const edge of callsEdges) {
      this.store.addEdge(edge);
      edgesAdded++;
    }

    // Third pass: extract @req annotations and create verified_by edges
    edgesAdded += this.extractReqAnnotations(fileContents, rootDir);

    // Release source file contents to free memory before graph serialization
    fileContents.clear();

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async processFile(
    filePath: string,
    rootDir: string,
    nameToFiles: Map<string, Set<string>>,
    fileContents: Map<string, string>
  ): Promise<{ nodesAdded: number; edgesAdded: number }> {
    let nodesAdded = 0;
    let edgesAdded = 0;

    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = await fs.readFile(filePath, 'utf-8');
    const stat = await fs.stat(filePath);
    const fileId = `file:${relativePath}`;

    fileContents.set(relativePath, content);

    // Add file node
    const fileNode: GraphNode = {
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
      metadata: { language: this.detectLanguage(filePath) },
      lastModified: stat.mtime.toISOString(),
    };
    this.store.addNode(fileNode);
    nodesAdded++;

    // Extract symbols and track callables
    const symbols = this.extractSymbols(content, fileId, relativePath);
    for (const { node, edge } of symbols) {
      this.store.addNode(node);
      this.store.addEdge(edge);
      nodesAdded++;
      edgesAdded++;
      this.trackCallable(node, relativePath, nameToFiles);
    }

    // Extract imports
    const imports = await this.extractImports(content, fileId, relativePath, rootDir);
    for (const edge of imports) {
      this.store.addEdge(edge);
      edgesAdded++;
    }

    return { nodesAdded, edgesAdded };
  }

  private trackCallable(
    node: GraphNode,
    relativePath: string,
    nameToFiles: Map<string, Set<string>>
  ): void {
    if (node.type !== 'function' && node.type !== 'method') return;
    let files = nameToFiles.get(node.name);
    if (!files) {
      files = new Set<string>();
      nameToFiles.set(node.name, files);
    }
    files.add(relativePath);
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        results.push(...(await this.findSourceFiles(fullPath)));
      } else if (entry.isFile() && isSupportedSourceFile(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private extractSymbols(
    content: string,
    fileId: string,
    relativePath: string
  ): Array<{ node: GraphNode; edge: GraphEdge }> {
    const results: Array<{ node: GraphNode; edge: GraphEdge }> = [];
    const lines = content.split('\n');
    const lang = this.detectLanguage(relativePath);
    const ctx: ClassContext = { className: null, classId: null, insideClass: false, braceDepth: 0 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      this.processSymbolLine(line, lines, i, fileId, relativePath, ctx, results, lang);
    }

    return results;
  }

  private processSymbolLine(
    line: string,
    lines: string[],
    i: number,
    fileId: string,
    relativePath: string,
    ctx: ClassContext,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): void {
    if (lang === 'python') {
      this.updatePythonClassContext(lines, i, ctx);
    }

    if (this.tryExtractFunction(line, lines, i, fileId, relativePath, ctx, results, lang)) return;
    if (this.tryExtractClass(line, lines, i, fileId, relativePath, ctx, results, lang)) return;
    if (this.tryExtractInterface(line, lines, i, fileId, relativePath, ctx, results, lang)) return;
    if (this.tryEnterImplBlock(line, lang, relativePath, ctx)) return;
    if (lang !== 'python' && this.updateClassContext(line, ctx)) return;
    if (this.tryExtractMethod(line, lines, i, fileId, relativePath, ctx, results, lang)) return;
    if (ctx.insideClass) return;
    this.tryExtractVariable(line, i, fileId, relativePath, results, lang);
  }

  private matchFunction(line: string, lang: string): RegExpMatchArray | null {
    if (lang === 'java') return null; // Java functions are always methods inside classes
    const pattern = FUNCTION_PATTERNS[lang];
    return pattern ? line.match(pattern) : null;
  }

  private tryExtractFunction(
    line: string,
    lines: string[],
    i: number,
    fileId: string,
    relativePath: string,
    ctx: ClassContext,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): boolean {
    if (ctx.insideClass) return false;
    const fnMatch = this.matchFunction(line, lang);
    if (!fnMatch) return false;
    const name = fnMatch[1]!;
    const id = `function:${relativePath}:${name}`;
    const endLine =
      lang === 'python' ? this.findEndOfIndentBlock(lines, i) : this.findClosingBrace(lines, i);
    const exported = isExported(lang, line, name);
    results.push({
      node: {
        id,
        type: 'function',
        name,
        path: relativePath,
        location: { fileId, startLine: i + 1, endLine },
        metadata: {
          exported,
          cyclomaticComplexity: this.computeCyclomaticComplexity(lines.slice(i, endLine)),
          nestingDepth: this.computeMaxNesting(lines.slice(i, endLine)),
          lineCount: endLine - i,
          parameterCount: this.countParameters(line),
        },
      },
      edge: { from: fileId, to: id, type: 'contains' },
    });
    if (!ctx.insideClass) {
      ctx.className = null;
      ctx.classId = null;
    }
    return true;
  }

  private matchClass(line: string, lang: string): RegExpMatchArray | null {
    const pattern = CLASS_PATTERNS[lang];
    return pattern ? line.match(pattern) : null;
  }

  private tryExtractClass(
    line: string,
    lines: string[],
    i: number,
    fileId: string,
    relativePath: string,
    ctx: ClassContext,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): boolean {
    const classMatch = this.matchClass(line, lang);
    if (!classMatch) return false;
    const name = classMatch[1]!;
    const id = `class:${relativePath}:${name}`;
    const endLine =
      lang === 'python' ? this.findEndOfIndentBlock(lines, i) : this.findClosingBrace(lines, i);
    const exported = isExported(lang, line, name);
    results.push({
      node: {
        id,
        type: 'class',
        name,
        path: relativePath,
        location: { fileId, startLine: i + 1, endLine },
        metadata: { exported },
      },
      edge: { from: fileId, to: id, type: 'contains' },
    });
    ctx.className = name;
    ctx.classId = id;
    ctx.insideClass = true;
    ctx.braceDepth = lang === 'python' ? 1 : countBraces(line);
    return true;
  }

  private matchInterface(line: string, lang: string): RegExpMatchArray | null {
    const pattern = INTERFACE_PATTERNS[lang];
    return pattern ? line.match(pattern) : null;
  }

  private tryExtractInterface(
    line: string,
    lines: string[],
    i: number,
    fileId: string,
    relativePath: string,
    ctx: ClassContext,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): boolean {
    const ifaceMatch = this.matchInterface(line, lang);
    if (!ifaceMatch) return false;
    const name = ifaceMatch[1]!;
    const id = `interface:${relativePath}:${name}`;
    const endLine = this.findClosingBrace(lines, i);
    const exported = isExported(lang, line, name);
    results.push({
      node: {
        id,
        type: 'interface',
        name,
        path: relativePath,
        location: { fileId, startLine: i + 1, endLine },
        metadata: { exported },
      },
      edge: { from: fileId, to: id, type: 'contains' },
    });
    ctx.className = null;
    ctx.classId = null;
    ctx.insideClass = false;
    return true;
  }

  /**
   * Enter an impl block (Rust) or Java class body — sets class context without creating a node.
   */
  private tryEnterImplBlock(
    line: string,
    lang: string,
    relativePath: string,
    ctx: ClassContext
  ): boolean {
    if (lang === 'rust') {
      const implMatch = line.match(/^impl(?:<[^>]*>)?\s+(\w+)/);
      if (implMatch) {
        const name = implMatch[1]!;
        ctx.className = name;
        ctx.classId = `class:${relativePath}:${name}`;
        ctx.insideClass = true;
        ctx.braceDepth = countBraces(line);
        return true;
      }
    }
    return false;
  }

  /** Update brace tracking; returns true when line is consumed (class ended or tracked). */
  private updateClassContext(line: string, ctx: ClassContext): boolean {
    if (!ctx.insideClass) return false;
    ctx.braceDepth += countBraces(line);
    if (ctx.braceDepth <= 0) {
      ctx.className = null;
      ctx.classId = null;
      ctx.insideClass = false;
      return true;
    }
    return false;
  }

  private matchMethod(line: string, lang: string, insideClass: boolean): RegExpMatchArray | null {
    // Go receiver methods are top-level, not inside a class
    if (lang === 'go') return line.match(GO_METHOD_PATTERN);
    // All other languages require being inside a class/impl context
    if (!insideClass) return null;
    const pattern = METHOD_PATTERNS[lang];
    return pattern ? line.match(pattern) : null;
  }

  private tryExtractMethod(
    line: string,
    lines: string[],
    i: number,
    fileId: string,
    relativePath: string,
    ctx: ClassContext,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): boolean {
    const methodMatch = this.matchMethod(line, lang, ctx.insideClass);
    if (!methodMatch) return false;

    // Go methods have receiver type and method name in different capture groups
    let methodName: string;
    let className: string | null;
    let classId: string | null;

    if (lang === 'go') {
      const receiverType = methodMatch[1]!;
      methodName = methodMatch[2]!;
      className = receiverType;
      classId = `class:${relativePath}:${receiverType}`;
    } else {
      if (!ctx.insideClass || !ctx.className || !ctx.classId) return false;
      methodName = methodMatch[1]!;
      className = ctx.className;
      classId = ctx.classId;
    }

    if (SKIP_METHOD_NAMES.has(methodName)) return false;
    const id = `method:${relativePath}:${className}.${methodName}`;
    const endLine =
      lang === 'python' ? this.findEndOfIndentBlock(lines, i) : this.findClosingBrace(lines, i);
    results.push({
      node: {
        id,
        type: 'method',
        name: methodName,
        path: relativePath,
        location: { fileId, startLine: i + 1, endLine },
        metadata: {
          className,
          exported: isExported(lang, line, methodName),
          cyclomaticComplexity: this.computeCyclomaticComplexity(lines.slice(i, endLine)),
          nestingDepth: this.computeMaxNesting(lines.slice(i, endLine)),
          lineCount: endLine - i,
          parameterCount: this.countParameters(line),
        },
      },
      edge: { from: classId, to: id, type: 'contains' },
    });
    return true;
  }

  private matchVariable(line: string, lang: string): RegExpMatchArray | null {
    const pattern = VARIABLE_PATTERNS[lang];
    return pattern ? line.match(pattern) : null;
  }

  private tryExtractVariable(
    line: string,
    i: number,
    fileId: string,
    relativePath: string,
    results: Array<{ node: GraphNode; edge: GraphEdge }>,
    lang: string
  ): void {
    const varMatch = this.matchVariable(line, lang);
    if (!varMatch) return;
    const name = varMatch[1]!;
    const id = `variable:${relativePath}:${name}`;
    const exported = isExported(lang, line, name);
    results.push({
      node: {
        id,
        type: 'variable',
        name,
        path: relativePath,
        location: { fileId, startLine: i + 1, endLine: i + 1 },
        metadata: { exported },
      },
      edge: { from: fileId, to: id, type: 'contains' },
    });
  }

  /**
   * Find the closing brace for a construct starting at the given line.
   * Uses a simple brace-counting heuristic. Returns 1-indexed line number.
   */
  private findClosingBrace(lines: string[], startIndex: number): number {
    let depth = 0;
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i]!;
      for (const ch of line) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0 && i > startIndex) {
        return i + 1; // 1-indexed
      }
      // If we found braces and they balanced on the start line
      if (depth === 0 && i === startIndex) {
        // Check if there were any braces at all
        if (line.includes('{')) {
          return i + 1;
        }
      }
    }
    // Fallback: if no closing brace found, return startLine
    // NOTE: endLine == startLine is a known limitation for constructs without braces
    return startIndex + 1;
  }

  /**
   * Find the end of an indentation-based block (Python).
   * The block ends when a subsequent non-empty line has indentation <= the starting line.
   */
  private findEndOfIndentBlock(lines: string[], startIndex: number): number {
    const startLine = lines[startIndex] ?? '';
    const baseIndent = startLine.search(/\S/);
    let lastNonEmpty = startIndex;

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === '') continue; // skip blank lines
      const indent = line.search(/\S/);
      if (indent <= baseIndent) {
        return lastNonEmpty + 1; // 1-indexed
      }
      lastNonEmpty = i;
    }
    return lastNonEmpty + 1;
  }

  /**
   * Update class context for Python using indentation tracking.
   */
  private updatePythonClassContext(lines: string[], i: number, ctx: ClassContext): boolean {
    if (!ctx.insideClass) return false;
    const line = lines[i]!;
    if (line.trim() === '') return false; // blank lines don't end blocks
    // Check if this non-empty line is back at the class-level indentation (i.e., not indented)
    const indent = line.search(/\S/);
    if (indent <= 0) {
      ctx.className = null;
      ctx.classId = null;
      ctx.insideClass = false;
      return false; // don't consume the line — it may be a new declaration
    }
    return false; // inside class, don't consume — let method/function extractors try
  }

  /**
   * Second pass: scan each file for identifiers matching known callable names,
   * then create file-to-file "calls" edges. Uses regex heuristic (not AST).
   */
  private extractCallsEdges(
    nameToFiles: ReadonlyMap<string, ReadonlySet<string>>,
    fileContents: Map<string, string>
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();

    for (const [filePath, content] of fileContents) {
      const callerFileId = `file:${filePath}`;
      const callPattern = /\b([a-zA-Z_$][\w$]*)\s*\(/g;
      let match: RegExpExecArray | null;

      while ((match = callPattern.exec(content)) !== null) {
        const name = match[1]!;
        const targetFiles = nameToFiles.get(name);
        if (!targetFiles) continue;

        for (const targetFile of targetFiles) {
          if (targetFile === filePath) continue;
          const targetFileId = `file:${targetFile}`;
          const key = `${callerFileId}|${targetFileId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push({
            from: callerFileId,
            to: targetFileId,
            type: 'calls',
            metadata: { confidence: 'regex' },
          });
        }
      }
    }

    return edges;
  }

  private async extractImports(
    content: string,
    fileId: string,
    relativePath: string,
    rootDir: string
  ): Promise<GraphEdge[]> {
    const lang = this.detectLanguage(relativePath);
    const edges: GraphEdge[] = [];

    const importPaths = this.extractImportPaths(content, lang);
    for (const { importPath, isTypeOnly } of importPaths) {
      // Only resolve relative imports for TS/JS; all imports for other languages
      if ((lang === 'typescript' || lang === 'javascript') && !importPath.startsWith('.')) continue;

      const resolvedPath = await this.resolveImportPath(relativePath, importPath, rootDir);
      if (resolvedPath) {
        const targetId = `file:${resolvedPath}`;
        edges.push({
          from: fileId,
          to: targetId,
          type: 'imports',
          metadata: { importType: isTypeOnly ? 'type-only' : 'static' },
        });
      }
    }

    return edges;
  }

  private extractImportPaths(
    content: string,
    lang: string
  ): Array<{ importPath: string; isTypeOnly: boolean }> {
    const results: Array<{ importPath: string; isTypeOnly: boolean }> = [];

    if (lang === 'typescript' || lang === 'javascript') {
      const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        results.push({
          importPath: match[1]!,
          isTypeOnly: match[0]!.includes('import type'),
        });
      }
    } else if (lang === 'python') {
      // from X import Y  or  import X
      const fromImport = /(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;
      let match: RegExpExecArray | null;
      while ((match = fromImport.exec(content)) !== null) {
        const importPath = (match[1] ?? match[2])!;
        // Convert dotted to relative path for local imports
        if (importPath.startsWith('.')) {
          results.push({ importPath, isTypeOnly: false });
        } else {
          results.push({ importPath: importPath.replace(/\./g, '/'), isTypeOnly: false });
        }
      }
    } else if (lang === 'go') {
      const goImport = /"([^"]+)"/g;
      let match: RegExpExecArray | null;
      while ((match = goImport.exec(content)) !== null) {
        results.push({ importPath: match[1]!, isTypeOnly: false });
      }
    } else if (lang === 'rust') {
      const useDecl = /use\s+((?:crate|super|self)(?:::\w+)+)/g;
      let match: RegExpExecArray | null;
      while ((match = useDecl.exec(content)) !== null) {
        results.push({ importPath: match[1]!, isTypeOnly: false });
      }
    } else if (lang === 'java') {
      const javaImport = /import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/g;
      let match: RegExpExecArray | null;
      while ((match = javaImport.exec(content)) !== null) {
        results.push({ importPath: match[1]!, isTypeOnly: false });
      }
    }

    return results;
  }

  private async resolveImportPath(
    fromFile: string,
    importPath: string,
    rootDir: string
  ): Promise<string | null> {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, importPath)).replace(/\\/g, '/');

    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
    for (const ext of extensions) {
      const candidate = resolved.replace(/\.js$/, '') + ext;
      const fullPath = path.join(rootDir, candidate);
      try {
        await fs.access(fullPath);
        return candidate;
      } catch {
        // File does not exist, try next
      }
    }

    // Try as directory with index
    const indexExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of indexExtensions) {
      const candidate = path.join(resolved, `index${ext}`).replace(/\\/g, '/');
      const fullPath = path.join(rootDir, candidate);
      try {
        await fs.access(fullPath);
        return candidate;
      } catch {
        // File does not exist, try next
      }
    }

    // Try as directory with __init__.py (Python)
    const pyInit = path.join(resolved, '__init__.py').replace(/\\/g, '/');
    try {
      await fs.access(path.join(rootDir, pyInit));
      return pyInit;
    } catch {
      // Not found
    }

    return null;
  }

  private computeCyclomaticComplexity(lines: string[]): number {
    let complexity = 1;
    const decisionPattern = /\b(if|else\s+if|while|for|case)\b|\?\s*[^:?]|&&|\|\||catch\b/g;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const matches = trimmed.match(decisionPattern);
      if (matches) complexity += matches.length;
    }
    return complexity;
  }

  private computeMaxNesting(lines: string[]): number {
    let maxDepth = 0;
    let currentDepth = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      for (const ch of trimmed) {
        if (ch === '{') {
          currentDepth++;
          if (currentDepth > maxDepth) maxDepth = currentDepth;
        } else if (ch === '}') {
          currentDepth--;
        }
      }
    }
    return Math.max(0, maxDepth - 1);
  }

  private countParameters(declarationLine: string): number {
    const parenMatch = declarationLine.match(/\(([^)]*)\)/);
    if (!parenMatch || !parenMatch[1]!.trim()) return 0;
    let depth = 0;
    let count = 1;
    for (const ch of parenMatch[1]!) {
      if (ch === '<' || ch === '(') depth++;
      else if (ch === '>' || ch === ')') depth--;
      else if (ch === ',' && depth === 0) count++;
    }
    return count;
  }

  private detectLanguage(filePath: string): string {
    if (/\.tsx?$/.test(filePath)) return 'typescript';
    if (/\.jsx?$/.test(filePath)) return 'javascript';
    if (/\.py$/.test(filePath)) return 'python';
    if (/\.go$/.test(filePath)) return 'go';
    if (/\.rs$/.test(filePath)) return 'rust';
    if (/\.java$/.test(filePath)) return 'java';
    return 'unknown';
  }

  /**
   * Scan file contents for @req annotations and create verified_by edges
   * linking requirement nodes to the annotated files.
   * Format: // @req <feature-name>#<index>
   */
  private extractReqAnnotations(fileContents: Map<string, string>, rootDir: string): number {
    // Matches // @req, # @req (Python), and /* @req */ style comments
    const REQ_TAG = /(?:\/\/|#|\/\*)\s*@req\s+([\w-]+)#(\d+)/g;
    const reqNodes = this.store.findNodes({ type: 'requirement' });
    let edgesAdded = 0;

    for (const [filePath, content] of fileContents) {
      let match: RegExpExecArray | null;
      REQ_TAG.lastIndex = 0;

      while ((match = REQ_TAG.exec(content)) !== null) {
        const featureName = match[1]!;
        const reqIndex = parseInt(match[2]!, 10);

        // Find the matching requirement node by featureName and index
        const reqNode = reqNodes.find(
          (n) => n.metadata.featureName === featureName && n.metadata.index === reqIndex
        );

        if (!reqNode) {
          console.warn(
            `@req annotation references non-existent requirement: ${featureName}#${reqIndex} in ${filePath}`
          );
          continue;
        }

        // Create the file node ID matching the convention used by processFile
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
        const fileNodeId = `file:${relPath}`;

        this.store.addEdge({
          from: reqNode.id,
          to: fileNodeId,
          type: 'verified_by',
          confidence: 1.0,
          metadata: {
            method: 'annotation',
            tag: `@req ${featureName}#${reqIndex}`,
            confidence: 1.0,
          },
        });
        edgesAdded++;
      }
    }

    return edgesAdded;
  }
}
