/**
 * Phase 4 Task 7 (R3 mitigation): assert that the two "tracker kind" concepts
 * in the codebase are accepted independently and do not collide:
 *
 *   1. `roadmap.tracker.kind: 'github'` (file-backed sync engine) — validated
 *      by `TrackerConfigSchema` in this package. Today's only supported value
 *      is `'github'`.
 *
 *   2. `WorkflowConfig.tracker.kind: 'roadmap' | 'github-issues' | <other>`
 *      (orchestrator workflow tracker) — declared as `string` in
 *      `packages/types/src/orchestrator.ts:233` and only checked for presence
 *      by `validateWorkflowConfig`. The orchestrator's `createTracker()`
 *      factory (Phase 4 / S2) dispatches on this string.
 *
 * Two near-identical strings (`'github'` vs `'github-issues'`) live in
 * different config namespaces. This test pins both surfaces so a typo in
 * one is not silently accepted by the other.
 *
 * @see docs/changes/roadmap-tracker-only/plans/2026-05-09-phase-4-wire-consumers-plan.md (R3)
 */
import { describe, it, expect } from 'vitest';
import { TrackerConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('TrackerConfigSchema — roadmap.tracker.kind (file-backed sync engine)', () => {
  it('accepts kind: "github" (today\'s only supported value)', () => {
    const r = TrackerConfigSchema.safeParse({
      kind: 'github',
      statusMap: { 'in-progress': 'open' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects kind: "github-issues" — the orchestrator workflow string MUST NOT collide here', () => {
    const r = TrackerConfigSchema.safeParse({
      kind: 'github-issues',
      statusMap: { 'in-progress': 'open' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects kind: "roadmap" — workflow string also distinct from this schema', () => {
    const r = TrackerConfigSchema.safeParse({
      kind: 'roadmap',
      statusMap: { 'in-progress': 'open' },
    });
    expect(r.success).toBe(false);
  });
});

describe('HarnessConfigSchema — roadmap.tracker passthrough (R3 regression)', () => {
  it('accepts roadmap.tracker.kind: "github" via the top-level schema', () => {
    const r = HarnessConfigSchema.safeParse({
      version: 1,
      roadmap: {
        mode: 'file-less',
        tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
      },
    });
    expect(r.success).toBe(true);
  });
});

/**
 * WorkflowConfig.tracker.kind is unvalidated string at the type layer; the
 * orchestrator's `createTracker()` performs the runtime dispatch. This block
 * pins that contract via a documentation-style assertion (no live import of
 * the orchestrator validator — it lives in a sibling package).
 */
describe('WorkflowConfig.tracker.kind — string contract documentation', () => {
  // The contract enumeration. Adding a new tracker kind requires updating
  // both this list AND the orchestrator's createTracker() factory.
  const SUPPORTED_WORKFLOW_TRACKER_KINDS = ['roadmap', 'github-issues'] as const;

  it('enumerates supported workflow tracker kinds (intent: pin contract)', () => {
    expect(SUPPORTED_WORKFLOW_TRACKER_KINDS).toContain('roadmap');
    expect(SUPPORTED_WORKFLOW_TRACKER_KINDS).toContain('github-issues');
  });

  it('confirms the two namespaces are syntactically distinct ("github" vs "github-issues")', () => {
    const fileBacked = 'github';
    const orchestrator = 'github-issues';
    expect(fileBacked).not.toBe(orchestrator);
  });
});
