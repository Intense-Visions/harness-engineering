import { describe, it, expect } from 'vitest';
import { validateReviewReceipt, type CheckedReceiptResult } from '../../src/receipts/review-gate';
import { ReviewDecisionRecordSchema, readSessionReviewState } from '../../src/receipts/decisions';
import {
  assembleStamp,
  buildProvenanceRow,
  renderProvenanceBlock,
  type ReviewDirRead,
} from '../../src/receipts/provenance';
import { PROVENANCE_MARKER, STAMP_LIMITS, parseStampRow } from '../../src/receipts/stamp-grammar';
import { parseProvenanceStamp } from '../../src/receipts/stamp-parser';
import { BASE, HEAD, OTHER, START, codesOf, ctx, receipt } from './round4-helpers';

/**
 * Unit 3, fix round 1: the review round 1 findings on the provenance stamp. Each block names the
 * finding ids it answers.
 */

const checked = (r: ReturnType<typeof validateReviewReceipt>): CheckedReceiptResult => {
  if (!r.checked) throw new Error('the receipt did not parse');
  return r;
};
const human = { decidedBy: 'human' as const, rationale: 'r' };
/** The cells of one rendered row, after the parser accepted it. */
function cellsOf(block: string, label: string) {
  const parsed = parseProvenanceStamp(block);
  const line = parsed?.rows.find((r) => r.startsWith(`| ${label} |`));
  const cells = line === undefined ? undefined : parseStampRow(line);
  if (cells === undefined) throw new Error(`no accepted row for ${label} in:\n${block}`);
  return cells;
}

/** bug-round-from-unchecked-receipt, adversarial-round-keyed-on-claimed-round. */
describe('a row takes its decisions from the round the gate counts, not the receipt claim', () => {
  // A fix round: one archive, and a receipt that omits `round` (an honest slip).
  const archive = [{ round: 1, head: OTHER, blocking: 1 }];
  const result = checked(
    validateReviewReceipt(receipt({ priorRounds: archive }), ctx({ archivedRounds: archive }))
  );
  it('the gate counts round 2 and fails the receipt that claims round 1', () => {
    expect(result.round).toBe(2);
    expect(codesOf(result)).toEqual(['ROUND_MISMATCH']);
  });
  it("round 1's dismissal does not apply; the human's round 2 override does", () => {
    const row = buildProvenanceRow({
      review: 'phase-0',
      result,
      decisions: [
        { ...human, state: 'REVIEW', phase: 0, kind: 'dismissed', findingIds: ['x'], round: 1 },
        { ...human, state: 'REVIEW', phase: 0, kind: 'gate', codes: ['ROUND_MISMATCH'], round: 2 },
      ],
      decisionsReadable: true,
    });
    expect(row.round).toBe(2);
    expect(row.gate).toEqual({ pass: false, codes: ['ROUND_MISMATCH'], overridden: true });
    expect(row.decisions.map((d) => d.kind)).toEqual(['gate']);
    expect(row.otherRoundDecisions).toBe(1);
    const cells = cellsOf(renderProvenanceBlock([row]), 'phase-0');
    expect(cells.Gate).toBe('FAIL: ROUND_MISMATCH (overridden)');
    expect(cells.Blocking).toBe('0; round 2; round 1: 1 blocking');
  });
  it('with no archives read, the round is the receipt claim', () => {
    expect(checked(validateReviewReceipt(receipt({ round: 1 }), ctx())).round).toBe(1);
  });
});

/** adversarial-render-fails-every-row-on-dirty-tree, architecture-worktree-check-under-ancestor-rule. */
describe('a caller that re-checks a review of an earlier commit does not check the working tree', () => {
  it.each([
    ['not-checked', []],
    [true, []],
    [false, ['WORKTREE_DIRTY']],
    [undefined, ['WORKTREE_DIRTY']],
  ] as const)('worktreeClean %s -> %j', (worktreeClean, codes) => {
    expect(codesOf(validateReviewReceipt(receipt(), ctx({ worktreeClean })))).toEqual(codes);
  });
});

/** bug-gap-ignores-reachability, adversarial-gap-uses-receipt-gate-passes-over. */
describe('the gate result carries the phase base it demanded', () => {
  it('a phase receipt carries it', () => {
    const phaseBase = { status: 'resolved', base: BASE, source: 'starting-commit' } as const;
    expect(checked(validateReviewReceipt(receipt(), ctx({ phaseBase }))).phaseBase).toEqual(
      phaseBase
    );
  });
  it('a final receipt does not', () => {
    const final = receipt({ moment: 'final', diff: { base: BASE, head: HEAD } });
    const r = checked(validateReviewReceipt(final, ctx({}, 'final')));
    expect(r.phaseBase).toBeUndefined();
  });
});

/** bug-missing-for-skipped-reviews, adversarial-sanctioned-skips-render-missing, compliance. */
describe('a skipped review is a typed decision and a row of its own', () => {
  const skip = (over: Record<string, unknown>) => ({
    ...human,
    state: 'REVIEW',
    phase: 0,
    kind: 'skipped',
    ...over,
  });
  it.each([
    ['empty, with the head', skip({ reason: 'empty', head: HEAD }), true],
    ['empty, no head', skip({ reason: 'empty' }), true],
    ['dropped', skip({ reason: 'dropped' }), true],
    [
      'the final review, empty',
      skip({ state: 'FINAL_REVIEW', phase: undefined, reason: 'empty' }),
      true,
    ],
    ['no reason', skip({}), false],
    ['an unknown reason', skip({ reason: 'later' }), false],
    ['a head that is not a full sha', skip({ reason: 'empty', head: 'abc1234' }), false],
  ])('the schema: %s -> %s', (_name, record, ok) => {
    const clean = JSON.parse(JSON.stringify(record));
    expect(ReviewDecisionRecordSchema.safeParse(clean).success).toBe(ok);
  });

  function stamp(decisions: unknown[], phases = 2, dirs: string[] = [], count = 3) {
    const state = readSessionReviewState(
      JSON.stringify({
        startingCommit: START,
        phases: Array.from({ length: phases }, (_, i) => ({ name: `P${i}` })),
        decisions,
      })
    );
    const read = (review: string): ReviewDirRead => ({ review, unread: { status: 'missing' } });
    const counted: string[] = [];
    const out = assembleStamp(state, { labels: dirs, skipped: 0 }, read, (from) => {
      counted.push(from);
      return count;
    });
    return { ...out, block: renderProvenanceBlock(out.rows, out.notes), counted };
  }

  it('an empty phase and a dropped phase are not MISSING', () => {
    const { block } = stamp([
      skip({ phase: 0, reason: 'empty', head: HEAD }),
      skip({ phase: 1, reason: 'dropped', decidedBy: 'human' }),
    ]);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (empty)');
    expect(cellsOf(block, 'phase-1').Gate).toBe('skipped (dropped)');
    expect(cellsOf(block, 'phase-1').Override).toBe(
      '0 overrides, 0 dismissals, 1 skip: skipped (dropped) (human): r'
    );
  });
  it('a directory with no receipt that a skip covers is skipped too', () => {
    const { block } = stamp([skip({ phase: 0, reason: 'empty' })], 1, ['phase-0']);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (empty)');
  });
  it('a phase with no skip decision is still MISSING', () => {
    expect(cellsOf(stamp([]).block, 'phase-0').Gate).toBe('MISSING');
  });
  it('the final review skipped as empty counts the commits after the head it recorded', () => {
    const { block, counted } = stamp([
      skip({ state: 'FINAL_REVIEW', phase: undefined, reason: 'empty', head: OTHER }),
    ]);
    expect(counted).toEqual([OTHER]);
    expect(cellsOf(block, 'final-all').Gate).toBe('skipped (empty), +3 commits not reviewed');
  });
});

/** compliance-ship-unreviewed-count-not-on-unread-final-row, adversarial-unread-final-row-no-unreviewed-count. */
describe('a final row without a read receipt counts the commits it did not cover', () => {
  const gate = { ...human, state: 'FINAL_REVIEW', kind: 'gate', codes: ['RECEIPT_MISSING'] };
  function finalCell(
    dirs: string[],
    decisions: unknown[],
    count: number | 'unavailable',
    startingCommit: string | undefined = START
  ) {
    const state = readSessionReviewState(
      JSON.stringify({ ...(startingCommit && { startingCommit }), phases: [], decisions })
    );
    const counted: string[] = [];
    const out = assembleStamp(
      state,
      { labels: dirs, skipped: 0 },
      (review) => ({ review, unread: { status: 'missing' } }),
      (from) => {
        counted.push(from);
        return count;
      }
    );
    return { gate: cellsOf(renderProvenanceBlock(out.rows), 'final-all').Gate, counted };
  }
  it('MISSING: from the starting commit', () => {
    expect(finalCell([], [], 4)).toEqual({
      gate: 'MISSING, +4 commits not reviewed',
      counted: [START],
    });
  });
  it('receipt missing, overridden', () => {
    expect(finalCell(['final-all'], [gate], 1).gate).toBe(
      'receipt missing (overridden), +1 commit not reviewed'
    );
  });
  it('git could not count', () => {
    expect(finalCell([], [], 'unavailable').gate).toBe(
      'MISSING, +? commits not reviewed (count unavailable)'
    );
  });
  it('no starting commit: unavailable, never zero', () => {
    expect(finalCell([], [], 9, '')).toEqual({
      gate: 'MISSING, +? commits not reviewed (count unavailable)',
      counted: [],
    });
  });
  it('zero commits adds nothing', () => {
    expect(finalCell([], [], 0).gate).toBe('MISSING');
  });
});

/** Suggestions: Override `unknown` when any decision is unreadable; the orphan note; outside-repo. */
describe('fix round 1 suggestions', () => {
  const gate = { ...human, state: 'REVIEW', phase: 0, kind: 'gate', codes: ['RECEIPT_MISSING'] };
  function block(decisions: unknown[], phases: unknown, unread = 'missing') {
    const state = readSessionReviewState(JSON.stringify({ phases, decisions }));
    const out = assembleStamp(state, { labels: ['phase-0'], skipped: 0 }, (review) => ({
      review,
      unread: { status: unread } as never,
    }));
    return { block: renderProvenanceBlock(out.rows, out.notes), notes: out.notes };
  }
  it('a row with readable decisions says unknown when another decision is unreadable', () => {
    const { block: b } = block(
      [gate, { state: 'REVIEW', phase: 0, chosen: 'override' }],
      [{ name: 'P' }]
    );
    expect(cellsOf(b, 'phase-0').Override).toBe(
      'unknown, at least 1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): r'
    );
  });
  it('with the expected reviews unknown, a decision for a review with no row is not an orphan', () => {
    const { notes } = block([{ ...gate, phase: 3 }], [{ name: 'P', index: 7 }]);
    expect(notes.map((n) => n.id)).toContain('decision-no-row');
    expect(notes.map((n) => n.id)).not.toContain('orphan-label');
  });
  it('with the expected reviews known, it is an orphan', () => {
    const { notes } = block([{ ...gate, phase: 3 }], [{ name: 'P' }]);
    expect(notes.map((n) => n.id)).toContain('orphan-label');
  });
  it('a receipt in another repository is its own state, overridden by RECEIPT_OUTSIDE_REPO', () => {
    const over = { ...gate, codes: ['RECEIPT_OUTSIDE_REPO'] };
    const { block: b } = block([over], [{ name: 'P' }], 'outside-repo');
    expect(cellsOf(b, 'phase-0').Gate).toBe('receipt outside repository (overridden)');
  });
});

/** security-details-hidden-stamp-read, security-open-comment-quadratic. */
describe('the PR-body parser: hidden blocks, more than one stamp, and its input bound', () => {
  const stamp = (gate: 'pass' | 'fail') =>
    renderProvenanceBlock([
      buildProvenanceRow({
        review: 'final-all',
        result: checked(
          validateReviewReceipt(
            receipt({ moment: 'final' }),
            ctx(gate === 'fail' ? { head: OTHER } : {}, 'final')
          )
        ),
        decisions: [],
        decisionsReadable: true,
      }),
    ]);
  const VISIBLE = stamp('fail');
  const HIDDEN = stamp('pass');
  it.each([
    ['a collapsed <details> after the stamp', `${VISIBLE}\n\n<details>\n\n${HIDDEN}\n\n</details>`],
    [
      'a <details> with a summary',
      `${VISIBLE}\n\n<details><summary>more</summary>\n\n${HIDDEN}\n\n</details>`,
    ],
    ['an open <details>', `${VISIBLE}\n\n<details open>\n\n${HIDDEN}\n\n</details>`],
    [
      'nested <details>',
      `${VISIBLE}\n\n<details>\n\n<details>\n\n</details>\n\n${HIDDEN}\n\n</details>`,
    ],
  ])('%s is not read; the visible stamp is', (_name, body) => {
    const parsed = parseProvenanceStamp(body);
    expect(parsed).toMatchObject({ status: 'read', stamps: 1, passedAt: [] });
    expect(parsed?.finalRows[0]?.gate).toMatch(/^FAIL: HEAD_MISMATCH/);
  });
  it('after </details> a stamp is visible again', () => {
    const body = `<details>\n\nhidden\n\n</details>\n\n${VISIBLE}`;
    expect(parseProvenanceStamp(body)).toMatchObject({ status: 'read', stamps: 1 });
  });
  it('two visible stamps are conflicting, and neither is read', () => {
    expect(parseProvenanceStamp(`${VISIBLE}\n\n${HIDDEN}`)).toMatchObject({
      status: 'conflicting',
      stamps: 2,
      rows: [],
      passedAt: [],
      finalRows: [],
    });
  });
  it('text over the input bound is refused unread', () => {
    const body = `${VISIBLE}\n\n${'x'.repeat(STAMP_LIMITS.input)}`;
    expect(parseProvenanceStamp(body)).toMatchObject({ status: 'too-large', stamps: 0, rows: [] });
    expect(parseProvenanceStamp(`${VISIBLE}\n\n${'x'.repeat(1000)}`)?.status).toBe('read');
  });
  it('a line of many unclosed comment openers leaves a comment open, and hides what follows', () => {
    const openers = '<!--'.repeat(20000);
    expect(parseProvenanceStamp(`${openers}\n\n${VISIBLE}`)).toBeUndefined();
    expect(parseProvenanceStamp(`${'<!-- x -->'.repeat(5000)}\n\n${VISIBLE}`)?.status).toBe('read');
  });
  it('the marker is the same text the renderer writes', () => {
    expect(VISIBLE.startsWith(PROVENANCE_MARKER)).toBe(true);
  });
});
