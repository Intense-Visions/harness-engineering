/**
 * Model-update regression sentinel (#1617) — cycle orchestration.
 *
 * Ties snapshot → detect → append into one sentinel cycle, plus an explicit
 * acknowledgement path that re-pins the baseline by appending a new record
 * (never rewriting history). Detect + report only.
 */

import { detectModelDrift } from './drift';
import { snapshotModelIdentities, type RawBackendsMap } from './snapshot';
import { appendSentinelRecord, latestSnapshot, readSentinelHistory } from './store';
import type { ModelSnapshot, SentinelCycleResult, SentinelRecord } from './types';

function makeId(snapshot: ModelSnapshot): string {
  return `${snapshot.takenAt}-${snapshot.digest}`;
}

/**
 * Run one sentinel cycle against the configured backends.
 *
 * Reads the append-only history, snapshots the current model identity, detects
 * drift vs the last-seen snapshot, and appends a record iff this is the initial
 * baseline or a change was detected. An `unchanged` cycle writes nothing (a
 * quiet log entry, not a hold).
 *
 * @param projectRoot - project root containing `.harness/`.
 * @param backends - `config.agent.backends`.
 * @param now - injectable clock for deterministic tests.
 */
export function evaluateModelSentinel(
  projectRoot: string,
  backends: RawBackendsMap | undefined,
  now: Date = new Date()
): SentinelCycleResult {
  const history = readSentinelHistory(projectRoot);
  const previous = latestSnapshot(history);
  const snapshot = snapshotModelIdentities(backends, now);
  const drift = detectModelDrift(previous, snapshot);

  const record: SentinelRecord = {
    id: makeId(snapshot),
    observedAt: snapshot.takenAt,
    snapshot,
    drift,
    acknowledged: false,
  };

  const wroteRecord = drift.kind === 'initial' || drift.kind === 'changed';
  if (wroteRecord) {
    appendSentinelRecord(projectRoot, record);
  }

  return {
    record,
    drift,
    wroteRecord,
    previousDigest: previous ? previous.digest : null,
  };
}

/**
 * Acknowledge the current model identity, re-pinning the baseline. Appends an
 * `acknowledged` record capturing the current snapshot so a subsequent
 * `--check` no longer reports the drift. History is preserved (append-only).
 *
 * @returns the appended acknowledgement record.
 */
export function acknowledgeModelDrift(
  projectRoot: string,
  backends: RawBackendsMap | undefined,
  note?: string,
  now: Date = new Date()
): SentinelRecord {
  const history = readSentinelHistory(projectRoot);
  const previous = latestSnapshot(history);
  const snapshot = snapshotModelIdentities(backends, now);
  const drift = detectModelDrift(previous, snapshot);

  const record: SentinelRecord = {
    id: `${makeId(snapshot)}-ack`,
    observedAt: snapshot.takenAt,
    snapshot,
    drift,
    acknowledged: true,
    ...(note !== undefined ? { note } : {}),
  };
  appendSentinelRecord(projectRoot, record);
  return record;
}

/**
 * Whether the latest recorded state is material, unacknowledged drift — the
 * predicate behind `harness models drift --check`. A cycle is "open" when the
 * most recent record is a material change that has not since been acknowledged.
 */
export function hasUnacknowledgedMaterialDrift(records: readonly SentinelRecord[]): boolean {
  const last = records[records.length - 1];
  if (!last) return false;
  if (last.acknowledged) return false;
  return last.drift.kind === 'changed' && last.drift.severity === 'material';
}
