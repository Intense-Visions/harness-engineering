/**
 * Shared presentation helpers for orchestrator run-attempt phases.
 *
 * Intended as the single source of phase colors so surfaces render phases
 * consistently. The Work-in-Flight kanban consumes these; the Orchestrator
 * monitor still has its own inline map and is a candidate to migrate here.
 */

/** Tailwind class pairs (background + text) per run-attempt phase. */
export const PHASE_COLORS: Record<string, string> = {
  PreparingWorkspace: 'bg-yellow-900/50 text-yellow-400',
  BuildingPrompt: 'bg-yellow-900/50 text-yellow-400',
  LaunchingAgent: 'bg-blue-900/50 text-blue-400',
  InitializingSession: 'bg-blue-900/50 text-blue-400',
  StreamingTurn: 'bg-emerald-900/50 text-emerald-400',
  RateLimitSleeping: 'bg-orange-900/50 text-orange-400',
  Finishing: 'bg-purple-900/50 text-purple-400',
  Succeeded: 'bg-emerald-900/50 text-emerald-300',
  Failed: 'bg-red-900/50 text-red-400',
  TimedOut: 'bg-red-900/50 text-red-400',
  Stalled: 'bg-orange-900/50 text-orange-400',
  CanceledByReconciliation: 'bg-gray-800 text-gray-400',
};

/** Resolve the badge classes for a phase, falling back to a neutral gray. */
export function phaseColor(phase: string): string {
  return PHASE_COLORS[phase] ?? 'bg-gray-800 text-gray-400';
}

/**
 * Human-readable elapsed time between an ISO start timestamp and `nowMs`.
 * A start in the future clamps to `0s`.
 */
export function formatElapsed(startedAt: string, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
