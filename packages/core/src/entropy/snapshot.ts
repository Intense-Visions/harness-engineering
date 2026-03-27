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
import { readFileContent, fileExists, findFiles, relativePosix } from '../shared/fs-utils';
import { buildDependencyGraph } from '../constraints/dependencies';
import { join, resolve } from 'path';
import { minimatch } from 'minimatch';

/** Collect resolved paths from a string-or-object package.json field. */
function collectFieldEntries(rootDir: string, field: unknown): string[] {
  if (typeof field === 'string') return [resolve(rootDir, field)];
  if (typeof field === 'object' && field !== null) {
    return Object.values(field as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => resolve(rootDir, v));
  }
  return [];
}

/** Extract entry points from a parsed package.json object. */
function extractPackageEntries(rootDir: string, pkg: Record<string, unknown>): string[] {
  const entries: string[] = [];

  entries.push(...collectFieldEntries(rootDir, pkg['exports']));

  if (entries.length === 0 && typeof pkg['main'] === 'string') {
    entries.push(resolve(rootDir, pkg['main']));
  }

  if (pkg['bin']) {
    entries.push(...collectFieldEntries(rootDir, pkg['bin']));
  }

  return entries;
}

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
  if (explicitEntries && explicitEntries.length > 0) {
    return Ok(explicitEntries.map((e) => resolve(rootDir, e)));
  }

  const pkgPath = join(rootDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgContent = await readFileContent(pkgPath);
    if (pkgContent.ok) {
      try {
        const pkg = JSON.parse(pkgContent.value) as Record<string, unknown>;
        const entries = extractPackageEntries(rootDir, pkg);
        if (entries.length > 0) return Ok(entries);
      } catch {
        // Invalid JSON, fall through to conventions
      }
    }
  }

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
      [
        'Add "exports" or "main" to package.json',
        'Create src/index.ts',
        'Specify entryPoints in config',
      ]
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

interface ASTNode {
  type: string;
  id?: { name?: string };
  declarations?: Array<{ id?: { name?: string } }>;
  loc?: { start?: { line: number } };
}

function makeInternalSymbol(
  name: string,
  type: 'function' | 'variable' | 'class',
  line: number
): InternalSymbol {
  return { name, type, line, references: 0, calledBy: [] };
}

function extractSymbolsFromNode(node: ASTNode): InternalSymbol[] {
  const line = node.loc?.start?.line || 0;

  if (node.type === 'FunctionDeclaration' && node.id?.name) {
    return [makeInternalSymbol(node.id.name, 'function', line)];
  }

  if (node.type === 'VariableDeclaration') {
    return (node.declarations || [])
      .filter((decl) => decl.id?.name)
      .map((decl) => makeInternalSymbol(decl.id!.name!, 'variable', line));
  }

  if (node.type === 'ClassDeclaration' && node.id?.name) {
    return [makeInternalSymbol(node.id.name, 'class', line)];
  }

  return [];
}

/**
 * Extract internal (non-exported) symbols from AST
 */
function extractInternalSymbols(ast: AST): InternalSymbol[] {
  const body = ast.body as { body?: unknown[] };
  if (!body?.body) return [];

  const nodes = body.body as ASTNode[];
  return nodes.flatMap(extractSymbolsFromNode);
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
          const names = matchedGroup.split(',').map((n) => n.trim());
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
  sourceFilePaths = sourceFilePaths.filter((f) => {
    const rel = relativePosix(rootDir, f);
    return !excludePatterns.some((p) => minimatch(rel, p));
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
