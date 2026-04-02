import type {
  Roadmap,
  RoadmapFeature,
  RoadmapMilestone,
  Priority,
  AssignmentRecord,
} from '@harness-engineering/types';

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
    for (let featureIdx = 0; featureIdx < ms.features.length; featureIdx++) {
      const feature = ms.features[featureIdx]!;
      globalPosition++;

      // Filter: only planned or backlog
      if (feature.status !== 'planned' && feature.status !== 'backlog') continue;

      // Filter: must be unblocked (all blockers done or unknown)
      const isBlocked = feature.blockedBy.some(
        (blocker) => !doneFeatures.has(blocker.toLowerCase())
      );
      if (isBlocked) continue;

      // Position score: earlier = higher (1.0 for first, approaching 0 for last)
      const positionScore = 1 - (globalPosition - 1) / totalPositions;

      // Dependents score: more downstream = higher
      const deps = dependentsCount.get(feature.name.toLowerCase()) ?? 0;
      const dependentsScore = deps / maxDependents;

      // Affinity score: bonus if user completed blockers or milestone siblings
      let affinityScore = 0;
      if (userCompletedFeatures.size > 0) {
        // Check if user completed any blockers of this feature
        const completedBlockers = feature.blockedBy.filter((b) =>
          userCompletedFeatures.has(b.toLowerCase())
        );
        if (completedBlockers.length > 0) {
          affinityScore = 1.0;
        } else {
          // Check milestone siblings
          const siblings = milestoneMap.get(ms.name) ?? [];
          const completedSiblings = siblings.filter((s) => userCompletedFeatures.has(s));
          if (completedSiblings.length > 0) {
            affinityScore = 0.5;
          }
        }
      }

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
