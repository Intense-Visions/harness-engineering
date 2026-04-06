import { readFile } from 'node:fs/promises';
import { parseRoadmap } from '@harness-engineering/core';
import type { FeatureStatus } from '@harness-engineering/core';
import type { RoadmapResult, MilestoneProgress } from '../../shared/types';

/**
 * Read and parse the roadmap file, computing per-milestone progress.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherRoadmap(roadmapPath: string): Promise<RoadmapResult> {
  try {
    const content = await readFile(roadmapPath, 'utf-8');
    const result = parseRoadmap(content);

    if (!result.ok) {
      return { error: result.error.message };
    }

    const roadmap = result.value;
    const allFeatures = roadmap.milestones.flatMap((m) => m.features);

    const milestones: MilestoneProgress[] = roadmap.milestones.map((m) => {
      const counts = countByStatus(m.features.map((f) => f.status));
      return {
        name: m.name,
        isBacklog: m.isBacklog,
        total: m.features.length,
        ...counts,
      };
    });

    const totals = countByStatus(allFeatures.map((f) => f.status));

    return {
      milestones,
      features: allFeatures,
      totalFeatures: allFeatures.length,
      totalDone: totals.done,
      totalInProgress: totals.inProgress,
      totalPlanned: totals.planned,
      totalBlocked: totals.blocked,
      totalBacklog: totals.backlog,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function countByStatus(statuses: FeatureStatus[]): {
  done: number;
  inProgress: number;
  planned: number;
  blocked: number;
  backlog: number;
} {
  let done = 0;
  let inProgress = 0;
  let planned = 0;
  let blocked = 0;
  let backlog = 0;

  for (const s of statuses) {
    switch (s) {
      case 'done':
        done++;
        break;
      case 'in-progress':
        inProgress++;
        break;
      case 'planned':
        planned++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'backlog':
        backlog++;
        break;
    }
  }

  return { done, inProgress, planned, blocked, backlog };
}
