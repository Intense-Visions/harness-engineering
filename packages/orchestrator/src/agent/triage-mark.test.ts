// packages/orchestrator/src/agent/triage-mark.test.ts
//
// Roadmap Auto-Triage — Phase 3, Task 3: the dispatch marker.
//
// The marker is the ONLY orchestrator write in Phase 3. It does NOT dispatch — it makes
// a human-approved item pickup-eligible for the EXISTING orchestrator loop by attaching
// the Phase-2 spec + setting an active status, then records the pre-dispatch prediction to
// the Phase-0 TriageRecord store. These tests pin every safety invariant against fakes.

import { describe, it, expect } from 'vitest';
import type { Roadmap, RoadmapFeature, ComplexityVerdict } from '@harness-engineering/types';
import type { RoadmapStore, FeatureMutation } from '@harness-engineering/core';
import type { GoNoGoCandidate } from '@harness-engineering/intelligence';
import { markApprovedForDispatch, type TriageMarkItem } from './triage-mark.js';

// --- Fakes -----------------------------------------------------------------

function feature(over: Partial<RoadmapFeature> = {}): RoadmapFeature {
  return {
    name: over.name ?? 'Fix flaky login test',
    status: over.status ?? 'planned',
    spec: over.spec ?? null,
    plans: over.plans ?? [],
    blockedBy: over.blockedBy ?? [],
    summary: over.summary ?? 'a summary',
    assignee: over.assignee ?? null,
    priority: over.priority ?? null,
    externalId: over.externalId ?? 'gh:acme/repo#1',
    updatedAt: over.updatedAt ?? null,
  };
}

/** In-memory RoadmapStore: records every patchFeature call + applies the mutation. */
function fakeStore(features: RoadmapFeature[]): {
  store: RoadmapStore;
  patches: Array<{ slug: string }>;
  featureFor: (name: string) => RoadmapFeature | undefined;
} {
  const bySlug = new Map(features.map((f) => [slugify(f.name), f]));
  const patches: Array<{ slug: string }> = [];
  // Arrow-function properties (not methods) so passing bare references to the marker does not
  // trip @typescript-eslint/unbound-method — these fakes never use `this`.
  const store = {
    load: async () => {
      return { ok: true as const, value: { milestones: [{ features }] } as unknown as Roadmap };
    },
    patchFeature: async (slug: string, mutate: FeatureMutation) => {
      patches.push({ slug });
      const target = bySlug.get(slug);
      if (!target) return { ok: false as const, error: new Error(`no shard ${slug}`) };
      Object.assign(target, mutate(target));
      return { ok: true as const, value: undefined };
    },
    addFeature: async () => ({ ok: true as const, value: undefined }),
    removeFeature: async () => ({ ok: true as const, value: undefined }),
    patchFrontmatter: async () => ({ ok: true as const, value: undefined }),
    patchAssignmentHistory: async () => ({ ok: true as const, value: undefined }),
  } as unknown as RoadmapStore;
  return { store, patches, featureFor: (name) => bySlug.get(slugify(name)) };
}

// Mirror core's slugifyFeatureName closely enough for the fake key.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function verdict(over: Partial<ComplexityVerdict> = {}): ComplexityVerdict {
  return {
    level: over.level ?? 'trivial',
    confidence: over.confidence ?? 'high',
    signals: over.signals ?? { filesTouched: 1 },
    source: over.source ?? 'static',
  };
}

function item(over: Partial<TriageMarkItem> = {}): TriageMarkItem {
  const externalId = over.candidate?.externalId ?? 'gh:acme/repo#1';
  const candidate: GoNoGoCandidate = over.candidate ?? {
    externalId,
    category: 'quick-fix',
    humanApproved: true,
  };
  return {
    candidate,
    featureName: over.featureName ?? 'Fix flaky login test',
    specPath: over.specPath ?? 'docs/changes/fix-flaky-login/proposal.md',
    labels: over.labels ?? ['test'],
    verdict: over.verdict ?? verdict(),
    scopeEstimate: over.scopeEstimate ?? 2,
    ...(over.effectiveStage !== undefined ? { effectiveStage: over.effectiveStage } : {}),
  };
}

/** Records every prediction written to the TriageRecord store. */
function fakeRecorder() {
  const writes: Array<Record<string, unknown>> = [];
  return {
    writes,
    recordPrediction: async (payload: Record<string, unknown>) => {
      writes.push(payload);
      return { ok: true as const, value: {} };
    },
  };
}

const ON = { enabled: true, ratchetStage: 1 as const };

// --- Tests -----------------------------------------------------------------

describe('markApprovedForDispatch — default-off (SC7)', () => {
  it('no-ops entirely when the feature is disabled: no patch, no prediction', async () => {
    const { store, patches } = fakeStore([feature()]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch([item()], {
      store,
      config: { enabled: false, ratchetStage: 1 },
      recordPrediction: rec.recordPrediction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.marked).toHaveLength(0);
    expect(patches).toHaveLength(0);
    expect(rec.writes).toHaveLength(0);
  });
});

describe('markApprovedForDispatch — makes an approved item pickup-eligible (SC1/SC2)', () => {
  it('attaches the generated spec + keeps an active status so the EXISTING pickup can select it', async () => {
    const f = feature({ spec: null, status: 'planned' });
    const { store, patches, featureFor } = fakeStore([f]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch(
      [item({ specPath: 'docs/changes/x/proposal.md' })],
      { store, config: ON, recordPrediction: rec.recordPrediction }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.marked).toEqual(['gh:acme/repo#1']);
    expect(patches).toHaveLength(1);
    const marked = featureFor('Fix flaky login test')!;
    // Spec attached => the item clears the spec-less→human gate on merit (not a bypass flag).
    expect(marked.spec).toBe('docs/changes/x/proposal.md');
    // Status stays an active state the orchestrator's candidate-selection accepts.
    expect(marked.status).toBe('planned');
    // The marker never steals/sets an assignee — the existing claim loop owns that.
    expect(marked.assignee).toBeNull();
  });

  it('writes the pre-dispatch prediction to the TriageRecord store keyed by externalId (P3 writes prediction)', async () => {
    const { store } = fakeStore([feature()]);
    const rec = fakeRecorder();
    await markApprovedForDispatch(
      [item({ verdict: verdict({ level: 'simple', confidence: 'medium' }), scopeEstimate: 3 })],
      { store, config: ON, recordPrediction: rec.recordPrediction }
    );
    expect(rec.writes).toHaveLength(1);
    const p = rec.writes[0]!;
    expect(p.externalId).toBe('gh:acme/repo#1');
    expect(p.scopeEstimate).toBe(3);
    expect(p.ratchetStage).toBe(1);
    expect((p.verdict as ComplexityVerdict).level).toBe('simple');
    // shapeKey is present + reflects the dispatchable escalation bucket at the predicted level.
    expect(typeof p.shapeKey).toBe('string');
    expect(p.shapeKey).toContain('|dispatchable|simple');
  });

  it('FIX 2 (SC6): stamps the PER-SHAPE effectiveStage onto the prediction, overriding config', async () => {
    const { store } = fakeStore([feature()]);
    const rec = fakeRecorder();
    // config ceiling is 1, but this shape earned effectiveStage 2 — the per-shape stage wins.
    await markApprovedForDispatch([item({ effectiveStage: 2 })], {
      store,
      config: ON,
      recordPrediction: rec.recordPrediction,
    });
    expect(rec.writes[0]!.ratchetStage).toBe(2);
  });

  it('falls back to config.ratchetStage when no per-shape effectiveStage is present (cold-start)', async () => {
    const { store } = fakeStore([feature()]);
    const rec = fakeRecorder();
    // No effectiveStage on the item ⇒ the marker stamps config.ratchetStage (Phase-3 behavior).
    await markApprovedForDispatch([item()], {
      store,
      config: ON,
      recordPrediction: rec.recordPrediction,
    });
    expect(rec.writes[0]!.ratchetStage).toBe(1);
  });
});

describe('markApprovedForDispatch — assignee gate (SC6)', () => {
  it('skips an item already assigned to a DIFFERENT assignee — never steals it', async () => {
    const f = feature({ assignee: 'someone-else', status: 'in-progress' });
    const { store, patches } = fakeStore([f]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch([item()], {
      store,
      config: ON,
      selfAssignee: 'orchestrator-1',
      recordPrediction: rec.recordPrediction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.marked).toHaveLength(0);
      expect(result.value.skipped).toContainEqual({
        externalId: 'gh:acme/repo#1',
        reason: 'assigned-elsewhere',
      });
    }
    expect(patches).toHaveLength(0);
    expect(rec.writes).toHaveLength(0);
  });

  it('marks an item assigned to SELF (idempotent re-mark)', async () => {
    const f = feature({ assignee: 'orchestrator-1', status: 'planned' });
    const { store, patches } = fakeStore([f]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch([item()], {
      store,
      config: ON,
      selfAssignee: 'orchestrator-1',
      recordPrediction: rec.recordPrediction,
    });
    expect(result.ok).toBe(true);
    expect(patches).toHaveLength(1);
    expect(rec.writes).toHaveLength(1);
  });

  it('marks an unassigned item when no selfAssignee is provided (call-site without identity)', async () => {
    const { store, patches } = fakeStore([feature({ assignee: null })]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch([item()], {
      store,
      config: ON,
      recordPrediction: rec.recordPrediction,
    });
    expect(result.ok).toBe(true);
    expect(patches).toHaveLength(1);
  });
});

describe('markApprovedForDispatch — never acts on a non-approved item (SC5)', () => {
  it('skips a candidate that is not human-approved even if passed in', async () => {
    const { store, patches } = fakeStore([feature()]);
    const rec = fakeRecorder();
    const result = await markApprovedForDispatch(
      [
        item({
          candidate: { externalId: 'gh:acme/repo#1', category: 'quick-fix', humanApproved: false },
        }),
      ],
      { store, config: ON, recordPrediction: rec.recordPrediction }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.marked).toHaveLength(0);
      expect(result.value.skipped).toContainEqual({
        externalId: 'gh:acme/repo#1',
        reason: 'not-approved',
      });
    }
    expect(patches).toHaveLength(0);
    expect(rec.writes).toHaveLength(0);
  });
});
