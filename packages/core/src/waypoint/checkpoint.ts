/**
 * Shipper checkpoint — what has already reached the ledger
 * (D3 of `docs/changes/waypoint-spool-shipper/proposal.md`).
 *
 * THE INVARIANT: this module never deletes, truncates, or rewrites a spool
 * segment. ADR-0047 promises adopters "retain a local copy of their exhaust",
 * so the spool is the adopter's own record and shipping is a read of it. A
 * shipper that consumed the spool would quietly convert that record into a
 * transmit queue and destroy the thing the ADR guaranteed. Progress therefore
 * lives beside the segments, never inside them.
 *
 * Keyed by segment id because segments are per-writer and advance
 * independently; keyed to a ULID rather than a line offset because ULIDs are
 * time-ordered and stable, while offsets shift the moment a segment drops its
 * oldest line at the cap — a resume point that silently re-sends or skips is
 * worse than no resume point at all.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** File holding shipper progress, beside the segments it describes. */
export const CHECKPOINT_FILENAME = '.shipped.json';

/** Per-segment high-water marks: `segmentId → last ULID known to have landed`. */
export interface ShipCheckpoint {
  readonly marks: Readonly<Record<string, string>>;
}

/** An empty checkpoint — nothing shipped yet. */
export const EMPTY_CHECKPOINT: ShipCheckpoint = { marks: {} };

function checkpointPath(spoolDir: string): string {
  return join(spoolDir, CHECKPOINT_FILENAME);
}

/**
 * Read the checkpoint, or an empty one.
 *
 * An unreadable or malformed file yields EMPTY rather than throwing. The
 * failure mode that choice accepts is re-sending events, which ingest dedups
 * by ULID and reports as `duplicate`; the failure mode it avoids is a shipper
 * that cannot run at all because a sidecar got corrupted. Only string values
 * are kept, so a hand-edited file cannot inject a non-ULID mark that would
 * compare unpredictably.
 */
export function readCheckpoint(spoolDir: string): ShipCheckpoint {
  const path = checkpointPath(spoolDir);
  if (!existsSync(path)) return EMPTY_CHECKPOINT;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_CHECKPOINT;
    const raw = (parsed as { marks?: unknown }).marks;
    if (typeof raw !== 'object' || raw === null) return EMPTY_CHECKPOINT;
    const marks: Record<string, string> = {};
    for (const [segmentId, mark] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof mark === 'string' && mark.length > 0) marks[segmentId] = mark;
    }
    return { marks };
  } catch {
    return EMPTY_CHECKPOINT;
  }
}

/** Persist the checkpoint, creating the spool directory if needed. */
export function writeCheckpoint(spoolDir: string, checkpoint: ShipCheckpoint): void {
  const path = checkpointPath(spoolDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

/**
 * Advance one segment's mark.
 *
 * Monotonic by construction: a mark only moves forward in ULID order. Batches
 * can be reported out of order and a stale run can finish after a fresh one
 * without either being able to rewind progress and cause a re-send.
 */
export function advanceMark(
  checkpoint: ShipCheckpoint,
  segmentId: string,
  ulid: string
): ShipCheckpoint {
  const current = checkpoint.marks[segmentId];
  if (current !== undefined && current >= ulid) return checkpoint;
  return { marks: { ...checkpoint.marks, [segmentId]: ulid } };
}

/**
 * The lines of one segment that have not yet landed.
 *
 * Compares ULIDs rather than counting, so a segment that dropped its oldest
 * lines at the cap resumes at the right place instead of re-sending from a
 * stale offset.
 */
export function unshippedLines(
  checkpoint: ShipCheckpoint,
  segmentId: string,
  lines: readonly string[]
): string[] {
  const mark = checkpoint.marks[segmentId];
  if (mark === undefined) return [...lines];
  return lines.filter((line) => {
    const id = eventIdOf(line);
    // A line whose id cannot be read is kept: ingest will judge it, and
    // dropping it here would hide a malformed event the adopter should see.
    return id === null ? true : id > mark;
  });
}

/** The `id` of a spooled JSONL line, or null when it cannot be read. */
export function eventIdOf(line: string): string | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const id = (parsed as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
