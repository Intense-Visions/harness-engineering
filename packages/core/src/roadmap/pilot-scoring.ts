import type { Roadmap, RoadmapFeature, Priority } from '@harness-engineering/types';

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
  /** Dependents-based score (0-1): more downstream blockers = higher */
  dependentsScore: number;
  /** Affinity-based score (0-1): bonus if user completed related items */
  affinityScore: number;
  /** Final weighted score (within tier) */
  weightedScore: number;
  /** Priority tier: 0 for P0, 1 for P1, etc. null for no priority */
  priorityTier: number | null;
}

export interface PilotScoringOptions {
  /** Current user identifier for affinity matching */
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

function isEligibleCandidate(
  feature: RoadmapFeature,
  allFeatureNames: Set<string>,
  doneFeatures: Set<string>
): boolean {
  if (feature.status !== 'planned' && feature.status !== 'backlog') return false;
  const isBlocked = feature.blockedBy.some((blocker) => {
    const key = blocker.toLowerCase();
    return allFeatureNames.has(key) && !doneFeatures.has(key);
  });
  return !isBlocked;
}

function computeAffinityScore(
  feature: RoadmapFeature,
  milestoneName: string,
  milestoneMap: Map<string, string[]>,
  userCompletedFeatures: Set<string>
): number {
  if (userCompletedFeatures.size === 0) return 0;
  const completedBlocker = feature.blockedBy.some((b) =>
    userCompletedFeatures.has(b.toLowerCase())
  );
  if (completedBlocker) return 1.0;
  const siblings = milestoneMap.get(milestoneName) ?? [];
  const completedSibling = siblings.some((s) => userCompletedFeatures.has(s));
  return completedSibling ? 0.5 : 0;
}

/**
 * Score and sort unblocked planned/backlog items using the two-tier algorithm.
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
  const allFeatureNames = new Set(allFeatures.map((f) => f.name.toLowerCase()));
  const doneFeatures = new Set(
    allFeatures.filter((f) => f.status === 'done').map((f) => f.name.toLowerCase())
  );

  // Build dependents map: feature name -> count of features that list it as a blocker
  const dependentsCount = new Map<string, number>();
  for (const feature of allFeatures) {
    for (const blocker of feature.blockedBy) {
      const key = blocker.toLowerCase();
      dependentsCount.set(key, (dependentsCount.get(key) ?? 0) + 1);
    }
  }
  const maxDependents = Math.max(1, ...dependentsCount.values());

  // Build milestone feature map for affinity
  const milestoneMap = new Map<string, string[]>();
  for (const ms of roadmap.milestones) {
    milestoneMap.set(
      ms.name,
      ms.features.map((f) => f.name.toLowerCase())
    );
  }

  // Build affinity data from assignment history
  const userCompletedFeatures = new Set<string>();
  if (options?.currentUser) {
    const user = options.currentUser.toLowerCase();
    for (const record of roadmap.assignmentHistory) {
      if (record.action === 'completed' && record.assignee.toLowerCase() === user) {
        userCompletedFeatures.add(record.feature.toLowerCase());
      }
    }
  }

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

      if (!isEligibleCandidate(feature, allFeatureNames, doneFeatures)) continue;

      const positionScore = 1 - (globalPosition - 1) / totalPositions;
      const deps = dependentsCount.get(feature.name.toLowerCase()) ?? 0;
      const dependentsScore = deps / maxDependents;
      const affinityScore = computeAffinityScore(
        feature,
        ms.name,
        milestoneMap,
        userCompletedFeatures
      );
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
