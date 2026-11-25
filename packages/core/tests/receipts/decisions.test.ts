import { describe, it, expect } from 'vitest';
import { REVIEW_GATE_FAILURE_CODES } from '@harness-engineering/types';
import { readSessionReviewState } from '../../src/receipts/decisions';

/** Phase entries shaped as autopilot writes them (session-state.test.ts covers the partition). */
const phase = (index: number) => ({ index, name: `Phase ${index}`, status: 'pending' });
const state = (decisions: unknown, phases: unknown = [phase(0), phase(1)]) =>
  JSON.stringify({ phases, decisions });
const gate = {
  state: 'REVIEW',
  phase: 0,
  kind: 'gate',
  rationale: 'why',
  codes: ['HEAD_MISMATCH'],
  decidedBy: 'human',
};

describe('readSessionReviewState: expected reviews', () => {
  it('expects one review per phase, then the final review', () => {
    expect(readSessionReviewState(state([])).expected).toEqual(['phase-0', 'phase-1', 'final-all']);
  });
  it.each([
    ['no phase list', JSON.stringify({ decisions: [] })],
    ['a phase list that is not an array', state([], { 0: {} })],
    ['a phase whose index is not a safe label', state([], [{ index: '../x' }])],
    ['a state file that is not JSON', '{nope'],
  ])('does not know the expected set for %s', (_name, text) => {
    expect(readSessionReviewState(text).expected).toBeUndefined();
  });
  it('knows nothing when there is no state file', () => {
    expect(readSessionReviewState(undefined)).toEqual({
      decisionsReadable: false,
      decisions: new Map(),
      expected: undefined,
      expectedUnknown: { reason: 'no-state' },
      orphans: [],
      legacyDecisions: 0,
    });
  });
});

describe('readSessionReviewState: review decisions', () => {
  it('keys each decision by the review label core defines, in the order taken', () => {
    const dismissed = {
      state: 'FINAL_REVIEW',
      kind: 'dismissed',
      rationale: 'unreachable',
      findingIds: ['f1'],
    };
    const findings = { state: 'REVIEW', phase: 0, kind: 'findings', rationale: 'ship' };
    const s = readSessionReviewState(state([gate, dismissed, findings]));
    expect(s.decisionsReadable).toBe(true);
    expect([...s.decisions.keys()]).toEqual(['phase-0', 'final-all']);
    expect(s.decisions.get('phase-0')?.map((d) => d.kind)).toEqual(['gate', 'findings']);
    expect(s.decisions.get('final-all')?.[0]).toMatchObject(dismissed);
  });
  it('ignores decisions of other states and other kinds', () => {
    const s = readSessionReviewState(
      state([
        { state: 'VERIFY', phase: 0, chosen: 'fix' },
        { state: 'REVIEW', phase: 0, chosen: 'fix', rationale: 'r' },
        { state: 'REVIEW', phase: 0, kind: 'design', chosen: 'x', rationale: 'r' },
      ])
    );
    expect(s).toMatchObject({ decisionsReadable: true });
    expect(s.decisions.size).toBe(0);
  });
  it('reads a state file with no decisions as readable and empty', () => {
    const s = readSessionReviewState(JSON.stringify({ phases: [] }));
    expect(s).toMatchObject({ decisionsReadable: true, expected: ['final-all'] });
  });
  it.each([
    ['an override with no kind', { state: 'REVIEW', phase: 0, chosen: 'override', question: 'q' }],
    ['a gate override that names no codes', { ...gate, codes: undefined }],
    ['a gate override with an empty code list', { ...gate, codes: [] }],
    ['a dismissal that names no finding', { ...gate, kind: 'dismissed', codes: undefined }],
    ['a decision with no rationale', { ...gate, rationale: '' }],
    ['a phase review decision with no phase', { ...gate, phase: undefined }],
    ['a phase that is not a safe label', { ...gate, phase: '<!-- x -->' }],
  ])('says the decisions are unreadable for %s, and keeps the good ones', (_name, bad) => {
    const s = readSessionReviewState(state([bad, { ...gate, phase: 1 }]));
    expect(s.decisionsReadable).toBe(false);
    expect([...s.decisions.keys()]).toEqual(['phase-1']);
  });
  it.each([
    ['null entries', [null, gate]],
    ['a non-object entry', ['override', gate]],
  ])('skips %s without losing the decisions after them', (_name, list) => {
    const s = readSessionReviewState(state(list));
    expect(s.decisions.get('phase-0')).toHaveLength(1);
  });
  it('says the decisions are unreadable when decisions is not an array', () => {
    expect(readSessionReviewState(state({ a: gate })).decisionsReadable).toBe(false);
  });
});

/**
 * Round 3, fix 4. Input partition for the codes of a gate override: absent, empty, one real code,
 * many, a duplicate, a misspelt code, a real code beside a misspelt one, a non-string, and every
 * real code at once. A code that is not a gate failure code makes the decision unreadable (the
 * stamp then says so); it is never kept as an override that silently covers nothing.
 */
describe('a gate override names real failure codes', () => {
  const codesOf = (codes: unknown) =>
    readSessionReviewState(state([{ ...gate, codes }], [{ name: 'a', status: 'x' }]));
  it.each([
    ['one real code', ['HEAD_MISMATCH']],
    ['many', ['HEAD_MISMATCH', 'COUNTS_MISMATCH', 'FINAL_NOT_FULL']],
    ['a duplicate', ['HEAD_MISMATCH', 'HEAD_MISMATCH']],
    ['every real code', [...REVIEW_GATE_FAILURE_CODES]],
  ])('%s: readable and kept', (_name, codes) => {
    const s = codesOf(codes);
    expect(s.decisionsReadable).toBe(true);
    expect(s.decisions.get('phase-0')?.[0]?.codes).toEqual(codes);
  });
  it.each([
    ['absent', undefined],
    ['empty', []],
    ['a misspelt code', ['HEAD_MISSMATCH']],
    ['a real code beside a misspelt one', ['HEAD_MISMATCH', 'HEAD_MISSMATCH']],
    ['a lower-case code', ['head_mismatch']],
    ['a non-string', [7]],
    ['a string, not a list', 'HEAD_MISMATCH'],
  ])('%s: the decision is unreadable and is not kept', (_name, codes) => {
    const s = codesOf(codes);
    expect(s.decisionsReadable).toBe(false);
    expect(s.decisions.size).toBe(0);
  });
});
