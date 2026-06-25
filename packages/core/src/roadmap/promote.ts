import type { Roadmap, RoadmapFeature, FeatureStatus } from '@harness-engineering/types';

/**
 * Promote a brainstormed feature from `backlog` to `planned` and link its spec.
 *
 * Pure state-transition logic shared by every caller (the brainstorming skill
 * today; dashboard and autopilot later). Per ADR "Roadmap state-transition
 * rules live in core, not skill markdown": the business rules below (D2 state
 * matrix, D4 idempotency, D5 field-write policy from
 * `docs/changes/brainstorm-auto-promote/proposal.md`) hold across all callers,
 * so they belong here rather than in any one consumer.
 *
 * @see docs/knowledge/roadmap/roadmap-promotion.md
 */

const EM_DASH = '—';

/** "Current Work" milestone hosts rows created by the not-found create path (D5/S3-002). */
const DEFAULT_MILESTONE = 'Current Work';

/** Max nearest-neighbour suggestions returned on a not-found refusal (D1). */
const MAX_CLOSEST_MATCHES = 3;

export interface RoadmapPromoteArgs {
  /** ARGUMENTS lookup key (D1); trimmed, case-insensitive exact match. */
  feature: string;
  /** Path to the spec, e.g. `docs/changes/<feature>/proposal.md`. */
  spec: string;
  /** Spec H1; applied only when the row's summary is empty (D5). */
  summary?: string;
}

/** Successful transitions the core function can produce. */
export type RoadmapPromoteTransition = 'backlog→planned' | 'spec-updated' | 'created' | 'noop';

/**
 * Result the pure core can produce. IO failures (`write-failed`) are added by
 * the MCP handler in `RoadmapPromoteResult`, since the core does no IO.
 */
export type RoadmapPromoteCoreResult =
  | { ok: true; transitioned: RoadmapPromoteTransition; feature: string }
  | { ok: false; reason: 'in-progress' | 'done'; detail: string; feature: string }
  | { ok: false; reason: 'not-found'; detail: string; feature: string; closestMatches: string[] }
  | { ok: false; reason: 'ambiguous'; detail: string; feature: string; matches: string[] };

/** Public envelope consumed by callers (skill, dashboard, autopilot). */
export type RoadmapPromoteResult =
  | RoadmapPromoteCoreResult
  | { ok: false; reason: 'write-failed'; detail: string; feature: string };

/**
 * Per-row promotion decision, derived purely from the current row state and the
 * requested spec/summary. Shared between the file-backed `promoteFeature` below
 * and the file-less handler so the D2/D4 rules have a single source of truth.
 */
export type RoadmapPromoteRowDecision =
  | { action: 'set-planned' } // backlog → planned (D2 happy path)
  | { action: 'update-spec' } // planned/blocked/needs-human: spec link refreshed, status preserved
  | { action: 'noop' } // already promoted with this spec + summary (D4)
  | { action: 'refuse'; reason: 'in-progress' | 'done' }; // dispatched or shipped (D2)

/** A row whose summary field is empty may receive the spec H1 (D5). */
function isEmptySummary(summary: string): boolean {
  const trimmed = summary.trim();
  return trimmed === '' || trimmed === EM_DASH;
}

/** Would applying `args` actually change this row's spec or summary? */
function rowWouldChange(
  currentSpec: string | null,
  currentSummary: string,
  args: RoadmapPromoteArgs
): boolean {
  const specChanges = currentSpec !== args.spec;
  const summaryChanges =
    args.summary !== undefined && args.summary !== '' && isEmptySummary(currentSummary);
  return specChanges || summaryChanges;
}

/**
 * Decide what to do with an existing row given its current state. Pure: no
 * mutation, no IO. Encodes the D2 transition matrix and D4 idempotency rule.
 */
export function decidePromotionForRow(
  status: FeatureStatus,
  currentSpec: string | null,
  currentSummary: string,
  args: RoadmapPromoteArgs
): RoadmapPromoteRowDecision {
  switch (status) {
    case 'in-progress':
      return { action: 'refuse', reason: 'in-progress' };
    case 'done':
      return { action: 'refuse', reason: 'done' };
    case 'backlog':
      return { action: 'set-planned' };
    // planned, blocked, needs-human — lateral states (see status-rank.ts).
    // Refresh the spec link but preserve status; warn upstream.
    default:
      return rowWouldChange(currentSpec, currentSummary, args)
        ? { action: 'update-spec' }
        : { action: 'noop' };
  }
}

/** Apply the spec/summary writes permitted by D5 to a (cloned) row, in place. */
function applySpecAndSummary(feature: RoadmapFeature, args: RoadmapPromoteArgs): void {
  feature.spec = args.spec;
  if (args.summary !== undefined && args.summary !== '' && isEmptySummary(feature.summary)) {
    feature.summary = args.summary;
  }
}

/** Iterative Levenshtein distance for not-found typo hints (D1). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const above = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prevDiag + cost);
      prevDiag = above;
    }
  }
  return row[n]!;
}

/**
 * Is `distance` close enough to read as a typo rather than a genuinely new
 * feature name? Length-aware so short queries don't trip on unrelated rows.
 * A probable typo refuses with hints (D1); anything further falls through to
 * the create-new path (criterion #2).
 */
function isProbableTypo(distance: number, queryLen: number): boolean {
  if (distance === 0) return false; // exact match is handled before this point
  return distance <= Math.max(2, Math.floor(queryLen / 4));
}

interface LocatedRow {
  milestoneIndex: number;
  featureIndex: number;
  milestoneName: string;
  feature: RoadmapFeature;
}

function locateRows(roadmap: Roadmap): LocatedRow[] {
  const rows: LocatedRow[] = [];
  roadmap.milestones.forEach((milestone, milestoneIndex) => {
    milestone.features.forEach((feature, featureIndex) => {
      rows.push({ milestoneIndex, featureIndex, milestoneName: milestone.name, feature });
    });
  });
  return rows;
}

function cloneRoadmap(roadmap: Roadmap): Roadmap {
  return structuredClone(roadmap);
}

function makeCreatedFeature(args: RoadmapPromoteArgs): RoadmapFeature {
  return {
    name: args.feature.trim(),
    status: 'planned',
    spec: args.spec,
    plans: [],
    blockedBy: [],
    summary: args.summary ?? '',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
  };
}

/** Append a brand-new planned row under "Current Work", creating it if absent (D5/S3-002). */
function appendCreatedRow(roadmap: Roadmap, args: RoadmapPromoteArgs): Roadmap {
  const next = cloneRoadmap(roadmap);
  let milestone = next.milestones.find(
    (m) => m.name.toLowerCase() === DEFAULT_MILESTONE.toLowerCase()
  );
  if (!milestone) {
    milestone = { name: DEFAULT_MILESTONE, isBacklog: false, features: [] };
    next.milestones.push(milestone);
  }
  milestone.features.push(makeCreatedFeature(args));
  return next;
}

/**
 * Promote `args.feature` within `roadmap`, returning the resulting envelope and
 * the next roadmap. Pure over `(Roadmap, RoadmapPromoteArgs) → (RoadmapPromoteCoreResult,
 * Roadmap)`. On any non-mutating outcome (refusal, not-found, ambiguous, noop)
 * the original `roadmap` is returned unchanged so callers can skip the write.
 */
export function promoteFeature(
  roadmap: Roadmap,
  args: RoadmapPromoteArgs
): { result: RoadmapPromoteCoreResult; nextRoadmap: Roadmap } {
  const query = args.feature.trim();
  const queryLower = query.toLowerCase();
  const rows = locateRows(roadmap);
  const exact = rows.filter((r) => r.feature.name.trim().toLowerCase() === queryLower);

  // Ambiguous: same heading hosted by multiple milestones (D1 / S3-001).
  if (exact.length > 1) {
    const matches = exact.map((r) => `${r.milestoneName} > ${r.feature.name}`);
    return {
      result: {
        ok: false,
        reason: 'ambiguous',
        feature: query,
        detail: `"${query}" matches ${matches.length} rows across milestones. Re-invoke milestone-qualified: ${matches.join(', ')}.`,
        matches,
      },
      nextRoadmap: roadmap,
    };
  }

  if (exact.length === 1) {
    const located = exact[0]!;
    const decision = decidePromotionForRow(
      located.feature.status,
      located.feature.spec,
      located.feature.summary,
      args
    );

    if (decision.action === 'refuse') {
      const detail =
        decision.reason === 'in-progress'
          ? `"${query}" is in-progress: an agent is dispatched against this row. Stop the agent or use a different feature name.`
          : `"${query}" is already 'done'. To revise a shipped feature, use a new name.`;
      return {
        result: { ok: false, reason: decision.reason, detail, feature: query },
        nextRoadmap: roadmap,
      };
    }

    if (decision.action === 'noop') {
      return { result: { ok: true, transitioned: 'noop', feature: query }, nextRoadmap: roadmap };
    }

    const next = cloneRoadmap(roadmap);
    const target = next.milestones[located.milestoneIndex]!.features[located.featureIndex]!;
    if (decision.action === 'set-planned') {
      target.status = 'planned';
      applySpecAndSummary(target, args);
      return {
        result: { ok: true, transitioned: 'backlog→planned', feature: query },
        nextRoadmap: next,
      };
    }
    // update-spec: preserve status, refresh spec link (and summary if empty).
    applySpecAndSummary(target, args);
    return {
      result: { ok: true, transitioned: 'spec-updated', feature: query },
      nextRoadmap: next,
    };
  }

  // Zero exact matches: refuse with typo hints if a near-neighbour exists,
  // otherwise create a brand-new planned row (D2 not-found → create).
  const ranked = rows
    .map((r) => ({
      name: r.feature.name,
      distance: levenshtein(queryLower, r.feature.name.toLowerCase()),
    }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = ranked[0];
  if (nearest && isProbableTypo(nearest.distance, queryLower.length)) {
    const closestMatches = ranked.slice(0, MAX_CLOSEST_MATCHES).map((r) => r.name);
    return {
      result: {
        ok: false,
        reason: 'not-found',
        feature: query,
        detail: `"${query}" not found. Did you mean: ${closestMatches.join(', ')}?`,
        closestMatches,
      },
      nextRoadmap: roadmap,
    };
  }

  return {
    result: { ok: true, transitioned: 'created', feature: query },
    nextRoadmap: appendCreatedRow(roadmap, args),
  };
}
