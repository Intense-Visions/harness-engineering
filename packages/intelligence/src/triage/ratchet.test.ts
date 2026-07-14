// packages/intelligence/src/triage/ratchet.test.ts
//
// Roadmap Auto-Triage — Phase 4, Task 2: the pure autonomy-ratchet stage resolver.
// SC4 (v1 CAP AT STAGE 2 — never 3/4), SC6 (advance on success-rate ≥ threshold over
// min-sample; a mispredict holds/resets). Never returns a stage the evidence doesn't support.

import { describe, it, expect } from 'vitest';
import { resolveStage, DEFAULT_RATCHET_CONFIG, V1_MAX_STAGE } from './ratchet.js';
import type { RatchetOutcome } from './ratchet.js';

/** N matched then M mispredicts, in chronological order. */
function history(matched: number, mispredicts: number): RatchetOutcome[] {
  return [
    ...Array.from({ length: matched }, () => ({ matched: true })),
    ...Array.from({ length: mispredicts }, () => ({ matched: false })),
  ];
}

describe('resolveStage', () => {
  it('cold-start (no history) ⇒ stage 1 (human before execution)', () => {
    expect(resolveStage([])).toBe(1);
  });

  it('below min-sample stays at stage 1 even with a perfect record', () => {
    // Fewer than the minimum sample: not enough evidence to advance, regardless of rate.
    const cfg = DEFAULT_RATCHET_CONFIG;
    expect(resolveStage(history(cfg.minSample - 1, 0))).toBe(1);
  });

  it('SC6: success-rate ≥ threshold over min-sample ⇒ advance to stage 2', () => {
    const cfg = DEFAULT_RATCHET_CONFIG;
    expect(resolveStage(history(cfg.minSample, 0))).toBe(2);
  });

  it('SC6: a rate below threshold over enough samples holds at stage 1', () => {
    // Half matched — below the default 0.9 threshold. Holds.
    expect(resolveStage(history(5, 5))).toBe(1);
  });

  it('SC6: a recent mispredict resets — a fresh mispredict drops the trailing window below threshold', () => {
    // Long clean run, then a mispredict: the trailing-window rate dips under threshold → hold at 1.
    const h = [...history(20, 0), { matched: false }];
    expect(resolveStage(h)).toBe(1);
  });

  it('SC4: never returns a stage above V1_MAX_STAGE (2) even with an overwhelming clean record', () => {
    const stage = resolveStage(history(1000, 0));
    expect(stage).toBeLessThanOrEqual(V1_MAX_STAGE);
    expect(V1_MAX_STAGE).toBe(2);
    expect(stage).toBe(2);
  });

  it('recovers to stage 2 after a mispredict once a fresh clean window re-accumulates', () => {
    const cfg = DEFAULT_RATCHET_CONFIG;
    // Mispredict, then a FULL fresh window of matches — the old miss ages out of the
    // trailing window entirely, so the shape re-earns stage 2.
    const h = [{ matched: false }, ...history(cfg.window, 0)];
    expect(resolveStage(h)).toBe(2);
  });

  it('honors a custom threshold/min-sample config', () => {
    const cfg = { threshold: 0.5, minSample: 2, window: 4 };
    // 2 of 3 matched = 0.67 ≥ 0.5 over min-sample 2, and the latest outcome is a match
    // (no reset) → advance under the loosened threshold.
    expect(resolveStage([{ matched: false }, { matched: true }, { matched: true }], cfg)).toBe(2);
  });
});
