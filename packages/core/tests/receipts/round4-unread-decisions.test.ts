import { describe, it, expect } from 'vitest';
import type { ReviewDecisionRecord } from '@harness-engineering/types';
import {
  assembleStamp,
  parseProvenanceStamp,
  renderProvenanceBlock,
  type UnreadReviewRow,
} from '../../src/receipts/provenance';
import { readSessionReviewState } from '../../src/receipts/decisions';

/**
 * Round 4, fix 7. A review row with no receipt (MISSING, receipt missing, invalid, unreadable)
 * shows the decisions recorded for it; its Gate cell reads `(overridden)` when a gate decision
 * names the code that row fails with (RECEIPT_MISSING for MISSING and missing, RECEIPT_INVALID
 * for invalid and unreadable). Every rendered row must still parse.
 */
const gate = (codes: string[], over: Record<string, unknown> = {}) => ({
  state: 'REVIEW',
  phase: 0,
  kind: 'gate',
  codes,
  rationale: 'accepted by the human',
  decidedBy: 'human',
  ...over,
});
const dismissal = {
  state: 'REVIEW',
  phase: 0,
  kind: 'dismissed',
  findingIds: ['b1'],
  rationale: 'n/a',
  decidedBy: 'human',
};
type Unread = UnreadReviewRow['unread'];
function cells(unread: Unread, decisions: unknown[]) {
  const state = readSessionReviewState(JSON.stringify({ phases: [{ name: 'P' }], decisions }));
  const labels = unread.status === 'absent' ? [] : ['phase-0'];
  const { rows, notes } = assembleStamp(state, { labels, skipped: 0 }, (review) => ({
    review,
    unread,
  }));
  const block = renderProvenanceBlock(rows, notes);
  const parsed = parseProvenanceStamp(block)!;
  const line = parsed.rows.find((r) => r.startsWith('| phase-0 '));
  expect(line, 'the rendered row parses').toBeDefined();
  const c = line!.split('|').map((x) => x.trim());
  return { gate: c[8], override: c[12], notes: parsed.notes };
}

const ABSENT: Unread = { status: 'absent' };
const MISSING: Unread = { status: 'missing' };
const INVALID: Unread = { status: 'invalid' };
const UNREADABLE: Unread = { status: 'unreadable', reason: 'EACCES' };
const rows: Array<[string, Unread, unknown[], string, string]> = [
  ['MISSING, no decision', ABSENT, [], 'MISSING', '-'],
  [
    'MISSING, an override of RECEIPT_MISSING',
    ABSENT,
    [gate(['RECEIPT_MISSING'])],
    'MISSING (overridden)',
    '1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): accepted by the human',
  ],
  [
    'MISSING, an override of another code',
    ABSENT,
    [gate(['HEAD_MISMATCH'])],
    'MISSING',
    '1 override, 0 dismissals: gate (HEAD_MISMATCH) (human): accepted by the human',
  ],
  [
    'receipt missing, override of RECEIPT_MISSING',
    MISSING,
    [gate(['RECEIPT_MISSING'])],
    'receipt missing (overridden)',
    '1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): accepted by the human',
  ],
  [
    'receipt invalid, override of RECEIPT_INVALID',
    INVALID,
    [gate(['RECEIPT_INVALID'])],
    'receipt invalid (overridden)',
    '1 override, 0 dismissals: gate (RECEIPT_INVALID) (human): accepted by the human',
  ],
  [
    'receipt invalid, override of RECEIPT_MISSING (not its code)',
    INVALID,
    [gate(['RECEIPT_MISSING'])],
    'receipt invalid',
    '1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): accepted by the human',
  ],
  [
    'receipt unreadable, override of RECEIPT_INVALID',
    UNREADABLE,
    [gate(['RECEIPT_INVALID'])],
    'receipt unreadable (EACCES) (overridden)',
    '1 override, 0 dismissals: gate (RECEIPT_INVALID) (human): accepted by the human',
  ],
  [
    'receipt missing, a dismissal only',
    MISSING,
    [dismissal],
    'receipt missing',
    '0 overrides, 1 dismissal: dismissed b1 (human): n/a',
  ],
  [
    'MISSING, a round 2 override still shows (no receipt says the round)',
    ABSENT,
    [gate(['RECEIPT_MISSING'], { round: 2 })],
    'MISSING (overridden)',
    '1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): accepted by the human',
  ],
];

describe('rows without a receipt show their decisions', () => {
  it.each(rows)('%s', (_name, unread, decisions, gateCell, overrideCell) => {
    const out = cells(unread, decisions);
    expect(out.gate).toBe(gateCell);
    expect(out.override).toBe(overrideCell);
    expect(out.notes.join('\n')).not.toMatch(/orphan decision/);
  });
});

describe('a decision is never dropped', () => {
  it('an override for a review with no row is still an orphan note', () => {
    const state = readSessionReviewState(
      JSON.stringify({
        phases: [{ name: 'P' }],
        decisions: [gate(['RECEIPT_MISSING'], { phase: 5 })],
      })
    );
    const { notes } = assembleStamp(state, { labels: [], skipped: 0 }, (review) => ({
      review,
      unread: MISSING,
    }));
    expect(notes).toContainEqual({ id: 'orphan-label', args: { n: 1, label: 'phase-5' } });
  });
  it('the decisions on an unread row are typed records', () => {
    const state = readSessionReviewState(
      JSON.stringify({ phases: [{ name: 'P' }], decisions: [gate(['RECEIPT_MISSING'])] })
    );
    const { rows } = assembleStamp(state, { labels: [], skipped: 0 }, (review) => ({
      review,
      unread: MISSING,
    }));
    const row = rows[0] as UnreadReviewRow;
    expect(row.decisions.map((d: ReviewDecisionRecord) => d.kind)).toEqual(['gate']);
  });
});
