import { describe, it, expect } from 'vitest';
import {
  ESCAPED_FROM_STAGES,
  FINDING_CLASSES,
  REVIEW_DECIDERS,
  REVIEW_DECISION_KINDS,
  REVIEW_GATE_FAILURE_CODES,
  REVIEW_SKIP_REASONS,
  type ReadReviewDecision,
  type ReviewDecisionRecord,
  type ReviewGateFailureCode,
  type ReviewReceipt,
} from '@harness-engineering/types';
import {
  STARTING_COMMIT_GAP,
  buildProvenanceRow,
  renderProvenanceBlock,
  type ProvenanceRowInput,
  type StampRow,
  type UnreadReview,
} from '../../src/receipts/provenance';
import type { BlockingReceiptFinding } from '../../src/receipts/schema';
import { parseProvenanceStamp } from '../../src/receipts/stamp-parser';
import {
  PROVENANCE_MARKER as MARKER,
  NO_PIPELINE_REVIEW,
  STAMP_COLUMNS,
  STAMP_LIMITS,
  STAMP_NOTES,
  STAMP_TABLE_HEADER as HEADER,
  STAMP_TABLE_RULE as RULE,
  inert,
  isInert,
  noteText,
  parseStampRow,
  type StampNote,
  type StampNoteId,
} from '../../src/receipts/stamp-grammar';

/** An expected review with no directory: the MISSING row. */
const absent = (review: string) => ({
  review,
  unread: { status: 'absent' as const },
  decisions: [],
  decisionsReadable: true,
});

const NO_REVIEW = `_${NO_PIPELINE_REVIEW}._`;
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
const finding = (id: string): BlockingReceiptFinding => ({
  id,
  file: 'a.ts',
  lineRange: [1, 1],
  severity: 'important',
  title: 't',
  findingClass: 'edge-case',
  escapedFrom: 'plan',
});
interface Over extends Partial<Omit<ProvenanceRowInput, 'result' | 'review'>> {
  receipt?: Partial<ReviewReceipt>;
  findings?: BlockingReceiptFinding[];
  fail?: ReviewGateFailureCode[];
  notLoaded?: string[];
}
const build = (review: string, over: Over = {}) => {
  const { receipt: r, findings = [], fail = [], notLoaded = [], ...rest } = over;
  return buildProvenanceRow({
    review,
    result: {
      checked: true,
      pass: fail.length === 0,
      failures: fail.map((code) => ({ code, message: 'm' })),
      reviewersRun: 4,
      reviewersRequired: 4,
      receipt: receipt(r),
      round: r?.round ?? 1,
      tally: { blocking: findings, advisory: 0 },
      loaded: [],
      notLoaded,
      coverage: { examined: 1, files: 2 },
    },
    decisions: [],
    decisionsReadable: true,
    ...rest,
  });
};
const decision = (over: Partial<ReviewDecisionRecord>): ReviewDecisionRecord => ({
  state: 'REVIEW',
  phase: 0,
  kind: 'findings',
  rationale: 'ship',
  decidedBy: 'human',
  ...over,
});
const cell = (row: StampRow, column: (typeof STAMP_COLUMNS)[number]) => {
  const block = renderProvenanceBlock([row]);
  const line = block.split('\n').filter((l) => l.startsWith('| '))[2];
  const cells = parseStampRow(line ?? '');
  if (cells === undefined) throw new Error(`the parser refused the rendered row: ${line}`);
  return cells[column];
};
const final = (over: Over = {}) =>
  build('final-all', { ...over, receipt: { moment: 'final', ...over.receipt } });

/**
 * Fix 7. Input partition for the Gate cell of the final row: gate {pass, FAIL, FAIL overridden}
 * x commits after the reviewed head {not counted (a phase row), 0, 1, many, unavailable}.
 * The count is appended whatever the gate result, and an unavailable count is never zero.
 */
describe('fix 7: commits the final review did not read are shown on every gate result', () => {
  const override = [decision({ state: 'FINAL_REVIEW', kind: 'gate', codes: ['FINAL_NOT_FULL'] })];
  const states: Array<[string, Over, string]> = [
    ['pass', {}, 'pass at e4f5a6b'],
    ['FAIL', { fail: ['FINAL_NOT_FULL'] }, 'FAIL: FINAL_NOT_FULL'],
    [
      'FAIL overridden',
      { fail: ['FINAL_NOT_FULL'], decisions: override },
      'FAIL: FINAL_NOT_FULL (overridden)',
    ],
  ];
  const counts: Array<[number | 'unavailable' | undefined, string]> = [
    [undefined, ''],
    [0, ''],
    [1, ', +1 commit not reviewed'],
    [2, ', +2 commits not reviewed'],
    [1234, ', +1234 commits not reviewed'],
    ['unavailable', ', +? commits not reviewed (count unavailable)'],
  ];
  const rows = states.flatMap(([name, over, text]) =>
    counts.map(([n, suffix]) => [name, n, over, `${text}${suffix}`] as const)
  );
  it.each(rows)('gate %s, %s commits after -> %s', (_name, n, over, expected) => {
    const row = final({ ...over, ...(n !== undefined && { unreviewedCommits: n }) });
    expect(cell(row, 'Gate')).toBe(expected);
  });
  it('covers eighteen combinations', () => expect(rows).toHaveLength(18));
});

/**
 * Fix 8. Input partition for the failure codes of a Gate cell: one, the bound, one over the
 * bound, every code there is. For each real code: a row failing with exactly that code is
 * accepted by the parser, so the Gate grammar is the failure-code list and nothing else.
 */
describe('fix 8: a Gate cell never cuts a code list mid-token', () => {
  const all = [...REVIEW_GATE_FAILURE_CODES];
  it.each(all)('a row failing with %s round-trips', (code) => {
    expect(cell(build('phase-0', { fail: [code] }), 'Gate')).toBe(`FAIL: ${code}`);
  });
  it.each([
    [1, 0],
    [STAMP_LIMITS.codes, 0],
    [STAMP_LIMITS.codes + 1, 1],
    [all.length, all.length - STAMP_LIMITS.codes],
  ])('%i codes: the first %i-or-fewer whole, then how many more', (n, more) => {
    const gate = cell(build('phase-0', { fail: all.slice(0, n) }), 'Gate');
    const shown = all.slice(0, Math.min(n, STAMP_LIMITS.codes)).join(', ');
    expect(gate).toBe(`FAIL: ${shown}${more > 0 ? `, +${more} more` : ''}`);
  });
  it('a code that is not a failure code is not a Gate cell', () => {
    const line = renderProvenanceBlock([build('phase-0', { fail: ['HEAD_MISMATCH'] })])
      .split('\n')
      .find((l) => l.includes('FAIL:'));
    expect(parseStampRow(line ?? '')).toBeDefined();
    expect(parseStampRow((line ?? '').replace('HEAD_MISMATCH', 'HEAD_MISSMATCH'))).toBeUndefined();
    expect(parseStampRow((line ?? '').replace('HEAD_MISMATCH', 'HEAD_MIS'))).toBeUndefined();
  });
});

/**
 * Fix 8. Input partition for the decisions of an Override cell: none (readable), none
 * (unreadable), one of each kind, a duplicate, many (over the bound), a rationale at the bound
 * and one over it, many finding ids, many codes, and the reviewers' two reproductions (a long
 * first rationale followed by a second decision).
 */
describe('fix 8: the Override cell starts with counts and never loses a decision silently', () => {
  const long = (n: number) => 'x'.repeat(n);
  const override = (decisions: ReviewDecisionRecord[], over: Over = {}) =>
    cell(build('phase-0', { decisions, ...over }), 'Override');
  it('none, readable and unreadable', () => {
    expect(override([])).toBe('none');
    expect(override([], { decisionsReadable: false })).toBe('unknown');
  });
  it.each([
    [
      'gate',
      decision({ kind: 'gate', codes: ['HEAD_MISMATCH'] }),
      '1 override, 0 dismissals: gate (HEAD_MISMATCH) (human): ship',
    ],
    ['findings', decision({}), '1 override, 0 dismissals: findings (human): ship'],
    [
      'dismissed',
      decision({ kind: 'dismissed', findingIds: ['bug-1'] }),
      '0 overrides, 1 dismissal: dismissed bug-1 (human): ship',
    ],
  ])('one %s decision', (_kind, d, expected) => {
    expect(override([d])).toBe(expected);
  });
  it('a duplicate decision is counted twice and shown twice', () => {
    expect(override([decision({}), decision({})])).toBe(
      '2 overrides, 0 dismissals: findings (human): ship; findings (human): ship'
    );
  });
  it.each([STAMP_LIMITS.rationale, STAMP_LIMITS.rationale + 1, 5000])(
    'a rationale of %i characters is whole at the bound and ends with an ellipsis over it',
    (n) => {
      const text = override([decision({ rationale: long(n) })]);
      const shown = text.replace('1 override, 0 dismissals: findings (human): ', '');
      if (n <= STAMP_LIMITS.rationale) expect(shown).toBe(long(n));
      else expect(shown).toBe(`${long(STAMP_LIMITS.rationale)}…`);
    }
  );
  it("a long first rationale does not push the second decision out (the reviewers' reproduction)", () => {
    const text = override([
      decision({ kind: 'dismissed', findingIds: ['a-1', 'b-2'], rationale: long(290) }),
      decision({ rationale: 'human chose to ship with bug-critical-token-leak open' }),
    ]);
    expect(text.startsWith('1 override, 1 dismissal: dismissed a-1, b-2 (human): ')).toBe(true);
    expect(text).toContain(
      '…; findings (human): human chose to ship with bug-critical-token-leak open'
    );
  });
  it('more decisions than the bound: all counted, the first ones written, the rest numbered', () => {
    const many = Array.from({ length: STAMP_LIMITS.decisions + 3 }, (_, i) =>
      decision({ rationale: `r${i}` })
    );
    const text = override(many);
    expect(text.startsWith(`${many.length} overrides, 0 dismissals: findings (human): r0; `)).toBe(
      true
    );
    expect(text.endsWith(`findings (human): r${STAMP_LIMITS.decisions - 1}; +3 more`)).toBe(true);
  });
  it('many finding ids and many codes are listed to the bound, then numbered', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `f-${i}`);
    expect(override([decision({ kind: 'dismissed', findingIds: ids })])).toBe(
      '0 overrides, 1 dismissal: dismissed f-0, f-1, f-2, f-3, +5 more (human): ship'
    );
    const codes = [...REVIEW_GATE_FAILURE_CODES].slice(0, 8);
    expect(override([decision({ kind: 'gate', codes })])).toContain(
      `gate (${codes.slice(0, STAMP_LIMITS.codes).join(', ')}, +2 more) (human): ship`
    );
  });
});

/**
 * Fix 6. Input partition: the receipt's round {absent, 1, 2, 3} x the decision's round
 * {absent, 1, 2}. A decision applies only where the two are the same round (absent is 1); in
 * every disagreeing row it overrides nothing, dismisses nothing, and is counted as another
 * round's. A dismissal applies only to the finding ids it names.
 */
describe('fix 6: a decision applies to the receipt of its own round only', () => {
  const rounds = [undefined, 1, 2, 3];
  const taken = [undefined, 1, 2];
  const rows = rounds.flatMap((r) => taken.map((d) => [r, d, (r ?? 1) === (d ?? 1)] as const));
  it.each(rows)('receipt round %s, decision round %s -> applies: %s', (r, d, applies) => {
    const at = d === undefined ? {} : { round: d };
    const row = build('phase-0', {
      receipt: r === undefined ? {} : { round: r },
      fail: ['REQUIRED_REVIEWER_NOT_RUN'],
      findings: [finding('bug-1'), finding('bug-2')],
      decisions: [
        decision({ kind: 'gate', codes: ['REQUIRED_REVIEWER_NOT_RUN'], ...at }),
        decision({ kind: 'dismissed', findingIds: ['bug-1'], ...at }),
      ],
    });
    expect(row.gate.overridden).toBe(applies);
    expect(row.dismissed).toBe(applies ? 1 : 0);
    expect(row.otherRoundDecisions).toBe(applies ? 0 : 2);
    expect(cell(row, 'Override')).toBe(
      applies
        ? '1 override, 1 dismissal: gate (REQUIRED_REVIEWER_NOT_RUN) (human): ship; dismissed bug-1 (human): ship'
        : '0 overrides, 0 dismissals, 2 from other rounds'
    );
  });
  it('covers twelve combinations, of which seven disagree', () => {
    expect(rows).toHaveLength(12);
    expect(rows.filter(([, , applies]) => !applies)).toHaveLength(7);
  });
  it("round 2 with round-1 decisions and a reused id (the reviewers' reproduction)", () => {
    const row = build('phase-0', {
      receipt: { round: 2, priorRounds: [{ round: 1, head: BASE, blocking: 2 }] },
      fail: ['REQUIRED_REVIEWER_NOT_RUN'],
      findings: [finding('bug-1')],
      decisions: [
        decision({ kind: 'gate', codes: ['REQUIRED_REVIEWER_NOT_RUN'], rationale: 'round 1' }),
        decision({ kind: 'dismissed', findingIds: ['bug-1'], rationale: 'round 1' }),
      ],
    });
    expect(cell(row, 'Gate')).toBe('FAIL: REQUIRED_REVIEWER_NOT_RUN');
    expect(cell(row, 'Blocking')).toBe('1; round 2; round 1: 2 blocking');
  });
  it('a findings override never dismisses, even when it carries finding ids', () => {
    const row = build('phase-0', {
      findings: [finding('bug-1')],
      decisions: [decision({ kind: 'findings', findingIds: ['bug-1'] })],
    });
    expect(row.dismissed).toBe(0);
  });
});

/**
 * Fix 9. Input partition for a review with no reviewed row: no directory, a directory with no
 * receipt, a receipt that is not a receipt, and each unreadable reason the reader can give.
 */
describe('fix 9: a review directory without a readable receipt is a row', () => {
  const unread = (u: UnreadReview): StampRow => ({
    review: 'phase-1',
    unread: u,
    decisions: [],
    decisionsReadable: true,
  });
  it.each<[string, StampRow, string]>([
    ['no directory', absent('phase-1'), 'MISSING'],
    ['no receipt', unread({ status: 'missing' }), 'receipt missing'],
    ['an invalid receipt', unread({ status: 'invalid' }), 'receipt invalid'],
    ...['EACCES', 'EISDIR', 'ELOOP', 'not valid JSON', 'not a regular file', 'too large'].map(
      (reason): [string, StampRow, string] => [
        reason,
        unread({ status: 'unreadable', reason }),
        `receipt unreadable (${reason})`,
      ]
    ),
    [
      'a reason that is not one the reader gives',
      unread({ status: 'unreadable', reason: 'see https://x @y' }),
      'receipt unreadable (UNKNOWN)',
    ],
    ['in another repository', unread({ status: 'outside-repo' }), 'receipt outside repository'],
    ['outside the project', unread({ status: 'outside' }), 'receipt outside project'],
    ['skipped as empty', unread({ status: 'skipped', reason: 'empty' }), 'skipped (empty)'],
    ['dropped', unread({ status: 'skipped', reason: 'dropped' }), 'skipped (dropped)'],
  ])('%s -> Gate cell %s, every other cell a dash', (_name, row, gate) => {
    const block = renderProvenanceBlock([row]);
    const line = block.split('\n').find((l) => l.startsWith('| phase-1 |')) ?? '';
    const cells = parseStampRow(line);
    expect(cells?.Gate).toBe(gate);
    expect(STAMP_COLUMNS.filter((c) => cells?.[c] === '-')).toHaveLength(10);
    expect(parseProvenanceStamp(block)).toMatchObject({ reviewed: 0, dropped: 0 });
    expect(parseProvenanceStamp(block)?.rows).toHaveLength(1);
  });
  it('a final review directory without a receipt is a row too', () => {
    const block = renderProvenanceBlock([
      {
        review: 'final-all',
        unread: { status: 'missing' },
        decisions: [],
        decisionsReadable: true,
      },
    ]);
    expect(block).toContain('| final-all | - | - | - | - | - | - | receipt missing |');
  });
});

/** Fix 10. The gap text: after a previous phase, and from the session's starting commit. */
describe('fix 10: continuity gaps', () => {
  it.each([
    [undefined, 'a1b2c3d..e4f5a6b'],
    ['phase-0', 'a1b2c3d..e4f5a6b (gap: base is not the head phase-0 reviewed)'],
    [STARTING_COMMIT_GAP, 'a1b2c3d..e4f5a6b (gap: base is not the session starting commit)'],
  ])('gap after %s', (gapAfter, expected) => {
    const row = build('phase-1', { ...(gapAfter !== undefined && { gapAfter }) });
    expect(cell(row, 'Diff')).toBe(expected);
  });
});

/**
 * Fix 10. Input partition for free text made inert: each character or sequence GitHub would
 * read as markup, a link, a mention or a reference, and each invisible character.
 */
describe('fix 10: free text is inert', () => {
  it.each([
    ['a bare URL', 'see https://evil.example/login?x=1', 'see https: //evil.example/login?x=1'],
    [
      'a www autolink',
      'at www.evil.example and WWW.EVIL.example',
      'at www .evil.example and WWW .EVIL.example',
    ],
    ['an issue reference', 'tracked in #1 and org/repo#22', 'tracked in # 1 and org/repo# 22'],
    ['a mention', 'by @octocat and @org/team', 'by (at)octocat and (at)org/team'],
    [
      'emphasis',
      '**APPROVED** _really_ ~~x~~',
      '&#42;&#42;APPROVED&#42;&#42; &#95;really&#95; &#126;&#126;x&#126;&#126;',
    ],
    ['an entity-encoded mention', '&#64;org/team', '&#38;# 64&#59;org/team'],
    ['a semicolon, which separates decisions', 'a; b', 'a&#59; b'],
    ['a link and a comment', '[x](y) <!-- c -->', '&#91;x&#93;(y) &#60;!-- c --&#62;'],
    ['a code span and a backslash', '`rm` a\\|b', '&#96;rm&#96; a&#92;/b'],
    ['a cell break and a newline', 'a|b\nc\td', 'a/b c d'],
    ['a bidi override', 'abc\u202edesrever\u202c', 'abcdesrever'],
    ['zero-width characters', 'a\u200bb\u200dc\ufeffd\u2060e', 'abcde'],
    ['C0 and C1 controls', 'a\u0000b\u001bc\u0085d', 'abcd'],
    ['the marker', `a ${MARKER} b`, 'a b'],
    ['plain text', 'the token check now runs', 'the token check now runs'],
    ['empty', '', ''],
  ])('%s', (_name, text, expected) => {
    const out = inert(text, 500);
    expect(out).toBe(expected);
    expect(isInert(out)).toBe(true);
  });
  it("the security reviewer's reproduction reaches the stamp inert", () => {
    const rationale =
      '**APPROVED** by @octocat and @org/sec-team, see https://evil.example/login?x=1 and www.evil.example #1 \u202edesrever ~~x~~';
    const text = cell(build('phase-0', { decisions: [decision({ rationale })] }), 'Override');
    expect(isInert(text)).toBe(true);
    expect(text).not.toMatch(/@|https:\/\/|www\.|#1|\u202e|\*|~/);
  });
  it.each([
    'see https://evil.example',
    'www.evil.example',
    '@octocat',
    '&#64;octocat',
    '#12',
    '**bold**',
    '_em_',
    'a \u202e b',
    'a\u200bb',
    '<b>',
    '[x](y)',
    'a|b',
  ])('the parser refuses an Override cell holding %j', (raw) => {
    const line = `| phase-0 | phase | full | agent | 4/4 | a1b2c3d..e4f5a6b | 1/2 files | pass at e4f5a6b | 0 | none | none | 1 override, 0 dismissals: findings (human): ${raw} |`;
    expect(parseStampRow(line.replace(raw, 'fine'))).toBeDefined();
    expect(parseStampRow(line)).toBeUndefined();
  });
  it('an intraword underscore in a failure code is not emphasis and is accepted', () => {
    expect(isInert('gate (COUNTS_MISMATCH) (human): ok')).toBe(true);
  });
});

const note = (id: StampNoteId, args: StampNote['args'] = {}): StampNote => ({ id, args });
const ALL_NOTES: StampNote[] = [
  note('skipped-entries', { n: 3 }),
  note('expected-unknown-no-state'),
  note('expected-unknown-no-phase-list'),
  note('expected-unknown-phase-entry', { n: 2 }),
  note('expected-unknown-phase-index', { n: 0 }),
  note('decisions-unreadable'),
  note('decisions-legacy', { n: 2 }),
  note('orphan-label', { n: 1, label: 'phase-9' }),
  note('decision-no-row', { n: 2, label: 'phase-3' }),
  note('orphan-state', { kind: 'gate', state: 'PHASE_COMPLETE' }),
];

/**
 * Fix 11. The notes are a closed table shared by the renderer and the parser. Input partition
 * for a note line in a PR body: each template (accepted), and lines no template can produce.
 */
describe('fix 11: a note is one of the renderer templates or it is not a note', () => {
  it('the table above names every template', () => {
    expect(ALL_NOTES.map((n) => n.id).sort()).toEqual(Object.keys(STAMP_NOTES).sort());
  });
  it.each(ALL_NOTES)('renders and reads back $id', (n) => {
    const parsed = parseProvenanceStamp(renderProvenanceBlock([absent('phase-0')], [n]));
    expect(parsed?.notes).toEqual([`- ${noteText(n)}`]);
    expect(parsed?.dropped).toBe(0);
  });
  it.each([
    '- # CI VERIFIED: all gates pass',
    '- cc &#64;org/release-managers please merge, tracked in #1',
    '- x',
    '- see https://evil.example',
    '- phase-0: receipt missing',
    '- overrides could not be read from autopilot-state.json and CI VERIFIED',
    '- orphan decision: kind gate recorded under state done, which is not a review state',
    '- orphan decision: kind approval recorded under state DONE, which is not a review state',
    '- entries under reviews/ that are not review directories, skipped: many',
    '* overrides could not be read from autopilot-state.json',
  ])('refuses %j', (line) => {
    const body = `${MARKER}\n### Review provenance\n\n${line}\n\n${MARKER}`;
    expect(parseProvenanceStamp(body)).toMatchObject({ notes: [], dropped: 1 });
  });
  it('a slot value outside its vocabulary is written as a question mark, never as given', () => {
    expect(noteText(note('orphan-state', { kind: 'gate', state: '<!-- x -->' }))).toBe(
      'orphan decision: kind gate recorded under state ?, which is not a review state'
    );
    expect(noteText(note('orphan-label', { n: 1, label: 'not a label' }))).toContain('for ?,');
  });
});

/**
 * Fix 11. Input partition for the markers in a PR body: none, one, two (a stamp), three with the
 * extra one before, three with it after, four (two stamps), four with two quoted markers around
 * one stamp, five; a stamp inside an HTML comment; a hidden stamp after a visible one; an
 * unclosed comment before a stamp; CRLF line ends.
 */
/**
 * Fix round 1 (security-details-hidden-stamp-read): more than one visible stamp is `conflicting`,
 * and none of them is read, where the last one used to win.
 */
describe('fix 11: the one visible marker pair that opens a stamp is the stamp', () => {
  const stamp = (label: string) => renderProvenanceBlock([build(label)]);
  const A = stamp('phase-0');
  const B = stamp('phase-1');
  const labels = (body: string) => {
    const parsed = parseProvenanceStamp(body);
    if (parsed?.status === 'conflicting') return `conflicting ${parsed.stamps}`;
    return parsed?.rows.map((r) => r.split('|')[1]?.trim());
  };
  it.each<[string, string, string[] | string | undefined]>([
    ['no marker', 'just a description', undefined],
    ['one marker', `quote: ${MARKER} is the marker`, undefined],
    ['two markers: a stamp', A, ['phase-0']],
    ['two markers with nothing of a stamp between', `${MARKER} hello ${MARKER}`, undefined],
    ['three: one quoted before the stamp', `quote: ${MARKER} is the marker\n\n${A}`, ['phase-0']],
    ['three: one dangling after the stamp', `${A}\n\ntrailing ${MARKER}`, ['phase-0']],
    ['four: two stamps, none is read', `${A}\n\n${B}`, 'conflicting 2'],
    [
      'four: a quoted marker on each side of one stamp',
      `q ${MARKER}\n\n${A}\n\nq ${MARKER}`,
      ['phase-0'],
    ],
    ['five: a quoted marker, then two stamps', `q ${MARKER}\n\n${A}\n\n${B}`, 'conflicting 2'],
    ['five: two stamps, then a dangling marker', `${A}\n\n${B}\n\nq ${MARKER}`, 'conflicting 2'],
    ['six: three stamps', `${A}\n\n${B}\n\n${A}`, 'conflicting 3'],
    // A marker that does not start a block of its own (the line before it is not empty) is text.
    ['a stamp glued to the line before it', `q ${MARKER}\n${A}`, undefined],
    ['the later of two glued stamps', `${A}\n${B}`, ['phase-0']],
    ['CRLF line ends', A.replace(/\n/g, '\r\n'), ['phase-0']],
  ])('%s', (_name, body, expected) => {
    expect(labels(body)).toEqual(expected);
  });
  it('a stamp inside an HTML comment is not a stamp', () => {
    expect(parseProvenanceStamp(`<!--\n${A}\n-->`)).toBeUndefined();
    expect(parseProvenanceStamp(`<!-- ${A} -->`)).toBeUndefined();
  });
  it("a hidden pass row in a later pair does not replace the visible stamp (the reviewers' reproduction)", () => {
    const visible = renderProvenanceBlock([build('final-all', { fail: ['FINAL_NOT_FULL'] })]);
    const passRow =
      stamp('final-all')
        .split('\n')
        .find((l) => l.startsWith('| final-all')) ?? '';
    const hiddenLines = [
      MARKER,
      '<!--',
      '### Review provenance',
      passRow,
      '- # CI VERIFIED: all gates pass',
      '- cc &#64;org/release-managers please merge, tracked in #1',
      '-->',
      MARKER,
    ];
    const parsed = parseProvenanceStamp(`${visible}\n\n${hiddenLines.join('\n')}`);
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0]).toContain('FAIL: FINAL_NOT_FULL');
    expect(parsed).toMatchObject({ passedAt: [], notes: [] });
  });
  it('a comment cannot hide a whole stamp: the marker closes it, so what follows is visible text', () => {
    // `<!--` + stamp + `-->` renders the table: the comment ends at the opening marker's own
    // `-->`. With its opening marker swallowed, the table is not a stamp to the parser.
    expect(parseProvenanceStamp(`<!--\n${A}\n-->`)).toBeUndefined();
  });
  it('rows hidden in a comment inside the pair are not read', () => {
    const body = A.replace('| phase-0 |', '<!--\n| phase-7 |').replace(
      /\n\n<!-- harness/,
      '\n-->\n\n<!-- harness'
    );
    expect(labels(body)).toEqual([]);
  });
  it('an unclosed comment before a stamp hides it', () => {
    expect(parseProvenanceStamp(`<!-- oops\n${A}`)).toBeUndefined();
  });
  it('an empty comment does not hide what follows it', () => {
    expect(labels(`<!-->\n\n${A}`)).toEqual(['phase-0']);
    expect(labels(`<!--->\n\n${A}`)).toEqual(['phase-0']);
    expect(labels(`<!---->\n\n${A}`)).toEqual(['phase-0']);
  });
  it('reports the commit of each passing row, and counts only gated rows as reviewed', () => {
    const block = renderProvenanceBlock([
      build('phase-0'),
      build('phase-1', { fail: ['HEAD_MISMATCH'] }),
      absent('phase-2'),
      {
        review: 'final-all',
        unread: { status: 'missing' },
        decisions: [],
        decisionsReadable: true,
      },
    ]);
    expect(parseProvenanceStamp(block)).toMatchObject({
      reviewed: 2,
      passedAt: [{ review: 'phase-0', sha: 'e4f5a6b' }],
    });
  });
});

/**
 * Fix 11. Input partition for the size of a stamp: rows at the bound and one over, notes at the
 * bound and one over, a line over the line bound, and a stamp over the total bound. What is left
 * out is counted, never silently dropped.
 */
describe('fix 11: the parser bounds rows, notes and size, and counts what it leaves out', () => {
  // Rows render as rows only under the table's header and rule; notes follow the table.
  const body = (lines: string[]) =>
    [MARKER, '### Review provenance', '', HEADER, RULE, ...lines, '', MARKER].join('\n');
  const notesBody = (lines: string[]) =>
    [MARKER, '### Review provenance', '', NO_REVIEW, '', ...lines, '', MARKER].join('\n');
  const row = (i: number) =>
    `| phase-${i} | phase | light | agent | 1/1 | a1b2c3d..e4f5a6b | 1/2 files | pass at e4f5a6b | 0 | none | none | none |`;
  const aNote = '- overrides could not be read from autopilot-state.json';
  it.each([
    [STAMP_LIMITS.rows, 0],
    [STAMP_LIMITS.rows + 1, 1],
    [STAMP_LIMITS.rows + 40, 40],
  ])('%i rows: %i omitted', (n, omitted) => {
    const parsed = parseProvenanceStamp(body(Array.from({ length: n }, (_, i) => row(i))));
    expect(parsed).toMatchObject({ omitted, dropped: 0 });
    expect(parsed?.rows).toHaveLength(n - omitted);
  });
  it.each([
    [STAMP_LIMITS.notes, 0],
    [STAMP_LIMITS.notes + 1, 1],
    [3000, 3000 - STAMP_LIMITS.notes],
  ])('%i notes: %i omitted', (n, omitted) => {
    const parsed = parseProvenanceStamp(notesBody(Array.from({ length: n }, () => aNote)));
    expect(parsed).toMatchObject({ omitted, dropped: 0 });
    expect(parsed?.notes).toHaveLength(STAMP_LIMITS.notes > n ? n : STAMP_LIMITS.notes);
  });
  it('round 4: a line over the line bound is omitted (over the size bounds), not dropped', () => {
    const fat = row(0)
      .replace('| none |\n', '')
      .replace(
        /none \|$/,
        `1 override, 0 dismissals: findings (human): ${'x'.repeat(STAMP_LIMITS.line)} |`
      );
    expect(parseProvenanceStamp(body([fat]))).toMatchObject({ rows: [], dropped: 0, omitted: 1 });
  });
  it('rows past the total bound are omitted and counted', () => {
    const decision = `findings (human): ${'x'.repeat(STAMP_LIMITS.rationale)}…`;
    const six = Array.from({ length: STAMP_LIMITS.decisions }, () => decision).join('; ');
    const wide = (i: number) =>
      row(i).replace(/none \|$/, `6 overrides, 0 dismissals: ${six}; +3 more |`);
    const n = STAMP_LIMITS.rows;
    const parsed = parseProvenanceStamp(body(Array.from({ length: n }, (_, i) => wide(i))));
    const kept = parsed?.rows.length ?? 0;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(n);
    expect(parsed).toMatchObject({ dropped: 0, omitted: n - kept });
    expect((parsed?.rows ?? []).join('').length).toBeLessThanOrEqual(STAMP_LIMITS.total);
  });
});

/** A small seeded generator (mulberry32), so a failure reproduces from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fix 8, the property: for any decisions and codes the renderer can receive, every rendered row
 * and note is accepted by the parser, within the line bound, with nothing dropped. 300 seeded
 * cases; free text is drawn from characters chosen to break a table, a link or a mention.
 */
describe('fix 8: whatever the renderer writes, the parser accepts (300 seeded cases)', () => {
  const NASTY = [
    'a',
    'b',
    ' ',
    '  ',
    '|',
    '\n',
    '\t',
    '<',
    '>',
    '&',
    '[',
    ']',
    '(',
    ')',
    '`',
    '*',
    '_',
    '~',
    '\\',
    '@',
    '#',
    '1',
    ':',
    '/',
    '.',
    'www.',
    'https://',
    '&#64;',
    '<!--',
    '-->',
    MARKER,
    '…',
    '\u202e',
    '\u200b',
    '\u0000',
    '\u001b[2K',
    '\r',
    'é',
    '漢',
    '😀',
    '; ',
    ', ',
    '+3 more',
    'FAIL: ',
  ];
  const cases = Array.from({ length: 300 }, (_, i) => i + 1);
  it.each(cases)('seed %i', (seed) => {
    const next = rng(seed);
    const int = (n: number) => Math.floor(next() * n);
    const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)] as T;
    const text = (max: number) => Array.from({ length: int(max) }, () => pick(NASTY)).join('');
    const some = <T>(xs: readonly T[], max: number) =>
      Array.from({ length: int(max + 1) }, () => pick(xs));
    const aDecision = (): ReadReviewDecision => {
      const kind = pick(REVIEW_DECISION_KINDS);
      const base = {
        state: pick(['REVIEW', 'FINAL_REVIEW'] as const),
        rationale: text(400) || 'r',
        decidedBy: pick([...REVIEW_DECIDERS, 'unknown'] as const),
        ...(next() < 0.5 && { round: 1 + int(3) }),
      };
      switch (kind) {
        case 'gate':
          return {
            ...base,
            kind,
            codes: [pick(REVIEW_GATE_FAILURE_CODES), ...some(REVIEW_GATE_FAILURE_CODES, 30)],
          };
        case 'dismissed':
          return {
            ...base,
            kind,
            findingIds: [text(60) || 'f', ...some(['bug-1', text(80) || 'x'], 12)],
          };
        case 'skipped':
          return { ...base, kind, reason: pick(REVIEW_SKIP_REASONS) };
        case 'findings':
          return { ...base, kind };
      }
    };
    const anUnreadRow = (label: string, final: boolean): StampRow => ({
      review: label,
      unread: pick<UnreadReview>([
        { status: 'absent' },
        { status: 'missing' },
        { status: 'invalid' },
        { status: 'outside-repo' },
        { status: 'outside' },
        { status: 'skipped', reason: pick(REVIEW_SKIP_REASONS) },
        { status: 'unreadable', reason: pick(['EACCES', 'not valid JSON', text(20)]) },
      ]),
      decisions: Array.from({ length: int(4) }, aDecision),
      decisionsReadable: next() < 0.8,
      ...(final && next() < 0.7 && { unreviewedCommits: pick([0, 1, 7, 'unavailable'] as const) }),
    });
    const aRow = (i: number): StampRow => {
      const label = i === 0 ? 'final-all' : `phase-${i}`;
      if (int(10) <= 1) return anUnreadRow(label, i === 0);
      const blocking = Array.from({ length: int(5) }, (_, n) => ({
        ...finding(`${text(10)}-${n}`),
        findingClass: pick(FINDING_CLASSES),
        escapedFrom: pick(ESCAPED_FROM_STAGES),
      }));
      return build(label, {
        receipt: {
          moment: i === 0 ? 'final' : 'phase',
          ...(next() < 0.5 && { round: 1 + int(3) }),
          ...(next() < 0.3 && {
            priorRounds: Array.from({ length: int(9) }, (_, n) => ({
              round: n + 1,
              head: BASE,
              blocking: int(40),
            })),
          }),
          ...(next() < 0.2 && { diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' } }),
        },
        fail: some(REVIEW_GATE_FAILURE_CODES, 30),
        findings: blocking,
        notLoaded: some(
          ['security', 'bug', 'a-very-long-reviewer-id-that-goes-on-and-on-and-on', 'x'],
          8
        ),
        decisions: Array.from({ length: int(12) }, aDecision),
        decisionsReadable: next() < 0.8,
        ...(next() < 0.5 && { unreviewedCommits: pick([0, 1, 7, 'unavailable'] as const) }),
        ...(next() < 0.3 && { gapAfter: pick(['phase-0', STARTING_COMMIT_GAP]) }),
      });
    };
    const rows = Array.from({ length: 1 + int(6) }, (_, i) => aRow(i));
    const notes = some(ALL_NOTES, 6);
    const block = renderProvenanceBlock(rows, notes);
    const parsed = parseProvenanceStamp(`intro\n\n${block}\n\ntrailer`);
    const refused = block
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| Review') && !l.startsWith('| ---'))
      .filter((l) => parseStampRow(l) === undefined);
    expect(refused).toEqual([]);
    expect(parsed?.dropped).toBe(0);
    expect(parsed?.omitted).toBe(0);
    expect(parsed?.rows).toHaveLength(rows.length);
    expect(parsed?.notes).toEqual(notes.map((n) => `- ${noteText(n)}`));
    for (const line of block.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(STAMP_LIMITS.line);
      // No raw markup or invisible character anywhere outside the two marker lines.
      if (line !== MARKER)
        expect(line).not.toMatch(/[<>[\]`@\u0000-\u001f\u202a-\u202e\u200b-\u200f]/);
    }
    expect(block.split(MARKER)).toHaveLength(3);
  });
});
