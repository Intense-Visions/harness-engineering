/**
 * Proves the DEFAULT loader is wired and its verdict is honoured — not just the
 * injected-loader seam. `vi.mock` replaces the real
 * `@typescript-eslint/typescript-estree` with a module that resolves but has
 * lost the API surface this parser calls, which is what `health()` must detect
 * through the real `import()` rather than through a test-only seam.
 *
 * In its own file because the module mock is file-scoped. Nothing else in
 * `packages/core/src` imports estree at runtime (it is a type-only import
 * there), so this file is the whole blast radius of the mock.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@typescript-eslint/typescript-estree', () => ({
  version: '0.0.0-mocked',
  // Present but not callable: the exact shape a `typeof parse === 'function'`
  // guard exists to reject. Declared (rather than omitted) because vitest's
  // mocked namespace throws on a missing export, which would exercise the
  // property-access-threw branch instead of this one.
  parse: 'no longer a function',
}));

import { TypeScriptParser } from '../../../src/shared/parsers/typescript';

describe('TypeScriptParser.health with the default loader (#2267)', () => {
  it('reports unavailable when the real import yields no callable parse', async () => {
    const result = await new TypeScriptParser().health();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.available).toBe(false);
    expect(result.value.message).toContain('without a callable `parse` export');
    // Not merely "no version": the mocked version must not leak out as if the
    // parser were healthy.
    expect(result.value.version).toBeUndefined();
  });

  it('propagates the same verdict through parseFile', async () => {
    const result = await new TypeScriptParser().parseFile(
      new URL('./typescript-health-default-loader.test.ts', import.meta.url).pathname
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected err');
    expect(result.error.code).toBe('PARSER_UNAVAILABLE');
  });
});
