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
import type { AST, Export, LanguageParser } from '../shared/parsers';
import { getDefaultRegistry } from '../shared/parsers';
import { skipDirGlobs } from '@harness-engineering/graph';
import { createEntropyError } from '../shared/errors';
import { readFileContent, findFiles, relativePosix } from '../shared/fs-utils';
import { buildDependencyGraph } from '../constraints/dependencies';
import { resolve } from 'path';
import { minimatch } from 'minimatch';
import { resolveEntryPoints } from './entry-points';

export { resolveEntryPoints };

const DEFAULT_INCLUDE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
];

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

function extractFunctionSymbol(node: ASTNode, line: number): InternalSymbol[] {
  if (node.id?.name) return [makeInternalSymbol(node.id.name, 'function', line)];
  return [];
}

function extractVariableSymbols(node: ASTNode, line: number): InternalSymbol[] {
  return (node.declarations || [])
    .filter((decl) => decl.id?.name)
    .map((decl) => makeInternalSymbol(decl.id!.name!, 'variable', line));
}

function extractClassSymbol(node: ASTNode, line: number): InternalSymbol[] {
  if (node.id?.name) return [makeInternalSymbol(node.id.name, 'class', line)];
  return [];
}

function extractSymbolsFromNode(node: ASTNode): InternalSymbol[] {
  const line = node.loc?.start?.line || 0;
  if (node.type === 'FunctionDeclaration') return extractFunctionSymbol(node, line);
  if (node.type === 'VariableDeclaration') return extractVariableSymbols(node, line);
  if (node.type === 'ClassDeclaration') return extractClassSymbol(node, line);
  return [];
}

/**
 * Extract internal (non-exported) symbols from AST.
 * Only meaningful for ESTree-shaped TS/JS ASTs; tree-sitter ASTs return empty.
 */
function extractInternalSymbols(ast: AST): InternalSymbol[] {
  if (ast.language !== 'typescript' && ast.language !== 'javascript') return [];
  const body = ast.body as { body?: unknown[] };
  if (!body?.body) return [];

  const nodes = body.body as ASTNode[];
  return nodes.flatMap(extractSymbolsFromNode);
}

type RawComment = {
  type: string;
  value?: string;
  loc?: { start?: { line: number } };
};

function toJSDocComment(comment: RawComment): JSDocComment | null {
  if (comment.type !== 'Block' || !comment.value?.startsWith('*')) return null;
  return { content: comment.value, line: comment.loc?.start?.line || 0 };
}

function extractJSDocComments(ast: AST): JSDocComment[] {
  if (ast.language !== 'typescript' && ast.language !== 'javascript') return [];
  const body = ast.body as { comments?: RawComment[] };
  if (!body?.comments) return [];
  return body.comments.flatMap((c) => {
    const doc = toJSDocComment(c);
    return doc ? [doc] : [];
  });
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

const CODE_BLOCK_LANGUAGES = new Set(['typescript', 'ts', 'javascript', 'js']);

function refsFromInlineRefs(doc: DocumentationFile): CodeReference[] {
  return doc.inlineRefs.map((inlineRef) => ({
    docFile: doc.path,
    line: inlineRef.line,
    column: inlineRef.column,
    reference: inlineRef.reference,
    context: 'inline' as const,
  }));
}

function refsFromCodeBlock(docPath: string, block: CodeBlock): CodeReference[] {
  if (!CODE_BLOCK_LANGUAGES.has(block.language)) return [];
  const refs: CodeReference[] = [];
  const importRegex = /import\s+\{([^}]+)\}\s+from/g;
  let match;
  while ((match = importRegex.exec(block.content)) !== null) {
    const group = match[1];
    if (group === undefined) continue;
    for (const name of group.split(',').map((n) => n.trim())) {
      refs.push({
        docFile: docPath,
        line: block.line,
        column: 0,
        reference: name,
        context: 'code-block',
      });
    }
  }
  return refs;
}

function refsFromCodeBlocks(doc: DocumentationFile): CodeReference[] {
  return doc.codeBlocks.flatMap((block) => refsFromCodeBlock(doc.path, block));
}

function extractAllCodeReferences(docs: DocumentationFile[]): CodeReference[] {
  return docs.flatMap((doc) => [...refsFromInlineRefs(doc), ...refsFromCodeBlocks(doc)]);
}

/**
 * Build a complete CodebaseSnapshot
 */
export async function buildSnapshot(
  config: EntropyConfig
): Promise<Result<CodebaseSnapshot, EntropyError>> {
  const startTime = Date.now();
  const rootDir = resolve(config.rootDir);

  // Resolve entry points
  const entryPointsResult = await resolveEntryPoints(rootDir, config.entryPoints);
  if (!entryPointsResult.ok) {
    return Err(entryPointsResult.error);
  }

  // Source-file dispatch: if caller passed a single parser, use it for every
  // file (preserves legacy behavior); otherwise dispatch per-file via the
  // default multi-language registry.
  const registry = getDefaultRegistry();
  const singleParser = config.parser;
  const parserForFile = (filePath: string): LanguageParser | null =>
    singleParser ?? registry.getForFile(filePath);

  // Find source files
  const includePatterns = config.include || DEFAULT_INCLUDE_PATTERNS;
  const excludePatterns = config.exclude || [...skipDirGlobs(), '**/*.test.ts', '**/*.spec.ts'];

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
    const fileParser = parserForFile(filePath);
    if (!fileParser) continue;

    const parseResult = await fileParser.parseFile(filePath);
    if (!parseResult.ok) continue;

    const importsResult = fileParser.extractImports(parseResult.value);
    const exportsResult = fileParser.extractExports(parseResult.value);
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

  // Build dependency graph — pass the registry directly so it can dispatch per file
  const graphResult = await buildDependencyGraph(sourceFilePaths, singleParser ?? registry);
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
