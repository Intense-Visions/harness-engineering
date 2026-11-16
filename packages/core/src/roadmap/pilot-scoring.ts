import type { Roadmap, RoadmapFeature, Priority } from '@harness-engineering/types';
import { getRoadmapMode, type RoadmapMode, type RoadmapModeConfig } from './mode';
import { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less';
import type { TrackedFeature } from './tracker';
import {
  createBlockerReferenceResolver,
  createBlockerResolver,
  isPilotStatus,
  type BlockerReferenceResolver,
  type BlockerResolutionOptions,
} from './blocker-resolution';

/**
 * A candidate feature with computed scores for the pilot selection algorithm.
 */
export interface ScoredCandidate {
  /** The original feature object */
  feature: RoadmapFeature;
  /** The milestone this feature belongs to */
  milestone: string;
  /** Position-based score (0-1): earlier in milestone + earlier milestone = higher */
  positionScore: number;
  /** Dependents-based score (0-1): more not-done rows whose Blockers name this row = higher */
  dependentsScore: number;
  /** Affinity-based score (0-1): 1 if the user completed a blocker of this row, 0.5 if a milestone sibling */
  affinityScore: number;
  /** Final weighted score (within tier) */
  weightedScore: number;
  /** Priority tier: 0 for P0, 1 for P1, etc. null for no priority */
  priorityTier: number | null;
}

export interface PilotScoringOptions extends BlockerResolutionOptions {
  /**
   * Current user identifier for affinity matching. Compared case-insensitively
   * with a leading `@` ignored against row `Assignee` values and assignment
   * history; no alias mapping between a git name, an email and a handle is done.
   */
  currentUser?: string;
}

const PRIORITY_RANK: Record<Priority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const POSITION_WEIGHT = 0.5;
const DEPENDENTS_WEIGHT = 0.3;
const AFFINITY_WEIGHT = 0.2;

function normalizeUser(user: string): string {
  return user.trim().replace(/^@/, '').toLowerCase();
}

/**
 * The rows the current user completed (#2222). A row counts when it is `done`
 * and the user is its owner of record: an explicit `completed` assignment record,
 * the row's own `Assignee`, or — when the row's `Assignee` is empty — the user is
 * the assignee of the row's latest `assigned` history record. Nothing in
 * production writes `completed` records, so the old `completed`-only rule made
 * affinity identically zero on every real roadmap.
 */
function userCompletedFeatures(
  roadmap: Roadmap,
  currentUser: string | undefined
): Set<RoadmapFeature> {
  const completed = new Set<RoadmapFeature>();
  if (!currentUser) return completed;
  const user = normalizeUser(currentUser);
  if (user === '') return completed;

  const completedByRecord = new Set<string>();
  const lastAssigned = new Map<string, string | null>();
  for (const record of roadmap.assignmentHistory) {
    const key = record.feature.trim().toLowerCase();
    const who = normalizeUser(record.assignee);
    if (record.action === 'completed' && who === user) completedByRecord.add(key);
    if (record.action === 'assigned') lastAssigned.set(key, who);
    if (record.action === 'unassigned' && lastAssigned.get(key) === who)
      lastAssigned.set(key, null);
  }

  for (const feature of roadmap.milestones.flatMap((m) => m.features)) {
    if (feature.status !== 'done') continue;
    const key = feature.name.trim().toLowerCase();
    const owner = feature.assignee ? normalizeUser(feature.assignee) : lastAssigned.get(key);
    if (completedByRecord.has(key) || owner === user) completed.add(feature);
  }
  return completed;
}

function computeAffinityScore(
  feature: RoadmapFeature,
  siblings: readonly RoadmapFeature[],
  resolveRefs: BlockerReferenceResolver,
  completed: ReadonlySet<RoadmapFeature>
): number {
  if (completed.size === 0) return 0;
  const completedBlocker = feature.blockedBy.some((b) =>
    resolveRefs(b).some((ref) => ref !== feature && completed.has(ref))
  );
  if (completedBlocker) return 1.0;
  return siblings.some((s) => s !== feature && completed.has(s)) ? 0.5 : 0;
}

/**
 * Count, per row, the distinct not-done rows whose Blockers reference it, using
 * the same matching rules as the eligibility filter (#2222). A dependent that
 * names the same row in several comma-split fragments counts once; a blocker
 * that resolves to no row contributes nothing (it used to become its own key and
 * could set the normalizer).
 */
function countDependents(
  allFeatures: readonly RoadmapFeature[],
  resolveRefs: BlockerReferenceResolver
): Map<RoadmapFeature, number> {
  const dependents = new Map<RoadmapFeature, Set<RoadmapFeature>>();
  for (const dependent of allFeatures) {
    if (dependent.status === 'done') continue;
    for (const text of dependent.blockedBy) {
      if (text.trim() === '') continue;
      for (const target of resolveRefs(text)) {
        if (target === dependent) continue;
        const set = dependents.get(target) ?? new Set<RoadmapFeature>();
        set.add(dependent);
        dependents.set(target, set);
      }
    }
  }
  return new Map([...dependents].map(([target, set]) => [target, set.size]));
}

/**
 * Score and sort unblocked planned/backlog items using the two-tier algorithm.
 *
 * A row is unblocked when every `Blockers` entry resolves to `done` rows; rows
 * withheld as blocked are listed by `findBlockedRoadmapCandidates`.
 *
 * Tier 1: Items with explicit priority sorted by priority level (P0 > P1 > P2 > P3).
 * Tier 2: Items without priority sorted by weighted score.
 * Within the same priority tier, items are sorted by weighted score.
 *
 * Weights: position (0.5), dependents (0.3), affinity (0.2).
 */
export function scoreRoadmapCandidates(
  roadmap: Roadmap,
  options?: PilotScoringOptions
): ScoredCandidate[] {
  const allFeatures = roadmap.milestones.flatMap((m) => m.features);
  // Eligibility: a planned/backlog row is dispatchable only when none of its
  // blockers still holds. See `blocker-resolution.ts` for the forms a Blockers
  // entry takes and why an unresolvable one fails closed (#2255). Rows withheld
  // here are reported by `findBlockedRoadmapCandidates`.
  const heldBlockers = createBlockerResolver(roadmap, options);
  const resolveRefs = createBlockerReferenceResolver(roadmap, options);

  const dependentsCount = countDependents(allFeatures, resolveRefs);
  const maxDependents = Math.max(1, ...dependentsCount.values());
  const completed = userCompletedFeatures(roadmap, options?.currentUser);

  // Compute total positions for normalization
  let totalPositions = 0;
  for (const ms of roadmap.milestones) {
    totalPositions += ms.features.length;
  }
  totalPositions = Math.max(1, totalPositions);

  // Filter and score candidates
  const candidates: ScoredCandidate[] = [];
  let globalPosition = 0;

  for (const ms of roadmap.milestones) {
    for (const feature of ms.features) {
      globalPosition++;

      if (!isPilotStatus(feature) || heldBlockers(feature).length > 0) continue;

      const positionScore = 1 - (globalPosition - 1) / totalPositions;
      const deps = dependentsCount.get(feature) ?? 0;
      const dependentsScore = deps / maxDependents;
      const affinityScore = computeAffinityScore(feature, ms.features, resolveRefs, completed);
      const weightedScore =
        POSITION_WEIGHT * positionScore +
        DEPENDENTS_WEIGHT * dependentsScore +
        AFFINITY_WEIGHT * affinityScore;
      const priorityTier = feature.priority ? PRIORITY_RANK[feature.priority] : null;

      candidates.push({
        feature,
        milestone: ms.name,
        positionScore,
        dependentsScore,
        affinityScore,
        weightedScore,
        priorityTier,
      });
    }
  }

  // Sort: priority tier first (lower = better, null = after all priorities), then weighted score desc
  candidates.sort((a, b) => {
    // Tier 1 vs Tier 2
    if (a.priorityTier !== null && b.priorityTier === null) return -1;
    if (a.priorityTier === null && b.priorityTier !== null) return 1;

    // Within same tier type
    if (a.priorityTier !== null && b.priorityTier !== null) {
      if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    }

    // Within same priority tier (or both null): sort by weighted score desc
    return b.weightedScore - a.weightedScore;
  });

  return candidates;
}

/**
 * Assign a feature to a user, updating the feature's assignee field
 * and appending records to the assignment history.
 *
 * - New assignment: appends one 'assigned' record.
 * - Reassignment: appends 'unassigned' for previous + 'assigned' for new.
 * - Same assignee: no-op.
 *
 * Mutates roadmap in-place.
 */
export function assignFeature(
  roadmap: Roadmap,
  feature: RoadmapFeature,
  assignee: string,
  date: string
): void {
  if (feature.assignee === assignee) return;

  if (feature.assignee !== null) {
    roadmap.assignmentHistory.push({
      feature: feature.name,
      assignee: feature.assignee,
      action: 'unassigned',
      date,
    });
  }

  feature.assignee = assignee;
  roadmap.assignmentHistory.push({
    feature: feature.name,
    assignee,
    action: 'assigned',
    date,
  });
}

/**
 * Mode-aware wrapper around `scoreRoadmapCandidates`. The roadmap-pilot skill
 * (and any caller that needs to honor `roadmap.mode`) should call this instead
 * of `scoreRoadmapCandidates` directly.
 *
 * Phase 4 behavior:
 *   - `file-backed` (default) — delegates to `scoreRoadmapCandidates` unchanged.
 *   - `file-less` — D4 sort: delegates to `scoreRoadmapCandidatesFileLess` which
 *     orders eligible features by Priority then `createdAt` ascending.
 *     The caller is expected to pass a `Roadmap` whose milestones' features
 *     carry tracker fields (constructed from `RoadmapTrackerClient.fetchAll()`).
 *
 * @param roadmap - The roadmap (file-backed: parsed from the roadmap aggregate;
 *                  file-less: synthesized from tracker fetchAll output).
 * @param options - Pilot scoring options (currentUser etc.).
 * @param config  - The Harness config (or any object with optional `roadmap.mode`);
 *                  use `getRoadmapMode(config)` to resolve.
 * @returns Scored candidates. Note: file-less results have zeroed
 *          positionScore/dependentsScore/affinityScore/weightedScore — the
 *          D4 sort is by `priorityTier` then issue creation order.
 */
export function scoreRoadmapCandidatesForMode(
  roadmap: Roadmap,
  options: PilotScoringOptions,
  config: RoadmapModeConfig | undefined | null
): ScoredCandidate[] {
  const mode: RoadmapMode = getRoadmapMode(config);
  if (mode === 'file-less') {
    const flatFeatures: RoadmapFeature[] = roadmap.milestones.flatMap((m) => m.features);
    const tracked: TrackedFeature[] = flatFeatures.map(featureToTrackedFeature);
    const fileLess = scoreRoadmapCandidatesFileLess(tracked, options);
    // Map back to ScoredCandidate shape so the public signature is preserved.
    const featuresByName = new Map<string, RoadmapFeature>(flatFeatures.map((f) => [f.name, f]));
    return fileLess.map((c) => {
      const feature = featuresByName.get(c.feature.name);
      if (!feature) {
        throw new Error(`Internal: feature ${c.feature.name} lost during mode dispatch`);
      }
      return {
        feature,
        milestone: '',
        positionScore: 0,
        dependentsScore: 0,
        affinityScore: 0,
        weightedScore: 0,
        priorityTier: c.priorityTier,
      };
    });
  }
  return scoreRoadmapCandidates(roadmap, options);
}

/**
 * Adapter: project a file-backed `RoadmapFeature` onto the wide-interface
 * `TrackedFeature` shape needed by `scoreRoadmapCandidatesFileLess`.
 *
 * `RoadmapFeature` has no `createdAt`; we default to the unix epoch so the
 * sort degenerates to "all equal createdAt → priority-only" rather than
 * throwing. Production callers in file-less mode should pass synthesized
 * roadmaps whose features have been hydrated from tracker fetchAll output
 * (carrying real createdAt values from the tracker).
 */
function featureToTrackedFeature(f: RoadmapFeature): TrackedFeature {
  return {
    externalId: f.externalId ?? '',
    name: f.name,
    status: f.status,
    summary: f.summary,
    spec: f.spec,
    plans: f.plans,
    blockedBy: f.blockedBy,
    assignee: f.assignee,
    priority: f.priority,
    milestone: null,
    createdAt: '1970-01-01T00:00:00Z',
    updatedAt: f.updatedAt,
  };
}
