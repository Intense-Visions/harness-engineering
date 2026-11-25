import { z } from 'zod';
import {
  FULL_SHA_PATTERN,
  REVIEW_DECIDERS,
  REVIEW_DECISION_KINDS,
  REVIEW_GATE_FAILURE_CODES,
  REVIEW_SKIP_REASONS,
  type ReadReviewDecision,
  type ReviewDecisionKind,
} from '@harness-engineering/types';
import { FINAL_REVIEW_LABEL, reviewLabel } from './layout';
import {
  AutopilotPhaseEntrySchema,
  AutopilotSessionStateSchema,
} from '../state/autopilot-session-state';

const REVIEW_STATES = ['REVIEW', 'FINAL_REVIEW'] as const;
const ids = z.array(z.string().min(1)).min(1);
/** A code that is not a gate failure code makes the decision unreadable, never a silent no-op. */
const codes = z.array(z.enum(REVIEW_GATE_FAILURE_CODES)).min(1);

/** The fields of every kind. Keys a kind does not declare are dropped. */
const fields = {
  state: z.enum(REVIEW_STATES),
  phase: z.union([z.number(), z.string()]).exactOptional(),
  rationale: z.string().min(1),
  round: z.number().int().positive().exactOptional(),
  decidedBy: z.enum(REVIEW_DECIDERS),
};

/**
 * A review decision, one shape per kind: a `gate` override names its codes, a dismissal its
 * finding ids, a skip its reason (and, for an empty range, may name the head it was empty at).
 * Plain objects: keys a kind does not declare are dropped, so nothing an agent wrote beside a
 * decision is carried into a stamp row or its JSON. Only a phase can be dropped from the plan: a
 * final review skipped as `dropped` is refused.
 */
export const ReviewDecisionRecordSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...fields, kind: z.literal('gate'), codes }),
    z.object({ ...fields, kind: z.literal('findings') }),
    z.object({ ...fields, kind: z.literal('dismissed'), findingIds: ids }),
    z.object({
      ...fields,
      kind: z.literal('skipped'),
      reason: z.enum(REVIEW_SKIP_REASONS),
      head: z.string().regex(FULL_SHA_PATTERN).exactOptional(),
    }),
  ])
  .refine((d) => !(d.kind === 'skipped' && d.state === 'FINAL_REVIEW' && d.reason === 'dropped'), {
    message: 'only a phase review can be skipped as dropped; the final review cannot',
  });

/**
 * The own fields of an unparsed JSON value when it is a JSON object; undefined for anything else,
 * an array included. The one such helper of the review receipts (cli included).
 */
export function jsonObjectFields(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? { ...v } : undefined;
}

/** Why the reviews a session calls for are not known. `position` is 0-based. */
export type ExpectedUnknown =
  | { reason: 'no-state' | 'no-phase-list' }
  | { reason: 'phase-entry' | 'phase-index'; position: number };

/** A review decision recorded under a state that is not a review state. It applies to no review. */
export interface OrphanDecision {
  /** The state as written when it is a plain state name, else `unknown`. */
  state: string;
  kind: ReviewDecisionKind;
}

export interface SessionReviewState {
  /** False when the state file is absent or malformed, or a review decision in it is. */
  decisionsReadable: boolean;
  /** Review decisions by review label, in the order they were taken. */
  decisions: ReadonlyMap<string, ReadReviewDecision[]>;
  /** The reviews the session's phase list calls for, then the final review. undefined: unknown. */
  expected: string[] | undefined;
  /** Set exactly when `expected` is undefined. */
  expectedUnknown?: ExpectedUnknown;
  orphans: OrphanDecision[];
  /** Review decisions written without `decidedBy`: read as decided by `unknown`. */
  legacyDecisions: number;
  /** The session's starting commit, when the state holds a full sha. */
  startingCommit?: string;
}

const isKind = (v: unknown): v is ReviewDecisionKind => REVIEW_DECISION_KINDS.some((k) => k === v);
const isReviewState = (v: unknown) => REVIEW_STATES.some((s) => s === v);
const { shape } = AutopilotSessionStateSchema;

/**
 * The reviews `phases[]` calls for, read with the state schema's `phases`. A phase is its 0-based
 * position: an entry may omit `index`, and one that states an index other than its position makes
 * the whole set unknown, because the review directories and decision records would then name
 * different phases. The first entry at fault is named; at one position a stated index that is not
 * the position is reported before any other fault of the entry.
 */
function expectedReviews(phases: unknown): string[] | ExpectedUnknown {
  if (!Array.isArray(phases)) return { reason: 'no-phase-list' };
  for (const [position, entry] of phases.entries()) {
    const index = jsonObjectFields(entry)?.index;
    if (index !== undefined && index !== position) return { reason: 'phase-index', position };
    if (!AutopilotPhaseEntrySchema.safeParse(entry).success)
      return { reason: 'phase-entry', position };
  }
  // Every entry passed on its own; the list as a whole is read with the state schema's `phases`.
  const parsed = shape.phases.safeParse(phases);
  if (!parsed.success) return { reason: 'no-phase-list' };
  const labels = (parsed.data ?? []).map((_, position) => `phase-${position}`);
  return [...labels, FINAL_REVIEW_LABEL];
}

/** How one entry of `decisions[]` bears on the session's reviews. */
type Entry =
  | { is: 'other' }
  | { is: 'orphan'; orphan: OrphanDecision }
  | { is: 'unreadable' }
  | { is: 'decision'; label: string; record: ReadReviewDecision; legacy: boolean };

/** A review-kind entry under a state that is not a review state. */
function orphanOf(entry: Record<string, unknown>): Entry {
  if (!isKind(entry.kind)) return { is: 'other' };
  const named = typeof entry.state === 'string' && /^[A-Z_]{1,40}$/.test(entry.state);
  const state = named ? String(entry.state) : 'unknown';
  return { is: 'orphan', orphan: { state, kind: entry.kind } };
}

/**
 * A review decision. One written before `decidedBy` existed (no such key) is read when it is
 * otherwise valid, as decided by `unknown`, and counted so the stamp can say so. A `decidedBy`
 * of any other value, `unknown` included, makes the record unreadable.
 */
function decisionOf(entry: Record<string, unknown>): Entry {
  const legacy = !('decidedBy' in entry);
  const parsed = ReviewDecisionRecordSchema.safeParse(
    legacy ? { ...entry, decidedBy: 'human' } : entry
  );
  if (!parsed.success) return { is: 'unreadable' };
  const record: ReadReviewDecision = legacy
    ? { ...parsed.data, decidedBy: 'unknown' }
    : parsed.data;
  const label = reviewLabel(record.state === 'REVIEW' ? 'phase' : 'final', record.phase);
  return label === undefined ? { is: 'unreadable' } : { is: 'decision', label, record, legacy };
}

function classify(raw: unknown): Entry {
  const entry = jsonObjectFields(raw);
  if (entry === undefined) return { is: 'other' };
  if (!isReviewState(entry.state)) return orphanOf(entry);
  const overrides = typeof entry.chosen === 'string' && /^\s*override\s*$/i.test(entry.chosen);
  return overrides || isKind(entry.kind) ? decisionOf(entry) : { is: 'other' };
}

type Decisions = Pick<
  SessionReviewState,
  'decisionsReadable' | 'decisions' | 'orphans' | 'legacyDecisions'
>;

/** Add one classified entry to what has been read. */
function addEntry(out: Decisions & { decisions: Map<string, ReadReviewDecision[]> }, e: Entry) {
  if (e.is === 'unreadable') out.decisionsReadable = false;
  else if (e.is === 'orphan') out.orphans.push(e.orphan);
  else if (e.is === 'decision') {
    out.decisions.set(e.label, [...(out.decisions.get(e.label) ?? []), e.record]);
    if (e.legacy) out.legacyDecisions++;
  }
}

/** Sort `decisions[]` into review decisions by label, orphans, and whether all of it was readable. */
function readDecisions(entries: unknown): Decisions {
  const out = {
    decisionsReadable: true,
    decisions: new Map<string, ReadReviewDecision[]>(),
    orphans: [] as OrphanDecision[],
    legacyDecisions: 0,
  };
  if (entries === undefined) return out;
  const parsed = shape.decisions.safeParse(entries);
  if (!parsed.success) return { ...out, decisionsReadable: false };
  for (const entry of parsed.data ?? []) addEntry(out, classify(entry));
  return out;
}

function parseState(text: string | undefined): Record<string, unknown> | undefined {
  try {
    return jsonObjectFields(JSON.parse(text ?? ''));
  } catch {
    return undefined;
  }
}

/**
 * What a session's `autopilot-state.json` says about its reviews: which are expected, which
 * decisions were recorded for each, and the commit it started from. Each field is read with
 * `AutopilotSessionStateSchema`, one field at a time, so a fault in one never hides another.
 * Nothing is dropped silently: a review decision that does not parse makes `decisionsReadable`
 * false, one recorded under another state is an orphan, and an unknown expected set carries its
 * reason. This is the one reader of the file's review fields; callers read the file once and
 * pass the text.
 */
export function readSessionReviewState(stateText: string | undefined): SessionReviewState {
  const state = parseState(stateText);
  if (state === undefined) {
    return {
      decisionsReadable: false,
      decisions: new Map(),
      orphans: [],
      legacyDecisions: 0,
      expected: undefined,
      expectedUnknown: { reason: 'no-state' },
    };
  }
  const expected = expectedReviews(state.phases);
  const start = shape.startingCommit.safeParse(state.startingCommit);
  return {
    ...readDecisions(state.decisions),
    ...(Array.isArray(expected)
      ? { expected }
      : { expected: undefined, expectedUnknown: expected }),
    ...(start.success && start.data !== undefined && { startingCommit: start.data }),
  };
}
