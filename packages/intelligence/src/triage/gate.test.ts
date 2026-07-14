// packages/intelligence/src/triage/gate.test.ts
//
// Roadmap Auto-Triage — Phase 3, Task 2: the pure go/no-go gate.
//
// Stage 1 of the autonomy ratchet: a human go/no-go BEFORE execution. The gate is
// a pure fold over the ready candidate set — it authorizes NOTHING on its own; an
// item is `approved` only when a human has explicitly flagged it AND its escalation
// category is auto-executable. Everything else is `held` with a legible reason.

import { describe, it, expect } from 'vitest';
import { resolveGoNoGo, AUTO_EXECUTE_CATEGORIES } from './gate.js';
import type { GoNoGoCandidate } from './gate.js';

/** Build a candidate with sensible defaults; override per case. */
function candidate(over: Partial<GoNoGoCandidate> = {}): GoNoGoCandidate {
  return {
    externalId: over.externalId ?? 'gh:acme/repo#1',
    category: over.category ?? 'quick-fix',
    humanApproved: over.humanApproved ?? false,
  };
}

describe('resolveGoNoGo — stage 1 (human go/no-go before execution)', () => {
  it('holds an auto-executable item that has NOT been human-approved (SC4: no item dispatches without a human go)', () => {
    const { approved, held } = resolveGoNoGo(
      [candidate({ category: 'quick-fix', humanApproved: false })],
      1
    );
    expect(approved).toHaveLength(0);
    expect(held).toHaveLength(1);
    expect(held[0]!.reason).toBe('awaiting-human-go');
  });

  it('approves an auto-executable item ONLY once a human has explicitly approved it', () => {
    const { approved, held } = resolveGoNoGo(
      [candidate({ externalId: 'gh:acme/repo#7', category: 'diagnostic', humanApproved: true })],
      1
    );
    expect(held).toHaveLength(0);
    expect(approved).toHaveLength(1);
    expect(approved[0]!.externalId).toBe('gh:acme/repo#7');
    expect(approved[0]!.category).toBe('diagnostic');
  });

  it('holds a human-approved item whose category is NOT auto-executable (SC3)', () => {
    for (const category of ['guided-change', 'full-exploration'] as const) {
      const { approved, held } = resolveGoNoGo([candidate({ category, humanApproved: true })], 1);
      expect(approved).toHaveLength(0);
      expect(held).toHaveLength(1);
      expect(held[0]!.reason).toBe('not-auto-executable');
    }
  });

  it('category gate takes precedence over the approval gate (an approved non-autoExecute item reads not-auto-executable, not awaiting-human-go)', () => {
    const { held } = resolveGoNoGo(
      [candidate({ category: 'full-exploration', humanApproved: true })],
      1
    );
    expect(held[0]!.reason).toBe('not-auto-executable');
  });

  it('partitions a mixed batch: only the approved + auto-executable items pass', () => {
    const { approved, held } = resolveGoNoGo(
      [
        candidate({ externalId: 'a', category: 'quick-fix', humanApproved: true }), // approve
        candidate({ externalId: 'b', category: 'quick-fix', humanApproved: false }), // hold (no go)
        candidate({ externalId: 'c', category: 'diagnostic', humanApproved: true }), // approve
        candidate({ externalId: 'd', category: 'guided-change', humanApproved: true }), // hold (category)
      ],
      1
    );
    expect(approved.map((c) => c.externalId).sort()).toEqual(['a', 'c']);
    expect(held.map((c) => c.externalId).sort()).toEqual(['b', 'd']);
  });

  it('AUTO_EXECUTE_CATEGORIES is exactly {quick-fix, diagnostic} (mirrors the orchestrator escalation default)', () => {
    expect([...AUTO_EXECUTE_CATEGORIES].sort()).toEqual(['diagnostic', 'quick-fix']);
  });

  it('holds everything on an empty batch without throwing (degrade-empty)', () => {
    const { approved, held } = resolveGoNoGo([], 1);
    expect(approved).toHaveLength(0);
    expect(held).toHaveLength(0);
  });
});

describe('resolveGoNoGo — ratchet stages beyond 1 are refused in Phase 3', () => {
  it('holds EVERY item for any stage other than 1 (stages 2-4 are not implemented until Phase 4)', () => {
    for (const stage of [2, 3, 4] as const) {
      const { approved, held } = resolveGoNoGo(
        [candidate({ category: 'quick-fix', humanApproved: true })],
        stage
      );
      expect(approved).toHaveLength(0);
      expect(held).toHaveLength(1);
      expect(held[0]!.reason).toBe('ratchet-stage-unsupported');
    }
  });
});
