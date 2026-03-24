import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { SideEffect } from '../types/events';

/**
 * Reconcile running issues against their current tracker states.
 *
 * For each running issue found in runningStates:
 * - Terminal state -> stop + cleanWorkspace + releaseClaim
 * - Neither active nor terminal -> stop + releaseClaim (no workspace cleanup)
 * - Still active -> no effects (keep running)
 *
 * Issues not found in runningStates are left running (state refresh may have
 * partially failed; retry next tick per spec).
 */
export function reconcile(
  state: OrchestratorState,
  runningStates: ReadonlyMap<string, Issue>,
  activeStates: string[],
  terminalStates: string[]
): SideEffect[] {
  const effects: SideEffect[] = [];
  const normalizedActive = activeStates.map((s) => s.toLowerCase());
  const normalizedTerminal = terminalStates.map((s) => s.toLowerCase());

  for (const [issueId, entry] of state.running) {
    const currentIssue = runningStates.get(issueId);
    if (!currentIssue) {
      // Not in refresh results -- keep running, retry next tick
      continue;
    }

    const normalizedState = currentIssue.state.toLowerCase();

    if (normalizedTerminal.includes(normalizedState)) {
      // Terminal: stop, clean workspace, release claim
      effects.push({ type: 'stop', issueId, reason: `terminal_state: ${normalizedState}` });
      effects.push({ type: 'cleanWorkspace', issueId, identifier: entry.identifier });
      effects.push({ type: 'releaseClaim', issueId });
    } else if (!normalizedActive.includes(normalizedState)) {
      // Neither active nor terminal: stop, release claim, but keep workspace
      effects.push({ type: 'stop', issueId, reason: `non_active_state: ${normalizedState}` });
      effects.push({ type: 'releaseClaim', issueId });
    }
    // Still active: no effects, keep running
  }

  return effects;
}
