// packages/core/src/state/event-sourcing/snapshot.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { SNAPSHOT_FILE } from './constants';
import type { Event } from './events';
// DP3: eventLogPaths/readTailSeq are module-internal (not barrel-exported); import
// directly from the sibling ./log to resolve the on-disk log + state dir.
import { eventLogPaths, loadEvents, type EventLogOptions } from './log';
import { projectCoreState, type CoreStateProjection } from './projections/core-state';

/**
 * Lane-machine projection. Empty placeholder in Phase 2 — Phase 4 extends this
 * additively (forced-transition lanes, dependency guards) without reshaping the
 * Snapshot envelope.
 */
// DP2: intentional empty placeholder; Phase 4 adds lane-machine fields by extending this.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LanesProjection {}

/**
 * Append-only audit projection. Empty placeholder in Phase 2 — Phase 5 extends
 * this additively (the session audit trail) without reshaping the Snapshot envelope.
 */
// DP2: intentional empty placeholder; Phase 5 adds audit-trail fields by extending this.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AuditProjection {}

/**
 * The materialized, derived (non-authoritative) snapshot of the event log. The
 * event log remains the source of truth; this is a cache that {@link readSnapshot}
 * recomputes whenever it is stale or corrupt. `lanes`/`audit` are empty placeholders
 * in Phase 2 (DP2), typed so Phases 4-5 extend them additively.
 */
export interface Snapshot {
  schemaVersion: 2;
  coreState: CoreStateProjection;
  lanes: LanesProjection; // Phase 4 — lane machine
  audit: AuditProjection; // Phase 5 — audit trail
  meta: { lastSeq: number };
}

/**
 * PURE composition: build the full snapshot from an event sequence. `meta.lastSeq`
 * is the highest seq observed (0 for an empty log) and is the staleness watermark
 * {@link readSnapshot} compares against the live log tail.
 */
export function reduce(events: Event[]): Snapshot {
  return {
    schemaVersion: 2,
    coreState: projectCoreState(events),
    lanes: {}, // Phase 4 / Phase 5: extended additively
    audit: {},
    meta: { lastSeq: events.reduce((m, e) => Math.max(m, e.seq), 0) },
  };
}

/**
 * The SOLE writer of `state.snapshot.json`. Loads the log, reduces it, and writes
 * the snapshot atomically (temp + rename, mirroring state-persistence.ts:52-56) so a
 * torn/lost write is a cache miss rather than corruption. Never mutates the log.
 */
export async function materialize(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<void, Error>> {
  try {
    const { dir } = await eventLogPaths(projectPath, options);
    const loaded = await loadEvents(projectPath, options);
    if (!loaded.ok) return loaded;
    const snapshot = reduce(loaded.value);
    fs.mkdirSync(dir, { recursive: true });
    const snapPath = path.join(dir, SNAPSHOT_FILE);
    const tmpPath = `${snapPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmpPath, snapPath); // atomic
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to materialize snapshot: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
