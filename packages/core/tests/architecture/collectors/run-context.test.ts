/**
 * Unit tests for the run-scoped parse memo shared by the dependency collectors
 * (#2270). The end-to-end parse-count and output-equivalence checks live in
 * shared-parse.test.ts; these pin the memo's own contract with a counting fake.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SharedImportParser,
  createCollectorRunContext,
} from '../../../src/architecture/collectors/run-context';
import { runAll } from '../../../src/architecture/collectors/index';
import type { ArchConfig, Collector } from '../../../src/architecture/types';
import type { AST, Import, LanguageParser, ParseError } from '../../../src/shared/parsers';
import { getDefaultRegistry, resetDefaultRegistry } from '../../../src/shared/parsers/registry';
import { Err, Ok } from '../../../src/shared/result';

const imp = (source: string): Import => ({
  source,
  specifiers: [],
  location: { file: 'x', line: 1, column: 0 },
  kind: 'value',
});

/** A parser whose every `parseFile` call is counted and resolves a tick later. */
function countingParser(name = 'fake') {
  const calls: string[] = [];
  const syntaxError: ParseError = {
    code: 'SYNTAX_ERROR',
    message: 'bad',
    details: {},
    suggestions: [],
  };
  const parser: LanguageParser = {
    name,
    extensions: ['.ts'],
    async parseFile(file) {
      calls.push(file);
      await new Promise((r) => setTimeout(r, 1));
      if (file.includes('broken')) return Err(syntaxError);
      return Ok({ type: 'Program', body: file, language: name });
    },
    extractImports: (ast) => Ok([imp(`from:${String(ast.body)}`)]),
    extractExports: () => Ok([]),
    health: async () => Ok({ available: true, message: name }),
  };
  return { parser, calls, syntaxError };
}

afterEach(() => {
  vi.restoreAllMocks();
  resetDefaultRegistry();
});

describe('SharedImportParser', () => {
  it('parses a file once however many readers ask, including concurrently', async () => {
    const { parser, calls } = countingParser();
    const memo = new SharedImportParser();
    const a = memo.forParser(parser);
    const b = memo.forLookup({ getForFile: () => parser }).getForFile('/r/a.ts')!;

    const results = await Promise.all([a.parseFile('/r/a.ts'), b.parseFile('/r/a.ts')]);
    await a.parseFile('/r/a.ts');

    expect(calls).toEqual(['/r/a.ts']);
    expect(memo.parseCount).toBe(1);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(a.extractImports(r.ok ? r.value : ({} as AST))).toEqual(Ok([imp('from:/r/a.ts')]));
    }
  });

  it('returns the imports the parser itself extracts', async () => {
    const { parser } = countingParser();
    const wrapped = new SharedImportParser().forParser(parser);

    const viaMemo = await wrapped.parseFile('/r/a.ts');
    const direct = await parser.parseFile('/r/a.ts');

    expect(viaMemo.ok && direct.ok).toBe(true);
    if (!viaMemo.ok || !direct.ok) return;
    expect(wrapped.extractImports(viaMemo.value)).toEqual(parser.extractImports(direct.value));
  });

  it('parses distinct files separately', async () => {
    const { parser, calls } = countingParser();
    const wrapped = new SharedImportParser().forParser(parser);
    await wrapped.parseFile('/r/a.ts');
    await wrapped.parseFile('/r/b.ts');
    expect(calls).toEqual(['/r/a.ts', '/r/b.ts']);
  });

  it('memoizes a failed parse and hands every reader the same error', async () => {
    const { parser, calls, syntaxError } = countingParser();
    const wrapped = new SharedImportParser().forParser(parser);

    const first = await wrapped.parseFile('/r/broken.ts');
    const second = await wrapped.parseFile('/r/broken.ts');

    expect(calls).toEqual(['/r/broken.ts']);
    expect(first).toEqual(Err(syntaxError));
    expect(second).toBe(first);
  });

  it('keys by parser: two different parsers each parse the file', async () => {
    const one = countingParser('one');
    const two = countingParser('two');
    const memo = new SharedImportParser();
    await memo.forParser(one.parser).parseFile('/r/a.ts');
    await memo.forParser(two.parser).parseFile('/r/a.ts');
    expect(one.calls).toEqual(['/r/a.ts']);
    expect(two.calls).toEqual(['/r/a.ts']);
  });

  it('keys the default registry javascript entry under the typescript parser it binds', async () => {
    const registry = getDefaultRegistry();
    const ts = registry.getByLanguage('typescript')!;
    const parse = vi
      .spyOn(ts, 'parseFile')
      .mockResolvedValue(Ok({ type: 'Program', body: null, language: 'typescript' }));
    vi.spyOn(ts, 'extractImports').mockReturnValue(Ok([imp('./dep')]));
    const memo = new SharedImportParser();

    const viaJs = await memo.forParser(registry.getByLanguage('javascript')!).parseFile('/r/a.js');
    const viaTs = await memo.forParser(ts).parseFile('/r/a.js');

    expect(parse).toHaveBeenCalledTimes(1);
    expect(viaTs).toBe(viaJs);
  });

  it('two memos share nothing', async () => {
    const { parser, calls } = countingParser();
    await new SharedImportParser().forParser(parser).parseFile('/r/a.ts');
    await new SharedImportParser().forParser(parser).parseFile('/r/a.ts');
    expect(calls).toHaveLength(2);
  });

  it('keeps the parser identity and delegates health', async () => {
    const { parser } = countingParser('ident');
    const memo = new SharedImportParser();
    const wrapped = memo.forParser(parser);
    expect(memo.forParser(parser)).toBe(wrapped);
    expect(wrapped.name).toBe('ident');
    expect(wrapped.extensions).toBe(parser.extensions);
    expect(await wrapped.health()).toEqual(Ok({ available: true, message: 'ident' }));
  });

  it('returns null from a lookup that has no parser for the file', () => {
    const memo = new SharedImportParser();
    expect(memo.forLookup({ getForFile: () => null }).getForFile('/r/a.txt')).toBeNull();
  });

  it('delegates extraction for a tree it did not produce', () => {
    const { parser } = countingParser();
    const wrapped = new SharedImportParser().forParser(parser);
    const foreign: AST = { type: 'Program', body: 'f', language: 'fake' };
    expect(wrapped.extractImports(foreign)).toEqual(Ok([imp('from:f')]));
    expect(wrapped.extractExports(foreign)).toEqual(Ok([]));
  });

  it('refuses exports from a memoized parse instead of reporting none', async () => {
    const { parser } = countingParser();
    const wrapped = new SharedImportParser().forParser(parser);
    const parsed = await wrapped.parseFile('/r/a.ts');
    if (!parsed.ok) throw new Error('fixture parse failed');
    expect(() => wrapped.extractExports(parsed.value)).toThrow(/imports only/);
  });
});

describe('runAll run context', () => {
  const config: ArchConfig = {
    enabled: true,
    baselinePath: '.harness/arch/baselines.json',
    thresholds: {},
    modules: {},
  };

  function recordingCollector(seen: unknown[]): Collector {
    return {
      category: 'complexity',
      collect: async (_c, _r, context) => {
        seen.push(context);
        return [];
      },
      getRules: () => [],
    };
  }

  it('hands every collector in one call the same context, and a fresh one per call', async () => {
    const seen: unknown[] = [];
    await runAll(config, '/project', [recordingCollector(seen), recordingCollector(seen)]);
    await runAll(config, '/project', [recordingCollector(seen)]);

    expect(seen).toHaveLength(3);
    expect(seen[0]).toBeDefined();
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).not.toBe(seen[0]);
  });

  it('createCollectorRunContext builds an empty memo', () => {
    expect(createCollectorRunContext().imports.parseCount).toBe(0);
  });
});
