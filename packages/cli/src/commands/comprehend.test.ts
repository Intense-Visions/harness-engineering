import { describe, it, expect, vi } from 'vitest';
import {
  resolveMode,
  resolveChangedScope,
  resolveCompileProvider,
  resolveStaticOnlyPosture,
  formatCompiledUnits,
  stageCompiledUnits,
  reportSemanticRegression,
} from './comprehend';
import type { ComprehensionConfig } from '../config/schema';
import type { ChangedSurface } from './validate-scope';
import type { RefReadDeps, SemanticState } from '../comprehension/regression';

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

/**
 * #1743 / CODE-R003 — contract of the `--since` regression narrative extracted out of
 * `runCheckMode`. This is the gate's only unit coverage: before the extraction the whole
 * block was inlined behind a `process.exit` and untestable, so the unreadable-ref refusal
 * (the "never report a false green" invariant) had no test anywhere in the repo. Both the
 * git seam and the logger are injected — no git, no disk, no process exit.
 */
describe('reportSemanticRegression — the --since gate contract', () => {
  const shardPath = (module: string) => `.harness/comprehension/${module}/_module.md`;
  const shard = (module: string, semantic: SemanticState) =>
    `module: ${module}\nsemantic: ${semantic}\n`;

  /** In-memory RefReadDeps. A `null` ref models an unfetched / bad / git-errored ref. */
  const makeDeps = (refs: Record<string, Record<string, SemanticState> | null>): RefReadDeps => ({
    listShardsAtRef: (ref) => {
      const modules = refs[ref];
      return modules ? Object.keys(modules).map(shardPath) : null;
    },
    showAtRef: (ref, path) => {
      const modules = refs[ref];
      if (!modules) return null;
      const hit = Object.entries(modules).find(([module]) => shardPath(module) === path);
      return hit ? shard(hit[0], hit[1]) : null;
    },
  });

  const makeLog = () => ({ error: vi.fn(), warn: vi.fn(), success: vi.fn() });

  it('refuses to report a pass when the BASE ref is unreadable', () => {
    const log = makeLog();
    const deps = makeDeps({ 'origin/main': null, HEAD: { a: 'present' } });
    expect(reportSemanticRegression('origin/main', 'main', deps, log)).toEqual({
      regressed: [],
      refUnreadable: true,
    });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("base ref 'origin/main'"));
    // No comparison happened, so the gate must not narrate a verdict either way.
    expect(log.success).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("names 'HEAD' when it is HEAD that is unreadable", () => {
    const log = makeLog();
    const deps = makeDeps({ 'origin/main': { a: 'present' }, HEAD: null });
    expect(reportSemanticRegression('origin/main', 'main', deps, log)).toEqual({
      regressed: [],
      refUnreadable: true,
    });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("'HEAD'"));
    expect(log.success).not.toHaveBeenCalled();
  });

  it("context 'pr': never flags present→absent, and advisory-warns on a committed-semantic addition", () => {
    const log = makeLog();
    const deps = makeDeps({ base: { a: 'absent' }, HEAD: { a: 'present' } });
    expect(reportSemanticRegression('base', 'pr', deps, log)).toEqual({
      regressed: [],
      refUnreadable: false,
    });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('COMMITTED semantic'));
    expect(log.success).toHaveBeenCalledWith(expect.stringContaining('Static-only PR path'));
    expect(log.error).not.toHaveBeenCalled();
  });

  it("context 'pr': the expected present→absent downgrade is silent (no warn, no regression)", () => {
    const log = makeLog();
    const deps = makeDeps({ base: { a: 'present' }, HEAD: { a: 'absent' } });
    expect(reportSemanticRegression('base', 'pr', deps, log)).toEqual({
      regressed: [],
      refUnreadable: false,
    });
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.success).toHaveBeenCalledWith(expect.stringContaining('Static-only PR path'));
  });

  it("context 'main': returns exactly the regressed modules and errors listing them", () => {
    const log = makeLog();
    const deps = makeDeps({
      base: { a: 'present', b: 'present' },
      HEAD: { a: 'absent', b: 'present' },
    });
    expect(reportSemanticRegression('base', 'main', deps, log)).toEqual({
      regressed: ['a'],
      refUnreadable: false,
    });
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('1 module(s) regressed'));
    expect(log.success).not.toHaveBeenCalled();
  });

  it("context 'main': reports a clean pass when nothing lost semantic", () => {
    const log = makeLog();
    const deps = makeDeps({ base: { a: 'present' }, HEAD: { a: 'present' } });
    expect(reportSemanticRegression('base', 'main', deps, log)).toEqual({
      regressed: [],
      refUnreadable: false,
    });
    expect(log.success).toHaveBeenCalledWith(
      expect.stringContaining('No semantic regressions on `main` vs base')
    );
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});
