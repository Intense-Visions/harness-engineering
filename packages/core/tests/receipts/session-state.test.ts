import { describe, it, expect } from 'vitest';
import { readSessionReviewState } from '../../src/receipts/decisions';

const SHA = 'c'.repeat(40);

/**
 * A state file with the STRUCTURE (keys only) of real sessions under .harness/sessions: the
 * top-level keys, a phase entry as autopilot writes it today, and the decision shapes four
 * different sessions hold. No review content is copied.
 */
function realShapedState(over: Record<string, unknown> = {}) {
  const phase = (index: number) => ({
    index,
    name: `Phase ${index + 1}`,
    complexity: 'medium',
    complexityOverride: null,
    status: 'complete',
    planPath: `docs/changes/x/plans/phase-${index + 1}.md`,
  });
  return {
    schemaVersion: 5,
    sessionSlug: 'changes--x--proposal',
    specPath: 'docs/changes/x/proposal.md',
    rigorLevel: 'standard',
    reviewPlans: false,
    startingCommit: SHA,
    currentState: 'REVIEW',
    currentPhase: 1,
    retryBudget: { max: 3, used: 0 },
    phases: [phase(0), phase(1), phase(2)],
    decisions: [
      { state: 'ASSESS', phase: 0, question: 'q', chosen: 'x', by: 'human', at: 't' },
      { state: 'APPROVE_PLAN', phase: 0, question: 'q', chosen: 'approve', by: 'human' },
      { state: 'REVIEW', phase: 0, kind: 'design', question: 'q', chosen: 'a', by: 'human' },
      { at: 't', phase: 1, decision: 'd', rationale: 'r' },
      { what: 'w', when: 't' },
      { phase: 2, what: 'w', why: 'y' },
    ],
    history: [],
    finalReview: { status: 'pending' },
    ...over,
  };
}
const read = (state: unknown) => readSessionReviewState(JSON.stringify(state));
const expectedOf = (phases: unknown) => read(realShapedState({ phases })).expected;
const unknownOf = (phases: unknown) => read(realShapedState({ phases })).expectedUnknown;

/**
 * Fix 5. Input partition for `phases[]`. The list: absent, not a list, empty, one, many. An
 * entry: with a correct index, with NO index (the shape one real session has: name, complexity,
 * complete), a mix of both. A wrong index: negative, a fraction, a string, null, a duplicate,
 * off by one (1-based), out of order. A malformed entry: null, a string, an object with no name.
 */
describe('expected reviews from phases[]: identity is the 0-based position', () => {
  const noIndex = (name: string) => ({ name, complexity: 'low', complete: true });
  const at = (index: unknown, name = 'p') => ({ index, name, status: 'pending' });
  it.each([
    ['an empty list', [], ['final-all']],
    ['one entry with index 0', [at(0)], ['phase-0', 'final-all']],
    [
      'many, each with its position',
      [at(0), at(1), at(2)],
      ['phase-0', 'phase-1', 'phase-2', 'final-all'],
    ],
    ['one entry with no index', [noIndex('a')], ['phase-0', 'final-all']],
    [
      'many with no index (a real shape)',
      [noIndex('a'), noIndex('b'), noIndex('c'), noIndex('d')],
      ['phase-0', 'phase-1', 'phase-2', 'phase-3', 'final-all'],
    ],
    [
      'some with an index, some without',
      [at(0), noIndex('b'), at(2)],
      ['phase-0', 'phase-1', 'phase-2', 'final-all'],
    ],
    [
      'the real-shaped state as written',
      realShapedState().phases,
      ['phase-0', 'phase-1', 'phase-2', 'final-all'],
    ],
  ])('%s -> known', (_name, phases, expected) => {
    expect(expectedOf(phases)).toEqual(expected);
    expect(unknownOf(phases)).toBeUndefined();
  });
  it.each([
    ['no phase list', undefined, { reason: 'no-phase-list' }],
    ['a phase list that is an object', { 0: at(0) }, { reason: 'no-phase-list' }],
    ['a phase list that is a string', 'three', { reason: 'no-phase-list' }],
    ['a null entry', [at(0), null], { reason: 'phase-entry', position: 1 }],
    ['a string entry', ['Phase 1'], { reason: 'phase-entry', position: 0 }],
    ['an entry with no name', [{ index: 0, status: 'x' }], { reason: 'phase-entry', position: 0 }],
    ['a negative index', [at(-1)], { reason: 'phase-index', position: 0 }],
    ['a fractional index', [at(0), at(1.5)], { reason: 'phase-index', position: 1 }],
    ['a string index', [at('0')], { reason: 'phase-index', position: 0 }],
    ['a null index', [at(null)], { reason: 'phase-index', position: 0 }],
    ['a boolean index', [at(true)], { reason: 'phase-index', position: 0 }],
    ['a duplicate index', [at(0), at(0)], { reason: 'phase-index', position: 1 }],
    ['1-based indexes', [at(1), at(2)], { reason: 'phase-index', position: 0 }],
    ['indexes out of order', [at(1), at(0)], { reason: 'phase-index', position: 0 }],
    [
      'a wrong index after entries with none',
      [noIndex('a'), at(5)],
      { reason: 'phase-index', position: 1 },
    ],
  ])('%s -> unknown, and says why', (_name, phases, why) => {
    expect(expectedOf(phases)).toBeUndefined();
    expect(unknownOf(phases)).toEqual(why);
  });
  it.each([
    ['no state file', undefined],
    ['a state file that is not JSON', '{nope'],
    ['a state file that is a JSON array', '[]'],
    ['a state file that is a JSON number', '7'],
  ])('%s -> unknown: no-state', (_name, text) => {
    const s = readSessionReviewState(text);
    expect(s).toMatchObject({ expected: undefined, expectedUnknown: { reason: 'no-state' } });
    expect(s.decisionsReadable).toBe(false);
  });
  it('a large phase list is read whole', () => {
    const many = Array.from({ length: 300 }, (_, i) => noIndex(`p${i}`));
    expect(expectedOf(many)).toHaveLength(301);
  });
});

describe('the real-shaped state file', () => {
  it('reads as readable, with no review decision, no orphan, and the starting commit', () => {
    const s = read(realShapedState());
    expect(s.decisionsReadable).toBe(true);
    expect(s.decisions.size).toBe(0);
    expect(s.orphans).toEqual([]);
    expect(s.startingCommit).toBe(SHA);
  });
  it.each([
    ['absent', undefined],
    ['a short sha', 'abc1234'],
    ['a ref name', 'main'],
    ['a number', 7],
  ])('a starting commit that is %s is not used', (_name, startingCommit) => {
    expect(read(realShapedState({ startingCommit })).startingCommit).toBeUndefined();
  });
});

/**
 * Orphan decisions. Input partition for one entry of decisions[] that carries a review kind:
 * its state is REVIEW or FINAL_REVIEW (a review decision, keyed by label), or any other state,
 * a missing state, a non-string state (an orphan: it is reported, never dropped). Entries with
 * no review kind under another state are ordinary decisions of other states and are ignored.
 */
describe('a review decision recorded under a state that is not a review state is an orphan', () => {
  const kinded = (over: Record<string, unknown>) => ({
    phase: 0,
    kind: 'findings',
    rationale: 'ship',
    ...over,
  });
  it.each([
    ['PHASE_COMPLETE', 'PHASE_COMPLETE'],
    ['DONE', 'DONE'],
    ['a lower-case review state', 'review'],
    ['no state', undefined],
    ['a numeric state', 7],
    ['a state holding markup', '<!-- x --> @team'],
  ])('state %s -> one orphan, not a decision', (_name, state) => {
    const s = read(realShapedState({ decisions: [kinded({ state })] }));
    expect(s.decisions.size).toBe(0);
    expect(s.orphans).toHaveLength(1);
    expect(s.orphans[0]).toMatchObject({ kind: 'findings' });
    expect(s.orphans[0]?.state).toMatch(/^[A-Z_]{1,40}$|^unknown$/);
  });
  it.each(['REVIEW', 'FINAL_REVIEW'])('state %s -> a decision, no orphan', (state) => {
    const s = read(realShapedState({ decisions: [kinded({ state })] }));
    expect(s.orphans).toEqual([]);
    expect(s.decisions.size).toBe(1);
  });
  it('counts each orphan, keeps the good decisions, and ignores ordinary decisions of other states', () => {
    const s = read(
      realShapedState({
        decisions: [
          kinded({ state: 'DONE', kind: 'gate', codes: ['HEAD_MISMATCH'] }),
          kinded({ state: 'OUTCOME_EVAL', kind: 'dismissed', findingIds: ['a'] }),
          kinded({ state: 'REVIEW' }),
          { state: 'VERIFY', phase: 0, chosen: 'override', rationale: 'r' },
          { state: 'EXECUTE', phase: 0, kind: 'design', chosen: 'x' },
        ],
      })
    );
    expect(s.orphans.map((o) => `${o.state}:${o.kind}`)).toEqual([
      'DONE:gate',
      'OUTCOME_EVAL:dismissed',
    ]);
    expect([...s.decisions.keys()]).toEqual(['phase-0']);
  });
});

/**
 * Fix 6. Input partition for a decision's `round`: absent (round 1), 1, 2, many, zero, negative,
 * a fraction, a string. A round that is not a positive integer makes the decision unreadable.
 */
describe('a decision record carries the round it was taken in', () => {
  const decision = (round: unknown) => ({
    state: 'REVIEW',
    phase: 0,
    kind: 'findings',
    rationale: 'ship',
    ...(round !== undefined && { round }),
  });
  it.each([
    [undefined, undefined],
    [1, 1],
    [2, 2],
    [17, 17],
  ])('round %s is kept as %s', (round, kept) => {
    const s = read(realShapedState({ decisions: [decision(round)] }));
    expect(s.decisionsReadable).toBe(true);
    expect(s.decisions.get('phase-0')?.[0]?.round).toBe(kept);
  });
  it.each([0, -1, 1.5, '2', null])('round %j makes the decision unreadable', (round) => {
    const s = read(realShapedState({ decisions: [decision(round)] }));
    expect(s.decisionsReadable).toBe(false);
    expect(s.decisions.size).toBe(0);
  });
});
