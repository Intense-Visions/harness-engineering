import { readFile } from 'node:fs/promises';
import { parseRoadmap } from '@harness-engineering/core';
import type {
  RoadmapResult,
  MilestoneProgress,
  DashboardFeature,
  DashboardAssignmentRecord,
  FeatureStatus,
} from '../../shared/types';

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
    const allFeatures = projectFeatures(roadmap.milestones);
    const milestones = buildMilestoneProgress(roadmap.milestones);
    const totals = countByStatus(allFeatures.map((f) => f.status));
    const assignmentHistory: DashboardAssignmentRecord[] = (roadmap.assignmentHistory ?? []).map(
      (r) => ({
        feature: r.feature,
        assignee: r.assignee,
        action: r.action,
        date: r.date,
      })
    );

    return {
      milestones,
      features: allFeatures,
      assignmentHistory,
      totalFeatures: allFeatures.length,
      totalDone: totals.done,
      totalInProgress: totals.inProgress,
      totalPlanned: totals.planned,
      totalBlocked: totals.blocked,
      totalBacklog: totals.backlog,
      totalNeedsHuman: totals.needsHuman,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function projectFeatures(
  milestones: {
    name: string;
    features: {
      name: string;
      status: FeatureStatus;
      summary: string;
      blockedBy: string[];
      assignee?: string | null;
      priority?: string | null;
      spec?: string | null;
      plans?: string[];
      externalId?: string | null;
      updatedAt?: string | null;
    }[];
  }[]
): DashboardFeature[] {
  return milestones.flatMap((m) =>
    m.features.map((f) => ({
      name: f.name,
      status: f.status,
      summary: f.summary,
      milestone: m.name,
      blockedBy: f.blockedBy,
      assignee: f.assignee ?? null,
      priority: f.priority ?? null,
      spec: f.spec ?? null,
      plans: f.plans ?? [],
      externalId: f.externalId ?? null,
      updatedAt: f.updatedAt ?? null,
    }))
  );
}

function buildMilestoneProgress(
  milestones: { name: string; isBacklog: boolean; features: { status: FeatureStatus }[] }[]
): MilestoneProgress[] {
  return milestones.map((m) => ({
    name: m.name,
    isBacklog: m.isBacklog,
    total: m.features.length,
    ...countByStatus(m.features.map((f) => f.status)),
  }));
}

function countByStatus(statuses: FeatureStatus[]): {
  done: number;
  inProgress: number;
  planned: number;
  blocked: number;
  backlog: number;
  needsHuman: number;
} {
  let done = 0;
  let inProgress = 0;
  let planned = 0;
  let blocked = 0;
  let backlog = 0;
  let needsHuman = 0;

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
      case 'needs-human':
        needsHuman++;
        break;
    }
  }

  return { done, inProgress, planned, blocked, backlog, needsHuman };
}
