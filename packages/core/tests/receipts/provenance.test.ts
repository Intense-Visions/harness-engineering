import { describe, it, expect } from 'vitest';
import {
  NO_PIPELINE_REVIEW,
  PROVENANCE_MARKER,
  buildProvenanceRow,
  parseProvenanceStamp,
  renderProvenanceBlock,
  type ProvenanceRowInput,
} from '../../src/receipts/provenance';
import type { BlockingReceiptFinding } from '../../src/receipts/schema';
import type {
  ReviewDecisionRecord,
  ReviewGateFailureCode,
  ReviewReceipt,
} from '@harness-engineering/types';

const BASE = 'a1b2c3d' + '0'.repeat(33);
const HEAD = 'e4f5a6b' + '1'.repeat(33);
const receipt = (over: Partial<ReviewReceipt> = {}): ReviewReceipt => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'full',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: [],
  blocking: 0,
  advisory: 0,
  ...over,
});
const f = (
  id: string,
  cls: BlockingReceiptFinding['findingClass'] = 'edge-case',
  stage: BlockingReceiptFinding['escapedFrom'] = 'plan'
): BlockingReceiptFinding => ({
  id,
  file: 'a.ts',
  lineRange: [1, 1],
  severity: 'important',
  title: 't',
  findingClass: cls,
  escapedFrom: stage,
});
const three = [
  f('a', 'stale-claim', 'plan'),
  f('b', 'stale-claim', 'execution'),
  f('c', 'edge-case', 'plan'),
];

interface Over extends Partial<Omit<ProvenanceRowInput, 'result' | 'review'>> {
  receipt?: Partial<ReviewReceipt>;
  findings?: BlockingReceiptFinding[];
  fail?: ReviewGateFailureCode[];
  notLoaded?: string[];
  coverage?: { examined: number; files: number };
}
const build = (review: string, over: Over = {}) => {
  const { receipt: r, findings = [], fail = [], notLoaded = [], coverage, ...rest } = over;
  return buildProvenanceRow({
    review,
    result: {
      checked: true,
      pass: fail.length === 0,
      failures: fail.map((code) => ({ code, message: 'm' })),
      reviewersRun: 4 - notLoaded.length,
      reviewersRequired: 4,
      receipt: receipt(r),
      tally: { blocking: findings, advisory: 0 },
      loaded: [],
      notLoaded,
      ...(coverage !== undefined && { coverage }),
    },
    decisions: [],
    decisionsReadable: true,
    ...rest,
  });
};
const gate = (codes: ReviewGateFailureCode[], rationale = 'accepted'): ReviewDecisionRecord => ({
  state: 'REVIEW',
  phase: 0,
  kind: 'gate',
  rationale,
  codes,
  decidedBy: 'human',
});
const cellsOf = (block: string, review: string) =>
  (block.split('\n').find((l) => l.startsWith(`| ${review} |`)) ?? '')
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

describe('buildProvenanceRow', () => {
  it('SC10: carries tier, reviewers run of required, range, coverage, gate and the tallies', () => {
    const row = build('phase-0', { findings: three, coverage: { examined: 5, files: 6 } });
    expect(row).toMatchObject({
      review: 'phase-0',
      reviewersRun: 4,
      reviewersRequired: 4,
      coverage: { examined: 5, files: 6 },
      gate: { pass: true, codes: [], overridden: false },
      blocking: 3,
      dismissed: 0,
      byClass: { 'stale-claim': 2, 'edge-case': 1 },
      byStage: { plan: 2, execution: 1 },
    });
    expect(row.receipt.diff).toEqual({ base: BASE, head: HEAD });
  });
  it('de-duplicates failure codes and keeps the order the gate raised them', () => {
    const row = build('phase-0', {
      fail: ['FINDINGS_FILE_MISSING', 'COUNTS_MISMATCH', 'FINDINGS_FILE_MISSING'],
    });
    expect(row.gate.codes).toEqual(['FINDINGS_FILE_MISSING', 'COUNTS_MISMATCH']);
  });
});

describe('fix 14: an override covers the failure it was taken for, and only that one', () => {
  it('marks a failed gate overridden when every failing code was overridden', () => {
    const row = build('phase-0', {
      fail: ['EXAMINED_FILES_EMPTY'],
      decisions: [gate(['EXAMINED_FILES_EMPTY'])],
    });
    expect(row.gate.overridden).toBe(true);
  });
  it('does not mark a later, different failure as overridden', () => {
    const row = build('phase-0', {
      fail: ['HEAD_MISMATCH'],
      decisions: [gate(['EXAMINED_FILES_EMPTY'])],
    });
    expect(row.gate.overridden).toBe(false);
    const block = renderProvenanceBlock([row]);
    expect(cellsOf(block, 'phase-0')[7]).toBe('FAIL: HEAD_MISMATCH');
  });
  it('does not mark a failure overridden when only some of its codes were', () => {
    const row = build('phase-0', {
      fail: ['HEAD_MISMATCH', 'COUNTS_MISMATCH'],
      decisions: [gate(['COUNTS_MISMATCH'])],
    });
    expect(row.gate.overridden).toBe(false);
  });
  it('a findings override never marks the gate overridden', () => {
    const findings: ReviewDecisionRecord = {
      state: 'REVIEW',
      phase: 0,
      kind: 'findings',
      rationale: 'ship',
    };
    const row = build('phase-0', { fail: ['HEAD_MISMATCH'], decisions: [findings] });
    expect(row.gate.overridden).toBe(false);
  });
  it('counts how many blocking findings a dismissal names, and shows it in the Blocking cell', () => {
    const dismissed: ReviewDecisionRecord = {
      state: 'REVIEW',
      phase: 0,
      kind: 'dismissed',
      rationale: 'not reachable',
      findingIds: ['a', 'c', 'not-a-finding'],
      decidedBy: 'human',
    };
    const row = build('phase-0', { findings: three, decisions: [dismissed] });
    expect(row.dismissed).toBe(2);
    const cells = cellsOf(renderProvenanceBlock([row]), 'phase-0');
    expect(cells[8]).toBe('3 (2 dismissed)');
    expect(cells[11]).toBe(
      '0 overrides, 1 dismissal: dismissed a, c, not-a-finding (human): not reachable'
    );
  });
  it('prints unknown, never none, when the decisions could not be read', () => {
    const unread = renderProvenanceBlock([build('phase-0', { decisionsReadable: false })]);
    expect(cellsOf(unread, 'phase-0')[11]).toBe('unknown');
    expect(cellsOf(renderProvenanceBlock([build('phase-0')]), 'phase-0')[11]).toBe('none');
  });
  it('shows every decision, a gate override with its codes', () => {
    const row = build('phase-0', {
      fail: ['COUNTS_MISMATCH'],
      decisions: [
        gate(['COUNTS_MISMATCH'], 'recount later'),
        { state: 'REVIEW', phase: 0, kind: 'findings', rationale: 'ship it', decidedBy: 'human' },
      ],
    });
    expect(cellsOf(renderProvenanceBlock([row]), 'phase-0')[11]).toBe(
      '2 overrides, 0 dismissals: gate (COUNTS_MISMATCH) (human): recount later; findings (human): ship it'
    );
  });
});

describe('renderProvenanceBlock', () => {
  it('SC10: renders one twelve-column row per review between the two markers', () => {
    const block = renderProvenanceBlock([
      build('phase-0', { findings: three, coverage: { examined: 5, files: 6 } }),
      build('final-all', { receipt: { moment: 'final' } }),
    ]);
    const lines = block.split('\n');
    expect(lines[0]).toBe(PROVENANCE_MARKER);
    expect(lines.at(-1)).toBe(PROVENANCE_MARKER);
    expect(lines[3]).toBe(
      '| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |'
    );
    expect(cellsOf(block, 'phase-0')).toEqual([
      'phase-0',
      'phase',
      'full',
      'agent',
      '4/4',
      'a1b2c3d..e4f5a6b',
      '5/6 files',
      'pass at e4f5a6b',
      '3',
      'stale-claim 2, edge-case 1',
      'plan 2, execution 1',
      'none',
    ]);
    expect(cellsOf(block, 'final-all')[6]).toBe('unknown');
  });
  it('a block with no rows says no pipeline review was recorded', () => {
    expect(renderProvenanceBlock([])).toContain(`_${NO_PIPELINE_REVIEW}._`);
  });
  it('shows a starting-commit base on the row', () => {
    const row = build('final-all', {
      receipt: { moment: 'final', diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' } },
    });
    expect(cellsOf(renderProvenanceBlock([row]), 'final-all')[5]).toBe(
      'a1b2c3d..e4f5a6b (base: starting-commit)'
    );
  });
  it('prints a blocking count as a floor when a reviewer file could not be read', () => {
    const row = build('phase-0', { findings: three, notLoaded: ['bug'] });
    const cells = cellsOf(renderProvenanceBlock([row]), 'phase-0');
    expect(cells[4]).toBe('3/4');
    expect(cells[8]).toBe('at least 3; not loaded: bug');
  });
});

describe('fix 10: the stamp shows the reviews it expected and did not find', () => {
  it('renders a label with no row as MISSING, in the order given', () => {
    const block = renderProvenanceBlock([build('phase-0'), 'phase-1', 'final-all']);
    expect(cellsOf(block, 'phase-1')).toEqual([
      'phase-1',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
      'MISSING',
      '-',
      '-',
      '-',
      '-',
    ]);
    expect(cellsOf(block, 'final-all')[7]).toBe('MISSING');
    expect(block.indexOf('| phase-1 |')).toBeLessThan(block.indexOf('| final-all |'));
  });
  it('a stamp of MISSING rows only is a table, not the "no review" sentence', () => {
    const block = renderProvenanceBlock(['phase-0', 'final-all']);
    expect(block).not.toContain(NO_PIPELINE_REVIEW);
    expect(parseProvenanceStamp(block)).toMatchObject({ reviewed: 0 });
    expect(parseProvenanceStamp(block)?.rows).toHaveLength(2);
  });
  it('shows a gap when a phase does not start at the head the previous phase reviewed', () => {
    const block = renderProvenanceBlock([build('phase-1', { gapAfter: 'phase-0' })]);
    expect(cellsOf(block, 'phase-1')[5]).toBe(
      'a1b2c3d..e4f5a6b (gap: base is not the head phase-0 reviewed)'
    );
  });
});

describe('fix 11: commits after the final review are visible', () => {
  it('never prints a bare pass when HEAD holds commits the final review did not read', () => {
    const row = build('final-all', { receipt: { moment: 'final' }, unreviewedCommits: 2 });
    expect(cellsOf(renderProvenanceBlock([row]), 'final-all')[7]).toBe(
      'pass at e4f5a6b, +2 commits not reviewed'
    );
    const one = build('final-all', { receipt: { moment: 'final' }, unreviewedCommits: 1 });
    expect(cellsOf(renderProvenanceBlock([one]), 'final-all')[7]).toBe(
      'pass at e4f5a6b, +1 commit not reviewed'
    );
  });
  it('prints a plain pass when the final review read HEAD', () => {
    const row = build('final-all', { receipt: { moment: 'final' }, unreviewedCommits: 0 });
    expect(cellsOf(renderProvenanceBlock([row]), 'final-all')[7]).toBe('pass at e4f5a6b');
  });
});

describe('fix 13: fix rounds stay visible on the row', () => {
  it('shows the round and what earlier rounds found, so a fixed phase does not read as 0', () => {
    const row = build('phase-0', {
      receipt: {
        round: 3,
        priorRounds: [
          { round: 1, head: BASE, blocking: 4 },
          { round: 2, head: BASE, blocking: 1 },
        ],
      },
    });
    expect(cellsOf(renderProvenanceBlock([row]), 'phase-0')[8]).toBe(
      '0; round 3; round 1: 4 blocking; round 2: 1 blocking'
    );
  });
  it('says nothing about rounds for a first round', () => {
    expect(cellsOf(renderProvenanceBlock([build('phase-0')]), 'phase-0')[8]).toBe('0');
  });
});
