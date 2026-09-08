import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';
import type { SideEffect } from '../types/events';

/**
 * Reconcile running issues against their current tracker states.
 *
 * For each running issue found in runningStates:
 * - Terminal state -> stop + cleanWorkspace + releaseClaim
 * - Neither active nor terminal -> stop + releaseClaim (no workspace cleanup)
 * - Still active -> no side-effect entries (keep running)
 *
 * Issues not found in runningStates are left running (state refresh may have
 * partially failed; retry next tick per spec).
 */
export function reconcileRunningIssues(
  state: OrchestratorState,
  runningStates: ReadonlyMap<string, Issue>,
  activeStates: string[],
  terminalStates: string[]
): SideEffect[] {
  const sideEffects: SideEffect[] = [];
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
      sideEffects.push({ type: 'stop', issueId, reason: `terminal_state: ${normalizedState}` });
      sideEffects.push({ type: 'cleanWorkspace', issueId, identifier: entry.identifier });
      sideEffects.push({ type: 'releaseClaim', issueId });
    } else if (!normalizedActive.includes(normalizedState)) {
      // Neither active nor terminal: stop, release claim, but keep workspace
      sideEffects.push({
        type: 'stop',
        issueId,
        reason: `non_active_state: ${normalizedState}`,
      });
      sideEffects.push({ type: 'releaseClaim', issueId });
    }
    // Still active: no side-effect entries, keep running
  }

  return sideEffects;
}

/** @deprecated Use `reconcileRunningIssues` instead. */
export const reconcile = reconcileRunningIssues;
