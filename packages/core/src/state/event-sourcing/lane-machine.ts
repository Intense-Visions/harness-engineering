// packages/core/src/state/event-sourcing/lane-machine.ts
//
// Phase 4: the pure task-lane state machine. No IO — mirrors the purity of
// projections/core-state.ts. The transition table + guards here are the single
// source of truth for what lane moves are legal; transition.ts (writer) and the
// manage_state task-transition action compose them before emitting an event.
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type { Lane } from './events';
import { LANES } from './events';

export type { Lane };

/** Terminal lanes admit no outgoing transitions (spec D4). */
export const TERMINAL_LANES: ReadonlySet<Lane> = new Set<Lane>(['done', 'canceled']);
export function isTerminal(lane: Lane): boolean {
  return TERMINAL_LANES.has(lane);
}

const NON_TERMINAL: Lane[] = LANES.filter((l) => !TERMINAL_LANES.has(l));

/** Allowed (non-forced) transitions: from → set of reachable `to` lanes. */
const TABLE: Record<Lane, ReadonlySet<Lane>> = {
  planned: new Set<Lane>(['claimed', 'blocked', 'canceled']),
  claimed: new Set<Lane>(['in_progress', 'blocked', 'canceled']),
  in_progress: new Set<Lane>(['in_review', 'blocked', 'canceled']),
  in_review: new Set<Lane>(['done', 'in_progress', 'blocked', 'canceled']),
  // blocked returns to any non-terminal prior lane (projection supplies the prior).
  blocked: new Set<Lane>(NON_TERMINAL.filter((l) => l !== 'blocked')),
  done: new Set<Lane>(),
  canceled: new Set<Lane>(),
};

export function isAllowedTransition(from: Lane, to: Lane): boolean {
  return TABLE[from].has(to);
}

/**
 * Guard: entering `in_progress` requires every `dependsOn` task to be `done`.
 * Applies only to `in_progress` — all other target lanes pass vacuously. Pure:
 * the caller supplies a `laneOf` lookup over the current lane projection.
 */
export function dependencyGuard(
  to: Lane,
  dependsOn: string[],
  laneOf: (taskId: string) => Lane | undefined
): Result<void, Error> {
  if (to !== 'in_progress') return Ok(undefined);
  const unmet = dependsOn.filter((id) => laneOf(id) !== 'done');
  if (unmet.length > 0)
    return Err(new Error(`dependencyGuard: tasks not done: ${unmet.join(', ')}`));
  return Ok(undefined);
}

/**
 * Guard: entering `done` requires non-empty `evidence` (PR/commit/test refs).
 * All other target lanes pass vacuously. Pure.
 */
export function evidenceGuard(to: Lane, evidence?: string[]): Result<void, Error> {
  if (to !== 'done') return Ok(undefined);
  if (!evidence || evidence.length === 0)
    return Err(new Error('evidenceGuard: entering done requires non-empty evidence'));
  return Ok(undefined);
}

export interface ForceOpts {
  force?: boolean;
  actor?: string;
  reason?: string;
}

/**
 * Guard: an off-table transition is permitted only when `force: true` is set
 * together with both `actor` and `reason` (audit completeness). On-table
 * transitions pass without force. Pure.
 */
export function forceGuard(from: Lane, to: Lane, opts: ForceOpts): Result<void, Error> {
  if (isAllowedTransition(from, to)) return Ok(undefined);
  if (!opts.force)
    return Err(
      new Error(`forceGuard: ${from}→${to} not allowed; set force:true with actor+reason`)
    );
  if (!opts.actor || !opts.reason)
    return Err(new Error('forceGuard: force requires both actor and reason'));
  return Ok(undefined);
}
