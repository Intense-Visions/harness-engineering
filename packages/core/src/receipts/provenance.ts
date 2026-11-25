import type {
  EscapedFrom,
  FindingClass,
  ReviewDecisionRecord,
  ReviewGateFailureCode,
  ReviewPriorRound,
  ReviewReceipt,
} from '@harness-engineering/types';
import type { CheckedReceiptResult } from './review-gate';
import type { SessionReviewState } from './decisions';
import {
  MISSING_REVIEW,
  SESSION_REVIEW_LABEL,
  UNREAD_REASON,
  compareReviewLabels,
  countsText,
  NO_PIPELINE_REVIEW,
  PROVENANCE_MARKER,
  STAMP_COLUMNS,
  STAMP_HEADING,
  STAMP_LIMITS,
  STAMP_TABLE_HEADER,
  STAMP_TABLE_RULE,
  inert,
  listed,
  noteText,
  parseProvenanceStamp,
  plural,
  type ParsedProvenanceStamp,
  type StampCells,
  type StampNote,
} from './stamp-grammar';

export { NO_PIPELINE_REVIEW, PROVENANCE_MARKER, parseProvenanceStamp };
export type { ParsedProvenanceStamp, StampNote };

/** `gapAfter` of a first phase whose base is not the session's starting commit. */
export const STARTING_COMMIT_GAP = 'starting-commit';

/** One reviewed row of the stamp. */
export interface ProvenanceRow {
  /** The review's label: `phase-0`, `final-all`. */
  review: string;
  receipt: ReviewReceipt;
  /** Required reviewers whose findings file loaded, of those the receipt requires. */
  reviewersRun: number;
  reviewersRequired: number;
  /**
   * Reviewers marked ran whose findings file did not load (absent, unreadable, or read and
   * rejected). Their findings are unknown.
   */
  notLoaded: string[];
  coverage?: { examined: number; files: number };
  gate: {
    pass: boolean;
    /** Distinct failure codes, in the order the gate raised them. Empty on a pass. */
    codes: ReviewGateFailureCode[];
    /** True when the gate failed and every code it failed with was overridden by the human. */
    overridden: boolean;
  };
  /**
   * Commits on HEAD after the reviewed head. Set for the final review only, whatever its gate
   * result; `unavailable` when git could not count them, which is never the same as zero.
   */
  unreviewedCommits?: number | 'unavailable';
  /** The previous phase's label, or STARTING_COMMIT_GAP, when this phase's base is not continuous with it. */
  gapAfter?: string;
  /** Blocking findings, recounted from the reviewer findings files that loaded. */
  blocking: number;
  /** How many of them a `dismissed` decision of this round names. */
  dismissed: number;
  /** Of those, how many no human or audit agreed to (`unaudited`), and how many by `unknown`. */
  dismissedUnaudited: number;
  dismissedUnknown: number;
  byClass: Partial<Record<FindingClass, number>>;
  byStage: Partial<Record<EscapedFrom, number>>;
  /** The review decisions recorded for this round of the review, in the order they were taken. */
  decisions: ReviewDecisionRecord[];
  /** Decisions recorded for the review in another round. They apply to nothing on this row. */
  otherRoundDecisions: number;
  /** False when the session's decisions could not be read: an empty list is then not "none". */
  decisionsReadable: boolean;
}

/** A review directory whose receipt could not be read: a row, never only a note. */
export interface UnreadReviewRow {
  review: string;
  /** `absent`: an expected review with no directory (the MISSING row). */
  unread: { status: 'absent' | 'missing' | 'invalid' } | { status: 'unreadable'; reason: string };
  /** Every decision recorded for the review (no receipt says which round it is). */
  decisions?: ReviewDecisionRecord[];
  decisionsReadable?: boolean;
}

/** The gate failure a review without a readable receipt fails with, which an override may name. */
const UNREAD_CODE: Record<UnreadReviewRow['unread']['status'], ReviewGateFailureCode> = {
  absent: 'RECEIPT_MISSING',
  missing: 'RECEIPT_MISSING',
  invalid: 'RECEIPT_INVALID',
  unreadable: 'RECEIPT_INVALID',
};

/** A stamp row: a reviewed review, one whose receipt is unread, or (a string) one with no directory. */
export type StampRow = ProvenanceRow | UnreadReviewRow | string;

type BlockingFinding = CheckedReceiptResult['tally']['blocking'][number];

function tally<K extends 'findingClass' | 'escapedFrom'>(
  findings: readonly BlockingFinding[],
  key: K
): Partial<Record<BlockingFinding[K], number>> {
  const out: Partial<Record<BlockingFinding[K], number>> = {};
  for (const f of findings) out[f[key]] = (out[f[key]] ?? 0) + 1;
  return out;
}

export interface ProvenanceRowInput {
  review: string;
  /** The gate's result for a receipt that parsed. */
  result: CheckedReceiptResult;
  /** Every decision recorded for the review, of any round. */
  decisions: readonly ReviewDecisionRecord[];
  decisionsReadable: boolean;
  unreviewedCommits?: number | 'unavailable';
  gapAfter?: string;
}

/** The gate result as the row shows it. An override covers the failures it names, never one raised since. */
function gateOf(
  result: CheckedReceiptResult,
  decisions: readonly ReviewDecisionRecord[]
): ProvenanceRow['gate'] {
  const codes = [...new Set(result.failures.map((f) => f.code))];
  const overridden = new Set<ReviewGateFailureCode>(
    decisions.filter((d) => d.kind === 'gate').flatMap((d) => d.codes ?? [])
  );
  const all = codes.length > 0 && codes.every((c) => overridden.has(c));
  return { pass: result.pass, codes, overridden: all };
}

type OptionalFields = Pick<ProvenanceRow, 'coverage' | 'unreviewedCommits' | 'gapAfter'>;

function optionalFields(input: ProvenanceRowInput): OptionalFields {
  const out: OptionalFields = {};
  if (input.result.coverage !== undefined) out.coverage = input.result.coverage;
  if (input.unreviewedCommits !== undefined) out.unreviewedCommits = input.unreviewedCommits;
  if (input.gapAfter !== undefined) out.gapAfter = input.gapAfter;
  return out;
}

/** Each dismissed finding id with who dismissed it (the first dismissal that names it). */
function dismissalsById(decisions: readonly ReviewDecisionRecord[]) {
  const out = new Map<string, ReviewDecisionRecord['decidedBy']>();
  for (const d of decisions.filter((x) => x.kind === 'dismissed')) {
    for (const id of d.findingIds ?? []) if (!out.has(id)) out.set(id, d.decidedBy);
  }
  return out;
}

/**
 * A decision is matched to a review by label and round: an override or a dismissal applies only
 * to the receipt of the round it was taken in, and a dismissal only to the finding ids it names.
 */
export function buildProvenanceRow(input: ProvenanceRowInput): ProvenanceRow {
  const { result } = input;
  const round = result.receipt.round ?? 1;
  const decisions = input.decisions.filter((d) => (d.round ?? 1) === round);
  const dismissed = dismissalsById(decisions);
  const blocking = result.tally.blocking;
  const decider = (f: { id: string }) => dismissed.get(f.id);
  return {
    review: input.review,
    receipt: result.receipt,
    reviewersRun: result.reviewersRun,
    reviewersRequired: result.reviewersRequired,
    notLoaded: result.notLoaded,
    gate: gateOf(result, decisions),
    ...optionalFields(input),
    blocking: blocking.length,
    dismissed: blocking.filter((f) => dismissed.has(f.id)).length,
    dismissedUnaudited: blocking.filter((f) => decider(f) === 'unaudited').length,
    dismissedUnknown: blocking.filter((f) => decider(f) === 'unknown').length,
    byClass: tally(blocking, 'findingClass'),
    byStage: tally(blocking, 'escapedFrom'),
    decisions,
    otherRoundDecisions: input.decisions.length - decisions.length,
    decisionsReadable: input.decisionsReadable,
  };
}

/** What the stamp reads of a session's state: `readSessionReviewState`'s answer, read once. */
export type StampSessionState = Pick<
  SessionReviewState,
  'decisionsReadable' | 'decisions' | 'expected' | 'expectedUnknown' | 'orphans' | 'startingCommit'
> &
  Partial<Pick<SessionReviewState, 'legacyDecisions'>>;

/** What a review directory gave: its gated receipt, or why it could not be read. */
export type ReviewDirRead =
  | { review: string; unread: UnreadReviewRow['unread'] }
  | { review: string; result: CheckedReceiptResult; unreviewedCommits?: number | 'unavailable' };

/** The last phase row that was reviewed: what the next phase must be continuous with. */
type Previous = { review: string; head: string } | undefined;

/**
 * A phase's continuity: its base against the head of the nearest earlier REVIEWED phase (carried
 * across MISSING and unread rows), or the session's starting commit when no earlier phase was
 * reviewed. Returns the label it is not continuous with, STARTING_COMMIT_GAP, or undefined.
 */
function gapOf(base: string, previous: Previous, startingCommit: string | undefined) {
  if (previous !== undefined) return previous.head === base ? undefined : previous.review;
  return startingCommit !== undefined && startingCommit !== base ? STARTING_COMMIT_GAP : undefined;
}

/** The note that says why the expected reviews are unknown. */
function expectedNote(why: NonNullable<StampSessionState['expectedUnknown']>): StampNote {
  switch (why.reason) {
    case 'no-state':
      return { id: 'expected-unknown-no-state' };
    case 'no-phase-list':
      return { id: 'expected-unknown-no-phase-list' };
    case 'phase-entry':
      return { id: 'expected-unknown-phase-entry', args: { n: why.position } };
    case 'phase-index':
      return { id: 'expected-unknown-phase-index', args: { n: why.position } };
  }
}

/** What the table cannot show as a row, each as one line under it. */
function stampNotes(state: StampSessionState, skipped: number, shown: string[]): StampNote[] {
  const notes: StampNote[] = [];
  if (skipped > 0) notes.push({ id: 'skipped-entries', args: { n: skipped } });
  if (state.expectedUnknown !== undefined) notes.push(expectedNote(state.expectedUnknown));
  if (!state.decisionsReadable) notes.push({ id: 'decisions-unreadable' });
  const legacy = state.legacyDecisions ?? 0;
  if (legacy > 0) notes.push({ id: 'decisions-legacy', args: { n: legacy } });
  // A decision that applies to no row is said, never dropped.
  for (const [label, records] of state.decisions) {
    if (!shown.includes(label))
      notes.push({ id: 'orphan-label', args: { n: records.length, label } });
  }
  for (const o of state.orphans) notes.push({ id: 'orphan-state', args: { ...o } });
  return notes;
}

/**
 * A session's stamp rows and notes: a row for every expected review and every review directory
 * (phases in order, then final-all), MISSING for an expected review with no directory. `dirs`
 * lists the directories under `reviews/` by name (`labels`) and counts the other entries
 * (`skipped`); a directory whose name is not a review label (SESSION_REVIEW_LABEL) is skipped
 * too. `read` gates one review directory; everything else (decisions, continuity, notes) is
 * decided here.
 */
export function assembleStamp(
  state: StampSessionState,
  listed: { labels: readonly string[]; skipped: number },
  read: (label: string) => ReviewDirRead
): { rows: StampRow[]; notes: StampNote[] } {
  const labels = listed.labels.filter((l) => SESSION_REVIEW_LABEL.test(l));
  const dirs = { labels, skipped: listed.skipped + listed.labels.length - labels.length };
  const all = [...new Set([...(state.expected ?? []), ...dirs.labels])].sort(compareReviewLabels);
  const rows: StampRow[] = [];
  let previous: Previous;
  for (const label of all) {
    const decided = {
      decisions: state.decisions.get(label) ?? [],
      decisionsReadable: state.decisionsReadable,
    };
    const got: ReviewDirRead = dirs.labels.includes(label)
      ? read(label)
      : { review: label, unread: { status: 'absent' } };
    if ('unread' in got) {
      rows.push({ review: label, unread: got.unread, ...decided });
      continue;
    }
    const { base, head } = got.result.receipt.diff;
    const phase = got.result.receipt.moment === 'phase';
    const gapAfter = phase ? gapOf(base, previous, state.startingCommit) : undefined;
    if (phase) previous = { review: label, head };
    rows.push(
      buildProvenanceRow({
        review: label,
        result: got.result,
        decisions: state.decisions.get(label) ?? [],
        decisionsReadable: state.decisionsReadable,
        ...(got.unreviewedCommits !== undefined && { unreviewedCommits: got.unreviewedCommits }),
        ...(gapAfter !== undefined && { gapAfter }),
      })
    );
  }
  return { rows, notes: stampNotes(state, dirs.skipped, all) };
}

function diffCell(r: ProvenanceRow): string {
  const { base, head, baseSource } = r.receipt.diff;
  const source = baseSource === 'starting-commit' ? ' (base: starting-commit)' : '';
  const after =
    r.gapAfter === STARTING_COMMIT_GAP
      ? 'the session starting commit'
      : `the head ${r.gapAfter} reviewed`;
  const gap = r.gapAfter === undefined ? '' : ` (gap: base is not ${after})`;
  return `${base.slice(0, 7)}..${head.slice(0, 7)}${source}${gap}`;
}

/** Commits the final review did not read. Appended whether the gate passed, failed or was overridden. */
function unreviewedText(later: ProvenanceRow['unreviewedCommits']): string {
  if (later === 'unavailable') return ', +? commits not reviewed (count unavailable)';
  if (later === undefined || later <= 0) return '';
  return `, +${plural(later, 'commit')} not reviewed`;
}

/** `pass at <sha>`: the gate held at the reviewed commit. A failure lists its codes. */
function gateCell(r: ProvenanceRow): string {
  const state = r.gate.pass
    ? `pass at ${r.receipt.diff.head.slice(0, 7)}`
    : `FAIL: ${listed(r.gate.codes, STAMP_LIMITS.codes)}${r.gate.overridden ? ' (overridden)' : ''}`;
  return `${state}${unreviewedText(r.unreviewedCommits)}`;
}

/** The round, when it is not the first, and what the earlier rounds found. */
function roundsText(receipt: ReviewReceipt): string[] {
  const prior: readonly ReviewPriorRound[] = receipt.priorRounds ?? [];
  const round = receipt.round ?? 1;
  const shown = prior.slice(0, STAMP_LIMITS.items);
  const parts = shown.map((p) => `round ${p.round}: ${p.blocking} blocking`);
  if (round > 1 || prior.length > 0) parts.unshift(`round ${round}`);
  if (prior.length > shown.length)
    parts.push(`+${plural(prior.length - shown.length, 'more round')}`);
  return parts;
}

/** Free-text ids as a bounded list of inert items. */
const idList = (ids: readonly string[]): string =>
  listed(
    ids.map((id) => inert(id, STAMP_LIMITS.id) || '?'),
    STAMP_LIMITS.items
  );

/** A count is a floor when a reviewer's file could not be read: never print it as exact. */
function blockingCell(r: ProvenanceRow): string {
  const count = r.notLoaded.length === 0 ? String(r.blocking) : `at least ${r.blocking}`;
  const flags = [
    `${r.dismissed} dismissed`,
    ...(r.dismissedUnaudited > 0 ? [`${r.dismissedUnaudited} unaudited`] : []),
    ...(r.dismissedUnknown > 0 ? [`${r.dismissedUnknown} decider unknown`] : []),
  ];
  const parts = [r.dismissed > 0 ? `${count} (${flags.join(', ')})` : count];
  if (r.notLoaded.length > 0) parts.push(`not loaded: ${idList(r.notLoaded)}`);
  return [...parts, ...roundsText(r.receipt)].join('; ');
}

/** Who took a decision, as the Override cell writes it. */
const deciderText = (who: ReviewDecisionRecord['decidedBy']): string =>
  `(${who === 'unknown' ? 'decider unknown' : who})`;

function decisionText(d: ReviewDecisionRecord): string {
  const why = inert(d.rationale, STAMP_LIMITS.rationale) || '?';
  const by = deciderText(d.decidedBy);
  switch (d.kind) {
    case 'gate':
      return `gate (${listed(d.codes ?? [], STAMP_LIMITS.codes)}) ${by}: ${why}`;
    case 'findings':
      return `findings ${by}: ${why}`;
    case 'dismissed':
      return `dismissed ${idList(d.findingIds ?? [])} ${by}: ${why}`;
  }
}

/**
 * The counts come first and are never cut; then each decision, a long rationale ending in `…`,
 * and `+N more` when there are more decisions than are written out.
 */
function overrideCell(r: ProvenanceRow): string {
  return overrideText(r.decisions, r.otherRoundDecisions, r.decisionsReadable);
}

function overrideText(
  decisions: readonly ReviewDecisionRecord[],
  otherRounds: number,
  readable: boolean
): string {
  if (decisions.length + otherRounds === 0) return readable ? 'none' : 'unknown';
  const dismissals = decisions.filter((d) => d.kind === 'dismissed').length;
  const counts = [
    plural(decisions.length - dismissals, 'override'),
    plural(dismissals, 'dismissal'),
    ...(otherRounds > 0 ? [`${otherRounds} from other rounds`] : []),
  ].join(', ');
  if (decisions.length === 0) return counts;
  const shown = decisions.slice(0, STAMP_LIMITS.decisions).map(decisionText);
  const more = decisions.length - shown.length;
  return `${counts}: ${[...shown, ...(more > 0 ? [`+${more} more`] : [])].join('; ')}`;
}

function unreadGate(unread: UnreadReviewRow['unread']): string {
  if (unread.status === 'absent') return MISSING_REVIEW;
  if (unread.status !== 'unreadable') return `receipt ${unread.status}`;
  const known = new RegExp(`^${UNREAD_REASON}$`).test(unread.reason);
  return `receipt unreadable (${known ? unread.reason : 'UNKNOWN'})`;
}

/** The Gate cell of a row without a receipt: `(overridden)` when a gate decision names its code. */
function unreadGateCell(r: UnreadReviewRow, decisions: readonly ReviewDecisionRecord[]): string {
  const code = UNREAD_CODE[r.unread.status];
  const overridden = decisions.some((d) => d.kind === 'gate' && d.codes?.includes(code) === true);
  return `${unreadGate(r.unread)}${overridden ? ' (overridden)' : ''}`;
}

/**
 * A row without a receipt. Its Override cell is `-` only when the decisions were read and none
 * names the review; when they could not be read it is `unknown`, never a claim that there are
 * none.
 */
function unreadCells(r: UnreadReviewRow): StampCells {
  const decisions = r.decisions ?? [];
  const readable = r.decisionsReadable !== false;
  const cells = blank(r.review, unreadGateCell(r, decisions));
  if (decisions.length === 0 && readable) return cells;
  return { ...cells, Override: overrideText(decisions, 0, readable) };
}

const blank = (review: string, gate: string): StampCells => ({
  Review: review,
  Moment: '-',
  Tier: '-',
  Backend: '-',
  Reviewers: '-',
  Diff: '-',
  Coverage: '-',
  Gate: gate,
  Blocking: '-',
  'By class': '-',
  'Escaped from': '-',
  Override: '-',
});

function cellsOf(r: StampRow): StampCells {
  if (typeof r === 'string') return blank(r, MISSING_REVIEW);
  if ('unread' in r) return unreadCells(r);
  return {
    Review: r.review,
    Moment: r.receipt.moment,
    Tier: r.receipt.tier,
    Backend: r.receipt.backend,
    Reviewers: `${r.reviewersRun}/${r.reviewersRequired}`,
    Diff: diffCell(r),
    Coverage:
      r.coverage === undefined ? 'unknown' : `${r.coverage.examined}/${r.coverage.files} files`,
    Gate: gateCell(r),
    Blocking: blockingCell(r),
    'By class': countsText(r.byClass),
    'Escaped from': countsText(r.byStage),
    Override: overrideCell(r),
  };
}

function rowLine(r: StampRow): string {
  const cells = cellsOf(r);
  return `| ${STAMP_COLUMNS.map((column) => cells[column]).join(' | ')} |`;
}

/**
 * The Markdown stamp, delimited by PROVENANCE_MARKER: one table row per review, in the order
 * given, and `notes` as a list under the table. Free text (a rationale, a finding id) is made
 * inert and bounded with a visible `…`; every other cell is fixed vocabulary; a note is one of
 * the templates in stamp-grammar.ts. Nothing is cut without a mark.
 */
export function renderProvenanceBlock(
  rows: readonly StampRow[],
  notes: readonly StampNote[] = []
): string {
  const lines = [PROVENANCE_MARKER, STAMP_HEADING, ''];
  if (rows.length === 0) lines.push(`_${NO_PIPELINE_REVIEW}._`);
  else lines.push(STAMP_TABLE_HEADER, STAMP_TABLE_RULE, ...rows.map(rowLine));
  if (notes.length > 0) lines.push('', ...notes.map((n) => `- ${noteText(n)}`));
  lines.push('', PROVENANCE_MARKER);
  return lines.join('\n');
}
