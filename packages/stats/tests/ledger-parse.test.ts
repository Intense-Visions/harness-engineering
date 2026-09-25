import type { Pull } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import { parseLine } from '../src/bandit/ledger-parse';

const valid: Pull = {
  ts: '2026-09-24T00:00:00.000Z',
  consumer: 'routing',
  context: 'quick-fix',
  arm: 'local',
  mode: 'explore',
  reward: { outcome: 1, costUsd: 0.02 },
  ref: 'issue-1557',
};

function line(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...valid, ...overrides });
}

describe('parseLine (spec "Ledger": malformed-line definition)', () => {
  it('accepts a full scored pull and an unscored pull without ref', () => {
    expect(parseLine(JSON.stringify(valid))).toEqual({ ok: true, pull: valid });
    const { reward: _r, ref: _f, ...unscored } = valid;
    expect(parseLine(JSON.stringify(unscored))).toEqual({ ok: true, pull: unscored });
  });

  it('rejects invalid JSON, including a torn final line (A6)', () => {
    expect(parseLine('{"ts":"2026-09-24T00:00:00.000Z","consumer":"rou')).toEqual({
      ok: false,
      reason: 'invalid-json',
    });
    expect(parseLine('')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(parseLine('[]')).toEqual({ ok: false, reason: 'missing-field' });
    expect(parseLine('null')).toEqual({ ok: false, reason: 'missing-field' });
  });

  it.each(['ts', 'consumer', 'context', 'arm', 'mode'])(
    'rejects a pull missing required field %s',
    (field) => {
      expect(parseLine(line({ [field]: undefined }))).toEqual({
        ok: false,
        reason: 'missing-field',
      });
    }
  );

  it('rejects wrong-typed fields as missing', () => {
    expect(parseLine(line({ mode: 'random' }))).toEqual({ ok: false, reason: 'missing-field' });
    expect(parseLine(line({ ref: 42 }))).toEqual({ ok: false, reason: 'missing-field' });
    expect(parseLine(line({ reward: { costUsd: 1 } }))).toEqual({
      ok: false,
      reason: 'missing-field',
    });
    expect(parseLine(line({ reward: 'great' }))).toEqual({ ok: false, reason: 'missing-field' });
    expect(parseLine(line({ reward: { outcome: 1, costUsd: 'free' } }))).toEqual({
      ok: false,
      reason: 'missing-field',
    });
  });

  it('rejects a ts that is not ISO-8601', () => {
    expect(parseLine(line({ ts: 'yesterday' }))).toEqual({ ok: false, reason: 'bad-timestamp' });
    expect(parseLine(line({ ts: 'Sep 24 2026' }))).toEqual({
      ok: false,
      reason: 'bad-timestamp',
    });
    expect(parseLine(line({ ts: '2026-13-45T00:00:00Z' }))).toEqual({
      ok: false,
      reason: 'bad-timestamp',
    });
    expect(parseLine(line({ ts: '2026-09-24T10:30:00+02:00' })).ok).toBe(true);
  });

  it('rejects a ts without a zone designator: Date.parse would read it as local time', () => {
    for (const ts of ['2026-09-24T10:30:00', '2026-09-24T10:30:00.000', '2026-09-24T10:30']) {
      expect(parseLine(line({ ts }))).toEqual({ ok: false, reason: 'bad-timestamp' });
    }
    expect(parseLine(line({ ts: '2026-09-24T10:30Z' })).ok).toBe(true);
    expect(parseLine(line({ ts: '2026-09-24T10:30:00-07:00' })).ok).toBe(true);
    expect(parseLine(line({ ts: '2026-09-24T10:30:00.123456Z' })).ok).toBe(true);
  });

  it('rejects outcome outside [0, 1] and negative costUsd', () => {
    expect(parseLine(line({ reward: { outcome: 1.01 } }))).toEqual({
      ok: false,
      reason: 'outcome-out-of-range',
    });
    expect(parseLine(line({ reward: { outcome: -0.5 } }))).toEqual({
      ok: false,
      reason: 'outcome-out-of-range',
    });
    expect(parseLine(line({ reward: { outcome: 0.5, costUsd: -1 } }))).toEqual({
      ok: false,
      reason: 'negative-cost',
    });
    expect(parseLine(line({ reward: { outcome: 0 } })).ok).toBe(true);
    expect(parseLine(line({ reward: { outcome: 1, costUsd: 0 } })).ok).toBe(true);
  });
});
