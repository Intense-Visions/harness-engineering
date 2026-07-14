// packages/cli/src/commands/roadmap/triage-approve.test.ts
//
// Roadmap Auto-Triage — Phase 3, Task 4: the batched go/no-go pure core.
//
// Pins the two pure functions offline: `deriveReadyCandidates` (which brainstorm rows are even
// ELIGIBLE for a human go) and `buildApprovalPlan` (the human-approval partition through the
// stage-1 gate). No dispatch, no IO — the marker + store are wired in the command action.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import {
  deriveReadyCandidates,
  buildApprovalPlan,
  resolveEffectiveStage,
  type ReadyCandidate,
} from './triage-approve.js';
import { shapeKey, type RatchetOutcome } from '@harness-engineering/intelligence';
import type { BrainstormReportRow } from './triage.js';
import { runApproveCommand } from './triage.js';

function feature(over: Partial<RoadmapFeature> = {}): RoadmapFeature {
  return {
    name: over.name ?? 'Fix flaky login test',
    status: over.status ?? 'planned',
    spec: over.spec ?? null,
    plans: over.plans ?? [],
    blockedBy: over.blockedBy ?? [],
    summary: over.summary ?? 's',
    assignee: over.assignee ?? null,
    priority: over.priority ?? null,
    externalId: over.externalId ?? 'gh:acme/repo#1',
    updatedAt: over.updatedAt ?? null,
  };
}

function roadmapOf(features: RoadmapFeature[]): Roadmap {
  return { milestones: [{ name: 'M', isBacklog: false, features }] } as unknown as Roadmap;
}

/** A completed, dispatchable brainstorm row (the ready-candidate happy path). */
function completedRow(over: Partial<BrainstormReportRow> = {}): BrainstormReportRow {
  return {
    externalId: over.externalId ?? 'gh:acme/repo#1',
    name: over.name ?? 'Fix flaky login test',
    status: over.status ?? 'planned',
    level: 'trivial',
    result: over.result ?? {
      outcome: { kind: 'completed', spec: { decisions: [] } } as never,
      specPath: 'docs/changes/fix-flaky/proposal.md',
      rescore: {
        externalId: 'gh:acme/repo#1',
        dispatchable: true,
        verdict: { level: 'trivial', confidence: 'high', signals: {}, source: 'static' },
        levers: { scope: { value: { blastRadius: 4 } } },
        rationale: 'ok',
      } as never,
    },
  } as BrainstormReportRow;
}

describe('deriveReadyCandidates', () => {
  it('keeps only completed + spec-written + dispatchable rows tied to an actionable feature', () => {
    const roadmap = roadmapOf([feature()]);
    const ready = deriveReadyCandidates([completedRow()], roadmap);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.externalId).toBe('gh:acme/repo#1');
    expect(ready[0]!.specPath).toBe('docs/changes/fix-flaky/proposal.md');
    // spec now present => guided-change (no scope: label override) — held by the gate later.
    expect(ready[0]!.category).toBe('guided-change');
    expect(ready[0]!.scopeEstimate).toBe(4);
  });

  it('drops a halted row (no spec drafted)', () => {
    const halted = {
      externalId: 'gh:acme/repo#2',
      name: 'X',
      status: 'planned',
      level: 'moderate',
      result: { outcome: { kind: 'halted', reason: 'error', fork: {}, detail: 'no model' } },
    } as unknown as BrainstormReportRow;
    const roadmap = roadmapOf([feature({ externalId: 'gh:acme/repo#2', name: 'X' })]);
    expect(deriveReadyCandidates([halted], roadmap)).toHaveLength(0);
  });

  it('drops a completed row whose re-score is NOT dispatchable', () => {
    const row = completedRow({
      result: {
        outcome: { kind: 'completed', spec: { decisions: [] } } as never,
        specPath: 'docs/changes/x/proposal.md',
        rescore: {
          externalId: 'gh:acme/repo#1',
          dispatchable: false,
          holdReason: 'unresolved-scope',
          verdict: { level: 'simple', confidence: 'low', signals: {}, source: 'static' },
          levers: { scope: { value: 'unknown' } },
          rationale: 'held',
        } as never,
      },
    });
    expect(deriveReadyCandidates([row], roadmapOf([feature()]))).toHaveLength(0);
  });
});

// --- buildApprovalPlan -----------------------------------------------------

function ready(over: Partial<ReadyCandidate> = {}): ReadyCandidate {
  return {
    externalId: over.externalId ?? 'gh:acme/repo#1',
    featureName: over.featureName ?? 'Fix flaky login test',
    specPath: over.specPath ?? 'docs/changes/x/proposal.md',
    category: over.category ?? 'quick-fix',
    level: over.level ?? 'trivial',
    confidence: over.confidence ?? 'high',
    signals: over.signals ?? {},
    source: over.source ?? 'static',
    scopeEstimate: over.scopeEstimate ?? 2,
    labels: over.labels ?? [],
  };
}

describe('buildApprovalPlan — stage-1 human go/no-go partition', () => {
  it('marks nothing when no ids are approved (SC4/SC5 — a human go is required)', () => {
    const plan = buildApprovalPlan([ready()], { approvedIds: new Set(), stage: 1 });
    expect(plan.toMark).toHaveLength(0);
    // An auto-executable item that was not approved is HELD as awaiting-human-go (not dispatched).
    expect(plan.held).toContainEqual({ externalId: 'gh:acme/repo#1', reason: 'awaiting-human-go' });
  });

  it('marks an approved + auto-executable item (quick-fix)', () => {
    const plan = buildApprovalPlan([ready({ category: 'quick-fix' })], {
      approvedIds: new Set(['gh:acme/repo#1']),
      stage: 1,
    });
    expect(plan.toMark).toHaveLength(1);
    expect(plan.toMark[0]!.candidate.humanApproved).toBe(true);
    expect(plan.toMark[0]!.specPath).toBe('docs/changes/x/proposal.md');
    expect(plan.held).toHaveLength(0);
  });

  it('holds an approved item whose category is NOT auto-executable (SC3: guided-change stays human)', () => {
    const plan = buildApprovalPlan([ready({ category: 'guided-change' })], {
      approvedIds: new Set(['gh:acme/repo#1']),
      stage: 1,
    });
    expect(plan.toMark).toHaveLength(0);
    expect(plan.held).toContainEqual({
      externalId: 'gh:acme/repo#1',
      reason: 'not-auto-executable',
    });
  });

  it('approveAll approves every ready item — still subject to the category gate', () => {
    const plan = buildApprovalPlan(
      [
        ready({ externalId: 'a', category: 'quick-fix' }),
        ready({ externalId: 'b', category: 'diagnostic' }),
        ready({ externalId: 'c', category: 'guided-change' }),
      ],
      { approvedIds: new Set(), approveAll: true, stage: 1 }
    );
    expect(plan.toMark.map((m) => m.candidate.externalId).sort()).toEqual(['a', 'b']);
    expect(plan.held).toContainEqual({ externalId: 'c', reason: 'not-auto-executable' });
  });

  it('builds a prediction-bearing marker item (verdict + scopeEstimate carried through)', () => {
    const plan = buildApprovalPlan(
      [ready({ category: 'quick-fix', level: 'simple', confidence: 'medium', scopeEstimate: 5 })],
      { approvedIds: new Set(['gh:acme/repo#1']), stage: 1 }
    );
    const m = plan.toMark[0]!;
    expect(m.verdict.level).toBe('simple');
    expect(m.verdict.confidence).toBe('medium');
    expect(m.scopeEstimate).toBe(5);
  });
});

// --- FIX 2 (SC6): the per-shape evidence-derived ratchet stage --------------

describe('resolveEffectiveStage — min(resolveStage(history), ceiling, 2)', () => {
  const clean = (n: number): RatchetOutcome[] =>
    Array.from({ length: n }, () => ({ matched: true }));

  it('cold-start (EMPTY history) ⇒ stage 1 for EVERY ceiling (identical to the static default)', () => {
    for (const ceiling of [1, 2] as const) {
      expect(resolveEffectiveStage([], ceiling)).toBe(1);
    }
  });

  it('a shape with a strong clean history earns stage 2 — but only up to the ceiling', () => {
    // 10 clean matches clears the default ratchet bar (≥90% over ≥5). Ceiling 2 ⇒ stage 2.
    expect(resolveEffectiveStage(clean(10), 2)).toBe(2);
    // The config stage is a CEILING: even with strong evidence, ceiling 1 holds it at stage 1.
    expect(resolveEffectiveStage(clean(10), 1)).toBe(1);
  });

  it('a recent mispredict RESETS an otherwise-strong shape back to stage 1 (SC6)', () => {
    const withRecentMiss: RatchetOutcome[] = [...clean(9), { matched: false }];
    expect(resolveEffectiveStage(withRecentMiss, 2)).toBe(1);
  });
});

describe('buildApprovalPlan — cold-start invariance (FIX 2 / SC6)', () => {
  it('EMPTY history ⇒ every approved candidate gets effectiveStage 1 (byte-identical to static)', () => {
    // The OVERRIDING safety constraint: with no accumulated outcomes, the per-shape ratchet
    // must resolve stage 1 for every candidate — the same stage the Phase-3 static default
    // stamped. `historyForShape` omitted ⇒ cold-start (empty history) for every shape.
    const plan = buildApprovalPlan(
      [
        ready({ externalId: 'a', category: 'quick-fix' }),
        ready({ externalId: 'b', category: 'diagnostic' }),
      ],
      { approvedIds: new Set(['a', 'b']), stage: 2 } // config CEILING 2, but no evidence
    );
    expect(plan.toMark).toHaveLength(2);
    for (const m of plan.toMark) {
      expect(m.effectiveStage).toBe(1); // cold-start ⇒ stage 1, not the ceiling
    }
  });

  it('cold-start with config stage 1 also yields stage 1 (unchanged from Phase 3)', () => {
    const plan = buildApprovalPlan([ready({ category: 'quick-fix' })], {
      approvedIds: new Set(['gh:acme/repo#1']),
      stage: 1,
    });
    expect(plan.toMark[0]!.effectiveStage).toBe(1);
  });

  it('a shape whose history earned stage 2 advances INDEPENDENTLY (only that shape)', () => {
    // Two shapes: `trivial` has a strong clean history (earns 2); `simple` has none (stays 1).
    const trivialKey = shapeKey([], 'dispatchable', 'trivial');
    const history = (key: string): readonly RatchetOutcome[] =>
      key === trivialKey ? Array.from({ length: 10 }, () => ({ matched: true })) : [];

    const plan = buildApprovalPlan(
      [
        ready({ externalId: 'earned', category: 'quick-fix', level: 'trivial' }),
        ready({ externalId: 'cold', category: 'quick-fix', level: 'simple' }),
      ],
      { approvedIds: new Set(['earned', 'cold']), stage: 2, historyForShape: history }
    );
    const byId = new Map(plan.toMark.map((m) => [m.candidate.externalId, m.effectiveStage]));
    expect(byId.get('earned')).toBe(2); // evidence advanced this shape
    expect(byId.get('cold')).toBe(1); // the OTHER shape stays at the cold-start default
  });

  it('the config ceiling still caps an evidence-strong shape (ceiling 1 ⇒ stage 1)', () => {
    const trivialKey = shapeKey([], 'dispatchable', 'trivial');
    const history = (key: string): readonly RatchetOutcome[] =>
      key === trivialKey ? Array.from({ length: 10 }, () => ({ matched: true })) : [];
    const plan = buildApprovalPlan([ready({ category: 'quick-fix', level: 'trivial' })], {
      approvedIds: new Set(['gh:acme/repo#1']),
      stage: 1, // ceiling 1 holds it even though the shape earned 2
      historyForShape: history,
    });
    expect(plan.toMark[0]!.effectiveStage).toBe(1);
  });

  it('does NOT weaken auth: an unapproved item is still held even when its shape earned stage 2', () => {
    const trivialKey = shapeKey([], 'dispatchable', 'trivial');
    const history = (key: string): readonly RatchetOutcome[] =>
      key === trivialKey ? Array.from({ length: 10 }, () => ({ matched: true })) : [];
    const plan = buildApprovalPlan([ready({ category: 'quick-fix', level: 'trivial' })], {
      approvedIds: new Set(), // NOT approved
      stage: 2,
      historyForShape: history,
    });
    // Even at earned stage 2, the human-go requirement holds — nothing is marked.
    expect(plan.toMark).toHaveLength(0);
    expect(plan.held).toContainEqual({ externalId: 'gh:acme/repo#1', reason: 'awaiting-human-go' });
  });
});

// --- runApproveCommand (guard paths — no live model needed) -----------------

describe('runApproveCommand — safety guards', () => {
  function tmpProject(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-approve-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    return dir;
  }

  it('is inert when roadmap.autoTriage.enabled is not true (default-off, SC7)', async () => {
    const dir = tmpProject({
      'harness.config.json': JSON.stringify({
        version: 1,
        roadmap: { autoTriage: { enabled: false } },
      }),
      'docs/roadmap.md': '## Milestone: M\n\n### Feature: A\n\nStatus: planned\n',
    });
    const res = await runApproveCommand(dir, { config: path.join(dir, 'harness.config.json') });
    expect(res.note).toBe('disabled');
    expect(res.marked).toHaveLength(0);
  });

  it('reports no-roadmap when docs/roadmap.md is absent (no changes)', async () => {
    const dir = tmpProject({
      'harness.config.json': JSON.stringify({
        version: 1,
        roadmap: { autoTriage: { enabled: true } },
      }),
    });
    const res = await runApproveCommand(dir, { config: path.join(dir, 'harness.config.json') });
    expect(res.note).toBe('no-roadmap');
    expect(res.marked).toHaveLength(0);
  });

  it('enabled + no live model + no approvals ⇒ marks nothing (offline halts every item)', async () => {
    const dir = tmpProject({
      'harness.config.json': JSON.stringify({
        version: 1,
        roadmap: { autoTriage: { enabled: true, ratchetStage: 1 } },
      }),
      'docs/roadmap.md': [
        '# Roadmap',
        '',
        '## Milestone: M',
        '',
        '### Feature: A',
        '',
        '- Status: planned',
        '- Summary: a small fix',
        '- External-ID: gh:x/y#1',
        '',
      ].join('\n'),
    });
    const res = await runApproveCommand(dir, { config: path.join(dir, 'harness.config.json') });
    // Enabled but no provider wired ⇒ the brainstorm halts every item ⇒ no ready candidates ⇒
    // nothing is marked. The safety invariant: NOTHING dispatches without a human go + a model.
    expect(res.marked).toHaveLength(0);
  });
});
