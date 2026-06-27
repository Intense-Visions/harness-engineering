// packages/core/src/state/event-sourcing/lane-machine.ts
//
// Phase 4: the pure task-lane state machine. No IO — mirrors the purity of
// projections/core-state.ts. The transition table + guards here are the single
// source of truth for what lane moves are legal; transition.ts (writer) and the
// manage_state task-transition action compose them before emitting an event.
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
