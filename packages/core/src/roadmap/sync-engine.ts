import { isDeepStrictEqual } from 'node:util';
import type {
  Roadmap,
  RoadmapFeature,
  FeatureStatus,
  SyncResult,
  TrackerSyncConfig,
  ExternalTicketState,
} from '@harness-engineering/types';
import { resolveRoadmapStore } from './store/factory';
import { applyRoadmapDiff } from './store/apply-diff';
import type { TrackerSyncAdapter, ExternalSyncOptions, TicketWriteOptions } from './tracker-sync';
import { resolveReverseStatus } from './tracker-sync';
import { isRegression } from './status-rank';
import { isMachineAssignee, setStatus } from './assignee-lifecycle';
// Known adapters: adapters/github-issues.ts (GitHubIssuesSyncAdapter).
// This module consumes adapters via the TrackerSyncAdapter interface.
// Changes to the interface contract require updating both this file and all adapters.

function emptySyncResult(): SyncResult {
  return {
    created: [],
    updated: [],
    assignmentChanges: [],
    errors: [],
    dryRun: false,
    planned: { creates: [], updates: [], localWrites: [] },
    skippedCreates: [],
    skippedStateChanges: [],
    suppressedInbound: [],
    examined: { roadmapRows: 0, ticketsFetched: null },
  };
}

/** Count every feature row across every milestone — the push-side denominator. */
function countRoadmapRows(roadmap: Roadmap): number {
  let rows = 0;
  for (const milestone of roadmap.milestones) rows += milestone.features.length;
  return rows;
}

/**
 * Build a title-based dedup index from pre-fetched tickets.
 * Only includes tickets that carry the configured labels (e.g., harness-managed).
 * Prefers open issues over closed when titles collide.
 */
function buildDedupIndex(
  tickets: ExternalTicketState[] | undefined,
  config: TrackerSyncConfig
): Map<string, ExternalTicketState> {
  const index = new Map<string, ExternalTicketState>();
  if (!tickets) return index;

  const configLabels = new Set((config.labels ?? []).map((l) => l.toLowerCase()));
  for (const ticket of tickets) {
    const hasConfigLabels =
      configLabels.size === 0 || ticket.labels.some((l) => configLabels.has(l.toLowerCase()));
    if (!hasConfigLabels) continue;
    const key = ticket.title.toLowerCase();
    const prev = index.get(key);
    if (!prev || (prev.status === 'closed' && ticket.status === 'open')) {
      index.set(key, ticket);
    }
  }
  return index;
}

/** Guard settings resolved once per push, with today's behaviour as the default. */
interface PushGuards {
  dryRun: boolean;
  allowCreate: boolean;
  syncIssueState: boolean;
}

function resolveGuards(options?: ExternalSyncOptions): PushGuards {
  // Normalize once rather than optional-chaining each field: same result, and it
  // keeps this function under the repo's cyclomatic-complexity threshold.
  const opts = options ?? {};
  return {
    dryRun: opts.dryRun ?? false,
    allowCreate: opts.allowCreate ?? true,
    syncIssueState: opts.syncIssueState ?? true,
  };
}

/**
 * Resolve the externalId for a feature: dedup-link, create, or return existing.
 * Returns true if the feature now has an externalId (and should be updated), false
 * if creation was withheld, failed, or a new ticket was created (already recorded).
 *
 * Both guards report rather than silently drop: a withheld create lands in
 * `skippedCreates` (with the reason) or `planned.creates`, never nowhere.
 */
async function resolveExternalId(
  feature: RoadmapFeature,
  milestone: string,
  adapter: TrackerSyncAdapter,
  dedupIndex: Map<string, ExternalTicketState>,
  result: SyncResult,
  guards: PushGuards
): Promise<boolean> {
  if (feature.externalId) return true;

  const existing = dedupIndex.get(feature.name.toLowerCase());
  if (existing) {
    feature.externalId = existing.externalId;
    return true;
  }

  // Creation guard: a cron that invents issues is unacceptable, so refusing to
  // create is a first-class outcome that must be visible in the report.
  if (!guards.allowCreate) {
    result.skippedCreates.push({ feature: feature.name, milestone, reason: 'create-disabled' });
    return false;
  }
  if (guards.dryRun) {
    result.planned.creates.push({ feature: feature.name, milestone });
    result.skippedCreates.push({ feature: feature.name, milestone, reason: 'dry-run' });
    return false;
  }

  const createResult = await adapter.createTicket(feature, milestone);
  if (createResult.ok) {
    feature.externalId = createResult.value.externalId;
    result.created.push(createResult.value);
  } else {
    result.errors.push({ featureOrId: feature.name, error: createResult.error });
  }
  return false;
}

/**
 * Record the open/closed transition a status push WOULD have made, when the
 * state guard is suppressing it. Requires the ticket's current external state,
 * which is only known from the prefetched set — an unknown current state is not
 * reported as a change (we cannot claim a transition we cannot see).
 */
function recordSuppressedStateChange(
  feature: RoadmapFeature,
  config: TrackerSyncConfig,
  ticketByExternalId: Map<string, ExternalTicketState>,
  result: SyncResult
): void {
  const current = ticketByExternalId.get(feature.externalId!);
  if (!current) return;
  const desired = config.statusMap[feature.status];
  if (!desired || desired === current.status) return;
  result.skippedStateChanges.push({
    externalId: feature.externalId!,
    from: current.status,
    to: desired,
  });
}

/**
 * Push planning fields from roadmap to external service.
 * - Features without externalId get a new ticket (externalId stored on feature object)
 * - Features with externalId get updated with current planning fields
 * Mutates `roadmap` in-place (stores new externalIds).
 * Never throws -- errors collected per-feature.
 *
 * `options` is additive: omitting it reproduces the pre-guard behaviour exactly
 * (create allowed, issue state patched, writes performed).
 */
export async function syncToExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  prefetchedTickets?: ExternalTicketState[],
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  const result = emptySyncResult();
  const guards = resolveGuards(options);
  result.dryRun = guards.dryRun;
  result.examined = {
    roadmapRows: countRoadmapRows(roadmap),
    ticketsFetched: prefetchedTickets ? prefetchedTickets.length : null,
  };
  const dedupIndex = buildDedupIndex(prefetchedTickets, config);
  const ticketByExternalId = new Map(
    (prefetchedTickets ?? []).map((t) => [t.externalId, t] as const)
  );
  const writeOptions: TicketWriteOptions = { syncIssueState: guards.syncIssueState };

  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      const shouldUpdate = await resolveExternalId(
        feature,
        milestone.name,
        adapter,
        dedupIndex,
        result,
        guards
      );
      if (!shouldUpdate) continue;

      if (!guards.syncIssueState) {
        recordSuppressedStateChange(feature, config, ticketByExternalId, result);
      }

      if (guards.dryRun) {
        result.planned.updates.push(feature.externalId!);
        continue;
      }

      const updateResult = await adapter.updateTicket(
        feature.externalId!,
        feature,
        milestone.name,
        writeOptions
      );
      if (updateResult.ok) {
        result.updated.push(feature.externalId!);
      } else {
        result.errors.push({ featureOrId: feature.externalId!, error: updateResult.error });
      }
    }
  }

  return result;
}

/**
 * Apply a single external ticket's assignee and status to a roadmap feature in-place.
 */
function applyTicketToFeature(
  roadmap: Roadmap,
  ticketState: ExternalTicketState,
  feature: RoadmapFeature,
  config: TrackerSyncConfig,
  forceSync: boolean,
  result: SyncResult
): void {
  // A live machine claim is local truth. Remember it before any status change:
  // if inbound sync drives status away from in-progress, the assignee must be
  // released through the lifecycle authority (not orphaned), or we recreate the
  // RMH005 violation in reverse — a non-in-progress row still carrying a claim.
  const localMachineClaim = isMachineAssignee(feature.assignee);

  // Held by reference so the status routing below can amend it in place. The
  // assignee block and the setStatus branch are no longer mutually exclusive
  // (the routing condition widened from "machine claim" to "any assignee"), so
  // a reported `to:` can be overwritten by the release that follows it.
  let reportedAssignmentChange: {
    feature: string;
    from: string | null;
    to: string | null;
  } | null = null;

  // Assignee: external wins — EXCEPT (i) a live machine claim, which is local
  // truth, and (ii) tracker SILENCE. A null external assignee is missing
  // information, not an authoritative empty value: an unassigned issue is the
  // DEFAULT state of every issue, so letting it clear a local assignee means
  // the tracker's default silently overwrites a human's decision. Assignment
  // (null → someone) and reassignment are unaffected; forceSync still clears.
  if (!localMachineClaim && ticketState.assignee !== feature.assignee) {
    const clearsLocalAssignee = ticketState.assignee === null && feature.assignee !== null;
    if (clearsLocalAssignee && !forceSync) {
      result.suppressedInbound.push({
        feature: feature.name,
        field: 'assignee',
        from: feature.assignee,
        to: null,
        reason: 'tracker-reports-no-assignee',
      });
    } else {
      reportedAssignmentChange = {
        feature: feature.name,
        from: feature.assignee,
        to: ticketState.assignee,
      };
      result.assignmentChanges.push(reportedAssignmentChange);
      feature.assignee = ticketState.assignee;
    }
  }

  // Status: use reverse mapping with label disambiguation
  const resolvedStatus = resolveReverseStatus(ticketState.status, ticketState.labels, config);
  if (!resolvedStatus || resolvedStatus === feature.status) return;

  const newStatus = resolvedStatus as FeatureStatus;
  if (!forceSync && isRegression(feature.status, newStatus)) return;
  // Guard: external "open" → "planned" must not override manually-set "blocked".
  if (!forceSync && feature.status === 'blocked' && newStatus === 'planned') return;

  // Guard: a merely-OPEN issue is not an opinion about backlog vs planned —
  // both are open states, and an unlabelled open issue is the default state of
  // every issue. Gated on the ABSENCE of a label rather than on the resolved
  // status, because a direct `open → planned` key resolves an explicitly-
  // labelled `planned` ticket identically to a bare one.
  //
  // The escape is specifically the label that would PRODUCE this write. Any
  // other status label is not evidence for it: under a direct `open` key the
  // resolved status is `planned` regardless, so a `blocked`-labelled ticket
  // would otherwise promote a backlog row on the strength of an opinion the
  // resolver already discarded. An explicit `planned` label IS an opinion for
  // `planned`, and still promotes.
  if (
    !forceSync &&
    feature.status === 'backlog' &&
    newStatus === 'planned' &&
    !ticketState.labels.includes(newStatus)
  ) {
    result.suppressedInbound.push({
      feature: feature.name,
      field: 'status',
      from: 'backlog',
      to: 'planned',
      reason: 'tracker-open-without-status-label',
    });
    return;
  }

  // When inbound sync moves an ASSIGNED row away from in-progress, route
  // through setStatus() so the assignee is released through the lifecycle
  // authority and an `unassigned` history entry is recorded — keeping
  // `assignee ≠ null ⟺ in-progress` (RMH005, an error-severity health rule).
  //
  // The condition is deliberately ANY non-null assignee, not just a machine
  // claim. The bare status write below used to be safe because the assignee
  // block above always reconciled the assignee from external first; the
  // tracker-silence guard removed that precondition, so a human-assigned row
  // whose ticket closes would otherwise land `done` while still assigned.
  // `feature.assignee` is read AFTER the assignee block, so this sees the
  // post-reconcile value.
  const date = new Date().toISOString().slice(0, 10);
  if (feature.assignee !== null && newStatus !== 'in-progress') {
    const released = feature.assignee;
    setStatus(roadmap, feature, newStatus, date);
    // setStatus releases the assignee, discarding whatever the assignee block
    // just wrote. Reconcile the report with the value that actually landed:
    // `assignmentChanges` flows unfiltered into the `--json` CI artifact, and a
    // `to:` naming an assignee that is null on disk is a lie in that artifact.
    // Amending rather than dropping keeps `from:` — the release is still a
    // change, and (per RMH005 repair on an already-invalid row) may be the only
    // record that the row lost its owner at all.
    if (feature.assignee === null) {
      if (reportedAssignmentChange) reportedAssignmentChange.to = null;
      else result.assignmentChanges.push({ feature: feature.name, from: released, to: null });
    }
    return;
  }
  feature.status = newStatus;
}

/**
 * Pull execution fields (assignee, status) from external service.
 * - External assignee wins over local assignee
 * - Status changes are subject to directional guard (no regression unless forceSync)
 * - Uses label-based reverse mapping for GitHub status disambiguation
 * Mutates `roadmap` in-place.
 * Never throws -- errors collected per-feature.
 */
export async function syncFromExternal(
  roadmap: Roadmap,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions,
  prefetchedTickets?: ExternalTicketState[]
): Promise<SyncResult> {
  const result = emptySyncResult();
  const forceSync = options?.forceSync ?? false;
  result.dryRun = options?.dryRun ?? false;
  result.examined.roadmapRows = countRoadmapRows(roadmap);

  // Build lookup from externalId to feature
  const featureByExternalId = new Map<string, RoadmapFeature>();
  for (const milestone of roadmap.milestones) {
    for (const feature of milestone.features) {
      if (feature.externalId) {
        featureByExternalId.set(feature.externalId, feature);
      }
    }
  }

  if (featureByExternalId.size === 0) return result;

  // Use pre-fetched tickets or fetch fresh
  let tickets: ExternalTicketState[];
  if (prefetchedTickets) {
    tickets = prefetchedTickets;
  } else {
    const fetchResult = await adapter.fetchAllTickets();
    if (!fetchResult.ok) {
      // ticketsFetched stays null: the pull denominator is unknown, not zero.
      result.errors.push({ featureOrId: '*', error: fetchResult.error });
      return result;
    }
    tickets = fetchResult.value;
  }
  result.examined.ticketsFetched = tickets.length;

  for (const ticketState of tickets) {
    const feature = featureByExternalId.get(ticketState.externalId);
    if (!feature) continue;
    applyTicketToFeature(roadmap, ticketState, feature, config, forceSync, result);
  }

  return result;
}

/**
 * Names of the rows whose body differs between two roadmap snapshots — the set
 * `applyRoadmapDiff` would rewrite. Reported by a dry run in place of writing.
 *
 * Identity is the feature name, matching `applyRoadmapDiff`'s slug identity
 * closely enough for a report (a rename shows up as one added + one removed row).
 */
function changedFeatureNames(before: Roadmap, after: Roadmap): string[] {
  const beforeByName = new Map<string, RoadmapFeature>();
  for (const milestone of before.milestones) {
    for (const feature of milestone.features) beforeByName.set(feature.name, feature);
  }
  const changed: string[] = [];
  for (const milestone of after.milestones) {
    for (const feature of milestone.features) {
      const prev = beforeByName.get(feature.name);
      if (!prev || !isDeepStrictEqual(prev, feature)) changed.push(feature.name);
    }
  }
  return changed;
}

/**
 * In-process mutex for serializing fullSync calls.
 * Prevents concurrent writes to the roadmap source.
 */
let syncMutex: Promise<void> = Promise.resolve();

/**
 * Full bidirectional sync: load roadmap via the store, push, pull, write back.
 * Serialized by an in-process mutex.
 *
 * Takes the project root (not a single file path) so it works in both modes:
 * `resolveRoadmapStore` loads from shards when `docs/roadmap.d/` exists, else the
 * monolith aggregate. Writeback is per-shard via `applyRoadmapDiff` — only the
 * rows whose planning/execution fields changed are rewritten (each its own shard
 * in sharded mode); monolith stays a whole-file rewrite.
 */
export async function fullSync(
  projectRoot: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  // Queue behind any in-progress sync
  const previousSync = syncMutex;
  let releaseMutex: () => void;
  syncMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });

  try {
    // Inside the try: a rejected predecessor must still reach the `finally`,
    // or this call's own mutex slot is never released and every subsequent
    // sync in the process queues behind a promise that never settles.
    await previousSync;

    const store = resolveRoadmapStore({ projectRoot });
    const loaded = await store.load();
    if (!loaded.ok) {
      // Echo the requested mode even on the load-failure path: a caller that
      // asked for a dry run must never see this reported as an applied run.
      return {
        ...emptySyncResult(),
        dryRun: options?.dryRun ?? false,
        errors: [{ featureOrId: '*', error: loaded.error }],
      };
    }

    const roadmap = loaded.value;
    const before = structuredClone(roadmap);
    const dryRun = options?.dryRun ?? false;

    // Fetch tickets for push (dedup) phase
    const fetchResult = await adapter.fetchAllTickets();
    const tickets = fetchResult.ok ? fetchResult.value : undefined;

    // Push first (planning fields out) — mutates roadmap (stores externalIds)
    const pushResult = await syncToExternal(roadmap, adapter, config, tickets, options);

    // Pull with fresh data (push may have changed issue states)
    const pullResult = await syncFromExternal(roadmap, adapter, config, options);

    // Per-shard writeback: exactly the changed rows are rewritten. A dry run
    // performs no writeback at all — it reports which rows it would have
    // rewritten instead, so "zero writes" means zero local writes too.
    const localWrites = changedFeatureNames(before, roadmap);
    const persisted = dryRun ? null : await applyRoadmapDiff(store, before, roadmap);

    // Merge results (surface a writeback failure under the '*' envelope)
    const writebackErrors =
      persisted && !persisted.ok ? [{ featureOrId: '*', error: persisted.error }] : [];

    // Stamp `last_synced` on a successful non-dry-run writeback (#1037). Previously
    // nothing on this path ever wrote it — `applyRoadmapDiff`'s frontmatter branch
    // only fires when before/after frontmatter differ (it never does here) and is a
    // no-op in sharded mode anyway — so `_meta.md` drifted arbitrarily stale ("22
    // days behind") even when every patch applied cleanly. A dry run writes nothing;
    // a failed writeback leaves the prior stamp untouched.
    let stampErrors: { featureOrId: string; error: Error }[] = [];
    if (!dryRun && persisted && persisted.ok) {
      const stamped = await store.stampLastSynced(new Date().toISOString());
      if (!stamped.ok) stampErrors = [{ featureOrId: '*', error: stamped.error }];
    }
    return {
      created: pushResult.created,
      updated: pushResult.updated,
      assignmentChanges: pullResult.assignmentChanges,
      errors: [...pushResult.errors, ...pullResult.errors, ...writebackErrors, ...stampErrors],
      dryRun,
      planned: {
        creates: pushResult.planned.creates,
        updates: pushResult.planned.updates,
        localWrites: dryRun ? localWrites : [],
      },
      skippedCreates: pushResult.skippedCreates,
      skippedStateChanges: pushResult.skippedStateChanges,
      suppressedInbound: pullResult.suppressedInbound,
      examined: {
        roadmapRows: countRoadmapRows(roadmap),
        // The push-phase fetch is the authoritative denominator: null means the
        // fetch failed, 0 means the tracker genuinely returned nothing. Both are
        // abstentions from the caller's point of view, and distinguishable.
        ticketsFetched: tickets ? tickets.length : null,
      },
    };
  } finally {
    releaseMutex!();
  }
}

/**
 * Push exactly ONE roadmap row to the tracker. Push-only, dedup-aware,
 * fail-closed. This is the blast-radius-proportional counterpart to
 * `fullSync`: an operation that writes one row must not reconcile the repo.
 *
 * - Takes the SAME module mutex as `fullSync`, so a scoped push and a full
 *   sync can never interleave their writebacks.
 * - Locates the row by case-insensitive name (matching the MCP tool). A match
 *   count other than exactly 1 is an error in the returned SyncResult and
 *   performs no writes — it never throws. Refusing an ambiguous name up front
 *   keeps name identity and `applyRoadmapDiff`'s slug identity from meeting.
 * - Runs NO inbound pull: nothing external can overwrite any local field here,
 *   so `suppressedInbound` is always empty on this path.
 * - Does NOT stamp `last_synced`. A scoped push is not a reconcile, and
 *   bumping the stamp would assert a whole-roadmap comparison that never
 *   happened. Deliberate behaviour change from the fullSync-on-add status quo.
 *
 * `examined.roadmapRows` is 1 by construction (the single-row projection),
 * which differs in meaning from fullSync's whole-roadmap denominator.
 */
export async function syncRowToExternal(
  projectRoot: string,
  adapter: TrackerSyncAdapter,
  config: TrackerSyncConfig,
  featureName: string,
  options?: ExternalSyncOptions
): Promise<SyncResult> {
  const previousSync = syncMutex;
  let releaseMutex: () => void;
  syncMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });

  const dryRun = options?.dryRun ?? false;
  const fail = (error: Error): SyncResult => ({
    ...emptySyncResult(),
    dryRun,
    errors: [{ featureOrId: featureName, error }],
  });

  try {
    // Inside the try: a rejected predecessor must still reach the `finally`,
    // or this call's own mutex slot is never released and every subsequent
    // sync in the process queues behind a promise that never settles.
    await previousSync;

    const store = resolveRoadmapStore({ projectRoot });
    const loaded = await store.load();
    if (!loaded.ok) return fail(loaded.error);

    const roadmap = loaded.value;
    const matches: Array<{
      milestone: Roadmap['milestones'][number];
      feature: RoadmapFeature;
    }> = [];
    for (const milestone of roadmap.milestones) {
      for (const feature of milestone.features) {
        if (feature.name.toLowerCase() === featureName.toLowerCase()) {
          matches.push({ milestone, feature });
        }
      }
    }
    if (matches.length === 0) {
      return fail(new Error(`Feature "${featureName}" not found in roadmap`));
    }
    if (matches.length > 1) {
      return fail(
        new Error(`Feature name "${featureName}" is ambiguous (${matches.length} matches)`)
      );
    }

    const { milestone, feature } = matches[0]!;
    const before = structuredClone(roadmap);

    // Fetch solely to build the dedup index. FAIL-CLOSED: fullSync degrades to
    // an empty index when the fetch fails, which for a one-row create would
    // mint exactly the duplicate issue this function exists to prevent.
    const fetchResult = await adapter.fetchAllTickets();
    if (!fetchResult.ok) return fail(fetchResult.error);

    // Single-row projection that SHARES feature object identity with `roadmap`.
    // syncToExternal mutates features in place, so the externalId it stamps
    // lands on the real row. Reuse, not reimplementation: create / dedup /
    // guard / report semantics stay in one place.
    const projection: Roadmap = {
      ...roadmap,
      milestones: [{ ...milestone, features: [feature] }],
    };

    const pushResult = await syncToExternal(
      projection,
      adapter,
      config,
      fetchResult.value,
      options
    );

    // No `stampLastSynced` here — see the function doc comment.
    const localWrites = changedFeatureNames(before, roadmap);
    const persisted = dryRun ? null : await applyRoadmapDiff(store, before, roadmap);
    const writebackErrors =
      persisted && !persisted.ok ? [{ featureOrId: featureName, error: persisted.error }] : [];

    return {
      ...pushResult,
      errors: [...pushResult.errors, ...writebackErrors],
      planned: { ...pushResult.planned, localWrites: dryRun ? localWrites : [] },
    };
  } finally {
    releaseMutex!();
  }
}

/**
 * Reset the sync mutex. Only for testing.
 */
export function _resetSyncMutex(): void {
  syncMutex = Promise.resolve();
}
