import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readSentinelHistory,
  appendSentinelRecord,
  latestSnapshot,
  sentinelHistoryPath,
} from './store';
import { snapshotModelIdentities } from './snapshot';
import { detectModelDrift } from './drift';
import type { SentinelRecord } from './types';

const NOW = new Date('2026-08-31T12:00:00.000Z');

function makeRecord(model: string, acknowledged = false): SentinelRecord {
  const snapshot = snapshotModelIdentities({ p: { type: 'anthropic', model } }, NOW);
  return {
    id: `${snapshot.takenAt}-${snapshot.digest}`,
    observedAt: snapshot.takenAt,
    snapshot,
    drift: detectModelDrift(null, snapshot),
    acknowledged,
  };
}

describe('model-sentinel store', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'model-sentinel-store-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns [] when the history file does not exist', () => {
    expect(readSentinelHistory(root)).toEqual([]);
    expect(latestSnapshot([])).toBeNull();
  });

  it('appends records as JSONL and reads them back in order (append-only)', () => {
    appendSentinelRecord(root, makeRecord('m1'));
    appendSentinelRecord(root, makeRecord('m2'));
    const records = readSentinelHistory(root);
    expect(records).toHaveLength(2);
    expect(records[0]?.snapshot.backends[0]?.models).toEqual(['m1']);
    expect(records[1]?.snapshot.backends[0]?.models).toEqual(['m2']);

    // The physical file has exactly two lines — the first was never rewritten.
    const raw = readFileSync(sentinelHistoryPath(root), 'utf-8').trim().split('\n');
    expect(raw).toHaveLength(2);
  });

  it('latestSnapshot returns the last record snapshot', () => {
    appendSentinelRecord(root, makeRecord('m1'));
    appendSentinelRecord(root, makeRecord('m2'));
    const latest = latestSnapshot(readSentinelHistory(root));
    expect(latest?.backends[0]?.models).toEqual(['m2']);
  });

  it('skips malformed lines with a stderr warning without throwing', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    appendSentinelRecord(root, makeRecord('m1'));
    appendFileSync(sentinelHistoryPath(root), 'not json\n', 'utf-8');
    appendFileSync(sentinelHistoryPath(root), '{"partial":true}\n', 'utf-8');
    appendSentinelRecord(root, makeRecord('m2'));

    const records = readSentinelHistory(root);
    expect(records).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
