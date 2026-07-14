// packages/intelligence/src/triage/gate.test.ts
//
// Roadmap Auto-Triage — Phase 3, Task 2: the pure go/no-go gate.
//
// Stage 1 of the autonomy ratchet: a human go/no-go BEFORE execution. The gate is
// a pure fold over the ready candidate set — it authorizes NOTHING on its own; an
// item is `approved` only when a human has explicitly flagged it AND its escalation
// category is auto-executable. Everything else is `held` with a legible reason.

import { describe, it, expect } from 'vitest';
import { resolveGoNoGo, resolveGoNoGoStaged, AUTO_EXECUTE_CATEGORIES } from './gate.js';
import type { GoNoGoCandidate, StagedGoNoGoCandidate } from './gate.js';

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

describe('resolveGoNoGo — v1 supports stages {1,2}; deferred stages (3-4) refused', () => {
  it('Phase 4: stage 2 is now a SUPPORTED stage (the evidence-earned ceiling) — auth unchanged', () => {
    // Phase 3 refused stage 2 wholesale; Phase 4 makes it earnable, so a uniform stage-2 batch
    // now applies the SAME authorization (humanApproved AND auto-executable) as stage 1. The
    // stage only rides along on the approved item — it never relaxes the human-go requirement.
    const { approved, held } = resolveGoNoGo(
      [candidate({ category: 'quick-fix', humanApproved: true })],
      2
    );
    expect(held).toHaveLength(0);
    expect(approved).toHaveLength(1);
    expect(approved[0]!.effectiveStage).toBe(2);
  });

  it('stage 2 still HOLDS an unapproved item (auth is stage-independent — no weakening)', () => {
    const { approved, held } = resolveGoNoGo(
      [candidate({ category: 'quick-fix', humanApproved: false })],
      2
    );
    expect(approved).toHaveLength(0);
    expect(held[0]!.reason).toBe('awaiting-human-go');
  });

  it('holds EVERY item for a DEFERRED stage (3-4) — never a silent auto-go', () => {
    for (const stage of [3, 4] as const) {
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

describe('resolveGoNoGoStaged — PER-CANDIDATE evidence-derived stage (SC6)', () => {
  function staged(over: Partial<StagedGoNoGoCandidate> = {}): StagedGoNoGoCandidate {
    return {
      externalId: over.externalId ?? 'gh:acme/repo#1',
      category: over.category ?? 'quick-fix',
      humanApproved: over.humanApproved ?? false,
      effectiveStage: over.effectiveStage ?? 1,
    };
  }

  it('authorizes identically at stage 1 and stage 2 (auth is stage-INDEPENDENT)', () => {
    for (const effectiveStage of [1, 2] as const) {
      const approvedRes = resolveGoNoGoStaged([
        staged({ category: 'quick-fix', humanApproved: true, effectiveStage }),
      ]);
      expect(approvedRes.approved).toHaveLength(1);
      expect(approvedRes.approved[0]!.effectiveStage).toBe(effectiveStage);

      // Unapproved is HELD regardless of stage — the stage never manufactures a go.
      const heldRes = resolveGoNoGoStaged([
        staged({ category: 'quick-fix', humanApproved: false, effectiveStage }),
      ]);
      expect(heldRes.approved).toHaveLength(0);
      expect(heldRes.held[0]!.reason).toBe('awaiting-human-go');

      // Non-auto-executable is HELD regardless of stage (SC3 — category gate independent).
      const catRes = resolveGoNoGoStaged([
        staged({ category: 'guided-change', humanApproved: true, effectiveStage }),
      ]);
      expect(catRes.approved).toHaveLength(0);
      expect(catRes.held[0]!.reason).toBe('not-auto-executable');
    }
  });

  it('resolves stages INDEPENDENTLY per candidate in a mixed batch', () => {
    const { approved } = resolveGoNoGoStaged([
      staged({ externalId: 'a', humanApproved: true, effectiveStage: 1 }),
      staged({ externalId: 'b', humanApproved: true, effectiveStage: 2 }),
    ]);
    const byId = new Map(approved.map((c) => [c.externalId, c.effectiveStage]));
    expect(byId.get('a')).toBe(1);
    expect(byId.get('b')).toBe(2);
  });

  it('refuses a deferred per-candidate stage (3) as a fail-safe belt', () => {
    const { approved, held } = resolveGoNoGoStaged([
      staged({ humanApproved: true, effectiveStage: 3 as unknown as 1 }),
    ]);
    expect(approved).toHaveLength(0);
    expect(held[0]!.reason).toBe('ratchet-stage-unsupported');
  });
});
