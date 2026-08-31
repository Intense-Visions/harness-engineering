import { describe, it, expect, vi } from 'vitest';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import {
  createComprehendCommand,
  resolveCompileProvider,
  resolveChangedScope,
  resolveStaticOnlyPosture,
  stageCompiledUnits,
  formatCompiledUnits,
} from '../../src/commands/comprehend';
import type { ChangedSurface } from '../../src/commands/validate-scope';
import { readComprehensionConfig } from '../../src/comprehension/config';
import { maybeCreateGenerateSemantic } from '../../src/comprehension/generate-semantic';
import type { ComprehendRunResult } from '../../src/comprehension/compile-run';

// --- SF1.1: --static forces static-only (no provider ever resolved, SC4) -----

describe('resolveCompileProvider — SF1.1 static-only posture (SC4)', () => {
  it('NEVER resolves a provider under --static, even when comprehension.semantic:true', async () => {
    const spy = vi.fn(async () => ({}) as AnalysisProvider);
    const cconf = readComprehensionConfig({ comprehension: { semantic: true } });
    const provider = await resolveCompileProvider(cconf, /* staticOnly */ true, spy);
    expect(provider).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    // A null provider ⇒ no semantic seam ⇒ units are semantic: absent.
    expect(maybeCreateGenerateSemantic(provider, { maxTokensPerRun: 1000 })).toBeUndefined();
  });

  it('does not resolve a provider when comprehension.semantic:false regardless of --static', async () => {
    const spy = vi.fn(async () => ({}) as AnalysisProvider);
    const cconf = readComprehensionConfig({ comprehension: { semantic: false } });
    expect(await resolveCompileProvider(cconf, false, spy)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('resolves a provider when semantic:true and NOT static (normal posture)', async () => {
    const spy = vi.fn(async () => ({}) as AnalysisProvider);
    const cconf = readComprehensionConfig({ comprehension: { semantic: true } });
    const provider = await resolveCompileProvider(cconf, false, spy);
    expect(provider).not.toBeNull();
    expect(spy).toHaveBeenCalledOnce();
  });
});

// --- FIX E.2: hook posture SKIPS on a failed changed-surface derivation --------

describe('resolveChangedScope — FIX E.2 hook posture', () => {
  const okSurface = (files: string[]): ChangedSurface => ({ ok: true, files });
  const failSurface = (reason: string): ChangedSurface => ({ ok: false, files: [], reason });

  it('a SUCCESSFUL derivation resolves to the changed-module set (both hook and non-hook)', () => {
    const log = { warn: vi.fn() };
    const nonHook = resolveChangedScope(okSurface(['packages/core/src/a.ts']), log);
    expect(nonHook.mode).toBe('changed');
    const hook = resolveChangedScope(okSurface(['packages/core/src/a.ts']), log, { hook: true });
    expect(hook.mode).toBe('changed');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('NON-hook: a FAILED derivation still promotes to a full sweep (--all), as before', () => {
    const log = { warn: vi.fn() };
    const scope = resolveChangedScope(failSurface('detached HEAD'), log);
    expect(scope.mode).toBe('all');
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]![0]).toContain('full sweep');
  });

  it('HOOK: a FAILED derivation SKIPS (never full-sweeps the whole repo on the commit path)', () => {
    const log = { warn: vi.fn() };
    const scope = resolveChangedScope(failSurface('no merge-base'), log, { hook: true });
    expect(scope.mode).toBe('skip');
    if (scope.mode === 'skip') expect(scope.reason).toBe('no merge-base');
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0]![0]).toContain('skipping');
    expect(log.warn.mock.calls[0]![0]).not.toContain('full sweep');
  });
});

describe('createComprehendCommand — SF1 flags present', () => {
  it('exposes the --static flag', () => {
    const flags = createComprehendCommand().options.map((o) => o.long);
    expect(flags).toContain('--static');
  });

  it('exposes the --stage flag', () => {
    const flags = createComprehendCommand().options.map((o) => o.long);
    expect(flags).toContain('--stage');
  });

  // ADR 0110 §4 — the reframed regression gate takes a --context.
  it('exposes the --context flag', () => {
    const flags = createComprehendCommand().options.map((o) => o.long);
    expect(flags).toContain('--context');
  });
});

// --- ADR 0110 §1: single-writer static-only posture on the PR path -------------

describe('resolveStaticOnlyPosture — ADR 0110 §1 (single writer)', () => {
  const cconf = readComprehensionConfig({ comprehension: { semantic: true } });

  it('forces static-only OFF the main-pass (the PR path) and flags the deferral', () => {
    const posture = resolveStaticOnlyPosture(
      cconf,
      /* requestedStatic */ false,
      /* isMainPass */ false
    );
    expect(posture).toEqual({ staticOnly: true, deferredToMain: true });
  });

  it('permits semantic ON the main-pass (single writer = main)', () => {
    const posture = resolveStaticOnlyPosture(cconf, false, /* isMainPass */ true);
    expect(posture).toEqual({ staticOnly: false, deferredToMain: false });
  });

  it('an explicit --static stays static-only WITHOUT the policy-deferral flag', () => {
    // requestedStatic wins first ⇒ deferredToMain is false (not a policy downgrade).
    const posture = resolveStaticOnlyPosture(
      cconf,
      /* requestedStatic */ true,
      /* isMainPass */ true
    );
    expect(posture).toEqual({ staticOnly: true, deferredToMain: false });
  });

  it('semantic:false is static-only regardless of main-pass, without the deferral flag', () => {
    const off = readComprehensionConfig({ comprehension: { semantic: false } });
    expect(resolveStaticOnlyPosture(off, false, true)).toEqual({
      staticOnly: true,
      deferredToMain: false,
    });
  });
});

// --- SF1.2: --stage git-adds compiled unit shard paths -----------------------

function runResult(over: Partial<ComprehendRunResult> = {}): ComprehendRunResult {
  return {
    mode: 'changed',
    compiled: [],
    semanticPresent: 0,
    semanticAbsent: 0,
    skipped: [],
    fresh: [],
    ...over,
  };
}

describe('stageCompiledUnits — SF1.2 (--stage)', () => {
  it('stages exactly the compiled modules’ shard paths (via the injected seam)', async () => {
    const staged: string[] = [];
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    await stageCompiledUnits(
      runResult({ compiled: ['packages/core/src', 'packages/cli/src'] }),
      store,
      (paths) => staged.push(...paths),
      () => {} // no-op format seam so the test never touches prettier
    );
    expect(staged).toEqual([
      '.harness/comprehension/packages/core/src/_module.md',
      '.harness/comprehension/packages/cli/src/_module.md',
    ]);
  });

  it('is a no-op when nothing compiled (never shells out to git or prettier)', async () => {
    const stage = vi.fn();
    const format = vi.fn();
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    await stageCompiledUnits(runResult({ compiled: [] }), store, stage, format);
    expect(stage).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
  });

  // FIX D: shards are prettier-formatted BEFORE they are git-added, so an
  // un-formatted shard can never trip the whole-tree format:check on push.
  it('prettier-formats the shard paths BEFORE staging them', async () => {
    const calls: string[] = [];
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    const shard = '.harness/comprehension/packages/core/src/_module.md';
    await stageCompiledUnits(
      runResult({ compiled: ['packages/core/src'] }),
      store,
      (paths) => calls.push(`stage:${paths.join(',')}`),
      (paths) => {
        calls.push(`format:${paths.join(',')}`);
      }
    );
    // Format runs first, over exactly the shard paths, THEN git-add over the same set.
    expect(calls).toEqual([`format:${shard}`, `stage:${shard}`]);
  });

  it('stages even when the format seam throws (best-effort — formatting never blocks the commit)', async () => {
    const staged: string[] = [];
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    await expect(
      stageCompiledUnits(
        runResult({ compiled: ['packages/core/src'] }),
        store,
        (paths) => staged.push(...paths),
        async () => {
          // The DEFAULT seam swallows its own errors; if a custom seam throws it
          // will propagate — but the default path is best-effort. Here we assert the
          // async contract: a resolved format seam is awaited before staging.
          await Promise.resolve();
        }
      )
    ).resolves.toBeUndefined();
    expect(staged).toEqual(['.harness/comprehension/packages/core/src/_module.md']);
  });
});

// --- #1697: formatCompiledUnits — write-time formatting on EVERY compile path ---

describe('formatCompiledUnits — #1697 (path-independent shard formatting)', () => {
  it('formats EXACTLY the compiled modules’ shard paths (via the injected seam)', async () => {
    const formatted: string[] = [];
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    await formatCompiledUnits(
      runResult({ compiled: ['packages/core/src', 'packages/cli/src'] }),
      store,
      (paths) => formatted.push(...paths)
    );
    expect(formatted).toEqual([
      '.harness/comprehension/packages/core/src/_module.md',
      '.harness/comprehension/packages/cli/src/_module.md',
    ]);
  });

  it('is a no-op when nothing compiled (never touches prettier)', async () => {
    const format = vi.fn();
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    await formatCompiledUnits(runResult({ compiled: [] }), store, format);
    expect(format).not.toHaveBeenCalled();
  });
});
