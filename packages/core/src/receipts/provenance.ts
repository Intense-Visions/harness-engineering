import type {
  EscapedFrom,
  FindingClass,
  ReadReviewDecision,
  ReviewGateFailureCode,
  ReviewPriorRound,
  ReviewReceipt,
  ReviewSkipReason,
} from '@harness-engineering/types';
import type { CheckedReceiptResult } from './review-gate';
import type { SessionReviewState } from './decisions';
import {
  FINAL_REVIEW_LABEL,
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
  plural,
  type StampCells,
  type StampNote,
} from './stamp-grammar';

/** `gapAfter` of a first phase whose base is not the session's starting commit. */
export const STARTING_COMMIT_GAP = 'starting-commit';

/** Commits HEAD holds after a commit; `unavailable` when git could not count them, never zero. */
export type UnreviewedCommits = number | 'unavailable';

/** One reviewed row of the stamp. */
export interface ProvenanceRow {
  /** The review's label: `phase-0`, `final-all`. */
  review: string;
  receipt: ReviewReceipt;
  /**
   * The round as the gate counts it (1 + the `round-R/` archives), which selects the row's
   * decisions; the receipt's own `round` is a claim the gate checks.
   */
  round: number;
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
   * result.
   */
  unreviewedCommits?: UnreviewedCommits;
  /**
   * A phase whose base is not the one the gate demands of it: the earlier phase whose head it
   * should start at, or STARTING_COMMIT_GAP.
   */
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
  decisions: ReadReviewDecision[];
  /** Decisions recorded for the review in another round. They apply to nothing on this row. */
  otherRoundDecisions: number;
  /**
   * False when any review decision of the session could not be read: the row's decisions may then
   * be incomplete, and none is never "none".
   */
  decisionsReadable: boolean;
}

/** Why a review has no receipt that was read. */
export type UnreadReview =
  /** An expected review with no directory (the MISSING row). */
  | { status: 'absent' }
  /** A directory with no receipt.json. */
  | { status: 'missing' }
  /** JSON that is not a receipt. */
  | { status: 'invalid' }
  | { status: 'unreadable'; reason: string }
  /** The receipt is in another git repository than the one the stamp runs in. */
  | { status: 'outside-repo' }
  /** The receipt path leaves the project. */
  | { status: 'outside' }
  /**
   * No receipt, and a `skipped` decision says why the review was not run. For an `empty` skip,
   * `check` says what the stamp found when it recomputed the range at the head the skip names:
   * `empty` (it is), `not-empty` (it is not), `unverified` (no head, or git could not say).
   */
  | { status: 'skipped'; reason: ReviewSkipReason; check?: SkipCheck };

/** What recomputing an `empty` skip's range found. */
export type SkipCheck = 'empty' | 'not-empty' | 'unverified';

/** A review without a receipt that was read: a row, never only a note. */
export interface UnreadReviewRow {
  review: string;
  unread: UnreadReview;
  /**
   * The decisions recorded for the review: of the round `round` names when it is set (its
   * directory holds `round-R/` archives), else every one (nothing says which round it is).
   */
  decisions: ReadReviewDecision[];
  /** 1 + the `round-R/` archives in the review's directory, set only when there are any. */
  round?: number;
  /** Decisions recorded for the review in another round than `round`. */
  otherRoundDecisions?: number;
  decisionsReadable: boolean;
  /** The final review: commits on HEAD after the last commit it can be said to cover. */
  unreviewedCommits?: UnreviewedCommits;
}

/** The gate failure a review without a readable receipt fails with, which an override may name. */
function unreadCode(unread: UnreadReview): ReviewGateFailureCode | undefined {
  switch (unread.status) {
    case 'absent':
    case 'missing':
      return 'RECEIPT_MISSING';
    case 'invalid':
    case 'unreadable':
      return 'RECEIPT_INVALID';
    case 'outside-repo':
      return 'RECEIPT_OUTSIDE_REPO';
    case 'outside':
      return 'GATE_ERROR';
    case 'skipped':
      return undefined;
  }
}

/** A stamp row: a reviewed review, or one without a receipt that was read. */
export type StampRow = ProvenanceRow | UnreadReviewRow;

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
  decisions: readonly ReadReviewDecision[];
  decisionsReadable: boolean;
  unreviewedCommits?: UnreviewedCommits;
  gapAfter?: string;
}

/** The gate result as the row shows it. An override covers the failures it names, never one raised since. */
function gateOf(
  result: CheckedReceiptResult,
  decisions: readonly ReadReviewDecision[]
): ProvenanceRow['gate'] {
  const codes = [...new Set(result.failures.map((f) => f.code))];
  const overridden = new Set<ReviewGateFailureCode>(
    decisions.flatMap((d) => (d.kind === 'gate' ? d.codes : []))
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
function dismissalsById(decisions: readonly ReadReviewDecision[]) {
  const out = new Map<string, ReadReviewDecision['decidedBy']>();
  for (const d of decisions) {
    if (d.kind !== 'dismissed') continue;
    for (const id of d.findingIds) if (!out.has(id)) out.set(id, d.decidedBy);
  }
  return out;
}

/**
 * A decision is matched to a review by label and round: an override or a dismissal applies only
 * to the receipt of the round it was taken in, and a dismissal only to the finding ids it names.
 * The round is the gate's count (1 + the `round-R/` archives), never the receipt's claim, so a
 * receipt that misstates its round never picks up another round's decisions.
 */
export function buildProvenanceRow(input: ProvenanceRowInput): ProvenanceRow {
  const { result } = input;
  const { round } = result;
  const decisions = input.decisions.filter((d) => (d.round ?? 1) === round);
  const dismissed = dismissalsById(decisions);
  const blocking = result.tally.blocking;
  const decider = (f: { id: string }) => dismissed.get(f.id);
  return {
    review: input.review,
    receipt: result.receipt,
    round,
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

/**
 * What a review directory gave: its gated receipt, or why it could not be read and, when the
 * directory holds `round-R/` archives, the round the gate would count (1 + the archives).
 */
export type ReviewDirRead =
  | {
      review: string;
      unread: Exclude<UnreadReview, { status: 'absent' | 'skipped' }>;
      round?: number;
    }
  | { review: string; result: CheckedReceiptResult };

/** Count the commits on HEAD after `from` (a full sha). */
export type CommitsAfter = (from: string) => UnreviewedCommits;

/** What the stamp asks git, through the caller. Absent: nothing is counted or recomputed. */
export interface StampGit {
  commitsAfter: CommitsAfter;
  /**
   * The base the final gate would demand at HEAD (`finalReviewBase`: the merge base with the
   * default branch, else the session's starting commit). undefined: none resolves, and a final
   * row without a receipt says its count is unavailable.
   */
  finalBase: string | undefined;
  /**
   * Whether a review's range at `head` lists no file: for `phase-N` from the phase base the gate
   * would demand at that head, for `final-all` from the final base at that head. undefined: it
   * could not be computed.
   */
  rangeEmpty?: (review: string, head: string) => boolean | undefined;
}

/**
 * A phase's continuity, by the gate's own rule (`phaseReviewBase`, which passes over an earlier
 * receipt that is not a usable phase receipt or whose head left the branch): the label of the
 * earlier phase whose head the base should be, STARTING_COMMIT_GAP, or undefined when the base is
 * the one the gate demands or none could be named (the gate then fails PHASE_BASE_UNKNOWN).
 */
function gapOf(result: CheckedReceiptResult): string | undefined {
  const demanded = result.phaseBase;
  if (demanded?.status !== 'resolved' || demanded.base === result.receipt.diff.base)
    return undefined;
  return demanded.source === 'previous-phase' ? `phase-${demanded.phase}` : STARTING_COMMIT_GAP;
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
  return [...notes, ...unshownDecisionNotes(state, shown)];
}

/**
 * A decision that applies to no row is said, never dropped. With the expected reviews unknown,
 * the stamp cannot say the review is not one of the session's.
 */
function unshownDecisionNotes(state: StampSessionState, shown: string[]): StampNote[] {
  const id = state.expectedUnknown === undefined ? 'orphan-label' : 'decision-no-row';
  const notes: StampNote[] = [];
  for (const [label, records] of state.decisions) {
    if (!shown.includes(label)) notes.push({ id, args: { n: records.length, label } });
  }
  for (const o of state.orphans) notes.push({ id: 'orphan-state', args: { ...o } });
  return notes;
}

/** The last `skipped` decision recorded for a review. */
function skipOf(decisions: readonly ReadReviewDecision[]) {
  const skips = decisions.filter((d) => d.kind === 'skipped');
  return skips[skips.length - 1];
}

type Skip = Extract<ReadReviewDecision, { kind: 'skipped' }>;

/** An `empty` skip's range recomputed at the head it names; `dropped` is not checked. */
function skipShown(skip: Skip, label: string, git: StampGit | undefined): UnreadReview {
  if (skip.reason !== 'empty') return { status: 'skipped', reason: skip.reason };
  const empty = skip.head === undefined ? undefined : git?.rangeEmpty?.(label, skip.head);
  const check: SkipCheck = empty === undefined ? 'unverified' : empty ? 'empty' : 'not-empty';
  return { status: 'skipped', reason: 'empty', check };
}

/** A review's decisions split by round, when its directory says which round it is. */
function byRound(
  decided: Pick<UnreadReviewRow, 'decisions' | 'decisionsReadable'>,
  round: number | undefined
): Pick<UnreadReviewRow, 'decisions' | 'decisionsReadable' | 'round' | 'otherRoundDecisions'> {
  if (round === undefined) return decided;
  const decisions = decided.decisions.filter((d) => (d.round ?? 1) === round);
  const otherRoundDecisions = decided.decisions.length - decisions.length;
  return { ...decided, decisions, round, otherRoundDecisions };
}

/**
 * A row without a read receipt. A review with no receipt (no directory, or no receipt.json) that a
 * `skipped` decision covers is `skipped`. The final review's row counts the commits after the
 * last commit it can be said to cover: the head its skip names when the Gate cell shows the skip
 * and its range there was recomputed as empty, else the base the final gate would demand at HEAD
 * (`StampGit.finalBase`), else the count is unavailable.
 */
function unreadRow(
  label: string,
  got: { unread: Exclude<UnreadReview, { status: 'skipped' }>; round?: number | undefined },
  decided: Pick<UnreadReviewRow, 'decisions' | 'decisionsReadable'>,
  git: StampGit | undefined
): UnreadReviewRow {
  const { unread } = got;
  const ofRound = byRound(decided, got.round);
  const skip = skipOf(ofRound.decisions);
  const noReceipt = unread.status === 'absent' || unread.status === 'missing';
  const shown: UnreadReview =
    noReceipt && skip?.kind === 'skipped' ? skipShown(skip, label, git) : unread;
  const row: UnreadReviewRow = { review: label, unread: shown, ...ofRound };
  if (label !== FINAL_REVIEW_LABEL || git === undefined) return row;
  const verified = shown.status === 'skipped' && shown.check === 'empty';
  const from = verified && skip?.kind === 'skipped' ? skip.head : git.finalBase;
  return { ...row, unreviewedCommits: from === undefined ? 'unavailable' : git.commitsAfter(from) };
}

/**
 * A session's stamp rows and notes: a row for every expected review and every review directory
 * (phases in order, then final-all), MISSING for an expected review with no directory, `skipped`
 * for one a `skipped` decision covers. Every session calls for a final review, so final-all has a
 * row even when the phase list cannot be read. `dirListing` lists the directories under
 * `reviews/` by name (`labels`) and counts the other entries (`skipped`); a directory whose name
 * is not a review label (SESSION_REVIEW_LABEL) is skipped too. `read` gates one review directory;
 * `git` counts the commits the final review did not read and recomputes empty skips (absent:
 * nothing is counted, and every empty skip is unverified). Everything else (decisions,
 * continuity, notes) is decided here.
 */
export function assembleStamp(
  state: StampSessionState,
  dirListing: { labels: readonly string[]; skipped: number },
  read: (label: string) => ReviewDirRead,
  git?: StampGit
): { rows: StampRow[]; notes: StampNote[] } {
  const labels = dirListing.labels.filter((l) => SESSION_REVIEW_LABEL.test(l));
  const skipped = dirListing.skipped + dirListing.labels.length - labels.length;
  const expected = state.expected ?? [FINAL_REVIEW_LABEL];
  const all = [...new Set([...expected, ...labels])].sort(compareReviewLabels);
  const rows = all.map((label): StampRow => {
    const decided = {
      decisions: state.decisions.get(label) ?? [],
      decisionsReadable: state.decisionsReadable,
    };
    const isFinal = label === FINAL_REVIEW_LABEL;
    const got: ReviewDirRead | undefined = labels.includes(label) ? read(label) : undefined;
    if (got === undefined) return unreadRow(label, { unread: { status: 'absent' } }, decided, git);
    if ('unread' in got) return unreadRow(label, got, decided, git);
    const later = isFinal ? git?.commitsAfter(got.result.receipt.diff.head) : undefined;
    const gapAfter = isFinal ? undefined : gapOf(got.result);
    return buildProvenanceRow({
      review: label,
      result: got.result,
      ...decided,
      ...(later !== undefined && { unreviewedCommits: later }),
      ...(gapAfter !== undefined && { gapAfter }),
    });
  });
  return { rows, notes: stampNotes(state, skipped, all) };
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

/** Commits the final review did not read. Appended whatever the Gate cell says before it. */
function unreviewedText(later: UnreviewedCommits | undefined): string {
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
function roundsText(r: ProvenanceRow): string[] {
  // A prior round at or above the round the gate counts is not an earlier round of this row.
  const prior: readonly ReviewPriorRound[] = (r.receipt.priorRounds ?? []).filter(
    (p) => p.round < r.round
  );
  const shown = prior.slice(0, STAMP_LIMITS.items);
  const parts = shown.map((p) => `round ${p.round}: ${p.blocking} blocking`);
  if (r.round > 1 || prior.length > 0) parts.unshift(`round ${r.round}`);
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
  return [...parts, ...roundsText(r)].join('; ');
}

/** Who took a decision, as the Override cell writes it. */
const deciderText = (who: ReadReviewDecision['decidedBy']): string =>
  `(${who === 'unknown' ? 'decider unknown' : who})`;

function decisionText(d: ReadReviewDecision): string {
  const why = inert(d.rationale, STAMP_LIMITS.rationale) || '?';
  const by = deciderText(d.decidedBy);
  switch (d.kind) {
    case 'gate':
      return `gate (${listed(d.codes, STAMP_LIMITS.codes)}) ${by}: ${why}`;
    case 'findings':
      return `findings ${by}: ${why}`;
    case 'dismissed':
      return `dismissed ${idList(d.findingIds)} ${by}: ${why}`;
    case 'skipped':
      return `skipped (${d.reason}) ${by}: ${why}`;
  }
}

/**
 * The counts come first and are never cut; then each decision, a long rationale ending in `…`,
 * and `+N more` when there are more decisions than are written out. When any decision of the
 * session could not be read the cell starts `unknown` and the counts are floors (`at least`).
 */
function overrideText(
  decisions: readonly ReadReviewDecision[],
  otherRounds: number,
  readable: boolean
): string {
  if (decisions.length + otherRounds === 0) return readable ? 'none' : 'unknown';
  const dismissals = decisions.filter((d) => d.kind === 'dismissed').length;
  const skips = decisions.filter((d) => d.kind === 'skipped').length;
  const counts = [
    plural(decisions.length - dismissals - skips, 'override'),
    plural(dismissals, 'dismissal'),
    ...(skips > 0 ? [plural(skips, 'skip')] : []),
    ...(otherRounds > 0 ? [`${otherRounds} from other rounds`] : []),
  ].join(', ');
  const floor = readable ? counts : `unknown, at least ${counts}`;
  if (decisions.length === 0) return floor;
  const shown = decisions.slice(0, STAMP_LIMITS.decisions).map(decisionText);
  const more = decisions.length - shown.length;
  return `${floor}: ${[...shown, ...(more > 0 ? [`+${more} more`] : [])].join('; ')}`;
}

/** What recomputing an empty skip found, as its Gate cell says it. */
function skipCheckText(check: SkipCheck | undefined): string {
  if (check === 'not-empty') return '; range not empty';
  if (check === 'unverified') return '; unverified';
  return '';
}

function unreadGate(unread: UnreadReview): string {
  switch (unread.status) {
    case 'absent':
      return MISSING_REVIEW;
    case 'missing':
    case 'invalid':
      return `receipt ${unread.status}`;
    case 'outside-repo':
      return 'receipt outside repository';
    case 'outside':
      return 'receipt outside project';
    case 'skipped':
      return `skipped (${unread.reason}${skipCheckText(unread.check)})`;
    case 'unreadable': {
      const known = new RegExp(`^${UNREAD_REASON}$`).test(unread.reason);
      return `receipt unreadable (${known ? unread.reason : 'UNKNOWN'})`;
    }
  }
}

/**
 * The Gate cell of a row without a receipt: `(overridden)` when a gate decision names the code it
 * fails with; on the final row, the commits it did not cover.
 */
function unreadGateCell(r: UnreadReviewRow): string {
  const code = unreadCode(r.unread);
  const overridden =
    code !== undefined && r.decisions.some((d) => d.kind === 'gate' && d.codes.includes(code));
  return `${unreadGate(r.unread)}${overridden ? ' (overridden)' : ''}${unreviewedText(r.unreviewedCommits)}`;
}

/**
 * A row without a receipt. Its Override cell is `-` only when the decisions were read and none
 * names the review; when they could not be read it is `unknown`, never a claim that there are
 * none.
 */
function unreadCells(r: UnreadReviewRow): StampCells {
  const cells = blank(r.review, unreadGateCell(r));
  const other = r.otherRoundDecisions ?? 0;
  if (r.decisions.length + other === 0 && r.decisionsReadable) return cells;
  return { ...cells, Override: overrideText(r.decisions, other, r.decisionsReadable) };
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
    Override: overrideText(r.decisions, r.otherRoundDecisions, r.decisionsReadable),
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
