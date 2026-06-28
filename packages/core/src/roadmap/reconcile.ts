import type { Roadmap, RoadmapFeature, Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import type { RoadmapStore } from './store/roadmap-store';
import { applyRoadmapDiff } from './store/apply-diff';
import { setStatus } from './assignee-lifecycle';

/**
 * Outcome of a reconcile pass, partitioning the supplied closed `External-ID`s.
 */
export interface ReconcileResult {
  /** Row names flipped to `done` this pass. */
  markedDone: string[];
  /** Row names whose matched row was already `done` (no write). */
  alreadyDone: string[];
  /** Closed `External-ID`s that map to no roadmap row (no write). */
  unmatched: string[];
}

/**
 * Auto-done reconciler (Phase 5, D6). Given a set of closed issue `External-ID`s
 * (`github:owner/repo#NNN`), flip exactly the matching non-`done` roadmap rows to
 * `done` and persist — conflict-free, idempotent, store-routed.
 *
 * Pure with respect to discovery: the caller supplies the closed-id set (CLI
 * fetch / Action GraphQL); this function performs no network or fs IO beyond the
 * injected {@link RoadmapStore}. It reads and writes ONLY through the store
 * (`store.load()` + {@link applyRoadmapDiff}) — never a direct aggregate read,
 * so invariant R is untouched and it works in both sharded and monolith modes.
 *
 * The `→ done` transition routes through {@link setStatus} (the assignee-lifecycle
 * authority), which auto-clears any live assignee and appends one `unassigned`
 * history record, preserving `assignee ≠ null ⟺ in-progress`. Per D6 it ONLY
 * moves rows `→ done`: an already-`done` match is a no-op (`alreadyDone`), an
 * unmatched id is recorded (`unmatched`), and no other transition is produced.
 *
 * `applyRoadmapDiff` emits one `patchFeature` per changed row (→ N shards for N
 * issues) plus a single `patchAssignmentHistory` (→ `_meta.md`) when an assignee
 * was cleared; an already-done pass diffs to nothing, so it writes nothing.
 */
export async function reconcileDoneFromClosedIssues(
  store: RoadmapStore,
  closedExternalIds: Iterable<string>,
  options?: { date?: string }
): Promise<Result<ReconcileResult>> {
  const closed = new Set(closedExternalIds);
  const loaded = await store.load();
  if (!loaded.ok) return loaded;

  const roadmap: Roadmap = loaded.value;
  const before = structuredClone(roadmap);
  const date = options?.date ?? new Date().toISOString().slice(0, 10);

  const byExternalId = new Map<string, RoadmapFeature>();
  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (!feature.externalId) continue;
      const existing = byExternalId.get(feature.externalId);
      if (existing) {
        // Two rows share one External-ID: only the last-indexed row can be
        // matched/flipped (map overwrite). Behavior is unchanged — surface the
        // collision so the duplicate linkage can be cleaned up.
        console.warn(
          `harness-reconcile: duplicate External-ID "${feature.externalId}" on rows ` +
            `"${existing.name}" and "${feature.name}"; only "${feature.name}" can be reconciled.`
        );
      }
      byExternalId.set(feature.externalId, feature);
    }
  }

  const result: ReconcileResult = { markedDone: [], alreadyDone: [], unmatched: [] };
  for (const id of closed) {
    const feature = byExternalId.get(id);
    if (!feature) {
      result.unmatched.push(id);
      continue;
    }
    if (feature.status === 'done') {
      result.alreadyDone.push(feature.name);
      continue;
    }
    setStatus(roadmap, feature, 'done', date);
    result.markedDone.push(feature.name);
  }

  const persisted = await applyRoadmapDiff(store, before, roadmap);
  if (!persisted.ok) return persisted;

  return Ok(result);
}
