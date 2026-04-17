import type Parser from 'web-tree-sitter';
import type { Result } from '../result';
import { Ok, Err } from '../result';
import { readFileContent } from '../fs-utils';
import type { AST, Import, Export, ParseError, LanguageParser, HealthCheckResult } from './base';
import { createParseError } from './base';
import { getParser } from '../../code-nav/parser';
import type { SupportedLanguage, OutlineResult, UnfoldResult } from '../../code-nav/types';
import { extractOutlineFromTree } from '../../code-nav/outline';

/**
 * Strategy for extracting imports from a tree-sitter AST.
 * Each supported language provides its own implementation.
 */
interface ImportExtractionStrategy {
  extractImports(root: Parser.SyntaxNode, source: string): Import[];
  extractExports(root: Parser.SyntaxNode, source: string): Export[];
}

function makeLocation(node: Parser.SyntaxNode) {
  return {
    file: '',
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  };
}

function makeNamedExport(node: Parser.SyntaxNode): Export | null {
  const name = node.childForFieldName('name');
  if (!name) return null;
  return { name: name.text, type: 'named', location: makeLocation(node), isReExport: false };
}

function makeImport(node: Parser.SyntaxNode, source: string): Import {
  return { source, specifiers: [], location: makeLocation(node), kind: 'value' };
}

// --- Python ---

function extractPythonImport(child: Parser.SyntaxNode): Import | null {
  const name = child.childForFieldName('name');
  if (!name) return null;
  return makeImport(child, name.text);
}

function extractPythonFromImport(child: Parser.SyntaxNode): Import {
  const moduleName = child.childForFieldName('module_name');
  const specifiers: string[] = [];
  for (const c of child.children) {
    if (c.type === 'dotted_name' && c !== moduleName) specifiers.push(c.text);
    if (c.type === 'aliased_import') {
      const n = c.childForFieldName('name');
      if (n) specifiers.push(n.text);
    }
  }
  return {
    source: moduleName?.text ?? '',
    specifiers,
    location: makeLocation(child),
    kind: 'value',
  };
}

function extractPythonExport(child: Parser.SyntaxNode): Export | null {
  if (child.type === 'function_definition' || child.type === 'class_definition') {
    return makeNamedExport(child);
  }
  if (child.type === 'assignment') {
    const left = child.childForFieldName('left') ?? child.children[0];
    if (left && !left.text.startsWith('_')) {
      return { name: left.text, type: 'named', location: makeLocation(child), isReExport: false };
    }
  }
  return null;
}

const pythonStrategy: ImportExtractionStrategy = {
  extractImports(root) {
    const imports: Import[] = [];
    for (const child of root.children) {
      if (child.type === 'import_statement') {
        const imp = extractPythonImport(child);
        if (imp) imports.push(imp);
      } else if (child.type === 'import_from_statement') {
        imports.push(extractPythonFromImport(child));
      }
    }
    return imports;
  },
  extractExports(root) {
    const exports: Export[] = [];
    for (const child of root.children) {
      const exp = extractPythonExport(child);
      if (exp) exports.push(exp);
    }
    return exports;
  },
};

// --- Go ---

function extractGoImportPath(spec: Parser.SyntaxNode): string | null {
  const pathNode =
    spec.childForFieldName('path') ??
    spec.children.find((c) => c.type === 'interpreted_string_literal');
  return pathNode ? pathNode.text.replace(/"/g, '') : null;
}

function extractGoImportsFromDecl(child: Parser.SyntaxNode): Import[] {
  const imports: Import[] = [];

  for (const spec of child.children.filter((c) => c.type === 'import_spec')) {
    const source = extractGoImportPath(spec);
    if (source) imports.push(makeImport(child, source));
  }

  const specList = child.children.find((c) => c.type === 'import_spec_list');
  if (specList) {
    for (const spec of specList.children.filter((c) => c.type === 'import_spec')) {
      const source = extractGoImportPath(spec);
      if (source) imports.push(makeImport(spec, source));
    }
  }

  return imports;
}

function isGoExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function extractGoExport(child: Parser.SyntaxNode): Export | null {
  if (child.type === 'function_declaration' || child.type === 'method_declaration') {
    const name = child.childForFieldName('name');
    if (name && isGoExported(name.text)) return makeNamedExport(child);
  }
  if (child.type === 'type_declaration') {
    const typeSpec = child.children.find((c) => c.type === 'type_spec');
    if (typeSpec) {
      const name = typeSpec.childForFieldName('name');
      if (name && isGoExported(name.text)) {
        return { name: name.text, type: 'named', location: makeLocation(child), isReExport: false };
      }
    }
  }
  return null;
}

const goStrategy: ImportExtractionStrategy = {
  extractImports(root) {
    const imports: Import[] = [];
    for (const child of root.children) {
      if (child.type === 'import_declaration') imports.push(...extractGoImportsFromDecl(child));
    }
    return imports;
  },
  extractExports(root) {
    const exports: Export[] = [];
    for (const child of root.children) {
      const exp = extractGoExport(child);
      if (exp) exports.push(exp);
    }
    return exports;
  },
};

// --- Rust ---

const RUST_USE_ARG_TYPES = new Set([
  'scoped_identifier',
  'use_wildcard',
  'scoped_use_list',
  'identifier',
]);

const RUST_PUB_ITEM_TYPES = new Set([
  'function_item',
  'struct_item',
  'enum_item',
  'trait_item',
  'type_item',
  'const_item',
  'static_item',
]);

const rustStrategy: ImportExtractionStrategy = {
  extractImports(root) {
    const imports: Import[] = [];
    for (const child of root.children) {
      if (child.type !== 'use_declaration') continue;
      const arg =
        child.childForFieldName('argument') ??
        child.children.find((c) => RUST_USE_ARG_TYPES.has(c.type));
      if (arg) imports.push(makeImport(child, arg.text));
    }
    return imports;
  },
  extractExports(root, source) {
    const exports: Export[] = [];
    const lines = source.split('\n');

    for (const child of root.children) {
      const line = lines[child.startPosition.row] ?? '';
      if (!/^\s*pub\b/.test(line)) continue;

      if (RUST_PUB_ITEM_TYPES.has(child.type)) {
        const exp = makeNamedExport(child);
        if (exp) exports.push(exp);
      } else if (child.type === 'mod_item') {
        const name = child.childForFieldName('name');
        if (name) {
          exports.push({
            name: name.text,
            type: 'namespace',
            location: makeLocation(child),
            isReExport: false,
          });
        }
      }
    }
    return exports;
  },
};

// --- Java ---

const JAVA_IMPORT_TYPES = new Set(['scoped_identifier', 'scoped_absolute_identifier']);

const JAVA_EXPORT_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);

const javaStrategy: ImportExtractionStrategy = {
  extractImports(root) {
    const imports: Import[] = [];
    for (const child of root.children) {
      if (child.type !== 'import_declaration') continue;
      const scoped = child.children.find((c) => JAVA_IMPORT_TYPES.has(c.type));
      if (scoped) imports.push(makeImport(child, scoped.text));
    }
    return imports;
  },
  extractExports(root, source) {
    const exports: Export[] = [];
    const lines = source.split('\n');
    for (const child of root.children) {
      if (!JAVA_EXPORT_TYPES.has(child.type)) continue;
      const line = lines[child.startPosition.row] ?? '';
      if (!/\bpublic\b/.test(line)) continue;
      const exp = makeNamedExport(child);
      if (exp) exports.push(exp);
    }
    return exports;
  },
};

const STRATEGIES: Partial<Record<SupportedLanguage, ImportExtractionStrategy>> = {
  python: pythonStrategy,
  go: goStrategy,
  rust: rustStrategy,
  java: javaStrategy,
};

/**
 * Generic tree-sitter-based LanguageParser implementation.
 * Works for any language with a WASM grammar and extraction strategy.
 */
export class TreeSitterParser implements LanguageParser {
  readonly name: string;
  readonly extensions: string[];
  private readonly lang: SupportedLanguage;
  private readonly strategy: ImportExtractionStrategy;

  constructor(lang: SupportedLanguage, extensions: string[], strategy: ImportExtractionStrategy) {
    this.name = lang;
    this.lang = lang;
    this.extensions = extensions;
    this.strategy = strategy;
  }

  async parseFile(path: string): Promise<Result<AST, ParseError>> {
    const contentResult = await readFileContent(path);
    if (!contentResult.ok) {
      return Err(
        createParseError('NOT_FOUND', `File not found: ${path}`, { path }, [
          'Check that the file exists',
        ])
      );
    }

    try {
      const parser = await getParser(this.lang);
      const tree = parser.parse(contentResult.value);
      return Ok({
        type: 'Program',
        body: { tree, source: contentResult.value },
        language: this.lang,
      });
    } catch (e) {
      const error = e as Error;
      return Err(
        createParseError('SYNTAX_ERROR', `Failed to parse ${path}: ${error.message}`, { path }, [
          'Check for syntax errors in the file',
        ])
      );
    }
  }

  extractImports(ast: AST): Result<Import[], ParseError> {
    const { tree, source } = ast.body as { tree: Parser.Tree; source: string };
    return Ok(this.strategy.extractImports(tree.rootNode, source));
  }

  extractExports(ast: AST): Result<Export[], ParseError> {
    const { tree, source } = ast.body as { tree: Parser.Tree; source: string };
    return Ok(this.strategy.extractExports(tree.rootNode, source));
  }

  async health(): Promise<Result<HealthCheckResult, ParseError>> {
    try {
      await getParser(this.lang);
      return Ok({ available: true, message: `tree-sitter ${this.lang} grammar loaded` });
    } catch {
      return Ok({ available: false, message: `tree-sitter ${this.lang} grammar not available` });
    }
  }

  outline(filePath: string, ast: AST): OutlineResult {
    const { tree, source } = ast.body as { tree: Parser.Tree; source: string };
    return extractOutlineFromTree(tree.rootNode, this.lang, source, filePath);
  }

  unfold(
    filePath: string,
    ast: AST,
    symbolName: string
  ): UnfoldResult | null {
    // Use outline to find the symbol, then extract its range
    const outlineResult = this.outline(filePath, ast);
    if (outlineResult.error || !outlineResult.symbols.length) return null;

    const { source } = ast.body as { tree: Parser.Tree; source: string };

    // Search top-level symbols and their children
    for (const sym of outlineResult.symbols) {
      if (sym.name === symbolName) {
        const lines = source.split('\n');
        const content = lines.slice(sym.line - 1, sym.endLine).join('\n');
        return {
          file: filePath,
          symbolName,
          startLine: sym.line,
          endLine: sym.endLine,
          content,
          language: this.lang,
          fallback: false,
        };
      }
      if (sym.children) {
        for (const child of sym.children) {
          if (child.name === symbolName) {
            const lines = source.split('\n');
            const content = lines.slice(child.line - 1, child.endLine).join('\n');
            return {
              file: filePath,
              symbolName,
              startLine: child.line,
              endLine: child.endLine,
              content,
              language: this.lang,
              fallback: false,
            };
          }
        }
      }
    }

    return null;
  }
}

/**
 * Create a TreeSitterParser for a known language.
 */
export function createTreeSitterParser(lang: SupportedLanguage): TreeSitterParser | null {
  const strategy = STRATEGIES[lang];
  if (!strategy) return null;

  const extensionMap: Record<string, string[]> = {
    python: ['.py'],
    go: ['.go'],
    rust: ['.rs'],
    java: ['.java'],
  };

  const extensions = extensionMap[lang];
  if (!extensions) return null;

  return new TreeSitterParser(lang, extensions, strategy);
}
