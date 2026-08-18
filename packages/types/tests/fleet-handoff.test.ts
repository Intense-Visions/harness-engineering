import { describe, it, expect } from 'vitest';
import {
  FleetHandoffRecordSchema,
  validateFleetHandoffRecord,
  parseFleetHandoffRecord,
  FLEET_HANDOFF_RECORD_VERSION,
  FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES,
  type FleetHandoffRecord,
} from '../src/fleet-handoff';

const doneRecord: FleetHandoffRecord = {
  status: 'done',
  fleet: 'roadmap-fleet',
  item: '1396',
  summary: 'Shipped canonical handoff record type + validator',
  evidence: [
    { kind: 'pr', ref: 'https://github.com/org/repo/pull/9' },
    { kind: 'provenance', ref: 'docs/changes/slug/provenance.json', note: 'committed' },
  ],
  next_steps: ['Human reviews and merges the PR'],
  v: FLEET_HANDOFF_RECORD_VERSION,
};

describe('FleetHandoffRecordSchema', () => {
  it('accepts a well-formed done record with evidence and next_steps', () => {
    const parsed = FleetHandoffRecordSchema.parse(doneRecord);
    expect(parsed.status).toBe('done');
    expect(parsed.evidence).toHaveLength(2);
    expect(parsed.next_steps).toEqual(['Human reviews and merges the PR']);
  });

  it('defaults evidence and next_steps to empty arrays when omitted', () => {
    const parsed = FleetHandoffRecordSchema.parse({
      status: 'done',
      fleet: 'bug-fleet',
      item: 'area-3',
      summary: 'No bug found in this area',
    });
    expect(parsed.evidence).toEqual([]);
    expect(parsed.next_steps).toEqual([]);
  });

  it('rejects a record missing a required field (summary)', () => {
    expect(() =>
      FleetHandoffRecordSchema.parse({ status: 'done', fleet: 'pr-fleet', item: '12' })
    ).toThrow();
  });

  it('rejects an unknown extra key (strict/bounded shape)', () => {
    expect(() => FleetHandoffRecordSchema.parse({ ...doneRecord, adHocField: 'nope' })).toThrow();
  });

  it('rejects an invalid status value', () => {
    expect(() =>
      FleetHandoffRecordSchema.parse({ ...doneRecord, status: 'in-progress' })
    ).toThrow();
  });

  it('rejects malformed evidence entries (missing ref)', () => {
    expect(() =>
      FleetHandoffRecordSchema.parse({ ...doneRecord, evidence: [{ kind: 'pr' }] })
    ).toThrow();
  });
});

describe('validateFleetHandoffRecord', () => {
  it('returns ok for a valid done record', () => {
    const result = validateFleetHandoffRecord(doneRecord);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.item).toBe('1396');
  });

  it('returns ok for a parked record that carries a blocker', () => {
    const result = validateFleetHandoffRecord({
      status: 'parked',
      fleet: 'roadmap-fleet',
      item: '77',
      summary: 'Hit an unforeseen fork',
      blocker: 'per-route vs global rate limit — not surfaced in CONFIRM',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-done status with no blocker (cross-field invariant)', () => {
    for (const status of FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES) {
      const result = validateFleetHandoffRecord({
        status,
        fleet: 'cicd-fleet',
        item: 'run-42',
        summary: 'Something happened',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('BLOCKER_REQUIRED');
    }
  });

  it('rejects a schema-invalid record with a SCHEMA error and issues', () => {
    const result = validateFleetHandoffRecord({ status: 'done', fleet: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA');
      expect(result.error.issues && result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('rejects a non-object input', () => {
    expect(validateFleetHandoffRecord(null).ok).toBe(false);
    expect(validateFleetHandoffRecord('nope').ok).toBe(false);
  });
});

describe('parseFleetHandoffRecord', () => {
  it('returns the record for valid input', () => {
    expect(parseFleetHandoffRecord(doneRecord).status).toBe('done');
  });

  it('throws on a status/blocker invariant violation', () => {
    expect(() =>
      parseFleetHandoffRecord({
        status: 'failed',
        fleet: 'test-fleet',
        item: 't-9',
        summary: 'pipeline did not converge',
      })
    ).toThrow(/blocker/);
  });
});
