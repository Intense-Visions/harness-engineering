// packages/cli/src/commands/fleet/clumpable-issues.ts
//
// The INTAKE half of clumping (docs/changes/clumping/proposal.md, Phase 4):
// "a set of like findings becomes one work item rather than N", applied to the
// open-issue backlog `issue-fleet` consumes.
//
// WHAT THIS SEAM CAN AND CANNOT DO, stated before the code so nobody has to
// infer it from a green test:
//
//   - FORMATION binds. Issues carry a scope (the paths they name) and a kind
//     (their type label), which is exactly what `formClumps` groups on.
//   - THE FLOOR DOES NOT. The floor's question is "is this worth the ceremony
//     cost of being FILED, or should it be acted on in place?" — and at intake
//     the item is ALREADY filed. issue-fleet's Iron Law forbids unfiling it
//     (no close without an explicit human authorization), and intake is not an
//     in-flight diff so there is no touched set for D4's `'act'` to resolve
//     against. Every typed issue therefore grades ABOVE the floor and
//     `report.floored` is 0 BY CONSTRUCTION, not by accident and not because
//     the floor was switched off. The floor still RUNS (`floorEnabled` is left
//     at its default) so a genuinely sub-floor grade would still route, and
//     `clumpable-issues.test.ts` pins that with a positive control — a
//     `suggestion`-graded item IS floored by this same composition. A zero and
//     a disabled check look identical in output; that control is what tells
//     them apart.
//
// NOT dedup. `issue-fleet`'s dedup axis removes RESTATEMENTS of one issue;
// clumping groups DISTINCT issues that happen to be alike. Both axes run, and
// conflating them is the likeliest misreading of this module.

import {
  formClumps,
  overlayClumpPolicy,
  scopeOfPath,
  withOrdinals,
  type ClumpPolicy,
  type ClumpPolicyOverlay,
  type ClumpResult,
  type ClumpableItem,
} from '@harness-engineering/core';
import { pilotScore } from '@harness-engineering/intelligence';

/**
 * The scope-sentinel FAMILY for an issue that names no path.
 *
 * `unscoped` alone is never a scope any more — see {@link unscopedScope}. It is
 * the family prefix, and it can NEVER collide with a derived scope: every
 * derived scope is a directory rendered WITH a trailing `/` (`packages/cli/`),
 * so no repository directory — including one literally named `unscoped` —
 * produces this string or anything under this prefix.
 */
export const UNSCOPED = 'unscoped';

/**
 * The scope of ONE issue that names no path: `unscoped#<item id>`, unique per
 * issue, so an unscoped issue is STRUCTURALLY ungroupable.
 *
 * WHY A SHARED `'unscoped'` SENTINEL WAS WRONG. It was a group key, and
 * `formClumps` groups on `(scope, kind)` — so the sentinel that exists to
 * prevent false affinity became the thing that manufactured it: every
 * path-less `bug` co-clumped with every other path-less `bug`. Measured on the
 * live backlog (347 open issues, 2026-11-11): FOUR unscoped clumps of 12 + 12 +
 * 7 + 3 = 34 members, 52% of the 66 clumped issues, and not one of them a unit
 * any human would work as one. Grouping on the ABSENCE of a signal is not
 * grouping; `#1306` and `#1836` share nothing but the fact that neither names a
 * file.
 *
 * D8 already settles the principle in the other coordinate: an item with no
 * gradable signal is TERMINAL, because a fabricated grade is a lie in the
 * queue. A fabricated affinity is the same lie about scope.
 *
 * THE MECHANISM, and why this one rather than grading it `ungraded`. The item
 * IS gradeable — it carries a type label — it is only unscopeable, and
 * `ungraded` means "no gradable signal" everywhere else in this control
 * (`report.ungraded === untyped + multiTyped` is an asserted identity, and the
 * bucket is a human-triage queue for issues NOBODY TYPED). Routing a typed
 * issue there would conflate two different absences, inflate a terminal bucket
 * with items that are ready to work, and make the report's own vocabulary
 * false. A per-issue scope instead leaves the grade honest and lets the item
 * land where it belongs — `solo`, its own queue entry, which is exactly where
 * an unclumpable issue goes. The count stays reported either way.
 *
 * Keyed on the item ID, which `withOrdinals` already makes unique within one
 * call, so the uniqueness of the scope is the uniqueness of the id rather than
 * a second thing that has to be kept true.
 *
 * Core stays generic: `form.ts` knows nothing about this sentinel and is not
 * asked to. Non-groupability is produced by the ordinary `(scope, kind)` key
 * over distinct scopes — the same mechanism that keeps two different
 * directories apart.
 */
export function unscopedScope(itemId: string): string {
  return `${UNSCOPED}#${itemId}`;
}

/**
 * Does this scope belong to the unscoped family?
 *
 * Exists so the report can COUNT unscoped issues after they stopped sharing one
 * string. The count is the thing the spec promises goes to CONFIRM rather than
 * being hidden, and a per-issue scope would have silently zeroed it.
 */
export function isUnscoped(scope: string): boolean {
  return scope === UNSCOPED || scope.startsWith(`${UNSCOPED}#`);
}

/**
 * The type-label vocabulary the `kind` axis reads, in no significant order.
 *
 * These are the project's EXISTING labels (`gh label list`), never invented
 * ones — the same rule `issue-fleet`'s label axis follows. Overridable so an
 * adopter whose tracker uses a different type vocabulary is not forced onto
 * ours.
 */
export const DEFAULT_ISSUE_TYPE_LABELS = [
  'bug',
  'enhancement',
  'feature',
  'documentation',
  'question',
] as const;

/**
 * Path prefixes that are NOT WORK TARGETS, in two measured classes.
 *
 * `conflictKeys` is documented as "what this item must edit", and `scope` is
 * the unit a triager holds in their head. A path that satisfies neither
 * manufactures affinity between issues that have nothing to do with each other,
 * and both classes below were found by RUNNING the axis over this repo's live
 * backlog (347 open issues, 2026-11-11) rather than by reasoning about it.
 *
 * TRACKER BOOKKEEPING — the tracker talking about itself. An issue does not
 * edit its own roadmap shard; the shard is the row that TRACKS it. Measured: 40
 * issues name a `docs/roadmap.d/` shard and NO other path, so without the
 * filter all 40 fold into one bogus `docs/roadmap.d/` family — forty unrelated
 * roadmap features presented as one coherent work unit.
 *
 * BUILD ARTIFACTS — a path from a pasted stack trace. Measured: `4 × bug
 * dist/ [#2146, #2169, #2189, #2324]`, four entirely unrelated bugs (roadmap
 * type labels, check-docs coverage, the dead-code detector, an entropy stub)
 * grouped because each body pastes a trace through a tsup bundle chunk and
 * `dist/chunk-*.js` is therefore the FIRST path each one names. Nobody edits a
 * bundle chunk, and the damage is not only cosmetic: those chunk paths also
 * became the `conflictKeys`, so D2's non-conflict precondition — the thing that
 * is supposed to guarantee two members of a clump do not collide — was
 * reasoning about build output. `dist/`, `node_modules/`, `coverage/` and
 * `.turbo/` are the four generated trees this repo's traces run through.
 * Filtered, #2189 scopes honestly to `packages/shared/src/schemas/` (the path
 * its body actually names) and the other three become `unscoped`.
 *
 * A prefix list rather than a hardcoded constant so an adopter with a different
 * roadmap store or a different build directory can say so. NOT named
 * `*_TRACKER_*` any more: it stopped being only about the tracker the moment
 * the artifact class was added, and a name that describes half its contents is
 * how the other half gets dropped on the next edit.
 */
export const DEFAULT_NON_TARGET_PATH_PREFIXES = [
  'docs/roadmap.d/',
  'dist/',
  'node_modules/',
  'coverage/',
  '.turbo/',
] as const;

/**
 * A repository-relative path mentioned in text.
 *
 * Requires at least one `/` AND a 2-to-5-character alphabetic extension. Both
 * halves are deliberately conservative, because a false path manufactures a
 * scope that is not there:
 *   - the `/` requirement keeps a bare `README.md` from scoping an issue to the
 *     repository root, which would group everything that mentions a top-level
 *     file;
 *   - the 2-character minimum extension rejects `docs/roadmap.d`, a DIRECTORY
 *     whose name ends in what looks like a one-letter extension (measured: it
 *     matched on this repo's backlog and scoped issues to `docs/`).
 * The leading lookbehind rejects a path inside a URL or already preceded by a
 * path separator, so `https://example.com/a/b.ts` contributes nothing.
 *
 * Over-filtering is its own fabrication, so nothing else is excluded: an issue
 * that names no recognizable path is reported `unscoped` rather than guessed at.
 */
const PATH_PATTERN = /(?<![\w./:-])((?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z]{2,5})(?![\w/])/g;

/** A GitHub label as `gh issue list --json labels` renders it, or a bare name. */
export type IssueLabel = string | { name: string };

/**
 * One open issue, as the intake seam reads it.
 *
 * Structurally satisfied by `gh issue list --json number,title,body,labels`
 * output, so the backlog the `issue-fleet` SKILL already enumerates is the
 * input to this adapter with no transformation step in between.
 *
 * `impact` / `confidence` / `effort` are the THREE INPUTS THE PRIORITIZE AXIS
 * ALREADY PRODUCES (`RankableCandidate`, `@harness-engineering/intelligence`).
 * They are optional because a raw `gh` dump carries no ranking: a backlog read
 * before triage is unranked, and fabricating a rank to fill the hole is the
 * thing `issue-fleet`'s own "an un-scoreable issue goes in an unranked group"
 * rule forbids.
 */
export interface IntakeIssue {
  number: number;
  title: string;
  body?: string | null;
  labels?: readonly IssueLabel[];
  /** Business impact, from the prioritize axis. */
  impact?: number;
  /** Confidence in the estimate, from the prioritize axis. */
  confidence?: number;
  /** Estimated effort, from the prioritize axis. */
  effort?: number;
}

/** Tunables for the normalization, separate from the clump policy. */
export interface IntakeAdapterOptions {
  /** Type-label vocabulary. Default {@link DEFAULT_ISSUE_TYPE_LABELS}. */
  typeLabels?: readonly string[];
  /** Non-target path prefixes. Default {@link DEFAULT_NON_TARGET_PATH_PREFIXES}. */
  nonTargetPathPrefixes?: readonly string[];
}

/** Normalize `gh`'s label objects and bare label names to one list of names. */
export function labelNames(labels: readonly IssueLabel[] | undefined): string[] {
  if (!labels) return [];
  return labels.map((label) => (typeof label === 'string' ? label : label.name));
}

/**
 * Every repository-relative path the issue names, in first-mention order,
 * de-duplicated, with tracker bookkeeping removed.
 *
 * De-duplication is load-bearing rather than tidiness: these become
 * `conflictKeys`, and a repeated path would be a repeated key.
 *
 * "With tracker bookkeeping removed" was the original wording and it is now
 * {@link DEFAULT_NON_TARGET_PATH_PREFIXES}: bookkeeping AND build artifacts.
 */
export function mentionedPaths(text: string, options: IntakeAdapterOptions = {}): string[] {
  const prefixes = options.nonTargetPathPrefixes ?? DEFAULT_NON_TARGET_PATH_PREFIXES;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PATH_PATTERN)) {
    const candidate = match[1]!;
    if (prefixes.some((prefix) => candidate.startsWith(prefix))) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

/**
 * The unit a triager holds in their head at once: the directory of the FIRST
 * path the issue names, or this issue's own {@link unscopedScope}.
 *
 * `unscopedKey` is REQUIRED rather than defaulted, so no caller can accidentally
 * produce the shared, groupable sentinel that this argument exists to replace.
 *
 * First-mention because an issue's opening paragraph names its subject and its
 * later paragraphs name the evidence; picking a different member of the list
 * (the most frequent, say) would make the scope a function of how verbose the
 * reporter was. Rendered WITH a trailing `/` so it can never collide with the
 * `unscoped` sentinel — see {@link UNSCOPED}.
 *
 * The path logic is core's `scopeOfPath`, shared with the craft and review
 * adapters rather than written a third time. Written a third time, it was
 * WRONG: this function used to be `first.slice(0, first.lastIndexOf('/'))`
 * with no `cut === -1` guard, so `issueScope(['README.md'])` answered
 * `'README.m/'` — `slice(0, -1)` drops the last character instead of meaning
 * "no directory". Unreachable through `mentionedPaths`, whose PATH_PATTERN
 * requires a slash, but this is EXPORTED with a signature that advertises no
 * such precondition. A root-level path now scopes to `'./'`.
 *
 * Only the TRAILING SLASH is this seam's own, and it stays here because it is
 * this seam's convention: it is what keeps a real scope from ever colliding
 * with the `unscoped` family (see {@link UNSCOPED}).
 */
export function issueScope(paths: readonly string[], unscopedKey: string): string {
  const first = paths[0];
  if (first === undefined) return unscopedScope(unscopedKey);
  return `${scopeOfPath(first)}/`;
}

/**
 * The kind of judgment the issue demands: its type label.
 *
 * Returns `null` — NOT a fabricated kind — when the issue carries zero type
 * labels or more than one. Both are honest absences of signal and both are
 * terminal (see {@link toClumpableIssues}):
 *   - ZERO: there is nothing to group on. `issue-fleet` runs its label axis
 *     before this one, so a still-untyped issue is one the label axis could not
 *     type either.
 *   - MORE THAN ONE: the issue plausibly fits two types, which `issue-fleet`
 *     calls a FORK — "not a guess". Picking the first match would resolve a
 *     fork by alphabet and bury it inside a clump.
 */
export function issueKind(
  labels: readonly IssueLabel[] | undefined,
  options: IntakeAdapterOptions = {}
): string | null {
  const vocabulary = options.typeLabels ?? DEFAULT_ISSUE_TYPE_LABELS;
  const types = labelNames(labels).filter((name) => vocabulary.includes(name));
  return types.length === 1 ? types[0]! : null;
}

/**
 * The prioritize axis's rank, or 0.
 *
 * `pilotScore` is the repo's EXISTING ranking function (`(impact × confidence)
 * ÷ effort`, `@harness-engineering/intelligence`) — the same one `issue-fleet`
 * already reuses for its prioritize axis — so `weight` and the queue order
 * agree by construction instead of by coincidence. All three inputs are
 * required: a partial trio would be a score computed from defaults, which is a
 * fabricated rank wearing a real function's name.
 *
 * `weight` is ORDERING ONLY. The floor never reads it (it reads `grade`), so an
 * unranked backlog clumps exactly as a ranked one does — only the cap order
 * differs.
 */
export function issueWeight(issue: IntakeIssue): number {
  const { impact, confidence, effort } = issue;
  if (impact === undefined || confidence === undefined || effort === undefined) return 0;
  return pilotScore({ impact, confidence, effort });
}

/**
 * Normalize the backlog into the seam-neutral candidates core reads.
 *
 * Taken as a BATCH because `ClumpableItem.id` must be unique within one call —
 * `formClumps` THROWS on a duplicate rather than collapsing two items, which is
 * right when the output is a filed issue and is a CRASH here: a backlog arrives
 * from paginated `gh` output, and a page boundary re-read or two concatenated
 * dumps repeat an issue number. An occurrence ordinal keeps that throw
 * unreachable from this seam without weakening it anywhere else, matching what
 * the craft and review adapters do for the same reason.
 */
export function toClumpableIssues(
  issues: readonly IntakeIssue[],
  options: IntakeAdapterOptions = {}
): ClumpableItem[] {
  return withOrdinals(issues, (issue) => String(issue.number)).map(({ item: issue, ordinal }) => {
    const paths = mentionedPaths(`${issue.title}\n${issue.body ?? ''}`, options);
    const kind = issueKind(issue.labels, options);
    const id = `issue-${issue.number}#${ordinal}`;
    return {
      id,
      // A path-less issue is scoped to ITSELF (`unscoped#<id>`), which makes it
      // ungroupable through the ordinary (scope, kind) key rather than through a
      // special case in core. See `unscopedScope`.
      scope: issueScope(paths, id),
      kind: kind ?? '',
      // An issue with no single type label has NO gradable signal, and D8 makes
      // `ungraded` terminal: never floored, never clumped, always reported. That
      // is the code form of `issue-fleet`'s existing rule that an un-scoreable
      // issue goes to an unranked group for a human rather than being assigned a
      // fabricated priority. The `kind: ''` above is never read for these — they
      // leave at step 1 of `formClumps`, before grouping.
      //
      // A typed issue grades `important`: above the floor, which at this seam is
      // a STRUCTURAL fact rather than a judgment (see the module header — the
      // item is already filed and the fleet may not unfile it).
      grade: kind === null ? { kind: 'ungraded' } : { kind: 'severity', severity: 'important' },
      weight: issueWeight(issue),
      conflictKeys: paths,
      ref: issue,
    };
  });
}

/** What the intake clump axis did, so CONFIRM can report it instead of guessing. */
export interface IntakeClumpReport {
  /** Issues handed in. */
  issues: number;
  /** Clumps emitted. */
  clumps: number;
  /** Issues folded into a clump. */
  clumped: number;
  /** Issues that stayed their own queue entry. Always `issues - clumped`. */
  individual: number;
  /** Issues naming no repository path. NEVER grouped — with a scoped issue or with each other. */
  unscoped: number;
  /** Issues carrying no type label (terminal: reported, never clumped). */
  untyped: number;
  /** Issues carrying more than one type label — a fork for the human (terminal). */
  multiTyped: number;
  /** `untyped + multiTyped`, as core's terminal bucket counts them. */
  ungraded: number;
  /** Sub-floor issues. 0 at this seam by construction — see the module header. */
  floored: number;
  /** Members of units past `maxClumps`, degraded to individual entries, never dropped. */
  overCap: number;
  /** Groups the conflict rule split because two issues name the same path. */
  conflictSplits: number;
}

export interface IntakeClumpOutcome {
  result: ClumpResult;
  /** The complement of the clumped members: every issue that kept its own queue entry. */
  individual: ClumpableItem[];
  report: IntakeClumpReport;
}

/**
 * The clump policy the intake seam runs under.
 *
 * `maxClumps` is lifted off the primitive's default of 20, and the reason is
 * the same one the review seam gives for degrading an over-cap unit to
 * individual comments rather than shedding it. D9's cap bounds EMITTED WORK
 * UNITS at a seam that CREATES work. Intake creates nothing — every issue in
 * the backlog was filed before this ran — so there is no creation to bound.
 *
 * THE FIGURE, MEASURED (2026-11-11, `--max-clumps 20` over the 347-issue
 * backlog): `overCap` 128, and the emitted clump set IDENTICAL to the uncapped
 * run — because an over-cap issue degrades to its own queue entry, which is
 * where it already was. So at 20 the cap is currently INERT for grouping on
 * this backlog, and the uncapped baseline is worth keeping for the cases where
 * it is not: a cap below the number of formed units sheds grouped issues
 * outright (measured `--max-clumps 5`: 11 clumps become 5, 12 grouped issues
 * pushed back out), and on a RANKED backlog a solo can outrank a clump and take
 * its slot. This comment used to say "~300", which was never measured and was
 * impossible: 182 of the 347 are `ungraded` and never enter a unit, so the
 * ceiling is 165.
 */
export const INTAKE_CLUMP_POLICY: Partial<ClumpPolicy> = { maxClumps: Number.MAX_SAFE_INTEGER };

/**
 * Form the clump set for an open-issue backlog.
 *
 * LAW (pinned by `clumpable-issues.test.ts`): every issue handed in is
 * represented EXACTLY ONCE — either as a member of one clump, or as one
 * individual queue entry. Written as a COMPLEMENT over the input rather than as
 * a loop per shed bucket (`solo`, `overCap`, `ungraded`, `floored`), for the
 * reason the review seam records: a per-bucket enumeration has to be kept in
 * sync with core, and a SIXTH bucket added upstream would drop its issues on the
 * floor with every existing test still green. Here a new bucket is covered the
 * moment it exists.
 */
export function clumpIssues(
  issues: readonly IntakeIssue[],
  policy: ClumpPolicyOverlay = {},
  options: IntakeAdapterOptions = {}
): IntakeClumpOutcome {
  const items = toClumpableIssues(issues, options);
  // `overlayClumpPolicy`, NOT `{ ...INTAKE_CLUMP_POLICY, ...policy }`. The
  // spread copies a key that is PRESENT AND `undefined`, and the baseline it
  // would clobber is the uncapped `maxClumps` whose measured stake is named in
  // the comment on INTAKE_CLUMP_POLICY directly above this function — which did
  // the unsafe thing anyway.
  const result = formClumps(items, overlayClumpPolicy(INTAKE_CLUMP_POLICY, policy));

  const clumpedIds = new Set(result.clumps.flatMap((c) => c.members.map((m) => m.id)));
  const individual = items.filter((item) => !clumpedIds.has(item.id));

  // `isUnscoped`, not `=== UNSCOPED`: each unscoped issue carries its own scope
  // (`unscoped#<id>`) so it cannot group, and an equality test would report 0.
  const unscoped = items.filter((item) => isUnscoped(item.scope)).length;
  // Counted from the labels directly rather than derived by subtracting one
  // tally from another: `untyped` and `multiTyped` are DIFFERENT human actions
  // (nobody typed it vs. two people typed it differently) and a subtraction
  // would silently re-label one as the other the day core's `ungraded` bucket
  // gains a third source.
  const vocabulary = options.typeLabels ?? DEFAULT_ISSUE_TYPE_LABELS;
  const typeCounts = issues.map(
    (issue) => labelNames(issue.labels).filter((name) => vocabulary.includes(name)).length
  );
  const untyped = typeCounts.filter((n) => n === 0).length;
  const multiTyped = typeCounts.filter((n) => n > 1).length;

  return {
    result,
    individual,
    report: {
      issues: items.length,
      clumps: result.clumps.length,
      clumped: result.counts.clumped,
      individual: individual.length,
      unscoped,
      untyped,
      multiTyped,
      ungraded: result.counts.ungraded,
      floored: result.counts.floored,
      overCap: result.counts.overCap,
      conflictSplits: result.counts.conflictSplits,
    },
  };
}
