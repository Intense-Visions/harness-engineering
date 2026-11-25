import { describe, it, expect } from 'vitest';
import {
  PROVENANCE_MARKER as MARKER,
  parseProvenanceStamp,
  renderProvenanceBlock,
  stampCoverage,
  type ParsedProvenanceStamp,
} from '../../src/receipts';

const HEADER =
  '| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |';
const RULE = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const row = (review: string, diff: string, gate: string) =>
  `| ${review} | ${review === 'final-all' ? 'final' : 'phase'} | full | agent | 5/5 | ${diff} | 9/9 files | ${gate} | 0 | none | none | none |`;
const stampOf = (...rows: string[]) =>
  [MARKER, '### Review provenance', '', HEADER, RULE, ...rows, '', MARKER].join('\n');
const parsed = (...rows: string[]): ParsedProvenanceStamp => {
  const p = parseProvenanceStamp(stampOf(...rows));
  if (p === undefined || p.rows.length !== rows.length) throw new Error('fixture did not parse');
  return p;
};

const HEAD = 'bbbbbbb' + '1'.repeat(33);
const PHASE_PASS = row('phase-0', '0000000..aaaaaaa', 'pass at aaaaaaa');
const FINAL_PASS_AT_HEAD = row('final-all', '0000000..bbbbbbb', 'pass at bbbbbbb');
const FINAL_PASS_OLD = row('final-all', '0000000..aaaaaaa', 'pass at aaaaaaa');
const FINAL_OVERRIDDEN_AT_HEAD = row(
  'final-all',
  '0000000..bbbbbbb',
  'FAIL: FINAL_NOT_FULL (overridden)'
);
const FINAL_OVERRIDDEN_OLD = row(
  'final-all',
  '0000000..aaaaaaa',
  'FAIL: FINAL_NOT_FULL (overridden)'
);
const FINAL_FAIL_AT_HEAD = row('final-all', '0000000..bbbbbbb', 'FAIL: FINAL_NOT_FULL');
const FINAL_MISSING = '| final-all | - | - | - | - | - | - | MISSING | - | - | - | - |';
const FINAL_UNREVIEWED = row(
  'final-all',
  '0000000..bbbbbbb',
  'pass at bbbbbbb, +2 commits not reviewed'
);

/**
 * Input partition for stampCoverage. The stamp: {not read, read with no final row (no rows; a
 * phase pass only), two final rows, one final row}. The one final row: Gate {pass, FAIL
 * (overridden), FAIL, MISSING (no Diff head)} x reviewed head {the PR head, an older commit} x
 * suffix {none, `+N commits not reviewed`}. The PR head: {a full sha, unknown, not a sha}. The
 * final row decides whatever its Gate cell says; phase rows count only when there is no final row.
 */
describe('stampCoverage: the PR head against the stamp, as data', () => {
  it('a stamp that was not read is not-read, whatever the head', () => {
    const conflicting = parseProvenanceStamp(`${stampOf(FINAL_PASS_AT_HEAD)}\n\n${stampOf()}`)!;
    expect(conflicting.status).toBe('conflicting');
    expect(stampCoverage(conflicting, HEAD)).toEqual({ state: 'not-read' });
  });
  it('a final row at the PR head that passed is current', () => {
    expect(stampCoverage(parsed(PHASE_PASS, FINAL_PASS_AT_HEAD), HEAD)).toEqual({
      state: 'current',
      head: 'bbbbbbb',
      finalHead: 'bbbbbbb',
      finalGate: 'pass at bbbbbbb',
      accepted: true,
    });
  });
  it('a final row overridden at the PR head is current, whatever the phase rows say', () => {
    expect(stampCoverage(parsed(PHASE_PASS, FINAL_OVERRIDDEN_AT_HEAD), HEAD)).toMatchObject({
      state: 'current',
      finalHead: 'bbbbbbb',
      finalGate: 'FAIL: FINAL_NOT_FULL (overridden)',
      accepted: true,
    });
  });
  it('a final row that failed at the PR head is current but not accepted', () => {
    expect(stampCoverage(parsed(FINAL_FAIL_AT_HEAD), HEAD)).toMatchObject({
      state: 'current',
      accepted: false,
    });
  });
  it.each([
    ['passed', FINAL_PASS_OLD, true],
    ['was overridden', FINAL_OVERRIDDEN_OLD, true],
  ])('a final row that %s at an older commit is stale', (_name, final, accepted) => {
    expect(stampCoverage(parsed(PHASE_PASS, final), HEAD)).toMatchObject({
      state: 'stale',
      head: 'bbbbbbb',
      finalHead: 'aaaaaaa',
      accepted,
    });
  });
  it('a final row with commits not reviewed is never current, even at the PR head', () => {
    expect(stampCoverage(parsed(FINAL_UNREVIEWED), HEAD)).toEqual({
      state: 'stale',
      head: 'bbbbbbb',
      finalHead: 'bbbbbbb',
      finalGate: 'pass at bbbbbbb, +2 commits not reviewed',
      accepted: true,
      unreviewed: '+2 commits not reviewed',
    });
  });
  it('a final row that names no reviewed head (MISSING) is stale, with no final head', () => {
    const coverage = stampCoverage(parsed(PHASE_PASS, FINAL_MISSING), HEAD);
    expect(coverage).toEqual({
      state: 'stale',
      head: 'bbbbbbb',
      finalGate: 'MISSING',
      accepted: false,
    });
  });
  it('no final row: falls back to the phase rows that passed, and is never current', () => {
    expect(stampCoverage(parsed(PHASE_PASS), HEAD)).toEqual({
      state: 'no-final-row',
      head: 'bbbbbbb',
      passed: ['aaaaaaa'],
    });
    const atHead = row('phase-0', '0000000..bbbbbbb', 'pass at bbbbbbb');
    expect(stampCoverage(parsed(atHead), HEAD)).toMatchObject({
      state: 'no-final-row',
      passed: ['bbbbbbb'],
    });
    expect(stampCoverage(parsed(), undefined)).toEqual({ state: 'no-final-row', passed: [] });
  });
  it('two final rows are compared with nothing', () => {
    expect(stampCoverage(parsed(FINAL_PASS_AT_HEAD, FINAL_PASS_OLD), HEAD)).toEqual({
      state: 'several-final-rows',
      head: 'bbbbbbb',
      finalRows: 2,
    });
  });
  it.each([
    ['unknown', undefined],
    ['not a sha', '<b>@team</b>'],
    ['abbreviated', 'bbbbbbb'],
  ])('a PR head that is %s: head-unknown, with the final row as data', (_name, prHead) => {
    expect(stampCoverage(parsed(FINAL_PASS_AT_HEAD), prHead)).toEqual({
      state: 'head-unknown',
      finalHead: 'bbbbbbb',
      finalGate: 'pass at bbbbbbb',
      accepted: true,
    });
  });
});

describe('noReview: the renderer said no review, which is not a stamp the reader could not read', () => {
  it('the renderer no-review block reads with noReview', () => {
    const p = parseProvenanceStamp(renderProvenanceBlock([]));
    expect(p).toMatchObject({ status: 'read', rows: [], noReview: true, dropped: 0 });
  });
  it('a stamp whose every line was dropped is not noReview', () => {
    const old = [
      MARKER,
      '### Review provenance',
      '',
      '| Review | Gate |',
      '| --- | --- |',
      '| final-all | pass at bbbbbbb |',
      '',
      MARKER,
    ];
    const p = parseProvenanceStamp(old.join('\n'));
    expect(p).toMatchObject({ status: 'read', rows: [], noReview: false });
    expect(p!.dropped).toBeGreaterThan(0);
  });
  it('a stamp with rows is not noReview', () => {
    expect(parsed(FINAL_PASS_AT_HEAD).noReview).toBe(false);
  });
});
