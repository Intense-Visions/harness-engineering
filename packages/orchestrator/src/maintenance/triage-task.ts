// packages/orchestrator/src/maintenance/triage-task.ts
//
// Roadmap Auto-Triage — Phase 0, Contract 3: the scheduling seam.
//
// Registers a leader-gated triage job on the EXISTING maintenance substrate rather
// than a bespoke loop. The job body is injected by later phases (P1 = report; P3+ =
// score+mark); here it is an empty no-op. Two safety properties, both inert-by-default:
//
//   1. Registered DORMANT unless `enabled && schedule` — with the feature off (the
//      default) `registerTriageTask` returns null, so nothing is scheduled and roadmap
//      behavior is byte-identical (SC-S1). The on-demand CLI path can still invoke the
//      body directly regardless.
//   2. Leader-gated — the body runs only for the elected leader, so concurrent
//      orchestrators don't double-run it (the duplicate-dispatch hazard). We reuse the
//      maintenance LeaderElector; the MaintenanceScheduler already leader-gates every
//      task in evaluate(), so registering through the same TaskDefinition path inherits
//      that gate. runTriageIfLeader is the explicit gate for the on-demand path (and the
//      unit under test).

import type { RoadmapAutoTriageConfig } from '@harness-engineering/types';
import type { TaskDefinition } from './types';
import type { LeaderElector } from './leader-elector';

/** Stable id for the triage maintenance task. */
export const TRIAGE_TASK_ID = 'roadmap-auto-triage';

/**
 * The injected triage job body. Phase 0 supplies an empty no-op; later phases inject
 * the real scoring/marking work. Kept minimal (no args) so the seam does not presuppose
 * a phase's context shape.
 */
export type TriageJobBody = () => Promise<void>;

/** The registered triage seam: the scheduler task + its injected body. */
export interface RegisteredTriageTask {
  task: TaskDefinition;
  body: TriageJobBody;
}

/**
 * Register the triage job as a maintenance task, or return `null` when the feature is
 * dormant. Dormant ⇔ `!config` OR `!config.enabled` OR no `config.schedule` — i.e. the
 * seam only becomes live once an operator both enables it AND gives it a cron schedule.
 * The returned task is `report-only` with no checkCommand (its work is the injected
 * body, not a mechanical CLI check); the scheduler leader-gates it like any other task.
 */
export function registerTriageTask(
  config: RoadmapAutoTriageConfig | undefined,
  body: TriageJobBody
): RegisteredTriageTask | null {
  if (!config || !config.enabled || !config.schedule) return null;
  const task: TaskDefinition = {
    id: TRIAGE_TASK_ID,
    type: 'report-only',
    description: 'Score actionable roadmap items and route them (auto-triage)',
    schedule: config.schedule,
    branch: null,
    // No checkCommand/fixSkill: the work is the injected body, dispatched by the phase
    // that owns it — NOT a mechanical check the maintenance runner executes.
    excludeFromHumanSweep: true,
  };
  return { task, body };
}

/**
 * Leader-gate a triage body invocation: run `body` only when the elector grants
 * leadership; a `rejected` claim (a peer is leader) or a failed election no-ops. This is
 * the single-leader guarantee for the on-demand path; the scheduler path gets the same
 * guarantee from MaintenanceScheduler.evaluate()'s own leader claim. Returns whether the
 * body ran. Never throws on a rejected/failed election.
 */
export async function runTriageIfLeader(
  elector: LeaderElector,
  body: TriageJobBody
): Promise<boolean> {
  const result = await elector.electLeader();
  if (!result.ok || result.value !== 'claimed') return false;
  await body();
  return true;
}
