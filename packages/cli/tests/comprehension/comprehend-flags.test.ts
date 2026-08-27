import { describe, it, expect, vi } from 'vitest';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import {
  createComprehendCommand,
  resolveCompileProvider,
  stageCompiledUnits,
} from '../../src/commands/comprehend';
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

describe('createComprehendCommand — SF1 flags present', () => {
  it('exposes the --static flag', () => {
    const flags = createComprehendCommand().options.map((o) => o.long);
    expect(flags).toContain('--static');
  });

  it('exposes the --stage flag', () => {
    const flags = createComprehendCommand().options.map((o) => o.long);
    expect(flags).toContain('--stage');
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
  it('stages exactly the compiled modules’ shard paths (via the injected seam)', () => {
    const staged: string[] = [];
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    stageCompiledUnits(
      runResult({ compiled: ['packages/core/src', 'packages/cli/src'] }),
      store,
      (paths) => staged.push(...paths)
    );
    expect(staged).toEqual([
      '.harness/comprehension/packages/core/src/_module.md',
      '.harness/comprehension/packages/cli/src/_module.md',
    ]);
  });

  it('is a no-op when nothing compiled (never shells out to git)', () => {
    const stage = vi.fn();
    const store = { path: (m: string) => `.harness/comprehension/${m}/_module.md` };
    stageCompiledUnits(runResult({ compiled: [] }), store, stage);
    expect(stage).not.toHaveBeenCalled();
  });
});
