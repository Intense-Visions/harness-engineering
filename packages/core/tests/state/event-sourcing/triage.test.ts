import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  recordTriagePrediction,
  recordTriageOutcome,
  loadTriageRecords,
  projectTriageRecords,
  type StoredTriageRecord,
} from '../../../src/state/event-sourcing/triage';
import { loadEvents, resetLocalCountersForTests } from '../../../src/state/event-sourcing/log';
import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
import type {
  TriagePredictedInput,
  TriageOutcomeInput,
} from '../../../src/state/event-sourcing/events';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estriage-'));
  resetLocalCountersForTests();
  __resetWriterIdForTests();
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function unwrap<T>(p: Promise<{ ok: boolean; value?: T; error?: Error }>): Promise<T> {
  const r = (await p) as { ok: boolean; value: T; error: Error };
  if (!r.ok) throw r.error;
  return r.value;
}

const prediction = (externalId: string): TriagePredictedInput => ({
  externalId,
  shapeKey: 'api,auth|dispatchable|trivial',
  verdict: { level: 'trivial', confidence: 'medium', signals: {}, source: 'static' },
  levers: { scope: 'bounded', precedent: 'unknown' },
  scopeEstimate: 3,
  ratchetStage: 1,
});

const outcome = (externalId: string, matched: boolean): TriageOutcomeInput => ({
  externalId,
  shapeKey: 'api,auth|dispatchable|trivial',
  actual: {
    level: 'trivial',
    confidence: 'high',
    signals: { blastRadius: 3 },
    source: 'escalated',
  },
  exceededBy: matched ? 0 : 2,
  matched,
});

describe('triage outcome-log store', () => {
  it('round-trips a prediction then an outcome, keyed by externalId', async () => {
    expect((await recordTriagePrediction(dir, prediction('ISSUE-1'))).ok).toBe(true);
    expect((await recordTriageOutcome(dir, outcome('ISSUE-1', true))).ok).toBe(true);

    const records = await unwrap(loadTriageRecords(dir));
    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.externalId).toBe('ISSUE-1');
    expect(rec.prediction?.ratchetStage).toBe(1);
    expect(rec.prediction?.scopeEstimate).toBe(3);
    expect(rec.outcome?.matched).toBe(true);
    expect(rec.outcome?.exceededBy).toBe(0);
  });

  it('separate appends accrete onto one record (prediction and outcome are separate events)', async () => {
    await recordTriagePrediction(dir, prediction('ISSUE-2'));
    // Only prediction so far: outcome absent
    let records = await unwrap(loadTriageRecords(dir));
    expect(records[0]!.prediction).toBeDefined();
    expect(records[0]!.outcome).toBeUndefined();

    await recordTriageOutcome(dir, outcome('ISSUE-2', false));
    records = await unwrap(loadTriageRecords(dir));
    expect(records).toHaveLength(1);
    expect(records[0]!.prediction).toBeDefined();
    expect(records[0]!.outcome?.matched).toBe(false);
  });

  it('keeps distinct externalIds as distinct records', async () => {
    await recordTriagePrediction(dir, prediction('A'));
    await recordTriagePrediction(dir, prediction('B'));
    await recordTriageOutcome(dir, outcome('B', true));

    const records = await unwrap(loadTriageRecords(dir));
    const byId = Object.fromEntries(records.map((r) => [r.externalId, r]));
    expect(Object.keys(byId).sort()).toEqual(['A', 'B']);
    expect(byId['A']!.outcome).toBeUndefined();
    expect(byId['B']!.outcome?.matched).toBe(true);
  });

  it('empty log yields no records', async () => {
    const records = await unwrap(loadTriageRecords(dir));
    expect(records).toEqual([]);
  });

  it('writes real triage events onto the shared event log', async () => {
    await recordTriagePrediction(dir, prediction('ISSUE-9'));
    const events = await unwrap(loadEvents(dir));
    const types = events.map((e) => e.type);
    expect(types).toContain('triage_predicted');
  });
});

describe('projectTriageRecords (pure fold)', () => {
  it('is order-driven: last append for a slice wins', async () => {
    await recordTriagePrediction(dir, prediction('ISSUE-3'));
    await recordTriageOutcome(dir, { ...outcome('ISSUE-3', false) });
    await recordTriageOutcome(dir, { ...outcome('ISSUE-3', true) });
    const events = await unwrap(loadEvents(dir));
    const records: StoredTriageRecord[] = projectTriageRecords(events);
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome?.matched).toBe(true);
  });

  it('ignores non-triage events', () => {
    const records = projectTriageRecords([]);
    expect(records).toEqual([]);
  });
});
