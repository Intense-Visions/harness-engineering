// packages/core/src/state/event-sourcing/projections/lanes.ts
//
// Phase 4: pure fold of lane events (task_registered + lane_transitioned) into a
// per-task lane projection. Mirrors core-state.ts: defensively copies + sorts its
// input by (seq, writerId), performs no IO, and is order-independent.
import type { Event, Lane } from '../events';

export interface LaneHistoryEntry {
  from: Lane;
  to: Lane;
  seq: number;
  timestamp: string;
  force?: boolean;
  actor?: string;
  reason?: string;
  evidence?: string[];
}
export interface LaneRecord {
  taskId: string;
  lane: Lane;
  dependsOn: string[];
  history: LaneHistoryEntry[];
}
export interface LanesProjection {
  tasks: Record<string, LaneRecord>;
}

/** Deterministic total order: (seq asc, writerId asc) — identical to loadEvents. */
function bySeqThenWriter(a: Event, b: Event): number {
  return a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0);
}

type EventOf<T extends Event['type']> = Extract<Event, { type: T }>;

/** `task_registered`: seed a task at `planned`, or refresh `dependsOn` if it exists. */
function applyRegister(tasks: Record<string, LaneRecord>, event: EventOf<'task_registered'>): void {
  const { taskId, dependsOn } = event.payload;
  const existing = tasks[taskId];
  if (existing) existing.dependsOn = [...dependsOn];
  else tasks[taskId] = { taskId, lane: 'planned', dependsOn: [...dependsOn], history: [] };
}

/** Build a history entry, copying only defined optionals (exactOptionalPropertyTypes). */
function buildHistoryEntry(event: EventOf<'lane_transitioned'>): LaneHistoryEntry {
  const { from, to, force, actor, reason, evidence } = event.payload;
  const entry: LaneHistoryEntry = { from, to, seq: event.seq, timestamp: event.timestamp };
  if (force !== undefined) entry.force = force;
  if (actor !== undefined) entry.actor = actor;
  if (reason !== undefined) entry.reason = reason;
  if (evidence !== undefined) entry.evidence = evidence;
  return entry;
}

/** `lane_transitioned`: append a history entry and advance the current lane to `to`. */
function applyTransition(
  tasks: Record<string, LaneRecord>,
  event: EventOf<'lane_transitioned'>
): void {
  const { taskId, from, to } = event.payload;
  const rec = tasks[taskId] ?? { taskId, lane: from, dependsOn: [], history: [] };
  rec.history.push(buildHistoryEntry(event));
  rec.lane = to;
  tasks[taskId] = rec;
}

/**
 * Fold lane events into `{ tasks }`. `task_registered` seeds (or refreshes the
 * `dependsOn` of) a task at `planned`; `lane_transitioned` appends a history entry
 * and advances the current lane to `to`. The highest-ordered transition wins.
 */
export function projectLanes(events: Event[]): LanesProjection {
  const tasks: Record<string, LaneRecord> = {};
  for (const event of [...events].sort(bySeqThenWriter)) {
    if (event.type === 'task_registered') applyRegister(tasks, event);
    else if (event.type === 'lane_transitioned') applyTransition(tasks, event);
  }
  return { tasks };
}
