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
