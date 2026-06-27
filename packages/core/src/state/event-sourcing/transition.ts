// packages/core/src/state/event-sourcing/transition.ts
//
// Phase 4: the lane writers (IO). registerTask + transitionLane are the only
// place lane events are emitted from core. transitionLane composes the pure
// guards (lane-machine.ts) against the current projection before appending, so
// an illegal transition returns Err and emits nothing.
import type { Result } from '../../shared/result';
import { emitEvent, type EventLogOptions, type EmitResult } from './log';

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
