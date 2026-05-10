import type { TrackedFeature } from './tracker';
import type { Priority } from '@harness-engineering/types';

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export interface FileLessScoredCandidate {
  feature: TrackedFeature;
  priorityTier: number | null;
}

/**
 * Local mirror of `PilotScoringOptions` to avoid an import cycle with
 * `pilot-scoring.ts` (which imports this module's `scoreRoadmapCandidatesFileLess`).
 * Keep this shape in sync with the canonical definition.
 */
interface FileLessScoringOptions {
  currentUser?: string;
}

/**
 * D4: Drop positional ordering in file-less mode; sort by Priority then issue
 * creation order (createdAt ascending). Only `planned` and `backlog` features
 * are eligible (parity with file-backed `isEligibleCandidate`). `blockedBy`
 * filtering: a feature is excluded if any blocker name is in the input set
 * AND that blocker is not 'done'. Caller is responsible for passing the full
 * feature set so the function can compute this.
 */
export function scoreRoadmapCandidatesFileLess(
  features: TrackedFeature[],
  _options: FileLessScoringOptions
): FileLessScoredCandidate[] {
  const allNames = new Set(features.map((f) => f.name.toLowerCase()));
  const doneNames = new Set(
    features.filter((f) => f.status === 'done').map((f) => f.name.toLowerCase())
  );
  const eligible = features.filter((f) => {
    if (f.status !== 'planned' && f.status !== 'backlog') return false;
    return !f.blockedBy.some((b) => {
      const k = b.toLowerCase();
      return allNames.has(k) && !doneNames.has(k);
    });
  });
  const candidates: FileLessScoredCandidate[] = eligible.map((f) => ({
    feature: f,
    priorityTier: f.priority ? PRIORITY_RANK[f.priority] : null,
  }));
  candidates.sort((a, b) => {
    const ap = a.priorityTier;
    const bp = b.priorityTier;
    if (ap !== null && bp === null) return -1;
    if (ap === null && bp !== null) return 1;
    if (ap !== null && bp !== null && ap !== bp) return ap - bp;
    return a.feature.createdAt.localeCompare(b.feature.createdAt);
  });
  return candidates;
}
