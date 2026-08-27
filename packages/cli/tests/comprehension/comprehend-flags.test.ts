import { describe, it, expect, vi } from 'vitest';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { createComprehendCommand, resolveCompileProvider } from '../../src/commands/comprehend';
import { readComprehensionConfig } from '../../src/comprehension/config';
import { maybeCreateGenerateSemantic } from '../../src/comprehension/generate-semantic';

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
});
