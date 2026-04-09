import type { Issue } from '@harness-engineering/types';
import type { OrchestratorState } from '../types/internal';

function comparePriority(a: Issue, b: Issue): number | null {
  const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
  const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
  return pa !== pb ? pa - pb : null;
}

function compareCreatedAt(a: Issue, b: Issue): number | null {
  const ca = a.createdAt ?? '\uffff';
  const cb = b.createdAt ?? '\uffff';
  if (ca === cb) return null;
  return ca < cb ? -1 : 1;
}

/**
 * Sort candidates by dispatch priority (stable sort).
 * 1. priority ascending (1..4 preferred; null sorts last)
 * 2. createdAt oldest first (null sorts last)
 * 3. identifier lexicographic tie-breaker
 */
export function sortCandidates(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    return (
      comparePriority(a, b) ??
      compareCreatedAt(a, b) ??
      a.identifier.localeCompare(b.identifier)
    );
  });
}

/**
 * Check if a single issue is dispatch-eligible.
 * State comparisons are case-insensitive.
 */
export function isEligible(
  issue: Issue,
  state: OrchestratorState,
  activeStates: string[],
  terminalStates: string[]
): boolean {
  // Must have required fields
  if (!issue.id || !issue.identifier || !issue.title || !issue.state) {
    return false;
  }

  const normalizedState = issue.state.toLowerCase();
  const normalizedActive = activeStates.map((s) => s.toLowerCase());
  const normalizedTerminal = terminalStates.map((s) => s.toLowerCase());

  // State must be active and not terminal
  if (!normalizedActive.includes(normalizedState)) {
    return false;
  }
  if (normalizedTerminal.includes(normalizedState)) {
    return false;
  }

  // Not already claimed or running
  if (state.claimed.has(issue.id)) {
    return false;
  }
  if (state.running.has(issue.id)) {
    return false;
  }

  // Blocker rule for Todo state: block if any blocker is non-terminal
  if (normalizedState === 'todo' && issue.blockedBy.length > 0) {
    const hasNonTerminalBlocker = issue.blockedBy.some((blocker) => {
      if (blocker.state === null) return true; // Unknown state = non-terminal
      return !normalizedTerminal.includes(blocker.state.toLowerCase());
    });
    if (hasNonTerminalBlocker) {
      return false;
    }
  }

  return true;
}

/**
 * Select and sort eligible candidates from a list of issues.
 */
export function selectCandidates(
  issues: readonly Issue[],
  state: OrchestratorState,
  activeStates: string[],
  terminalStates: string[]
): Issue[] {
  const sorted = sortCandidates(issues);
  return sorted.filter((issue) => isEligible(issue, state, activeStates, terminalStates));
}
