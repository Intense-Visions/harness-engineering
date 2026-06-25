import type { BlockerRef } from '@harness-engineering/types';
import type { OrchestratorSnapshot, RunningAgent, AgentSession } from '../types/orchestrator';

/** Stable lane identifiers, rendered left-to-right in this order. */
export type LaneId = 'queued' | 'in-progress' | 'blocked' | 'done';

/** A single task card on the work-in-flight board. */
export interface KanbanCard {
  issueId: string;
  identifier: string;
  title: string;
  phase: string | null;
  backendName: string | null;
  workspacePath: string | null;
  attempt: number | null;
  startedAt: string | null;
  blockedBy: BlockerRef[];
  /** Human-readable reason a blocked card is blocked, else null. */
  blockerReason: string | null;
  session: AgentSession | null;
}

export interface KanbanLane {
  id: LaneId;
  label: string;
  cards: KanbanCard[];
}

/**
 * Run-attempt phases that indicate the agent is stuck or failing. Every other
 * phase (active work, or transient terminal states like
 * CanceledByReconciliation) routes to the in-progress lane.
 */
const BLOCKED_PHASES = new Set(['RateLimitSleeping', 'Stalled', 'Failed', 'TimedOut']);

const LANE_LABELS: Record<LaneId, string> = {
  queued: 'Queued',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
};

function blockerReasonForPhase(phase: string): string | null {
  if (phase === 'RateLimitSleeping') return 'rate-limited';
  if (phase === 'Stalled') return 'stalled';
  if (phase === 'Failed') return 'failed';
  if (phase === 'TimedOut') return 'timed out';
  return null;
}

function cardFromRunning(agent: RunningAgent, blockerReason: string | null): KanbanCard {
  // `issue`, `workspacePath`, `attempt`, and `startedAt` are required on
  // RunningAgent (they match the wire payload), so no fallback guards are
  // needed — only `session` is nullable.
  const { issue, session } = agent;
  return {
    issueId: agent.issueId,
    identifier: issue.identifier,
    title: issue.title,
    phase: agent.phase,
    backendName: session?.backendName ?? null,
    workspacePath: agent.workspacePath,
    attempt: agent.attempt,
    startedAt: agent.startedAt,
    blockedBy: issue.blockedBy,
    blockerReason,
    session,
  };
}

/** Which lane a running agent belongs to, based on its run-attempt phase. */
function laneForPhase(phase: string): 'in-progress' | 'blocked' {
  return BLOCKED_PHASES.has(phase) ? 'blocked' : 'in-progress';
}

/** A blocked card synthesized from a retry-queue entry. */
function cardFromRetry(entry: {
  issueId: string;
  identifier: string;
  attempt: number;
  error: string | null;
}): KanbanCard {
  const card = idOnlyCard(entry.issueId, entry.error ?? 'awaiting retry', entry.attempt);
  card.identifier = entry.identifier;
  card.title = entry.identifier;
  return card;
}

function idOnlyCard(
  issueId: string,
  blockerReason: string | null,
  attempt: number | null
): KanbanCard {
  return {
    issueId,
    identifier: issueId,
    title: issueId,
    phase: null,
    backendName: null,
    workspacePath: null,
    attempt,
    startedAt: null,
    blockedBy: [],
    blockerReason,
    session: null,
  };
}

/**
 * Derive the four kanban lanes from a point-in-time orchestrator snapshot.
 * Pure: no side effects, deterministic, and independent of React — the page
 * component is a thin renderer over this output.
 */
export function deriveLanes(snapshot: OrchestratorSnapshot): KanbanLane[] {
  const queued: KanbanCard[] = [];
  const inProgress: KanbanCard[] = [];
  const blocked: KanbanCard[] = [];
  const done: KanbanCard[] = [];

  const runningIds = new Set(snapshot.running.map(([id]) => id));
  const retryIds = new Set(snapshot.retryAttempts.map(([id]) => id));

  for (const [, agent] of snapshot.running) {
    // Unknown / transient terminal phases (e.g. CanceledByReconciliation) fall
    // through laneForPhase to in-progress for the brief window they linger.
    const lane = laneForPhase(agent.phase) === 'blocked' ? blocked : inProgress;
    lane.push(cardFromRunning(agent, blockerReasonForPhase(agent.phase)));
  }

  for (const [, entry] of snapshot.retryAttempts) {
    blocked.push(cardFromRetry(entry));
  }

  for (const id of snapshot.claimed) {
    // The orchestrator keeps a failed issue's claim while a retry is pending
    // (state-machine.ts:240), so an id can be in both `claimed` and
    // `retryAttempts`. Exclude retrying ids here or the same task appears in
    // both Queued and Blocked.
    if (!runningIds.has(id) && !retryIds.has(id)) queued.push(idOnlyCard(id, null, null));
  }

  for (const id of snapshot.completed ?? []) {
    done.push(idOnlyCard(id, null, null));
  }

  return [
    { id: 'queued', label: LANE_LABELS.queued, cards: queued },
    { id: 'in-progress', label: LANE_LABELS['in-progress'], cards: inProgress },
    { id: 'blocked', label: LANE_LABELS.blocked, cards: blocked },
    { id: 'done', label: LANE_LABELS.done, cards: done },
  ];
}

/**
 * Identifiers of all in-flight (non-done) cards on the board. Used to mark
 * dependency chips that point at another task currently on the board.
 */
export function indexBoardIdentifiers(lanes: KanbanLane[]): Set<string> {
  const ids = new Set<string>();
  for (const lane of lanes) {
    if (lane.id === 'done') continue;
    for (const card of lane.cards) ids.add(card.identifier);
  }
  return ids;
}
