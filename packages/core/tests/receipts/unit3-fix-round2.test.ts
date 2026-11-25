import { describe, it, expect } from 'vitest';
import { validateReviewReceipt, type CheckedReceiptResult } from '../../src/receipts/review-gate';
import { ReviewDecisionRecordSchema, readSessionReviewState } from '../../src/receipts/decisions';
import {
  assembleStamp,
  buildProvenanceRow,
  renderProvenanceBlock,
  type ReviewDirRead,
  type StampGit,
} from '../../src/receipts/provenance';
import { STAMP_LIMITS, noteText, parseStampRow } from '../../src/receipts/stamp-grammar';
import { parseProvenanceStamp } from '../../src/receipts/stamp-parser';
import { HEAD, OTHER, START, ctx, receipt } from './round4-helpers';

/**
 * Unit 3, fix round 2: the verification findings on the round 1 fixes. The parser fails closed
 * where it cannot tell what the page shows; a final row without a receipt counts from the base
 * the final gate demands; an empty skip is recomputed. Each block names the finding it answers.
 */

const M = '<!-- harness:review-provenance -->';
const H = '### Review provenance';
const HDR =
  '| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |';
const RULE = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
const row = (gate: string) =>
  `| final-all | final | full | agent | 4/4 | aaaaaaa..bbbbbbb | 3/3 files | ${gate} | 0 | none | none | none |`;
const stamp = (gate: string) => [M, H, '', HDR, RULE, row(gate), '', M].join('\n');
const PASS = stamp('pass at bbbbbbb');
const FAIL = stamp('FAIL: HEAD_MISMATCH');
const body = (...parts: string[]) => parts.join('\n\n');

/**
 * security F1, adversarial F2: every probe of the verification reviewers. A body that hides a
 * stamp from the page, or whose hidden part the parser cannot place, is never read with the
 * hidden row: it is `ambiguous`.
 */
describe('the parser reads nothing where <details> appears before the last marker', () => {
  it.each([
    ['A0 details hides PASS', [`<details>`, PASS, '</details>']],
    ['B1 code-span </details>', ['<details>', '`</details>`', PASS, '</details>']],
    ['B2 fenced </details>', ['<details>', '```\n</details>\n```', PASS, '</details>']],
    [
      'B3 multi-line comment </details>',
      ['<details>', '<!--\n</details>\n-->', PASS, '</details>'],
    ],
    ['B4 escaped \\</details>', ['<details>', '\\</details>', PASS, '</details>']],
    ['B5 --> <details>', ['<!--\n--> <details>', PASS]],
    ['B6 </pre><details>', ['<pre>\nx\n</pre><details>', PASS]],
    ['B6b <pre></pre><details> on one line', ['<pre>x</pre><details>', PASS]],
    ['B7 `<!--` hides <details>', ['`<!--`', '<details>', '`-->`', PASS]],
    ['B8 a fence whose info string holds a backtick', ['``` a ` b', '<details>', '```', PASS]],
    ['B9 indented-code </details>', ['<details>', '    </details>', PASS, '</details>']],
    [
      'ATK visible FAIL, hidden PASS',
      ['`<details>`', FAIL, '<details>', '`</details>` `</details>`', PASS, '</details>'],
    ],
    ['B11 <textarea> holds <details>', ['<textarea>\n<details>\n</textarea>', PASS]],
    ['B12 CDATA bogus comment', ['<![CDATA[\nfoo>\n<details>\n]]>', PASS]],
    ['B13 <? bogus comment', ['<?\na>\n<details>\n?>', PASS]],
    ['B14 <script> holds <details>', ['<script>\n<details>\n</script>', PASS]],
    ['B15 an HTML block with </details> as text', ['<details>', '<div>`</details>`</div>', PASS]],
    ['B16 <DeTaIlS open>', ['<DeTaIlS open>', PASS]],
    ['B17 <details> in table cell HTML', ['<table><tr><td><details>', PASS]],
    ['S1 > <details> in a quote', ['> <details>', PASS]],
    ['S2 - <details> in a list', ['- <details>', PASS]],
    ['S3 `<details>` code span', ['`<details>`', PASS]],
    ['S4 </details x>', ['<details>', '</details x>', PASS]],
    [
      'inline code mentions <details>',
      ['This PR stops reading stamps inside `<details>` blocks.', PASS],
    ],
    ['indented code holds <details>', ['Example:\n\n    <details>', PASS]],
    [
      'a real stamp wrapped in <details>',
      ['<details><summary>Review</summary>', PASS, '</details>'],
    ],
    ['link text holds <details>', ['See [the `<details>` fix](https://x).', PASS]],
    ['<details>…</details> in one code span line', ['Use `<details>`…`</details>` pairs.', PASS]],
    ['a stamp, <details>, a stamp', [PASS, '<details>', PASS, '</details>']],
    ['CRLF line ends', ['<details>\r\n', PASS]],
  ])('%s: ambiguous, nothing read', (_name, parts) => {
    const parsed = parseProvenanceStamp(body(...parts));
    expect(parsed).toMatchObject({
      status: 'ambiguous',
      // B7's code span `<!--` is refused first, on its own line.
      reason: _name.startsWith('B7') ? 'comment-opener' : 'details-element',
      stamps: 0,
      rows: [],
      notes: [],
      passedAt: [],
      finalRows: [],
    });
  });
  it('<details> after the last marker leaves the stamp read', () => {
    expect(parseProvenanceStamp(body(PASS, 'See `<details>` handling.'))).toMatchObject({
      status: 'read',
      stamps: 1,
    });
  });
});

/** adversarial parse2: a comment opener a code span turns into text. */
describe('the parser reads nothing where a comment opener may be text', () => {
  it.each([
    ['a `<!--` code span before the stamp', ['A stamp inside a `<!--` comment is not read.', PASS]],
    ['a code span across lines holding <!--', ['foo `a\nb <!--\nc` d', PASS]],
    ['an opener left open mid-line', ['text <!-- note', 'more -->', PASS]],
    ['an opener left open in a quote', ['> <!--', '-->', PASS]],
    ['an opener left open in a list item', ['- <!--\n  x\n-->', PASS]],
  ])('%s: ambiguous', (_name, parts) => {
    expect(parseProvenanceStamp(body(...parts))).toMatchObject({
      status: 'ambiguous',
      reason: 'comment-opener',
      rows: [],
    });
  });
  it.each([
    ['a block comment at the start of its line (a PR template)', ['<!--\nDescribe it\n-->', PASS]],
    ['a whole comment on one line', ['text <!-- note --> more', PASS]],
    ['the marker quoted in a code span', ['the `<!-- harness:review-provenance -->` marker', PASS]],
    ['a comment with a backtick after the last marker', [PASS, 'later `<!--`']],
  ])('%s: read', (_name, parts) => {
    expect(parseProvenanceStamp(body(...parts))).toMatchObject({ status: 'read', stamps: 1 });
  });
  it('the scan stays linear: a long line of openers and backticks before the marker', () => {
    const text = `${'<!--`'.repeat(40000)}\n\n${PASS}`;
    const start = performance.now();
    expect(parseProvenanceStamp(text)?.status).toBe('ambiguous');
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it('the scan stays linear: many short lines before the marker', () => {
    const text = `${'x\n'.repeat((STAMP_LIMITS.input - PASS.length) / 2 - 10)}\n${PASS}`;
    expect(text.length).toBeLessThanOrEqual(STAMP_LIMITS.input);
    const start = performance.now();
    expect(parseProvenanceStamp(text)?.status).toBe('read');
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

/** A fence the page does not open: a backtick info string that holds a backtick. */
describe('a backtick fence whose info string holds a backtick is no fence', () => {
  it('the stamp the page shows as code (between the real fences) is not read', () => {
    expect(parseProvenanceStamp(body('``` a ` b', '```', PASS, '```'))).toBeUndefined();
  });
  it('a tilde fence may hold a backtick in its info string', () => {
    expect(parseProvenanceStamp(body('~~~ a ` b', PASS, '~~~'))).toBeUndefined();
  });
});

/** security F2: a line indented four or more columns is a code block on the page, not a row. */
describe('indented stamp lines are not rows', () => {
  const lines = (prefix: string) =>
    [M, H, '', prefix + HDR, prefix + RULE, prefix + row('pass at bbbbbbb'), '', M].join('\n');
  it('I1 a table indented four columns: no row read', () => {
    expect(parseProvenanceStamp(lines('    '))).toMatchObject({
      status: 'read',
      rows: [],
      finalRows: [],
      passedAt: [],
    });
  });
  it('a row indented four columns under a plain header is dropped with the rest', () => {
    const text = [M, H, '', HDR, RULE, `    ${row('pass at bbbbbbb')}`, row('x'), '', M].join('\n');
    expect(parseProvenanceStamp(text)).toMatchObject({ rows: [], dropped: 2 });
  });
  it('a tab-indented row is dropped', () => {
    const text = [M, H, '', HDR, RULE, `\t${row('pass at bbbbbbb')}`, '', M].join('\n');
    expect(parseProvenanceStamp(text)?.rows).toEqual([]);
  });
  it('one to three spaces of indent still read', () => {
    expect(parseProvenanceStamp(lines('   '))?.rows).toHaveLength(1);
  });
  it('an indented note is dropped', () => {
    const note = `    - ${noteText({ id: 'decisions-unreadable' })}`;
    const text = [M, H, '', HDR, RULE, row('pass at bbbbbbb'), '', note, '', M].join('\n');
    expect(parseProvenanceStamp(text)).toMatchObject({ notes: [], dropped: 1 });
  });
});

describe('the other states are unchanged', () => {
  it('S5 a marker with a zero-width character is no marker', () => {
    const hidden = PASS.replaceAll('review-provenance', 'review-\u200bprovenance');
    expect(parseProvenanceStamp(hidden)).toBeUndefined();
  });
  it('C1 two visible stamps: conflicting', () => {
    expect(parseProvenanceStamp(body(PASS, FAIL))).toMatchObject({
      status: 'conflicting',
      stamps: 2,
    });
  });
  it('T1 too large', () => {
    expect(parseProvenanceStamp(body(PASS, 'x'.repeat(STAMP_LIMITS.input)))?.status).toBe(
      'too-large'
    );
  });
  it('text with no marker is no stamp, whatever else it holds', () => {
    expect(parseProvenanceStamp('<details>\n\nnothing here\n\n</details>')).toBeUndefined();
  });
});

const human = { decidedBy: 'human' as const, rationale: 'r' };
const skip = (over: Record<string, unknown>) => ({
  ...human,
  state: 'REVIEW',
  phase: 0,
  kind: 'skipped',
  ...over,
});
const finalSkip = (over: Record<string, unknown>) =>
  skip({ state: 'FINAL_REVIEW', phase: undefined, reason: 'empty', ...over });
function cellsOf(block: string, label: string) {
  const parsed = parseProvenanceStamp(block);
  const line = parsed?.rows.find((r) => r.startsWith(`| ${label} |`));
  const cells = line === undefined ? undefined : parseStampRow(line);
  if (cells === undefined) throw new Error(`no accepted row for ${label} in:\n${block}`);
  return cells;
}

const FINAL_BASE = 'e'.repeat(40);
/** A session stamp with a git that counts 5 from anything and answers rangeEmpty as given. */
function stampWith(opts: {
  decisions?: unknown[];
  phases?: unknown;
  dirs?: string[];
  read?: (label: string) => ReviewDirRead;
  finalBase?: string | undefined;
  rangeEmpty?: StampGit['rangeEmpty'];
}) {
  const state = readSessionReviewState(
    JSON.stringify({
      startingCommit: START,
      ...(opts.phases !== null && { phases: opts.phases ?? [] }),
      decisions: opts.decisions ?? [],
    })
  );
  const counted: string[] = [];
  const asked: Array<[string, string]> = [];
  const read = opts.read ?? ((review) => ({ review, unread: { status: 'missing' } }));
  const out = assembleStamp(state, { labels: opts.dirs ?? [], skipped: 0 }, read, {
    commitsAfter: (from) => {
      counted.push(from);
      return 5;
    },
    finalBase: 'finalBase' in opts ? opts.finalBase : FINAL_BASE,
    rangeEmpty: (review, head) => {
      asked.push([review, head]);
      return opts.rangeEmpty?.(review, head);
    },
  });
  return { ...out, block: renderProvenanceBlock(out.rows, out.notes), counted, asked };
}

/** adversarial F1: a final row with no receipt counts from the base the final gate demands. */
describe('a final row without a read receipt counts from the final base', () => {
  it.each([
    ['MISSING', [], (r: string): ReviewDirRead => ({ review: r, unread: { status: 'missing' } })],
    [
      'receipt missing',
      ['final-all'],
      (r: string): ReviewDirRead => ({ review: r, unread: { status: 'missing' } }),
    ],
    [
      'receipt invalid',
      ['final-all'],
      (r: string): ReviewDirRead => ({ review: r, unread: { status: 'invalid' } }),
    ],
    [
      'receipt unreadable (EACCES)',
      ['final-all'],
      (r: string): ReviewDirRead => ({
        review: r,
        unread: { status: 'unreadable', reason: 'EACCES' },
      }),
    ],
    [
      'receipt outside repository',
      ['final-all'],
      (r: string): ReviewDirRead => ({ review: r, unread: { status: 'outside-repo' } }),
    ],
  ])('%s: from the final base, never the starting commit', (gate, dirs, read) => {
    const { block, counted } = stampWith({ dirs, read });
    expect(counted).toEqual([FINAL_BASE]);
    expect(cellsOf(block, 'final-all').Gate).toBe(`${gate}, +5 commits not reviewed`);
  });
  it('an overridden one too', () => {
    const over = { ...human, state: 'FINAL_REVIEW', kind: 'gate', codes: ['RECEIPT_MISSING'] };
    const { block, counted } = stampWith({ decisions: [over] });
    expect(counted).toEqual([FINAL_BASE]);
    expect(cellsOf(block, 'final-all').Gate).toBe('MISSING (overridden), +5 commits not reviewed');
  });
  it('no final base: unavailable, never zero and never the starting commit', () => {
    const { block, counted } = stampWith({ finalBase: undefined });
    expect(counted).toEqual([]);
    expect(cellsOf(block, 'final-all').Gate).toBe(
      'MISSING, +? commits not reviewed (count unavailable)'
    );
  });
  it('a skip recomputed empty counts from its head', () => {
    const { block, counted } = stampWith({
      decisions: [finalSkip({ head: OTHER })],
      rangeEmpty: () => true,
    });
    expect(counted).toEqual([OTHER]);
    expect(cellsOf(block, 'final-all').Gate).toBe('skipped (empty), +5 commits not reviewed');
  });
  it.each([
    ['not empty', () => false, 'skipped (empty; range not empty)'],
    ['not checkable', () => undefined, 'skipped (empty; unverified)'],
  ] as const)('a skip whose range is %s counts from the final base', (_n, empty, gate) => {
    const { block, counted } = stampWith({
      decisions: [finalSkip({ head: OTHER })],
      rangeEmpty: empty,
    });
    expect(counted).toEqual([FINAL_BASE]);
    expect(cellsOf(block, 'final-all').Gate).toBe(`${gate}, +5 commits not reviewed`);
  });
  it("a skip's head is not used when the Gate cell does not show the skip", () => {
    const { block, counted } = stampWith({
      decisions: [finalSkip({ head: OTHER })],
      dirs: ['final-all'],
      read: (review) => ({ review, unread: { status: 'invalid' } }),
      rangeEmpty: () => true,
    });
    expect(counted).toEqual([FINAL_BASE]);
    expect(cellsOf(block, 'final-all').Gate).toBe('receipt invalid, +5 commits not reviewed');
  });
});

/** adversarial F3: an empty skip is recomputed at its head, never taken on its word. */
describe('an empty skip is recomputed', () => {
  it('a phase skip whose range is not empty says so', () => {
    const { block, asked } = stampWith({
      phases: [{ name: 'P' }],
      decisions: [skip({ reason: 'empty', head: HEAD })],
      rangeEmpty: () => false,
    });
    expect(asked).toEqual([['phase-0', HEAD]]);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (empty; range not empty)');
  });
  it('a phase skip with no head is unverified, and git is not asked', () => {
    const { block, asked } = stampWith({
      phases: [{ name: 'P' }],
      decisions: [skip({ reason: 'empty' })],
      rangeEmpty: () => true,
    });
    expect(asked).toEqual([]);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (empty; unverified)');
  });
  it('a dropped phase is not recomputed', () => {
    const { block, asked } = stampWith({
      phases: [{ name: 'P' }],
      decisions: [skip({ reason: 'dropped' })],
    });
    expect(asked).toEqual([]);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (dropped)');
  });
  it('with no git every empty skip is unverified', () => {
    const state = readSessionReviewState(
      JSON.stringify({
        phases: [{ name: 'P' }],
        decisions: [skip({ reason: 'empty', head: HEAD })],
      })
    );
    const out = assembleStamp(state, { labels: [], skipped: 0 }, (review) => ({
      review,
      unread: { status: 'missing' },
    }));
    const block = renderProvenanceBlock(out.rows, out.notes);
    expect(cellsOf(block, 'phase-0').Gate).toBe('skipped (empty; unverified)');
  });
});

/** bug: a row without a receipt keys its decisions on 1 + the round archives when there are any. */
describe('a row without a receipt keys its decisions on the round its archives say', () => {
  const gate = (round: number) => ({
    ...human,
    state: 'REVIEW',
    phase: 0,
    kind: 'gate',
    codes: ['RECEIPT_MISSING'],
    round,
  });
  it('with one archive the row is round 2: a round 1 override does not apply', () => {
    const { block } = stampWith({
      phases: [{ name: 'P' }],
      dirs: ['phase-0'],
      decisions: [gate(1)],
      read: (review) => ({ review, unread: { status: 'missing' }, round: 2 }),
    });
    const cells = cellsOf(block, 'phase-0');
    expect(cells.Gate).toBe('receipt missing');
    expect(cells.Override).toBe('0 overrides, 0 dismissals, 1 from other rounds');
  });
  it("the round's own override applies", () => {
    const { block } = stampWith({
      phases: [{ name: 'P' }],
      dirs: ['phase-0'],
      decisions: [gate(1), gate(2)],
      read: (review) => ({ review, unread: { status: 'missing' }, round: 2 }),
    });
    const cells = cellsOf(block, 'phase-0');
    expect(cells.Gate).toBe('receipt missing (overridden)');
    expect(cells.Override).toMatch(/^1 override, 0 dismissals, 1 from other rounds: gate/);
  });
  it('with no archives every round applies, as before', () => {
    const { block } = stampWith({
      phases: [{ name: 'P' }],
      dirs: ['phase-0'],
      decisions: [gate(1), gate(2)],
    });
    expect(cellsOf(block, 'phase-0').Override).toMatch(/^2 overrides, 0 dismissals: gate/);
  });
});

/** bug r3: the Blocking cell lists only rounds below the one the gate counts. */
describe('earlier rounds at or above the counted round are not shown', () => {
  it('a receipt claiming round 2 with no archive shows no earlier round', () => {
    const r = validateReviewReceipt(
      receipt({ round: 2, priorRounds: [{ round: 1, head: OTHER, blocking: 4 }] }),
      ctx({ archivedRounds: [] })
    );
    if (!r.checked) throw new Error('did not parse');
    const row = buildProvenanceRow({
      review: 'phase-0',
      result: r as CheckedReceiptResult,
      decisions: [],
      decisionsReadable: true,
    });
    expect(row.round).toBe(1);
    expect(cellsOf(renderProvenanceBlock([row]), 'phase-0').Blocking).toBe('0');
  });
});

/** bug r7: the final review always has a row. */
describe('with the expected reviews unknown, final-all still has a row', () => {
  it('no phase list: a MISSING final row with its count', () => {
    const { rows, block, notes } = stampWith({ phases: null });
    expect(rows.map((r) => r.review)).toEqual(['final-all']);
    expect(cellsOf(block, 'final-all').Gate).toBe('MISSING, +5 commits not reviewed');
    expect(notes.map(noteText)).toContain(
      'expected reviews unknown (autopilot-state.json has no phase list), so a phase review that never ran is not shown'
    );
  });
});

/** bug: only a phase can be dropped. */
describe('a final review cannot be skipped as dropped', () => {
  it.each([
    [finalSkip({ reason: 'dropped' }), false],
    [finalSkip({ reason: 'empty' }), true],
    [skip({ reason: 'dropped' }), true],
  ])('%j -> %s', (record, ok) => {
    expect(ReviewDecisionRecordSchema.safeParse(JSON.parse(JSON.stringify(record))).success).toBe(
      ok
    );
  });
  it('the stamp reads such a record as unreadable', () => {
    const { block } = stampWith({ decisions: [finalSkip({ reason: 'dropped' })] });
    expect(cellsOf(block, 'final-all').Override).toBe('unknown');
  });
});

describe('the grammar accepts every skip form the renderer writes', () => {
  it.each([
    'skipped (empty)',
    'skipped (empty; range not empty)',
    'skipped (empty; unverified), +3 commits not reviewed',
    'skipped (dropped)',
  ])('%s', (gate) => {
    const line = `| phase-0 | - | - | - | - | - | - | ${gate} | - | - | - | - |`;
    expect(parseStampRow(line)?.Gate).toBe(gate);
  });
  it.each([
    'skipped (dropped; unverified)',
    'skipped (empty; maybe)',
    'skipped (empty;unverified)',
  ])('refuses %s', (gate) => {
    expect(parseStampRow(`| phase-0 | - | - | - | - | - | - | ${gate} | - | - | - | - |`)).toBe(
      undefined
    );
  });
});
