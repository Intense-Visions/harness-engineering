// packages/core/src/state/event-sourcing/snapshot.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { SNAPSHOT_FILE } from './constants';
import type { Event } from './events';
// DP3: eventLogPaths/readTailSeq are module-internal (not barrel-exported); import
// directly from the sibling ./log to resolve the on-disk log + state dir.
import { eventLogPaths, loadEvents, readTailSeq, type EventLogOptions } from './log';
import { projectCoreState, type CoreStateProjection } from './projections/core-state';
// Phase 4: lanes is now a real projection (per-task lane + history), folded by
// projectLanes. Re-exported so the existing barrel surface keeps working.
import { projectLanes, type LanesProjection } from './projections/lanes';
export type { LanesProjection };
// Phase 5: audit is now a real projection (the append-only session audit trail,
// subsuming GH-580), folded by projectAudit. Re-exported so the barrel surface keeps working.
import { projectAudit, type AuditProjection } from './projections/audit';
export type { AuditProjection };

/**
 * The materialized, derived (non-authoritative) snapshot of the event log. The
 * event log remains the source of truth; this is a cache that {@link readSnapshot}
 * recomputes whenever it is stale or corrupt. `lanes` (Phase 4) and `audit` (Phase 5)
 * are now real projections, folded additively without reshaping the Snapshot envelope.
 */
export interface Snapshot {
  schemaVersion: 2;
  coreState: CoreStateProjection;
  lanes: LanesProjection; // Phase 4 — lane machine
  audit: AuditProjection; // Phase 5 — session audit trail (GH-580)
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
    lanes: projectLanes(events), // Phase 4 — lane machine
    audit: projectAudit(events), // Phase 5 — session audit trail (GH-580)
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

/**
 * A snapshot is stale (must be recomputed) when it is absent or the live log tail
 * has advanced past the seq it was materialized at. The snapshot is a cache; staleness
 * is the cache-miss signal.
 */
export function isStale(snapshot: Snapshot | null, tailSeq: number): boolean {
  return snapshot === null || tailSeq > snapshot.meta.lastSeq;
}

/** Debounce window before a stale read triggers a background re-materialize. */
export const MATERIALIZE_DEBOUNCE_MS = 50;

// Single-process debounce: collapse a burst of stale reads for the same scope into
// one background materialize. Keyed by resolved logPath. Multi-process races resolve
// as last-write-wins on the atomic rename of a non-authoritative derived file (safe).
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
// In-flight materialize promises, tracked so tests can deterministically await the
// background write after firing the debounce timer.
const inflightMaterializes = new Set<Promise<unknown>>();

function scheduleMaterialize(
  projectPath: string,
  options: EventLogOptions | undefined,
  key: string
): void {
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    const p = materialize(projectPath, options).finally(() => inflightMaterializes.delete(p));
    inflightMaterializes.add(p);
  }, MATERIALIZE_DEBOUNCE_MS);
  // Do not keep the event loop alive for a background cache refresh.
  timer.unref?.();
  pendingTimers.set(key, timer);
}

/** Test-only: cancel all pending debounce timers and clear tracking (not barrel-exported). */
export function __resetMaterializeTimersForTests(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  inflightMaterializes.clear();
}

/** Test-only: await any in-flight background materialize promises (not barrel-exported). */
export async function __flushMaterializeForTests(): Promise<void> {
  await Promise.all([...inflightMaterializes]);
}

/** Read a stored snapshot from disk, returning null on any miss (absent/corrupt/invalid). */
function readStoredSnapshot(snapPath: string): Snapshot | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as { schemaVersion?: unknown }).schemaVersion === 2 &&
      typeof (parsed as { meta?: { lastSeq?: unknown } }).meta?.lastSeq === 'number' &&
      (parsed as { coreState?: unknown }).coreState !== null &&
      typeof (parsed as { coreState?: unknown }).coreState === 'object'
    ) {
      return parsed as Snapshot;
    }
    return null; // version-skewed / structurally invalid → cache miss → recompute
  } catch {
    return null; // missing file or unparseable JSON → cache miss
  }
}

/**
 * Read the snapshot for a scope WITHOUT ever writing on the read path (truth #6).
 * When the stored snapshot is fresh, it is returned verbatim. When it is stale,
 * absent, or corrupt, the snapshot is recomputed from the log via {@link reduce}
 * (returned immediately) and a debounced background {@link materialize} is scheduled
 * — `materialize` remains the sole writer. Never throws; always returns a Result.
 */
export async function readSnapshot(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<Snapshot, Error>> {
  try {
    const { dir, logPath } = await eventLogPaths(projectPath, options);
    const tailSeq = readTailSeq(logPath);
    const stored = readStoredSnapshot(path.join(dir, SNAPSHOT_FILE));

    if (isStale(stored, tailSeq)) {
      const loaded = await loadEvents(projectPath, options);
      if (!loaded.ok) return loaded;
      const fresh = reduce(loaded.value);
      // Schedule a background refresh; the read path itself performs no write.
      scheduleMaterialize(projectPath, options, logPath);
      return Ok(fresh);
    }
    // stored is non-null here (isStale(null, _) is true).
    return Ok(stored as Snapshot);
  } catch (error) {
    return Err(
      new Error(
        `Failed to read snapshot: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
