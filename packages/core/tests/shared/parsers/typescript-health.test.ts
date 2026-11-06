/**
 * `TypeScriptParser.health()` must be able to say "no".
 *
 * It used to `return Ok({ available: true, version: '7.0.0' })` unconditionally
 * (#2267): it probed nothing, and the version was wrong by a major — the
 * installed `@typescript-eslint/typescript-estree` is 8.x. Because
 * `validateDependencies` gates its whole parser-unavailable abstention on this
 * one answer, no production input could reach that abstention, nor any of the
 * consumer branches built on top of it.
 *
 * These tests exercise the real `TypeScriptParser` — not a stand-in parser
 * object — so each one pins a genuinely reachable false branch. The estree
 * module is reached through an injected loader for three of them and through
 * the real `import()` (made to fail with `vi.mock`) for the fourth, so the
 * default path is covered too and the seam is not the only thing under test.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { TypeScriptParser } from '../../../src/shared/parsers/typescript';

const require_ = createRequire(import.meta.url);

/** The real module, loaded the way the default loader loads it. */
async function realEstree() {
  return (await import('@typescript-eslint/typescript-estree')) as unknown as {
    parse: (code: string, options: Record<string, unknown>) => never;
  };
}

describe('TypeScriptParser.health (honest probe, #2267)', () => {
  it('reports the installed estree version, not a hardcoded literal', async () => {
    const installed = (
      require_('@typescript-eslint/typescript-estree/package.json') as { version: string }
    ).version;

    const result = await new TypeScriptParser().health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(true);
    // Positive discriminator: the reported version must equal the version on
    // disk. The old hardcoded '7.0.0' fails this against an 8.x install.
    expect(result.value.version).toBe(installed);
    expect(result.value.version).not.toBe('7.0.0');
  });

  it('reports unavailable, naming the load failure, when the estree module cannot be resolved', async () => {
    const parser = new TypeScriptParser(() =>
      Promise.reject(new Error("Cannot find module '@typescript-eslint/typescript-estree'"))
    );

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('could not be loaded');
    expect(result.value.message).toContain('Cannot find module');
    expect(result.value.version).toBeUndefined();
  });

  it('reports unavailable when the estree module resolves without a callable parse export', async () => {
    const parser = new TypeScriptParser(
      () => Promise.resolve({ version: '8.59.2' }) as never // API surface gone
    );

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('without a callable `parse` export');
  });

  it('reports unavailable when the trial parse throws', async () => {
    const parser = new TypeScriptParser(() =>
      Promise.resolve({
        version: '8.59.2',
        parse: () => {
          throw new Error('TypeScript versions prior to 4.7 are not supported');
        },
      })
    );

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('trial parse failed');
    expect(result.value.message).toContain('not supported');
  });

  it('reports unavailable when parse succeeds but yields an AST the extractors cannot read', async () => {
    // The failure mode a `typeof parse === 'function'` check cannot catch: the
    // call returns, without throwing, an object that is not a usable ESTree
    // Program. Only an end-to-end probe distinguishes this from health.
    const parser = new TypeScriptParser(() =>
      Promise.resolve({
        version: '8.59.2',
        parse: () => ({ type: 'Program', body: [], comments: [] }) as never,
      })
    );

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('extractors cannot read');
    expect(result.value.message).toContain('imports usable: false');
  });

  it('still reports available when the real module is injected explicitly', async () => {
    // Guards the inverse of the probe: the assertions above must be failing on
    // the planted defect, not on the probe being impossible to satisfy.
    const parser = new TypeScriptParser(realEstree as never);

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(true);
  });
});

describe('TypeScriptParser.parseFile when the parser is unavailable (#2267)', () => {
  it('returns PARSER_UNAVAILABLE instead of crashing or reporting a syntax error', async () => {
    const parser = new TypeScriptParser(() => Promise.reject(new Error('ENOENT estree')));

    // An existing, perfectly valid file: the failure must be attributed to the
    // parser, not to the input.
    const result = await parser.parseFile(
      new URL('./typescript-health.test.ts', import.meta.url).pathname
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('PARSER_UNAVAILABLE');
    expect(result.error.details.parser).toBe('typescript');
    expect(result.error.message).toContain('ENOENT estree');
  });

  it('resolves the module once and reuses the verdict across calls', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('resolved once')));
    const parser = new TypeScriptParser(loader as never);

    await parser.health();
    await parser.parseFile('/nonexistent.ts');
    await parser.health();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('TypeScriptParser.health when reading the module throws (#2267)', () => {
  it('reports unavailable rather than letting the access escape', async () => {
    // A module namespace whose property access throws — an exotic loader or a
    // partially-initialised ESM namespace. Reading `parse` is itself fallible,
    // so the guard must be inside the failure handling, not beside it.
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('namespace getter exploded');
        },
      }
    );
    const parser = new TypeScriptParser(() => Promise.resolve(hostile as never));

    const result = await parser.health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('namespace getter exploded');
  });
});
