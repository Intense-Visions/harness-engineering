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

    // Track all function/method nodes and file contents for calls-edge pass
    const callableNodes: Array<{ id: string; name: string; filePath: string }> = [];
    const fileContents: Map<string, string> = new Map();

    for (const filePath of files) {
      try {
        const relativePath = path.relative(rootDir, filePath);
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
            callableNodes.push({ id: node.id, name: node.name, filePath: relativePath });
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
    const callsEdges = this.extractCallsEdges(callableNodes, fileContents);
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
            metadata: { exported: line.includes('export') },
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
              metadata: { className: currentClassName, exported: false },
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
   * Second pass: for each function/method, check if its file content calls any other
   * known function/method. Creates approximate "calls" edges via regex matching.
   */
  private extractCallsEdges(
    callableNodes: Array<{ id: string; name: string; filePath: string }>,
    fileContents: Map<string, string>
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Build a map of function names to their node IDs (may have duplicates across files)
    const nameToNodes = new Map<string, Array<{ id: string; filePath: string }>>();
    for (const callable of callableNodes) {
      let arr = nameToNodes.get(callable.name);
      if (!arr) {
        arr = [];
        nameToNodes.set(callable.name, arr);
      }
      arr.push({ id: callable.id, filePath: callable.filePath });
    }

    // For each callable, scan its file for calls to other known callables
    for (const caller of callableNodes) {
      const content = fileContents.get(caller.filePath);
      if (!content) continue;

      for (const [name, targets] of nameToNodes) {
        // Don't create self-referential edges for the same name in the same file
        // unless it's genuinely a different function
        if (name === caller.name) continue;

        // Check if this function name appears as a call in the file
        const callPattern = new RegExp(`\\b${this.escapeRegex(name)}\\s*\\(`, 'g');
        if (callPattern.test(content)) {
          for (const target of targets) {
            edges.push({
              from: caller.id,
              to: target.id,
              type: 'calls',
              metadata: { confidence: 'regex' },
            });
          }
        }
      }
    }

    return edges;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const resolved = path.normalize(path.join(fromDir, importPath));

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
      const candidate = path.join(resolved, `index${ext}`);
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

  private detectLanguage(filePath: string): string {
    if (/\.tsx?$/.test(filePath)) return 'typescript';
    if (/\.jsx?$/.test(filePath)) return 'javascript';
    return 'unknown';
  }
}
