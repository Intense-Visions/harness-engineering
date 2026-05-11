import { describe, it, expect } from 'vitest';
import {
  hashHistoryEvent,
  parseHashFromCommentBody,
} from '../../../src/roadmap/migrate/history-hash';

describe('hashHistoryEvent', () => {
  it('is deterministic across runs for identical input', () => {
    const e = { type: 'claimed' as const, actor: 'alice', at: '2026-05-09T12:00:00Z' };
    expect(hashHistoryEvent(e)).toBe(hashHistoryEvent(e));
  });

  it('differs when the actor differs', () => {
    const a = { type: 'claimed' as const, actor: 'alice', at: '2026-05-09T12:00:00Z' };
    const b = { type: 'claimed' as const, actor: 'bob', at: '2026-05-09T12:00:00Z' };
    expect(hashHistoryEvent(a)).not.toBe(hashHistoryEvent(b));
  });

  it('treats omitted details and {} as identical', () => {
    const a = { type: 'created' as const, actor: 'x', at: '2026-05-09T12:00:00Z' };
    const b = { type: 'created' as const, actor: 'x', at: '2026-05-09T12:00:00Z', details: {} };
    expect(hashHistoryEvent(a)).toBe(hashHistoryEvent(b));
  });

  it('returns 8 lowercase hex chars', () => {
    const e = { type: 'completed' as const, actor: 'x', at: '2026-05-09T12:00:00Z' };
    expect(hashHistoryEvent(e)).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different hashes for two same-day events with different timestamps', () => {
    // Tighten hashing to second-granularity so re-runs reliably detect
    // unique events even when both fall on the same calendar day.
    const morning = {
      type: 'claimed' as const,
      actor: 'alice',
      at: '2026-05-09T08:15:00Z',
    };
    const afternoon = {
      type: 'claimed' as const,
      actor: 'alice',
      at: '2026-05-09T14:42:00Z',
    };
    expect(hashHistoryEvent(morning)).not.toBe(hashHistoryEvent(afternoon));
  });

  it('canonicalizes day-only YYYY-MM-DD to midnight UTC (source-side parity)', () => {
    // Assignment-history records (file-backed source) supply YYYY-MM-DD.
    // The hash should treat YYYY-MM-DD as YYYY-MM-DDT00:00:00Z so the
    // canonicalization is explicit and deterministic.
    const dayOnly = { type: 'claimed' as const, actor: 'alice', at: '2026-05-09' };
    const midnight = {
      type: 'claimed' as const,
      actor: 'alice',
      at: '2026-05-09T00:00:00Z',
    };
    expect(hashHistoryEvent(dayOnly)).toBe(hashHistoryEvent(midnight));
  });

  it('collapses sub-second jitter to the same hash (idempotency across runs)', () => {
    const a = {
      type: 'claimed' as const,
      actor: 'alice',
      at: '2026-05-09T08:15:00.123Z',
    };
    const b = {
      type: 'claimed' as const,
      actor: 'alice',
      at: '2026-05-09T08:15:00.999Z',
    };
    expect(hashHistoryEvent(a)).toBe(hashHistoryEvent(b));
  });
});

describe('parseHashFromCommentBody', () => {
  it('extracts hash:<8hex> from a harness-history comment', () => {
    const body = '<!-- harness-history hash:abcd1234 -->\n{"type":"x","actor":"y","at":"z"}';
    expect(parseHashFromCommentBody(body)).toBe('abcd1234');
  });

  it('returns null when the marker is absent', () => {
    expect(parseHashFromCommentBody('hello')).toBeNull();
  });
});
