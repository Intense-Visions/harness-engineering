import type Parser from 'web-tree-sitter';
import { parseFile } from './parser';
import type { OutlineResult, CodeSymbol, SymbolKind, SupportedLanguage } from './types';
import { detectLanguage } from './types';

/**
 * Node type mappings per language for top-level declarations.
 */
const TOP_LEVEL_TYPES: Record<SupportedLanguage, Record<string, SymbolKind>> = {
  typescript: {
    function_declaration: 'function',
    class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    lexical_declaration: 'variable',
    variable_declaration: 'variable',
    export_statement: 'export',
    import_statement: 'import',
    enum_declaration: 'type',
  },
  javascript: {
    function_declaration: 'function',
    class_declaration: 'class',
    lexical_declaration: 'variable',
    variable_declaration: 'variable',
    export_statement: 'export',
    import_statement: 'import',
  },
  python: {
    function_definition: 'function',
    class_definition: 'class',
    assignment: 'variable',
    import_statement: 'import',
    import_from_statement: 'import',
  },
  go: {
    function_declaration: 'function',
    method_declaration: 'method',
    type_declaration: 'type',
    var_declaration: 'variable',
    const_declaration: 'variable',
    import_declaration: 'import',
    short_var_declaration: 'variable',
  },
  rust: {
    function_item: 'function',
    struct_item: 'class',
    enum_item: 'type',
    trait_item: 'interface',
    impl_item: 'class',
    mod_item: 'variable',
    const_item: 'variable',
    static_item: 'variable',
    type_item: 'type',
    use_declaration: 'import',
  },
  java: {
    class_declaration: 'class',
    interface_declaration: 'interface',
    method_declaration: 'function',
    field_declaration: 'variable',
    import_declaration: 'import',
    enum_declaration: 'type',
    record_declaration: 'class',
    annotation_type_declaration: 'interface',
  },
};

const METHOD_TYPES: Record<SupportedLanguage, string[]> = {
  typescript: ['method_definition', 'public_field_definition'],
  javascript: ['method_definition'],
  python: ['function_definition'],
  go: ['method_declaration'],
  rust: ['function_item'],
  java: ['method_declaration', 'constructor_declaration'],
};

const IDENTIFIER_TYPES = new Set(['identifier', 'property_identifier', 'type_identifier']);

function findIdentifier(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  return (
    node.childForFieldName('name') ??
    node.children.find((c) => IDENTIFIER_TYPES.has(c.type)) ??
    null
  );
}

function getVariableDeclarationName(node: Parser.SyntaxNode): string | null {
  const declarator = node.children.find((c) => c.type === 'variable_declarator');
  if (!declarator) return null;
  const id = findIdentifier(declarator);
  return id?.text ?? null;
}

function getExportName(node: Parser.SyntaxNode, source: string): string {
  const decl = node.children.find(
    (c) => c.type !== 'export' && c.type !== 'default' && c.type !== 'comment'
  );
  return decl ? getNodeName(decl, source) : '<anonymous>';
}

function getAssignmentName(node: Parser.SyntaxNode): string {
  const left = node.childForFieldName('left') ?? node.children[0];
  return left?.text ?? '<anonymous>';
}

function getGoTypeSpecName(node: Parser.SyntaxNode): string {
  const typeSpec = node.children.find((c) => c.type === 'type_spec');
  if (typeSpec) {
    const id = findIdentifier(typeSpec);
    if (id) return id.text;
  }
  return '<anonymous>';
}

function getRustImplName(node: Parser.SyntaxNode): string {
  const typeId = node.childForFieldName('type');
  if (typeId) return typeId.text;
  const id = node.children.find((c) => IDENTIFIER_TYPES.has(c.type));
  return id?.text ?? '<anonymous>';
}

function getGoVarName(node: Parser.SyntaxNode): string {
  const spec = node.children.find((c) => c.type === 'var_spec' || c.type === 'const_spec');
  if (spec) {
    const id = findIdentifier(spec);
    if (id) return id.text;
  }
  return '<anonymous>';
}

type NameExtractor = (node: Parser.SyntaxNode, source: string) => string | null;

const NAME_EXTRACTORS: Record<string, NameExtractor> = {
  lexical_declaration: (n) => getVariableDeclarationName(n),
  variable_declaration: (n) => getVariableDeclarationName(n),
  export_statement: (n, s) => getExportName(n, s),
  assignment: (n) => getAssignmentName(n),
  type_declaration: (n) => getGoTypeSpecName(n),
  impl_item: (n) => getRustImplName(n),
  var_declaration: (n) => getGoVarName(n),
  const_declaration: (n) => getGoVarName(n),
};

function getNodeName(node: Parser.SyntaxNode, source: string): string {
  const id = findIdentifier(node);
  if (id) return id.text;

  const extractor = NAME_EXTRACTORS[node.type];
  if (extractor) return extractor(node, source) ?? '<anonymous>';

  return '<anonymous>';
}

function getSignature(node: Parser.SyntaxNode, source: string): string {
  const startLine = node.startPosition.row;
  const lines = source.split('\n');
  return (lines[startLine] ?? '').trim();
}

function extractMethods(
  classNode: Parser.SyntaxNode,
  language: SupportedLanguage,
  source: string,
  filePath: string
): CodeSymbol[] {
  const methodTypes = METHOD_TYPES[language] ?? [];
  const body =
    classNode.childForFieldName('body') ??
    classNode.children.find(
      (c) =>
        c.type === 'class_body' ||
        c.type === 'block' ||
        c.type === 'declaration_list' ||
        c.type === 'field_declaration_list'
    );

  if (!body) return [];

  return body.children
    .filter((child) => methodTypes.includes(child.type))
    .map((child) => ({
      name: getNodeName(child, source),
      kind: 'method' as SymbolKind,
      file: filePath,
      line: child.startPosition.row + 1,
      endLine: child.endPosition.row + 1,
      signature: getSignature(child, source),
    }));
}

function nodeToSymbol(
  node: Parser.SyntaxNode,
  kind: SymbolKind,
  source: string,
  filePath: string
): CodeSymbol {
  return {
    name: getNodeName(node, source),
    kind,
    file: filePath,
    line: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    signature: getSignature(node, source),
  };
}

function processExportStatement(
  child: Parser.SyntaxNode,
  topLevelTypes: Record<string, SymbolKind>,
  lang: SupportedLanguage,
  source: string,
  filePath: string
): CodeSymbol {
  const declaration = child.children.find(
    (c) => c.type !== 'export' && c.type !== 'default' && c.type !== ';' && c.type !== 'comment'
  );

  const kind = declaration ? topLevelTypes[declaration.type] : undefined;
  if (declaration && kind) {
    const sym = nodeToSymbol(child, kind, source, filePath);
    sym.name = getNodeName(declaration, source);
    if (kind === 'class') {
      sym.children = extractMethods(declaration, lang, source, filePath);
    }
    return sym;
  }

  return nodeToSymbol(child, 'export', source, filePath);
}

function extractSymbols(
  rootNode: Parser.SyntaxNode,
  lang: SupportedLanguage,
  source: string,
  filePath: string
): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const topLevelTypes = TOP_LEVEL_TYPES[lang] ?? {};

  for (const child of rootNode.children) {
    if (child.type === 'export_statement') {
      symbols.push(processExportStatement(child, topLevelTypes, lang, source, filePath));
      continue;
    }

    const kind = topLevelTypes[child.type];
    if (!kind || kind === 'import') continue;

    const sym = nodeToSymbol(child, kind, source, filePath);
    if (kind === 'class') {
      sym.children = extractMethods(child, lang, source, filePath);
    }
    symbols.push(sym);
  }

  return symbols;
}

function buildFailedResult(filePath: string, lang: SupportedLanguage | 'unknown'): OutlineResult {
  return { file: filePath, language: lang, totalLines: 0, symbols: [], error: '[parse-failed]' };
}

/**
 * Get structural outline for a single file.
 */
export async function getOutline(filePath: string): Promise<OutlineResult> {
  const lang = detectLanguage(filePath);
  if (!lang) return buildFailedResult(filePath, 'unknown');

  const result = await parseFile(filePath);
  if (!result.ok) return buildFailedResult(filePath, lang);

  const { tree, source } = result.value;
  const totalLines = source.split('\n').length;
  const symbols = extractSymbols(tree.rootNode, lang, source, filePath);

  return { file: filePath, language: lang, totalLines, symbols };
}

/**
 * Format an outline result as the tree-style text format shown in the spec.
 */
export function formatOutline(outline: OutlineResult): string {
  if (outline.error) {
    return `${outline.file} ${outline.error}`;
  }

  const lines: string[] = [`${outline.file} (${outline.totalLines} lines)`];
  const last = outline.symbols.length - 1;

  outline.symbols.forEach((sym, i) => {
    const prefix = i === last ? '└──' : '├──';
    lines.push(`${prefix} ${sym.signature}    :${sym.line}`);

    if (sym.children) {
      const childLast = sym.children.length - 1;
      sym.children.forEach((child, j) => {
        const childConnector = i === last ? '    ' : '│   ';
        const childPrefix = j === childLast ? '└──' : '├──';
        lines.push(`${childConnector}${childPrefix} ${child.signature}    :${child.line}`);
      });
    }
  });

  return lines.join('\n');
}
