import * as fs from 'fs';
import * as path from 'path';
import type { Roadmap, RoadmapFeature, FeatureStatus, Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

/**
 * A proposed status change from the sync engine.
 */
export interface SyncChange {
  /** Feature name */
  feature: string;
  /** Current status in the roadmap */
  from: FeatureStatus;
  /** Proposed new status based on execution state */
  to: FeatureStatus;
}

export interface SyncOptions {
  /** Path to project root */
  projectPath: string;
  /** Parsed roadmap object */
  roadmap: Roadmap;
  /** Override human-always-wins rule */
  forceSync?: boolean;
}

type TaskStatus = 'pending' | 'in_progress' | 'complete';

interface RootState {
  progress?: Record<string, TaskStatus>;
}

interface AutopilotPhase {
  name: string;
  planPath: string | null;
  status: string;
}

interface AutopilotState {
  phases?: AutopilotPhase[];
}

/**
 * Infer status for a single feature by checking execution state files.
 */
function inferStatus(
  feature: RoadmapFeature,
  projectPath: string,
  allFeatures: RoadmapFeature[]
): FeatureStatus | null {
  // 1. Blocker check takes precedence
  if (feature.blockedBy.length > 0) {
    const blockerNotDone = feature.blockedBy.some((blockerName) => {
      const blocker = allFeatures.find((f) => f.name.toLowerCase() === blockerName.toLowerCase());
      return !blocker || blocker.status !== 'done';
    });
    if (blockerNotDone) return 'blocked';
  }

  // 2. If no plans linked, cannot infer
  if (feature.plans.length === 0) return null;

  // 3. Gather task statuses from all state sources
  const allTaskStatuses: TaskStatus[] = [];

  // 3a. Check root .harness/state.json
  // Root state has no planPath field, so we can only use it when exactly one
  // feature has linked plans. With multiple plan-linked features, root state
  // is ambiguous and we rely solely on autopilot session state (which has
  // precise planPath matching).
  const featuresWithPlans = allFeatures.filter((f) => f.plans.length > 0);
  const useRootState = featuresWithPlans.length <= 1;

  if (useRootState) {
    const rootStatePath = path.join(projectPath, '.harness', 'state.json');
    if (fs.existsSync(rootStatePath)) {
      try {
        const raw = fs.readFileSync(rootStatePath, 'utf-8');
        const state: RootState = JSON.parse(raw);
        if (state.progress) {
          for (const status of Object.values(state.progress)) {
            allTaskStatuses.push(status);
          }
        }
      } catch {
        // Ignore malformed state files
      }
    }
  }

  // 3b. Check session autopilot-state.json files
  const sessionsDir = path.join(projectPath, '.harness', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      const sessionDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
      for (const entry of sessionDirs) {
        if (!entry.isDirectory()) continue;
        const autopilotPath = path.join(sessionsDir, entry.name, 'autopilot-state.json');
        if (!fs.existsSync(autopilotPath)) continue;
        try {
          const raw = fs.readFileSync(autopilotPath, 'utf-8');
          const autopilot: AutopilotState = JSON.parse(raw);
          if (!autopilot.phases) continue;

          // Check if any phase references a plan linked to this feature
          const linkedPhases = autopilot.phases.filter((phase) =>
            phase.planPath
              ? feature.plans.some((p) => p === phase.planPath || phase.planPath!.endsWith(p))
              : false
          );

          if (linkedPhases.length > 0) {
            for (const phase of linkedPhases) {
              if (phase.status === 'complete') {
                allTaskStatuses.push('complete');
              } else if (phase.status === 'pending') {
                allTaskStatuses.push('pending');
              } else {
                allTaskStatuses.push('in_progress');
              }
            }
          }
        } catch {
          // Ignore malformed autopilot state files
        }
      }
    } catch {
      // Ignore errors scanning sessions directory
    }
  }

  // 4. No state data found
  if (allTaskStatuses.length === 0) return null;

  // 5. Infer status from aggregated task statuses
  const allComplete = allTaskStatuses.every((s) => s === 'complete');
  if (allComplete) return 'done';

  const anyStarted = allTaskStatuses.some((s) => s === 'in_progress' || s === 'complete');
  if (anyStarted) return 'in-progress';

  return null;
}

/**
 * Scan execution state files and infer status changes for roadmap features.
 * Returns proposed changes without modifying the roadmap.
 */
export function syncRoadmap(options: SyncOptions): Result<SyncChange[]> {
  const { projectPath, roadmap, forceSync } = options;

  // Human-always-wins: if last_manual_edit > last_synced and not force, skip
  const isManuallyEdited =
    new Date(roadmap.frontmatter.lastManualEdit) > new Date(roadmap.frontmatter.lastSynced);
  const skipOverride = isManuallyEdited && !forceSync;

  const allFeatures = roadmap.milestones.flatMap((m) => m.features);
  const changes: SyncChange[] = [];

  for (const feature of allFeatures) {
    // If human-always-wins is active, skip this feature
    if (skipOverride) continue;

    const inferred = inferStatus(feature, projectPath, allFeatures);
    if (inferred === null) continue;
    if (inferred === feature.status) continue;

    changes.push({
      feature: feature.name,
      from: feature.status,
      to: inferred,
    });
  }

  return Ok(changes);
}
