import { describe, it, expect } from 'vitest';
import { shouldRunComprehendHook } from '../../src/comprehension/hook';
import type { HarnessConfig } from '../../src/config/schema';

/**
 * SF1.3 — the config-gated pre-commit hook helper. The hook is OPT-IN
 * (`comprehension.hook: true`, default off) and STATIC-ONLY + NON-BLOCKING. The
 * helper decides only whether the hook step runs; the command it invokes always
 * passes `--static`, so the hook path can never resolve a provider / call an LLM.
 */
describe('shouldRunComprehendHook — SF1.3 gating', () => {
  it('returns false by default (opt-in — no config, hook absent)', () => {
    expect(shouldRunComprehendHook(undefined)).toBe(false);
    expect(shouldRunComprehendHook(null)).toBe(false);
    expect(shouldRunComprehendHook({} as HarnessConfig)).toBe(false);
  });

  it('returns false when comprehension.hook is explicitly false', () => {
    expect(shouldRunComprehendHook({ comprehension: { hook: false } } as HarnessConfig)).toBe(
      false
    );
  });

  it('returns true when comprehension.hook is enabled (default committed storage)', () => {
    expect(shouldRunComprehendHook({ comprehension: { hook: true } } as HarnessConfig)).toBe(true);
  });

  it('returns false when hook is enabled but storage is cache (shards are not git-tracked)', () => {
    expect(
      shouldRunComprehendHook({
        comprehension: { hook: true, storage: 'cache' },
      } as HarnessConfig)
    ).toBe(false);
  });

  it('never enables semantic — the hook path is always static-only regardless of comprehension.semantic', () => {
    // The helper is a pure run/no-run gate; enabling semantic in config must not
    // change that a hook run stays static-only. Enabling semantic does not gate
    // the hook off, and the hook command still passes --static (SC4).
    expect(
      shouldRunComprehendHook({
        comprehension: { hook: true, semantic: true },
      } as HarnessConfig)
    ).toBe(true);
  });
});
