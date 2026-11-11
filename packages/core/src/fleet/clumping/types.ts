// packages/core/src/fleet/clumping/types.ts
//
// Shapes for the clumping control (docs/changes/clumping/proposal.md, Phase 1):
// a finding below the floor is acted on rather than filed, and a set of like
// findings becomes one work item rather than N.
//
// DECLARATIONS ONLY — no runtime code lives here. The policy defaults and
// resolver are in ./floor.ts, where the floor consumes them first and where they
// are covered by a test.
//
// Core knows nothing about findings, issues or PRs: every seam normalizes its
// native record into a ClumpableItem and keeps the original on `ref`.

import type { Confidence, Impact, Tier } from '../../craft/axes';

/**
 * What the floor reads. A UNION, not a scalar, and deliberately so:
 * `derivePriority` already collapses the three axes to a sortable number, but the
 * floor CANNOT be a threshold on it — `foundational/small/low` scores 1003 and must
 * be floored while `polish/small/medium` scores 109 and must not, so any single
 * cut-off gets one of them wrong. The floor reads STRUCTURE; `weight` orders.
 *
 * `ungraded` is a first-class TERMINAL state: an item with no gradable signal is
 * never floored and never clumped (D8). A fabricated grade is a lie in the queue.
 */
export type Grade =
  | { kind: 'axes'; tier: Tier; impact: Impact; confidence: Confidence }
  | { kind: 'severity'; severity: 'critical' | 'important' | 'suggestion' }
  | { kind: 'ungraded' };

/** A seam-neutral work candidate. */
export interface ClumpableItem {
  /** Stable identity in the source system. MUST be unique within one call. */
  id: string;
  /** The unit a reviewer holds in their head at once (e.g. a directory). */
  scope: string;
  /** The kind of judgment the item demands (e.g. a rubric family). */
  kind: string;
  /** What the floor reads. */
  grade: Grade;
  /** Sortable; higher = more urgent. Ordering ONLY — never a floor threshold. */
  weight: number;
  /** What this item must edit. Two items sharing a key may never co-clump. */
  conflictKeys: readonly string[];
  /** Opaque passthrough to the native record. Core never inspects it. */
  ref?: unknown;
}

/** Tunables. Absent any override, {@link DEFAULT_CLUMP_POLICY} applies and nothing errors. */
export interface ClumpPolicy {
  /** Max members in one clump. Default 12. */
  maxPerClump: number;
  /** Max EMITTED WORK UNITS (clumps + solos), never findings (D9). Default 20. */
  maxClumps: number;
  /** A group below this many members stays as solo items. Default 2. */
  minToClump: number;
  /**
   * A CEILING, not an outcome: the MOST a sub-floor item may resolve to. The
   * touched-set precondition narrows it. Default `'act'`.
   */
  floorResolution: 'act' | 'file';
  /** Escape hatch, cf. `--no-claim`. Default true. */
  floorEnabled: boolean;
}

/** What the caller already has open. Absent ⇒ a sub-floor item resolves to `'file'`. */
export interface FloorContext {
  touched?: readonly string[];
}

/** `below: false` carries no reason — there is nothing to explain. */
export type FloorVerdict =
  | { below: false }
  | { below: true; resolution: 'act' | 'file'; reason: string };

/** One emitted work unit: like items over one coherent scope. */
export interface Clump {
  /**
   * Deterministic: `clump-<first 16 hex of sha256(JSON.stringify([scope, kind,
   * sorted member ids]))>`. The encoding is JSON, not a joined string, because it
   * must be injective for arbitrary caller strings — `id` is whatever the source
   * system calls stable, and a comma inside one id used to shift the boundary
   * between ids and collide two different member sets onto one clump id.
   */
  id: string;
  scope: string;
  kind: string;
  /** Weight desc, tiebreak id asc. */
  members: readonly ClumpableItem[];
  /** Max member weight — a clump is as urgent as its worst item. */
  weight: number;
  /** Union of members', sorted. */
  conflictKeys: readonly string[];
}

/** A shed sub-floor item, with what to do about it and why. */
export interface FlooredItem {
  item: ClumpableItem;
  resolution: 'act' | 'file';
  reason: string;
}

/**
 * Every bucket, for the report (D5: shed items are counted and reported, never
 * silently discarded — a zero and a silent drop look identical in output).
 *
 * CONSERVATION LAW: `input === clumped + floored + overCap + ungraded + solo`.
 * It is checkable from this object alone, deliberately.
 *
 * `flooredAct` / `flooredFile` are a SUB-tally of `floored`, not extra buckets —
 * they do not participate in the conservation sum.
 */
export interface ClumpCounts {
  /** Items handed in. */
  input: number;
  /** Emitted clumps. */
  clumps: number;
  /** Members summed across emitted clumps. */
  clumped: number;
  floored: number;
  flooredAct: number;
  flooredFile: number;
  overCap: number;
  ungraded: number;
  solo: number;
  conflictSplits: number;
}

/**
 * The five buckets partition the input EXACTLY (success criterion 6). `ungraded`
 * is terminal: an ungraded item is reported here and is never also clumped or
 * soloed, which is what makes the partition disjoint.
 */
export interface ClumpResult {
  clumps: readonly Clump[];
  floored: readonly FlooredItem[];
  /** Flattened member ITEMS of over-cap units — the partition is over items, not units. */
  overCap: readonly ClumpableItem[];
  ungraded: readonly ClumpableItem[];
  solo: readonly ClumpableItem[];
  conflictSplits: number;
  counts: ClumpCounts;
}

/**
 * A clump member as it crosses a wire: the id, and nothing else.
 *
 * MEASURED, not assumed. The craft seam emits its `ClumpResult` inside the
 * object the craft MCP tools serialize whole (`JSON.stringify(result, null, 2)`),
 * and `ref` carries the ENTIRE finding. Conservation puts every finding in
 * exactly one bucket, so every finding was serialized twice — once under
 * `findings`, once under `clumps` — plus the item wrapper around it. On the
 * spec's own worked example (28 findings over 4 peer files, 7 clumps of 4) the
 * response went 21,496 -> 63,930 bytes, 2.97x.
 *
 * A control whose thesis is "ceremony cost dominates" cannot add 3x to the
 * surface agents read. The id is enough: at the craft seam it is
 * `code:path:line#ordinal`, which locates the finding in the sibling `findings`
 * array exactly, and at the intake seam it is `issue-<number>#ordinal`.
 */
export interface ClumpMemberView {
  id: string;
}

/** One emitted work unit, without its members' native records. */
export interface ClumpUnitView {
  id: string;
  scope: string;
  kind: string;
  weight: number;
  conflictKeys: readonly string[];
  members: readonly ClumpMemberView[];
}

/** A shed sub-floor item on the wire: which item, what to do, and why. */
export interface FlooredItemView {
  id: string;
  resolution: 'act' | 'file';
  reason: string;
}

/**
 * The SERIALIZED form of a {@link ClumpResult}.
 *
 * Same five buckets, same conservation law, same counts — `ref` is the only
 * thing missing, and the three flat buckets collapse to id arrays because an
 * item with no `ref` is its id. Callers that need the native record keep using
 * `ClumpResult` IN-PROCESS; this is what goes out of the process.
 */
export interface ClumpView {
  clumps: readonly ClumpUnitView[];
  floored: readonly FlooredItemView[];
  overCap: readonly string[];
  ungraded: readonly string[];
  solo: readonly string[];
  conflictSplits: number;
  counts: ClumpCounts;
}
