import { describe, it, expect, vi } from 'vitest';
import {
  resolveMode,
  resolveChangedScope,
  resolveCompileProvider,
  resolveStaticOnlyPosture,
  formatCompiledUnits,
  stageCompiledUnits,
} from './comprehend';
import type { ComprehensionConfig } from '../config/schema';
import type { ChangedSurface } from './validate-scope';

/**
 * Behavior contract for the exported resolution + shard-output helpers of
 * `harness comprehend`. Characterizes the CURRENT behavior of the mode
 * precedence, the `--changed` scope fallback (full-sweep vs hook-skip), the
 * static-only provider gate (resolver never called on the static path), the
 * single-writer static-only posture, and the format/stage seams (no-op on
 * nothing-compiled; format-before-stage ordering). These are the deterministic
 * decision points a refactor must preserve; the heavy compile pipeline is out of
 * scope. All external seams are injected. Behavior characterized as-is.
 */

const cconf = (over: Partial<ComprehensionConfig> = {}): ComprehensionConfig =>
  ({ semantic: true, ...over }) as ComprehensionConfig;

describe('resolveMode — flag precedence', () => {
  it('defaults to changed when no flags are set', () => {
    expect(resolveMode({})).toBe('changed');
  });
  it('honors the refresh > check > stats > all > changed precedence', () => {
    expect(resolveMode({ refresh: true, check: true, stats: true, all: true })).toBe('refresh');
    expect(resolveMode({ check: true, stats: true, all: true })).toBe('check');
    expect(resolveMode({ stats: true, all: true })).toBe('stats');
    expect(resolveMode({ all: true })).toBe('all');
  });
});

describe('resolveChangedScope — derivation success vs failure posture', () => {
  it('returns the changed-module scope when the surface derived cleanly', () => {
    const warn = vi.fn();
    const surface = { ok: true, files: ['packages/cli/src/foo.ts'] } as ChangedSurface;
    const scope = resolveChangedScope(surface, { warn });
    expect(scope.mode).toBe('changed');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to a full sweep (and warns) on derivation failure for a non-hook run', () => {
    const warn = vi.fn();
    const surface = { ok: false, reason: 'detached HEAD', files: [] } as unknown as ChangedSurface;
    const scope = resolveChangedScope(surface, { warn });
    expect(scope.mode).toBe('all');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('full sweep'));
  });

  it('skips (never full-sweeps) on derivation failure under the hook posture', () => {
    const warn = vi.fn();
    const surface = { ok: false, reason: 'no merge-base', files: [] } as unknown as ChangedSurface;
    const scope = resolveChangedScope(surface, { warn }, { hook: true });
    expect(scope).toMatchObject({ mode: 'skip', reason: 'no merge-base' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipping'));
  });
});

describe('resolveCompileProvider — static-only gate', () => {
  it('returns null and never resolves a provider under static-only', async () => {
    const resolver = vi.fn();
    const provider = await resolveCompileProvider(cconf(), true, resolver);
    expect(provider).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });

  it('returns null and never resolves when semantic is disabled', async () => {
    const resolver = vi.fn();
    const provider = await resolveCompileProvider(cconf({ semantic: false }), false, resolver);
    expect(provider).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });

  it('resolves the provider (with the configured model) on the semantic path', async () => {
    const fake = { name: 'p' } as unknown;
    const resolver = vi.fn().mockResolvedValue(fake);
    const provider = await resolveCompileProvider(
      cconf({ model: 'gpt-x' }),
      false,
      resolver as never
    );
    expect(provider).toBe(fake);
    expect(resolver).toHaveBeenCalledWith('gpt-x');
  });
});

describe('resolveStaticOnlyPosture — single-writer policy', () => {
  it('is static-only when explicitly requested', () => {
    expect(resolveStaticOnlyPosture(cconf(), true, true)).toEqual({
      staticOnly: true,
      deferredToMain: false,
    });
  });
  it('is static-only when semantic is disabled', () => {
    expect(resolveStaticOnlyPosture(cconf({ semantic: false }), false, true)).toEqual({
      staticOnly: true,
      deferredToMain: false,
    });
  });
  it('defers to main (static-only) off the main pass when semantic would generate', () => {
    expect(resolveStaticOnlyPosture(cconf(), false, false)).toEqual({
      staticOnly: true,
      deferredToMain: true,
    });
  });
  it('generates semantic on the main pass', () => {
    expect(resolveStaticOnlyPosture(cconf(), false, true)).toEqual({
      staticOnly: false,
      deferredToMain: false,
    });
  });
});

describe('formatCompiledUnits / stageCompiledUnits — shard output seams', () => {
  const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };

  it('formatCompiledUnits is a no-op when nothing compiled', async () => {
    const format = vi.fn();
    await formatCompiledUnits({ compiled: [] }, store, format);
    expect(format).not.toHaveBeenCalled();
  });

  it('formatCompiledUnits formats exactly the compiled shards', async () => {
    const format = vi.fn();
    await formatCompiledUnits({ compiled: ['a', 'b'] }, store, format);
    expect(format).toHaveBeenCalledWith([
      '.harness/comprehension/a/_module.md',
      '.harness/comprehension/b/_module.md',
    ]);
  });

  it('stageCompiledUnits is a fully inert no-op when nothing compiled', async () => {
    const stage = vi.fn();
    const format = vi.fn();
    await stageCompiledUnits({ compiled: [] }, store, stage, format);
    expect(stage).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
  });

  it('stageCompiledUnits formats BEFORE staging the shards', async () => {
    const order: string[] = [];
    const format = vi.fn(() => {
      order.push('format');
    });
    const stage = vi.fn(() => {
      order.push('stage');
    });
    await stageCompiledUnits({ compiled: ['a'] }, store, stage, format);
    expect(order).toEqual(['format', 'stage']);
    expect(stage).toHaveBeenCalledWith(['.harness/comprehension/a/_module.md']);
  });
});
