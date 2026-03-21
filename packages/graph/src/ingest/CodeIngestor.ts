import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, GraphEdge, IngestResult } from '../types.js';

/**
 * Ingests TypeScript/JavaScript files into the graph via regex-based parsing.
 * Future: upgrade to tree-sitter for full AST parsing.
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

        // Extract symbols (functions, classes, interfaces, methods, variables)
        const symbols = this.extractSymbols(content, fileId, relativePath);
        for (const { node, edge } of symbols) {
          this.store.addNode(node);
          this.store.addEdge(edge);
          nodesAdded++;
          edgesAdded++;

          // Track callables for the calls-edge pass
          if (node.type === 'function' || node.type === 'method') {
            let files = nameToFiles.get(node.name);
            if (!files) {
              files = new Set<string>();
              nameToFiles.set(node.name, files);
            }
            files.add(relativePath);
          }
        }

        // Extract imports
        const imports = await this.extractImports(content, fileId, relativePath, rootDir);
        for (const edge of imports) {
          this.store.addEdge(edge);
          edgesAdded++;
        }
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

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async findSourceFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
        results.push(...(await this.findSourceFiles(fullPath)));
      } else if (
        entry.isFile() &&
        /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts')
      ) {
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

    // Track class context for method extraction
    let currentClassName: string | null = null;
    let currentClassId: string | null = null;
    let braceDepth = 0;
    let insideClass = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Functions: export function name(
      const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (fnMatch) {
        const name = fnMatch[1]!;
        const id = `function:${relativePath}:${name}`;
        const endLine = this.findClosingBrace(lines, i);
        results.push({
          node: {
            id,
            type: 'function',
            name,
            path: relativePath,
            location: { fileId, startLine: i + 1, endLine },
            metadata: {
              exported: line.includes('export'),
              cyclomaticComplexity: this.computeCyclomaticComplexity(lines.slice(i, endLine)),
              nestingDepth: this.computeMaxNesting(lines.slice(i, endLine)),
              lineCount: endLine - i,
              parameterCount: this.countParameters(line),
            },
          },
          edge: { from: fileId, to: id, type: 'contains' },
        });
        // A top-level function resets class context
        if (!insideClass) {
          currentClassName = null;
          currentClassId = null;
        }
        continue;
      }

      // Classes: export class Name
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1]!;
        const id = `class:${relativePath}:${name}`;
        const endLine = this.findClosingBrace(lines, i);
        results.push({
          node: {
            id,
            type: 'class',
            name,
            path: relativePath,
            location: { fileId, startLine: i + 1, endLine },
            metadata: { exported: line.includes('export') },
          },
          edge: { from: fileId, to: id, type: 'contains' },
        });
        // Enter class context
        currentClassName = name;
        currentClassId = id;
        insideClass = true;
        braceDepth = 0;
        // Count braces on the class declaration line itself
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        continue;
      }

      // Interfaces: export interface Name
      const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (ifaceMatch) {
        const name = ifaceMatch[1]!;
        const id = `interface:${relativePath}:${name}`;
        const endLine = this.findClosingBrace(lines, i);
        results.push({
          node: {
            id,
            type: 'interface',
            name,
            path: relativePath,
            location: { fileId, startLine: i + 1, endLine },
            metadata: { exported: line.includes('export') },
          },
          edge: { from: fileId, to: id, type: 'contains' },
        });
        // An interface resets class context
        currentClassName = null;
        currentClassId = null;
        insideClass = false;
        continue;
      }

      // Track brace depth for class context
      if (insideClass) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        if (braceDepth <= 0) {
          currentClassName = null;
          currentClassId = null;
          insideClass = false;
          continue;
        }
      }

      // Methods: indented lines inside a class that look like method declarations
      if (insideClass && currentClassName && currentClassId) {
        const methodMatch = line.match(
          /^\s+(?:(?:public|private|protected|readonly|static|abstract)\s+)*(?:async\s+)?(\w+)\s*\(/
        );
        if (methodMatch) {
          const methodName = methodMatch[1]!;
          // Skip constructor and common non-method patterns
          if (
            methodName === 'constructor' ||
            methodName === 'if' ||
            methodName === 'for' ||
            methodName === 'while' ||
            methodName === 'switch'
          )
            continue;
          const id = `method:${relativePath}:${currentClassName}.${methodName}`;
          const endLine = this.findClosingBrace(lines, i);
          results.push({
            node: {
              id,
              type: 'method',
              name: methodName,
              path: relativePath,
              location: { fileId, startLine: i + 1, endLine },
              metadata: {
                className: currentClassName,
                exported: false,
                cyclomaticComplexity: this.computeCyclomaticComplexity(lines.slice(i, endLine)),
                nestingDepth: this.computeMaxNesting(lines.slice(i, endLine)),
                lineCount: endLine - i,
                parameterCount: this.countParameters(line),
              },
            },
            edge: { from: currentClassId, to: id, type: 'contains' },
          });
        }
        continue;
      }

      // Variables: exported constants/variables at the top level
      const varMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        const name = varMatch[1]!;
        const id = `variable:${relativePath}:${name}`;
        results.push({
          node: {
            id,
            type: 'variable',
            name,
            path: relativePath,
            location: { fileId, startLine: i + 1, endLine: i + 1 },
            metadata: { exported: line.includes('export') },
          },
          edge: { from: fileId, to: id, type: 'contains' },
        });
      }
    }

    return results;
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
    const edges: GraphEdge[] = [];
    const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]!;

      // Only resolve relative imports
      if (!importPath.startsWith('.')) continue;

      const resolvedPath = await this.resolveImportPath(relativePath, importPath, rootDir);
      if (resolvedPath) {
        const targetId = `file:${resolvedPath}`;
        const isTypeOnly = match[0]!.includes('import type');
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

  private async resolveImportPath(
    fromFile: string,
    importPath: string,
    rootDir: string
  ): Promise<string | null> {
    const fromDir = path.dirname(fromFile);
    const resolved = path.normalize(path.join(fromDir, importPath)).replace(/\\/g, '/');

    // Try with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
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
    for (const ext of extensions) {
      const candidate = path.join(resolved, `index${ext}`).replace(/\\/g, '/');
      const fullPath = path.join(rootDir, candidate);
      try {
        await fs.access(fullPath);
        return candidate;
      } catch {
        // File does not exist, try next
      }
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
    return 'unknown';
  }
}
