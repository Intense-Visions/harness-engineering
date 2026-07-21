import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AST } from './base';
import type { CodeSymbol, OutlineResult } from '../../code-nav/types';

// Hermetic: the SUT reaches out to the real filesystem (readFileContent), the
// WASM tree-sitter grammars (getParser), and the outline extractor
// (extractOutlineFromTree). Mock all three so the test exercises the parser's
// own logic — per-language extraction strategies and the LanguageParser
// surface — without touching disk, subprocesses, or WASM.
vi.mock('../fs-utils', () => ({
  readFileContent: vi.fn(),
}));
vi.mock('../../code-nav/parser', () => ({
  getParser: vi.fn(),
}));
vi.mock('../../code-nav/outline', () => ({
  extractOutlineFromTree: vi.fn(),
}));

import { readFileContent } from '../fs-utils';
import { getParser } from '../../code-nav/parser';
import { extractOutlineFromTree } from '../../code-nav/outline';
import { TreeSitterParser, createTreeSitterParser } from './tree-sitter';

const mockReadFileContent = vi.mocked(readFileContent);
const mockGetParser = vi.mocked(getParser);
const mockExtractOutline = vi.mocked(extractOutlineFromTree);

// --- Minimal tree-sitter SyntaxNode test double -----------------------------
// Only the members the SUT touches are modelled: type, text, startPosition,
// children, namedChildren, and childForFieldName.
interface FakeNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  children: FakeNode[];
  namedChildren: FakeNode[];
  childForFieldName(name: string): FakeNode | null;
}

function node(opts: {
  type: string;
  text?: string;
  row?: number;
  column?: number;
  children?: FakeNode[];
  namedChildren?: FakeNode[];
  fields?: Record<string, FakeNode>;
}): FakeNode {
  const children = opts.children ?? [];
  const fields = opts.fields ?? {};
  return {
    type: opts.type,
    text: opts.text ?? '',
    startPosition: { row: opts.row ?? 0, column: opts.column ?? 0 },
    children,
    namedChildren: opts.namedChildren ?? children,
    childForFieldName: (name: string) => fields[name] ?? null,
  };
}

// Wrap a root node as the { tree, source } AST body the parser expects.
function astFor(rootNode: FakeNode, language: string, source = ''): AST {
  return {
    type: 'Program',
    body: { tree: { rootNode }, source },
    language,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTreeSitterParser', () => {
  it('builds a parser with correct name and extensions for each supported language', () => {
    const cases: Array<[Parameters<typeof createTreeSitterParser>[0], string]> = [
      ['python', '.py'],
      ['go', '.go'],
      ['rust', '.rs'],
      ['java', '.java'],
    ];
    for (const [lang, ext] of cases) {
      const parser = createTreeSitterParser(lang);
      expect(parser).toBeInstanceOf(TreeSitterParser);
      expect(parser!.name).toBe(lang);
      expect(parser!.extensions).toEqual([ext]);
    }
  });

  it('returns null for a language without a registered extraction strategy', () => {
    expect(createTreeSitterParser('typescript')).toBeNull();
    expect(createTreeSitterParser('javascript')).toBeNull();
  });
});

describe('TreeSitterParser.parseFile', () => {
  it('returns a NOT_FOUND error when the file cannot be read', async () => {
    mockReadFileContent.mockResolvedValue({ ok: false, error: new Error('missing') });
    const parser = createTreeSitterParser('python')!;

    const result = await parser.parseFile('/nope.py');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.details.path).toBe('/nope.py');
    // getParser must not be invoked once the read fails.
    expect(mockGetParser).not.toHaveBeenCalled();
  });

  it('returns an Ok AST carrying the parsed tree and source on success', async () => {
    const source = 'x = 1\n';
    const tree = { rootNode: node({ type: 'module' }) };
    mockReadFileContent.mockResolvedValue({ ok: true, value: source });
    mockGetParser.mockResolvedValue({ parse: vi.fn().mockReturnValue(tree) } as never);
    const parser = createTreeSitterParser('python')!;

    const result = await parser.parseFile('/ok.py');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.type).toBe('Program');
    expect(result.value.language).toBe('python');
    expect(result.value.body).toEqual({ tree, source });
  });

  it('returns a SYNTAX_ERROR when the grammar parser throws', async () => {
    mockReadFileContent.mockResolvedValue({ ok: true, value: 'def (' });
    mockGetParser.mockResolvedValue({
      parse: vi.fn(() => {
        throw new Error('boom');
      }),
    } as never);
    const parser = createTreeSitterParser('python')!;

    const result = await parser.parseFile('/bad.py');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('SYNTAX_ERROR');
    expect(result.error.message).toContain('boom');
  });
});

describe('TreeSitterParser.health', () => {
  it('reports available when the grammar loads', async () => {
    mockGetParser.mockResolvedValue({} as never);
    const parser = createTreeSitterParser('go')!;

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(true);
    expect(result.value.message).toContain('go');
  });

  it('reports unavailable when the grammar fails to load', async () => {
    mockGetParser.mockRejectedValue(new Error('no wasm'));
    const parser = createTreeSitterParser('go')!;

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('not available');
  });
});

describe('Python strategy', () => {
  const parser = createTreeSitterParser('python')!;

  it('extracts plain and from-imports with specifiers', () => {
    const osName = node({ type: 'dotted_name', text: 'os' });
    const importStmt = node({
      type: 'import_statement',
      fields: { name: osName },
      children: [osName],
    });

    const moduleName = node({ type: 'dotted_name', text: 'typing' });
    const listSpec = node({ type: 'dotted_name', text: 'List' });
    const aliasName = node({ type: 'identifier', text: 'D' });
    const aliased = node({ type: 'aliased_import', fields: { name: aliasName } });
    const fromStmt = node({
      type: 'import_from_statement',
      fields: { module_name: moduleName },
      children: [moduleName, listSpec, aliased],
    });

    const root = node({ type: 'module', children: [importStmt, fromStmt] });
    const result = parser.extractImports(astFor(root, 'python'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual([
      { source: 'os', specifiers: [], location: { file: '', line: 1, column: 0 }, kind: 'value' },
      {
        source: 'typing',
        specifiers: ['List', 'D'],
        location: { file: '', line: 1, column: 0 },
        kind: 'value',
      },
    ]);
  });

  it('exports public defs, classes with one level of members, decorated defs, and module assignments', () => {
    const fn = node({
      type: 'function_definition',
      fields: { name: node({ type: 'identifier', text: 'do_thing' }) },
    });
    const priv = node({
      type: 'function_definition',
      fields: { name: node({ type: 'identifier', text: '_hidden' }) },
    });

    const method = node({
      type: 'function_definition',
      fields: { name: node({ type: 'identifier', text: 'run' }) },
    });
    const classBody = node({ type: 'block', children: [method] });
    const cls = node({
      type: 'class_definition',
      fields: { name: node({ type: 'identifier', text: 'Widget' }), body: classBody },
    });

    const decoratedInner = node({
      type: 'function_definition',
      fields: { name: node({ type: 'identifier', text: 'decorated_fn' }) },
    });
    const decorated = node({
      type: 'decorated_definition',
      fields: { definition: decoratedInner },
    });

    const assign = node({
      type: 'assignment',
      fields: { left: node({ type: 'identifier', text: 'CONST' }) },
    });
    const exprStmt = node({ type: 'expression_statement', children: [assign] });

    const skipAssign = node({
      type: 'assignment',
      fields: { left: node({ type: 'identifier', text: '_private_const' }) },
    });

    const root = node({
      type: 'module',
      children: [fn, priv, cls, decorated, exprStmt, skipAssign],
    });
    const result = parser.extractExports(astFor(root, 'python'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const names = result.value.map((e) => e.name);
    expect(names).toEqual(['do_thing', 'Widget', 'run', 'decorated_fn', 'CONST']);
    expect(result.value.every((e) => e.type === 'named' && !e.isReExport)).toBe(true);
  });
});

describe('Go strategy', () => {
  const parser = createTreeSitterParser('go')!;

  it('extracts single and grouped imports and strips quotes', () => {
    const single = node({
      type: 'import_declaration',
      children: [
        node({
          type: 'import_spec',
          fields: { path: node({ type: 'interpreted_string_literal', text: '"fmt"' }) },
        }),
      ],
    });

    const groupedSpec = node({
      type: 'import_spec',
      children: [node({ type: 'interpreted_string_literal', text: '"strings"' })],
    });
    const grouped = node({
      type: 'import_declaration',
      children: [node({ type: 'import_spec_list', children: [groupedSpec] })],
    });

    const root = node({ type: 'source_file', children: [single, grouped] });
    const result = parser.extractImports(astFor(root, 'go'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((i) => i.source)).toEqual(['fmt', 'strings']);
  });

  it('exports only capitalized functions and types', () => {
    const exportedFn = node({
      type: 'function_declaration',
      fields: { name: node({ type: 'identifier', text: 'DoThing' }) },
    });
    const unexportedFn = node({
      type: 'function_declaration',
      fields: { name: node({ type: 'identifier', text: 'doThing' }) },
    });
    const typeDecl = node({
      type: 'type_declaration',
      children: [
        node({
          type: 'type_spec',
          fields: { name: node({ type: 'type_identifier', text: 'Server' }) },
        }),
      ],
    });

    const root = node({ type: 'source_file', children: [exportedFn, unexportedFn, typeDecl] });
    const result = parser.extractExports(astFor(root, 'go'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((e) => e.name)).toEqual(['DoThing', 'Server']);
  });
});

describe('Rust strategy', () => {
  const parser = createTreeSitterParser('rust')!;

  it('extracts use declarations from the argument node', () => {
    const useDecl = node({
      type: 'use_declaration',
      fields: { argument: node({ type: 'scoped_identifier', text: 'std::collections::HashMap' }) },
    });
    const root = node({ type: 'source_file', children: [useDecl] });

    const result = parser.extractImports(astFor(root, 'rust'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((i) => i.source)).toEqual(['std::collections::HashMap']);
  });

  it('exports pub items and pub modules but skips private items', () => {
    const source = ['pub fn open() {}', 'fn closed() {}', 'pub mod util {}'].join('\n');
    const pubFn = node({
      type: 'function_item',
      row: 0,
      fields: { name: node({ type: 'identifier', text: 'open' }) },
    });
    const privFn = node({
      type: 'function_item',
      row: 1,
      fields: { name: node({ type: 'identifier', text: 'closed' }) },
    });
    const pubMod = node({
      type: 'mod_item',
      row: 2,
      fields: { name: node({ type: 'identifier', text: 'util' }) },
    });

    const root = node({ type: 'source_file', children: [pubFn, privFn, pubMod] });
    const result = parser.extractExports(astFor(root, 'rust', source));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((e) => ({ name: e.name, type: e.type }))).toEqual([
      { name: 'open', type: 'named' },
      { name: 'util', type: 'namespace' },
    ]);
  });
});

describe('Java strategy', () => {
  const parser = createTreeSitterParser('java')!;

  it('extracts scoped imports', () => {
    const importDecl = node({
      type: 'import_declaration',
      children: [node({ type: 'scoped_identifier', text: 'java.util.List' })],
    });
    const root = node({ type: 'program', children: [importDecl] });

    const result = parser.extractImports(astFor(root, 'java'));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((i) => i.source)).toEqual(['java.util.List']);
  });

  it('exports only public top-level type declarations', () => {
    const source = ['public class Foo {}', 'class Bar {}'].join('\n');
    const pubClass = node({
      type: 'class_declaration',
      row: 0,
      fields: { name: node({ type: 'identifier', text: 'Foo' }) },
    });
    const pkgClass = node({
      type: 'class_declaration',
      row: 1,
      fields: { name: node({ type: 'identifier', text: 'Bar' }) },
    });

    const root = node({ type: 'program', children: [pubClass, pkgClass] });
    const result = parser.extractExports(astFor(root, 'java', source));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.map((e) => e.name)).toEqual(['Foo']);
  });
});

describe('TreeSitterParser.outline', () => {
  it('delegates to extractOutlineFromTree with the tree root, language, source, and path', () => {
    const rootNode = node({ type: 'module' });
    const outline: OutlineResult = {
      file: '/f.py',
      language: 'python',
      totalLines: 3,
      symbols: [],
    };
    mockExtractOutline.mockReturnValue(outline);
    const parser = createTreeSitterParser('python')!;

    const result = parser.outline!('/f.py', astFor(rootNode, 'python', 'src'));

    expect(result).toBe(outline);
    expect(mockExtractOutline).toHaveBeenCalledWith(rootNode, 'python', 'src', '/f.py');
  });
});

describe('TreeSitterParser.unfold', () => {
  const source = ['line1', 'def foo():', '    return 1', 'line4'].join('\n');

  function outlineWith(symbols: CodeSymbol[], error?: string): OutlineResult {
    return {
      file: '/f.py',
      language: 'python',
      totalLines: 4,
      symbols,
      ...(error !== undefined ? { error } : {}),
    };
  }

  it('returns the source slice bounded by the matched symbol', () => {
    const symbols: CodeSymbol[] = [
      { name: 'foo', kind: 'function', file: '/f.py', line: 2, endLine: 3, signature: 'def foo()' },
    ];
    mockExtractOutline.mockReturnValue(outlineWith(symbols));
    const parser = createTreeSitterParser('python')!;

    const result = parser.unfold!(
      '/f.py',
      astFor(node({ type: 'module' }), 'python', source),
      'foo'
    );

    expect(result).not.toBeNull();
    expect(result!.startLine).toBe(2);
    expect(result!.endLine).toBe(3);
    expect(result!.content).toBe('def foo():\n    return 1');
    expect(result!.fallback).toBe(false);
    expect(result!.language).toBe('python');
  });

  it('finds symbols nested inside children', () => {
    const symbols: CodeSymbol[] = [
      {
        name: 'Outer',
        kind: 'class',
        file: '/f.py',
        line: 1,
        endLine: 4,
        signature: 'class Outer',
        children: [
          {
            name: 'foo',
            kind: 'method',
            file: '/f.py',
            line: 2,
            endLine: 3,
            signature: 'def foo()',
          },
        ],
      },
    ];
    mockExtractOutline.mockReturnValue(outlineWith(symbols));
    const parser = createTreeSitterParser('python')!;

    const result = parser.unfold!(
      '/f.py',
      astFor(node({ type: 'module' }), 'python', source),
      'foo'
    );

    expect(result).not.toBeNull();
    expect(result!.content).toBe('def foo():\n    return 1');
  });

  it('returns null when the outline reports an error', () => {
    mockExtractOutline.mockReturnValue(outlineWith([], '[parse-failed]'));
    const parser = createTreeSitterParser('python')!;

    const result = parser.unfold!(
      '/f.py',
      astFor(node({ type: 'module' }), 'python', source),
      'foo'
    );

    expect(result).toBeNull();
  });

  it('returns null when the outline has no symbols', () => {
    mockExtractOutline.mockReturnValue(outlineWith([]));
    const parser = createTreeSitterParser('python')!;

    const result = parser.unfold!(
      '/f.py',
      astFor(node({ type: 'module' }), 'python', source),
      'foo'
    );

    expect(result).toBeNull();
  });

  it('returns null when the requested symbol is not found', () => {
    const symbols: CodeSymbol[] = [
      {
        name: 'other',
        kind: 'function',
        file: '/f.py',
        line: 2,
        endLine: 3,
        signature: 'def other()',
      },
    ];
    mockExtractOutline.mockReturnValue(outlineWith(symbols));
    const parser = createTreeSitterParser('python')!;

    const result = parser.unfold!(
      '/f.py',
      astFor(node({ type: 'module' }), 'python', source),
      'missing'
    );

    expect(result).toBeNull();
  });
});
