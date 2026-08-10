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

  // Assignee: external wins — EXCEPT a live machine claim, which is local
  // truth. A machine assignee (orchestrator id) is never pushed to the external
  // assignee field, so inbound state can only ever lag or contradict it; never
  // let it clobber the running claim (that was the silent-skip bug).
  if (!localMachineClaim && ticketState.assignee !== feature.assignee) {
    result.assignmentChanges.push({
      feature: feature.name,
      from: feature.assignee,
      to: ticketState.assignee,
    });
    feature.assignee = ticketState.assignee;
  }

  // Status: use reverse mapping with label disambiguation
  const resolvedStatus = resolveReverseStatus(ticketState.status, ticketState.labels, config);
  if (!resolvedStatus || resolvedStatus === feature.status) return;

  const newStatus = resolvedStatus as FeatureStatus;
  if (!forceSync && isRegression(feature.status, newStatus)) return;
  // Guard: external "open" → "planned" must not override manually-set "blocked".
  if (!forceSync && feature.status === 'blocked' && newStatus === 'planned') return;

  // When inbound sync moves a machine-claimed row away from in-progress, route
  // through setStatus() so the assignee auto-clears and an `unassigned` history
  // entry is recorded — keeping `assignee ≠ null ⟺ in-progress` (RMH005). For a
  // human/null assignee the bare status write is fine (the assignee block above
  // already reconciled the assignee from external).
  const date = new Date().toISOString().slice(0, 10);
  if (localMachineClaim && newStatus !== 'in-progress') {
    setStatus(roadmap, feature, newStatus, date);
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

  await previousSync;

  try {
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
 * Reset the sync mutex. Only for testing.
 */
export function _resetSyncMutex(): void {
  syncMutex = Promise.resolve();
}
