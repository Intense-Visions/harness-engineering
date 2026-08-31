import { describe, it, expect } from 'vitest';
import {
  readComprehensionConfig,
  comprehensionEndpoint,
  selectSemanticModel,
  resolveComprehensionCiMode,
} from '../../src/comprehension/config';
import {
  HarnessConfigSchema,
  ComprehensionConfigSchema,
  type HarnessConfig,
} from '../../src/config/schema';

const cfg = (over: Record<string, unknown> = {}) => ComprehensionConfigSchema.parse(over);

describe('readComprehensionConfig', () => {
  it('returns all defaults when the block is absent', () => {
    expect(readComprehensionConfig(undefined)).toEqual({
      storage: 'committed',
      semantic: true,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 4,
      ci: 'verify',
      hook: false,
    });
  });

  it('applies overrides and defaults the rest', () => {
    const config = { comprehension: { semantic: false, concurrency: 2 } } as HarnessConfig;
    expect(readComprehensionConfig(config)).toEqual({
      storage: 'committed',
      semantic: false,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 2,
      ci: 'verify',
      hook: false,
    });
  });

  it('handles a null config', () => {
    expect(readComprehensionConfig(null).storage).toBe('committed');
  });
});

describe('ComprehensionConfigSchema wired into HarnessConfigSchema', () => {
  it('accepts a valid comprehension block', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'cache' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid enum value', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('resolveComprehensionCiMode (ADR 0110 §2 — the seam is now CONSUMED)', () => {
  it("defaults to 'verify' (token-free gate) when unset", () => {
    expect(resolveComprehensionCiMode(undefined)).toBe('verify');
    expect(resolveComprehensionCiMode(null)).toBe('verify');
  });

  it("reads 'off' from config (gate disabled)", () => {
    expect(resolveComprehensionCiMode({ comprehension: { ci: 'off' } } as HarnessConfig)).toBe(
      'off'
    );
  });

  it("reads 'refresh' from config (main-pass seam)", () => {
    expect(resolveComprehensionCiMode({ comprehension: { ci: 'refresh' } } as HarnessConfig)).toBe(
      'refresh'
    );
  });
});

describe('comprehensionEndpoint', () => {
  it('reflects analysisBaseUrl and is empty when unset', () => {
    expect(comprehensionEndpoint(cfg({ analysisBaseUrl: 'http://vendor/v1' }))).toEqual({
      baseUrl: 'http://vendor/v1',
    });
    expect(comprehensionEndpoint(cfg({}))).toEqual({});
  });
});

describe('selectSemanticModel (ADR 0109 slice 3 — model/provider decisions cannot diverge)', () => {
  // The regression this pins: a config-declared endpoint must NOT get a Claude
  // model id forced onto it just because `claude` is on PATH. Before the fix, the
  // model was chosen from `resolveProviderKind()` WITHOUT the endpoint, so it
  // returned 'claude-cli' → 'claude-haiku-4-5' → the vendor gateway rejected it and
  // comprehension silently produced zero semantic units.
  it('returns undefined for a config endpoint even with claude on PATH (the bug)', () => {
    expect(
      selectSemanticModel(cfg({ analysisBaseUrl: 'http://vendor/v1' }), {
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBeUndefined();
  });

  it('returns the Claude default when no endpoint and claude is on PATH', () => {
    expect(selectSemanticModel(cfg({}), { isClaudeCliAvailable: () => true, env: {} })).toBe(
      'claude-haiku-4-5'
    );
  });

  it('an explicit config model wins over any provider', () => {
    expect(
      selectSemanticModel(cfg({ model: 'my-model', analysisBaseUrl: 'http://vendor/v1' }), {
        isClaudeCliAvailable: () => true,
        env: {},
      })
    ).toBe('my-model');
  });

  it('returns undefined when nothing resolves (degrade to static-only)', () => {
    expect(
      selectSemanticModel(cfg({}), { isClaudeCliAvailable: () => false, env: {} })
    ).toBeUndefined();
  });
});
