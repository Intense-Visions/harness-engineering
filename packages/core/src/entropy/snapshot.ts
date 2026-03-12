import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type {
  EntropyError,
  EntropyConfig,
  CodeBlock,
  InlineReference,
  DocumentationFile,
  SourceFile,
  InternalSymbol,
  JSDocComment,
  ExportMap,
  CodeReference,
  CodebaseSnapshot,
} from './types';
import type { AST, Export } from '../shared/parsers';
import { TypeScriptParser } from '../shared/parsers';
import { createEntropyError } from '../shared/errors';
import { readFileContent, fileExists, findFiles } from '../shared/fs-utils';
import { buildDependencyGraph } from '../constraints/dependencies';
import { join, resolve, relative } from 'path';
import { minimatch } from 'minimatch';

/**
 * Resolve entry points for dead code analysis
 *
 * Entry points are the starting files from which reachability analysis begins.
 * The resolution order is:
 * 1. Explicit entries provided as arguments
 * 2. package.json exports/main/bin fields
 * 3. Conventional entry files (src/index.ts, index.ts, etc.)
 */
export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>> {
  // 1. Use explicit entries if provided
  if (explicitEntries && explicitEntries.length > 0) {
    const resolved = explicitEntries.map(e => resolve(rootDir, e));
    return Ok(resolved);
  }

  // 2. Try package.json
  const pkgPath = join(rootDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgContent = await readFileContent(pkgPath);
    if (pkgContent.ok) {
      try {
        const pkg = JSON.parse(pkgContent.value);
        const entries: string[] = [];

        // Check exports field
        if (pkg.exports) {
          if (typeof pkg.exports === 'string') {
            entries.push(resolve(rootDir, pkg.exports));
          } else if (typeof pkg.exports === 'object') {
            for (const value of Object.values(pkg.exports)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        // Check main field
        if (pkg.main && entries.length === 0) {
          entries.push(resolve(rootDir, pkg.main));
        }

        // Check bin field
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entries.push(resolve(rootDir, pkg.bin));
          } else if (typeof pkg.bin === 'object') {
            for (const value of Object.values(pkg.bin)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        if (entries.length > 0) {
          return Ok(entries);
        }
      } catch {
        // Invalid JSON, fall through to conventions
      }
    }
  }

  // 3. Fall back to conventions
  const conventions = ['src/index.ts', 'src/main.ts', 'index.ts', 'main.ts'];
  for (const conv of conventions) {
    const convPath = join(rootDir, conv);
    if (await fileExists(convPath)) {
      return Ok([convPath]);
    }
  }

  return Err(
    createEntropyError(
      'ENTRY_POINT_NOT_FOUND',
      'Could not resolve entry points',
      { reason: 'No package.json exports/main and no conventional entry files found' },
      ['Add "exports" or "main" to package.json', 'Create src/index.ts', 'Specify entryPoints in config']
    )
  );
}

/**
 * Extract code blocks from markdown content
 */
function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && line.startsWith('```')) {
      const langMatch = line.match(/```(\w*)/);
      const language = langMatch?.[1] || 'text';

      // Find closing ```
      let codeContent = '';
      let j = i + 1;
      let currentLine = lines[j];
      while (j < lines.length && currentLine !== undefined && !currentLine.startsWith('```')) {
        codeContent += currentLine + '\n';
        j++;
        currentLine = lines[j];
      }

      blocks.push({
        language,
        content: codeContent.trim(),
        line: i + 1,
      });

      i = j; // Skip to end of code block
    }
  }

  return blocks;
}

/**
 * Extract inline backtick references from markdown
 */
function extractInlineRefs(content: string): InlineReference[] {
  const refs: InlineReference[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const regex = /`([^`]+)`/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const reference = match[1];
      if (reference === undefined) continue;
      // Filter out code snippets, keep likely symbol references
      if (reference.match(/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*(\(.*\))?$/)) {
        refs.push({
          reference: reference.replace(/\(.*\)$/, ''), // Remove function parens
          line: i + 1,
          column: match.index,
        });
      }
    }
  }

  return refs;
}

/**
 * Parse a documentation file
 */
export async function parseDocumentationFile(
  path: string
): Promise<Result<DocumentationFile, EntropyError>> {
  const contentResult = await readFileContent(path);
  if (!contentResult.ok) {
    return Err(
      createEntropyError(
        'PARSE_ERROR',
        `Failed to read documentation file: ${path}`,
        { file: path },
        ['Check that the file exists']
      )
    );
  }

  const content = contentResult.value;
  const type = path.endsWith('.md') ? 'markdown' : 'text';

  return Ok({
    path,
    type,
    content,
    codeBlocks: extractCodeBlocks(content),
    inlineRefs: extractInlineRefs(content),
  });
}

/**
 * Extract internal (non-exported) symbols from AST
 */
function extractInternalSymbols(ast: AST): InternalSymbol[] {
  const symbols: InternalSymbol[] = [];
  const body = ast.body as { body?: unknown[] };

  if (!body?.body) return symbols;

  for (const node of body.body as Array<{
    type: string;
    id?: { name?: string };
    declarations?: Array<{ id?: { name?: string } }>;
    loc?: { start?: { line: number } };
  }>) {
    // Function declarations not exported
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      symbols.push({
        name: node.id.name,
        type: 'function',
        line: node.loc?.start?.line || 0,
        references: 0,
        calledBy: [],
      });
    }
    // Variable declarations not exported
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations || []) {
        if (decl.id?.name) {
          symbols.push({
            name: decl.id.name,
            type: 'variable',
            line: node.loc?.start?.line || 0,
            references: 0,
            calledBy: [],
          });
        }
      }
    }
    // Class declarations not exported
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      symbols.push({
        name: node.id.name,
        type: 'class',
        line: node.loc?.start?.line || 0,
        references: 0,
        calledBy: [],
      });
    }
  }

  return symbols;
}

/**
 * Extract JSDoc comments from AST
 */
function extractJSDocComments(ast: AST): JSDocComment[] {
  const comments: JSDocComment[] = [];
  const body = ast.body as {
    comments?: Array<{
      type: string;
      value?: string;
      loc?: { start?: { line: number } };
    }>;
  };

  if (body?.comments) {
    for (const comment of body.comments) {
      if (comment.type === 'Block' && comment.value?.startsWith('*')) {
        const jsDocComment: JSDocComment = {
          content: comment.value,
          line: comment.loc?.start?.line || 0,
        };
        comments.push(jsDocComment);
      }
    }
  }

  return comments;
}

/**
 * Build ExportMap from source files
 */
function buildExportMap(files: SourceFile[]): ExportMap {
  const byFile = new Map<string, Export[]>();
  const byName = new Map<string, { file: string; export: Export }[]>();

  for (const file of files) {
    byFile.set(file.path, file.exports);

    for (const exp of file.exports) {
      const existing = byName.get(exp.name) || [];
      existing.push({ file: file.path, export: exp });
      byName.set(exp.name, existing);
    }
  }

  return { byFile, byName };
}

/**
 * Extract code references from all documentation
 */
function extractAllCodeReferences(docs: DocumentationFile[]): CodeReference[] {
  const refs: CodeReference[] = [];

  for (const doc of docs) {
    for (const inlineRef of doc.inlineRefs) {
      refs.push({
        docFile: doc.path,
        line: inlineRef.line,
        column: inlineRef.column,
        reference: inlineRef.reference,
        context: 'inline',
      });
    }

    for (const block of doc.codeBlocks) {
      if (
        block.language === 'typescript' ||
        block.language === 'ts' ||
        block.language === 'javascript' ||
        block.language === 'js'
      ) {
        const importRegex = /import\s+\{([^}]+)\}\s+from/g;
        let match;
        while ((match = importRegex.exec(block.content)) !== null) {
          const matchedGroup = match[1];
          if (matchedGroup === undefined) continue;
          const names = matchedGroup.split(',').map(n => n.trim());
          for (const name of names) {
            refs.push({
              docFile: doc.path,
              line: block.line,
              column: 0,
              reference: name,
              context: 'code-block',
            });
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Build a complete CodebaseSnapshot
 */
export async function buildSnapshot(
  config: EntropyConfig
): Promise<Result<CodebaseSnapshot, EntropyError>> {
  const startTime = Date.now();
  const parser = config.parser || new TypeScriptParser();
  const rootDir = resolve(config.rootDir);

  // Resolve entry points
  const entryPointsResult = await resolveEntryPoints(rootDir, config.entryPoints);
  if (!entryPointsResult.ok) {
    return Err(entryPointsResult.error);
  }

  // Find source files
  const includePatterns = config.include || ['**/*.ts', '**/*.tsx'];
  const excludePatterns = config.exclude || [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  let sourceFilePaths: string[] = [];
  for (const pattern of includePatterns) {
    const files = await findFiles(pattern, rootDir);
    sourceFilePaths.push(...files);
  }

  // Filter out excluded
  sourceFilePaths = sourceFilePaths.filter(f => {
    const rel = relative(rootDir, f);
    return !excludePatterns.some(p => minimatch(rel, p));
  });

  // Parse source files
  const files: SourceFile[] = [];
  for (const filePath of sourceFilePaths) {
    const parseResult = await parser.parseFile(filePath);
    if (!parseResult.ok) continue;

    const importsResult = parser.extractImports(parseResult.value);
    const exportsResult = parser.extractExports(parseResult.value);
    const internalSymbols = extractInternalSymbols(parseResult.value);
    const jsDocComments = extractJSDocComments(parseResult.value);

    files.push({
      path: filePath,
      ast: parseResult.value,
      imports: importsResult.ok ? importsResult.value : [],
      exports: exportsResult.ok ? exportsResult.value : [],
      internalSymbols,
      jsDocComments,
    });
  }

  // Build dependency graph
  const graphResult = await buildDependencyGraph(sourceFilePaths, parser);
  const dependencyGraph = graphResult.ok ? graphResult.value : { nodes: [], edges: [] };

  // Find and parse documentation
  const docPatterns = config.docPaths || ['docs/**/*.md', 'README.md', '**/README.md'];
  let docFilePaths: string[] = [];
  for (const pattern of docPatterns) {
    const docFiles = await findFiles(pattern, rootDir);
    docFilePaths.push(...docFiles);
  }
  docFilePaths = [...new Set(docFilePaths)]; // Dedupe

  const docs: DocumentationFile[] = [];
  for (const docPath of docFilePaths) {
    const docResult = await parseDocumentationFile(docPath);
    if (docResult.ok) {
      docs.push(docResult.value);
    }
  }

  // Build export map and extract code references
  const exportMap = buildExportMap(files);
  const codeReferences = extractAllCodeReferences(docs);

  const buildTime = Date.now() - startTime;

  return Ok({
    files,
    dependencyGraph,
    exportMap,
    docs,
    codeReferences,
    entryPoints: entryPointsResult.value,
    rootDir,
    config,
    buildTime,
  });
}
