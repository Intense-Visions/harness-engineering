// packages/core/src/state/event-sourcing/transition.ts
//
// Phase 4: the lane writers (IO). registerTask + transitionLane are the only
// place lane events are emitted from core. transitionLane composes the pure
// guards (lane-machine.ts) against the current projection before appending, so
// an illegal transition returns Err and emits nothing.
import type { Result } from '../../shared/result';
import { Err } from '../../shared/result';
import { emitEvent, loadEvents, type EventLogOptions, type EmitResult } from './log';
import type { LaneTransitionedInput } from './events';
import { projectLanes } from './projections/lanes';
import { checkTransition, type Lane, type TransitionOpts } from './lane-machine';

/** Emit a task_registered event (idempotent baseline; refreshes dependsOn). */
export async function registerTask(
  projectPath: string,
  taskId: string,
  dependsOn: string[] = [],
  options?: EventLogOptions
): Promise<Result<EmitResult, Error>> {
  return emitEvent(
    projectPath,
    { type: 'task_registered', payload: { taskId, dependsOn } },
    options
  );
}

/**
 * Guarded lane writer: load the current projection, run checkTransition against
 * the task's current lane + deps, and only on Ok emit a lane_transitioned event.
 * Returns Err (emitting nothing) when the task is unregistered or a guard rejects.
 */
export async function transitionLane(
  projectPath: string,
  taskId: string,
  toLane: Lane,
  opts: TransitionOpts = {},
  options?: EventLogOptions
): Promise<Result<EmitResult, Error>> {
  const loaded = await loadEvents(projectPath, options);
  if (!loaded.ok) return loaded;
  const lanes = projectLanes(loaded.value);
  const rec = lanes.tasks[taskId];
  if (!rec) return Err(new Error(`transitionLane: task not registered: ${taskId}`));
  const laneOf = (id: string): Lane | undefined => lanes.tasks[id]?.lane;
  const check = checkTransition(rec.lane, toLane, rec.dependsOn, laneOf, opts);
  if (!check.ok) return check;
  const payload: LaneTransitionedInput = {
    taskId,
    from: rec.lane,
    to: toLane,
    ...(opts.force !== undefined ? { force: opts.force } : {}),
    ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
    ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
    ...(opts.evidence !== undefined ? { evidence: opts.evidence } : {}),
  };
  return emitEvent(projectPath, { type: 'lane_transitioned', payload }, options);
}
