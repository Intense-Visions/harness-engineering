import type { Roadmap, RoadmapFeature, FeatureStatus } from '@harness-engineering/types';

/**
 * The assignee lifecycle authority.
 *
 * One invariant governs the `assignee` field:
 *
 *   **`assignee ≠ null` ⟺ `status === 'in-progress'`.**
 *
 * An assignee names *who is currently executing* a feature. It is written at
 * execution start (not selection) and cleared on any transition away from
 * `in-progress`. This module is the single source of truth for that rule and
 * for what counts as a *machine* (orchestrator) assignee, so the GitHub
 * adapter, the sync engine, the health rules, the MCP write path, and the
 * orchestrator tracker adapter can never drift apart again — the original bug
 * was born from two adapters disagreeing about how to treat machine ids.
 *
 * Pure functions, no IO. Transition helpers mutate the passed `roadmap` /
 * `feature` in place and append assignment-history records, matching the
 * existing `assignFeature` convention.
 *
 * @see docs/changes/assignee-execution-lifecycle/proposal.md
 */

/**
 * Patterns that identify a *machine* (orchestrator) assignee — an executor that
 * lives only in `docs/roadmap.md` and must never be pushed to a GitHub issue's
 * `assignee` field (it is not a real GitHub login).
 *
 * - `orchestrator-{8 hex}` — the current orchestrator id form.
 * - `{anything}-{8 hex}`   — the legacy hostname-hash form
 *   (e.g. `chads-macbook-pro-8565381d`).
 *
 * Consolidates the regex that was previously inline in
 * `adapters/github-issues.ts`.
 */
const MACHINE_ASSIGNEE_PATTERNS: readonly RegExp[] = [
  /^orchestrator-[0-9a-f]{8}$/,
  /^[\w-]+-[0-9a-f]{8}$/,
];

/** True for orchestrator / machine ids. Null is never a machine assignee. */
export function isMachineAssignee(assignee: string | null): boolean {
  if (assignee === null) return false;
  return MACHINE_ASSIGNEE_PATTERNS.some((re) => re.test(assignee));
}

/**
 * The invariant predicate: a feature carries an assignee if and only if it is
 * `in-progress`.
 */
export function assigneeInvariantHolds(feature: RoadmapFeature): boolean {
  return (feature.assignee !== null) === (feature.status === 'in-progress');
}

/**
 * Outbound-sync policy: should this assignee be pushed to the external tracker's
 * assignee field? Only real (non-null, non-machine) assignees are pushed.
 * Machine claims stay local-only (represented as a comment + in-progress label).
 */
export function pushAssigneeToExternal(assignee: string | null): boolean {
  return assignee !== null && !isMachineAssignee(assignee);
}

function pushUnassigned(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  prev: string,
  date: string
): void {
  roadmap.assignmentHistory.push({
    feature: feature.name,
    assignee: prev,
    action: 'unassigned',
    date,
  });
}

/**
 * Coordination guard: may `assignee` take this row *without stealing a live
 * claim held by someone else*?
 *
 * This is the **single, status-agnostic first-claim-wins rule** the orchestrator
 * relies on: a row is claimable by `assignee` only when it is currently
 * unassigned or already held by `assignee` itself. Any other (foreign) assignee
 * — human or machine, in-progress or not — blocks the claim, so the orchestrator
 * never dispatches onto a row a human (or peer orchestrator) has touched.
 *
 * It is intentionally *stricter* than {@link claim}, which permits reassigning a
 * *non*-in-progress row's stale owner (the human-driven `manage_roadmap update`
 * path). Centralizing the predicate here keeps the orchestrator adapter from
 * re-deriving its own divergent compare-and-set inline (D4: one definition).
 */
export function isClaimableBy(feature: RoadmapFeature, assignee: string): boolean {
  return feature.assignee === null || feature.assignee === assignee;
}

/**
 * Execution-start transition: mark the feature `in-progress` and record who is
 * executing it.
 *
 * **Compare-and-set (first claim wins, S4-003):** if the feature is already
 * `in-progress` under a *different* assignee, this is a no-op — the existing
 * claim is preserved. This covers human↔orchestrator and orchestrator↔
 * orchestrator races. Idempotent for the same assignee. Reassignment of a row
 * that is *not* already in-progress appends an `unassigned` record for any
 * previous owner before the `assigned` record, keeping the history auditable.
 *
 * Mutates `roadmap` / `feature` in place.
 */
export function claim(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  assignee: string,
  date: string
): void {
  // First claim wins: never steal a live claim from a different owner.
  if (
    feature.status === 'in-progress' &&
    feature.assignee !== null &&
    feature.assignee !== assignee
  ) {
    return;
  }

  feature.status = 'in-progress';
  if (feature.assignee === assignee) return;

  if (feature.assignee !== null) {
    pushUnassigned(roadmap, feature, feature.assignee, date);
  }
  feature.assignee = assignee;
  roadmap.assignmentHistory.push({
    feature: feature.name,
    assignee,
    action: 'assigned',
    date,
  });
}

/**
 * Execution-end / handoff transition: clear the assignee. If the feature was
 * `in-progress`, move it back to `planned` (an unowned `in-progress` row would
 * violate the invariant). No-op when already unassigned. Appends an
 * `unassigned` history record.
 *
 * Mutates `roadmap` / `feature` in place.
 */
export function release(roadmap: Roadmap, feature: RoadmapFeature, date: string): void {
  if (feature.status === 'in-progress') {
    feature.status = 'planned';
  }
  if (feature.assignee === null) return;

  const prev = feature.assignee;
  feature.assignee = null;
  pushUnassigned(roadmap, feature, prev, date);
}

/**
 * Status-change chokepoint (S4-001). Applies `status`; any transition to a non-
 * `in-progress` status auto-clears a present assignee (with an `unassigned`
 * history record), so the invariant can never be transiently violated. A
 * transition *to* `in-progress` does not fabricate an assignee — use
 * {@link claim} to set one.
 *
 * Mutates `roadmap` / `feature` in place.
 */
export function setStatus(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  status: FeatureStatus,
  date: string
): void {
  feature.status = status;
  if (status !== 'in-progress' && feature.assignee !== null) {
    const prev = feature.assignee;
    feature.assignee = null;
    pushUnassigned(roadmap, feature, prev, date);
  }
}
