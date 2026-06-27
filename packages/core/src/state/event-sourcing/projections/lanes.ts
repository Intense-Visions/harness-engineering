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

/**
 * Fold lane events into `{ tasks }`. `task_registered` seeds (or refreshes the
 * `dependsOn` of) a task at `planned`; `lane_transitioned` appends a history entry
 * and advances the current lane to `to`. The highest-ordered transition wins.
 */
export function projectLanes(events: Event[]): LanesProjection {
  const sorted = [...events].sort(bySeqThenWriter);
  const tasks: Record<string, LaneRecord> = {};
  for (const event of sorted) {
    if (event.type === 'task_registered') {
      const { taskId, dependsOn } = event.payload;
      const existing = tasks[taskId];
      if (existing) existing.dependsOn = [...dependsOn];
      else tasks[taskId] = { taskId, lane: 'planned', dependsOn: [...dependsOn], history: [] };
    } else if (event.type === 'lane_transitioned') {
      const { taskId, from, to } = event.payload;
      const rec = tasks[taskId] ?? { taskId, lane: from, dependsOn: [], history: [] };
      const entry: LaneHistoryEntry = { from, to, seq: event.seq, timestamp: event.timestamp };
      if (event.payload.force !== undefined) entry.force = event.payload.force;
      if (event.payload.actor !== undefined) entry.actor = event.payload.actor;
      if (event.payload.reason !== undefined) entry.reason = event.payload.reason;
      if (event.payload.evidence !== undefined) entry.evidence = event.payload.evidence;
      rec.history.push(entry);
      rec.lane = to;
      tasks[taskId] = rec;
    }
  }
  return { tasks };
}
