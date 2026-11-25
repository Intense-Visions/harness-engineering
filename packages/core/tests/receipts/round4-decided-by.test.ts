import { describe, it, expect } from 'vitest';
import type { ReviewDecisionRecord } from '@harness-engineering/types';
import { ReviewDecisionRecordSchema, readSessionReviewState } from '../../src/receipts/decisions';
import {
  buildProvenanceRow,
  parseProvenanceStamp,
  renderProvenanceBlock,
} from '../../src/receipts/provenance';
import { noteText } from '../../src/receipts/stamp-grammar';
import type { CheckedReceiptResult } from '../../src/receipts/review-gate';
import type { BlockingReceiptFinding } from '../../src/receipts/schema';

/**
 * Round 4, fix 8. Every override and dismissal record says who decided: `human`, `audited` (a
 * blind-then-refute self-audit agreed) or `unaudited`. The schema rejects a record without it;
 * the session reader reads an old record as `unknown` and says so in a note; the stamp shows the
 * decider, and flags dismissals no human or audit agreed to in the Blocking cell.
 */
const base = { state: 'REVIEW', phase: 0, rationale: 'why' };
describe('ReviewDecisionRecordSchema requires decidedBy', () => {
  const rows: Array<[string, Record<string, unknown>, boolean]> = [
    ['gate, human', { ...base, kind: 'gate', codes: ['HEAD_MISMATCH'], decidedBy: 'human' }, true],
    ['findings, audited', { ...base, kind: 'findings', decidedBy: 'audited' }, true],
    [
      'dismissed, unaudited',
      { ...base, kind: 'dismissed', findingIds: ['a'], decidedBy: 'unaudited' },
      true,
    ],
    ['dismissed, no decidedBy', { ...base, kind: 'dismissed', findingIds: ['a'] }, false],
    [
      'gate, decidedBy unknown (only the reader writes it)',
      { ...base, kind: 'gate', codes: ['HEAD_MISMATCH'], decidedBy: 'unknown' },
      false,
    ],
    [
      'gate, decidedBy agent',
      { ...base, kind: 'gate', codes: ['HEAD_MISMATCH'], decidedBy: 'agent' },
      false,
    ],
  ];
  it.each(rows)('%s -> %s', (_name, record, ok) => {
    expect(ReviewDecisionRecordSchema.safeParse(record).success).toBe(ok);
  });
});

describe('the session reader: an old record is read as unknown, with a note', () => {
  it('counts legacy records and keeps them readable', () => {
    const state = readSessionReviewState(
      JSON.stringify({
        phases: [{ name: 'P' }],
        decisions: [
          { ...base, kind: 'dismissed', findingIds: ['a'] },
          { ...base, kind: 'gate', codes: ['HEAD_MISMATCH'], decidedBy: 'human' },
        ],
      })
    );
    expect(state.decisionsReadable).toBe(true);
    expect(state.legacyDecisions).toBe(1);
    expect(state.decisions.get('phase-0')?.map((d) => d.decidedBy)).toEqual(['unknown', 'human']);
  });
  it('a record with a decidedBy outside the vocabulary makes the decisions unreadable', () => {
    const state = readSessionReviewState(
      JSON.stringify({
        phases: [{ name: 'P' }],
        decisions: [{ ...base, kind: 'gate', codes: ['HEAD_MISMATCH'], decidedBy: 'agent' }],
      })
    );
    expect(state.decisionsReadable).toBe(false);
  });
  it('the legacy note text', () => {
    expect(noteText({ id: 'decisions-legacy', args: { n: 2 } })).toBe(
      'decision provenance unknown: 2 review decisions were recorded without decidedBy'
    );
  });
});

const finding = (id: string): BlockingReceiptFinding => ({
  id,
  file: 'a.ts',
  lineRange: [1, 1],
  severity: 'important',
  title: id,
  findingClass: 'edge-case',
  escapedFrom: 'plan',
});
const result = (ids: string[]): CheckedReceiptResult => ({
  checked: true,
  pass: true,
  failures: [],
  reviewersRun: 4,
  reviewersRequired: 4,
  receipt: {
    schemaVersion: 1,
    moment: 'phase',
    tier: 'full',
    backend: 'agent',
    diff: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: [],
    blocking: ids.length,
    advisory: 0,
  },
  tally: { blocking: ids.map(finding), advisory: 0 },
  loaded: [],
  notLoaded: [],
});
const dismissed = (ids: string[], decidedBy: string): ReviewDecisionRecord =>
  ({ ...base, kind: 'dismissed', findingIds: ids, decidedBy }) as ReviewDecisionRecord;

describe('the stamp shows the decider', () => {
  const rows: Array<[string, ReviewDecisionRecord[], string, string]> = [
    [
      'dismissed by a human',
      [dismissed(['a', 'b'], 'human')],
      '3 (2 dismissed)',
      '0 overrides, 1 dismissal: dismissed a, b (human): why',
    ],
    [
      'dismissed after an audit',
      [dismissed(['a'], 'audited')],
      '3 (1 dismissed)',
      '0 overrides, 1 dismissal: dismissed a (audited): why',
    ],
    [
      'dismissed unaudited is flagged',
      [dismissed(['a', 'b'], 'human'), dismissed(['c'], 'unaudited')],
      '3 (3 dismissed, 1 unaudited)',
      '0 overrides, 2 dismissals: dismissed a, b (human): why; dismissed c (unaudited): why',
    ],
    [
      'dismissed by an unknown decider is flagged apart',
      [dismissed(['a'], 'unknown')],
      '3 (1 dismissed, 1 decider unknown)',
      '0 overrides, 1 dismissal: dismissed a (decider unknown): why',
    ],
    [
      'a gate override by a human',
      [
        {
          ...base,
          kind: 'gate',
          codes: ['HEAD_MISMATCH'],
          decidedBy: 'human',
        } as ReviewDecisionRecord,
      ],
      '3',
      '1 override, 0 dismissals: gate (HEAD_MISMATCH) (human): why',
    ],
  ];
  it.each(rows)('%s', (_name, decisions, blocking, override) => {
    const row = buildProvenanceRow({
      review: 'phase-0',
      result: result(['a', 'b', 'c']),
      decisions,
      decisionsReadable: true,
    });
    const parsed = parseProvenanceStamp(renderProvenanceBlock([row]))!;
    expect(parsed.rows).toHaveLength(1);
    const cells = parsed.rows[0]!.split('|').map((c) => c.trim());
    expect(cells[9]).toBe(blocking);
    expect(cells[12]).toBe(override);
  });
});
