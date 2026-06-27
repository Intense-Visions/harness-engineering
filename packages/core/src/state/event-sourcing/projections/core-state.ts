// packages/core/src/state/event-sourcing/projections/core-state.ts
import type { Event } from '../events';
import { HarnessStateSchema, type HarnessState } from '../../types';

/**
 * The legacy-shaped core-state view derived from the event log. Mirrors the
 * authoritative fields of {@link HarnessState} (sans `schemaVersion`) so the
 * {@link toHarnessState} bridge can hand existing `loadState` callers an
 * unchanged shape during the additive Phase 2 rollout.
 */
export interface CoreStateProjection {
  position: { phase?: string; task?: string };
  decisions: Array<{ date: string; decision: string; context: string }>;
  blockers: Array<{ id: string; description: string; status: 'open' | 'resolved' }>;
  progress: Record<string, 'pending' | 'in_progress' | 'complete'>;
  lastSession?: { date: string; summary: string; lastSkill?: string; pendingTasks?: string[] };
}

/**
 * Deterministic total order over events: (seq asc, writerId asc). Identical to
 * the comparator {@link loadEvents} applies, so an already-sorted log is a fixed
 * point and `projectCoreState` is order-independent for any caller-supplied array.
 */
function bySeqThenWriter(a: Event, b: Event): number {
  return a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0);
}

/**
 * PURE reducer: folds a core-state event sequence into the legacy projection.
 * Performs no IO. Defensively copies + sorts its input (never mutates it), seeds
 * the baseline from any `state_imported.legacyState` genesis event, then applies
 * events in ascending (seq, writerId) order so the highest-ordered event wins for
 * each scalar field while `decisions`/`blockers` union by id (no append is lost).
 */
export function projectCoreState(events: Event[]): CoreStateProjection {
  const sorted = [...events].sort(bySeqThenWriter);

  let position: { phase?: string; task?: string } = {};
  // Keyed maps preserve union semantics (decisions/blockers keyed by id) and
  // deterministic iteration order (insertion order).
  const decisions = new Map<string, { date: string; decision: string; context: string }>();
  const blockers = new Map<
    string,
    { id: string; description: string; status: 'open' | 'resolved' }
  >();
  const progress: Record<string, 'pending' | 'in_progress' | 'complete'> = {};
  let lastSession: CoreStateProjection['lastSession'];

  for (const event of sorted) {
    switch (event.type) {
      case 'state_imported': {
        // Forward-compatible genesis seed (the event itself is emitted in Phase 3).
        // Loosely validate; ignore an unparseable legacyState rather than throwing.
        const parsed = HarnessStateSchema.safeParse(event.payload.legacyState);
        if (!parsed.success) break;
        const legacy = parsed.data;
        // Construct field-by-field (not spread) to satisfy exactOptionalPropertyTypes.
        position = {};
        if (legacy.position.phase !== undefined) position.phase = legacy.position.phase;
        if (legacy.position.task !== undefined) position.task = legacy.position.task;
        // Legacy decisions carry no id; key them by a stable synthetic seed index.
        legacy.decisions.forEach((d, i) => decisions.set(`__seed__${i}`, { ...d }));
        legacy.blockers.forEach((b) => blockers.set(b.id, { ...b }));
        Object.assign(progress, legacy.progress);
        if (legacy.lastSession) {
          const seed: NonNullable<CoreStateProjection['lastSession']> = {
            date: legacy.lastSession.date,
            summary: legacy.lastSession.summary,
          };
          if (legacy.lastSession.lastSkill !== undefined)
            seed.lastSkill = legacy.lastSession.lastSkill;
          if (legacy.lastSession.pendingTasks !== undefined)
            seed.pendingTasks = legacy.lastSession.pendingTasks;
          lastSession = seed;
        }
        break;
      }
      case 'position_set': {
        // Overwrite (last-event-wins). Vestigial `position` string is ignored (DP1).
        const next: { phase?: string; task?: string } = {};
        if (event.payload.phase !== undefined) next.phase = event.payload.phase;
        if (event.payload.task !== undefined) next.task = event.payload.task;
        position = next;
        break;
      }
      case 'decision_recorded': {
        decisions.set(event.payload.id, {
          date: event.timestamp,
          decision: event.payload.text,
          context: event.payload.context ?? '',
        });
        break;
      }
      case 'blocker_opened': {
        blockers.set(event.payload.id, {
          id: event.payload.id,
          description: event.payload.description,
          status: 'open',
        });
        break;
      }
      case 'blocker_resolved': {
        const existing = blockers.get(event.payload.id);
        if (existing) existing.status = 'resolved';
        else
          blockers.set(event.payload.id, {
            id: event.payload.id,
            description: '',
            status: 'resolved',
          });
        break;
      }
      case 'progress_set': {
        progress[event.payload.task] = event.payload.status;
        break;
      }
      case 'session_summarized': {
        const next: NonNullable<CoreStateProjection['lastSession']> = {
          date: event.payload.date ?? event.timestamp,
          summary: event.payload.summary,
        };
        if (event.payload.lastSkill !== undefined) next.lastSkill = event.payload.lastSkill;
        if (event.payload.pendingTasks !== undefined)
          next.pendingTasks = event.payload.pendingTasks;
        lastSession = next;
        break;
      }
    }
  }

  return {
    position,
    decisions: Array.from(decisions.values()),
    blockers: Array.from(blockers.values()),
    progress,
    ...(lastSession ? { lastSession } : {}),
  };
}

/**
 * Legacy bridge: lift a {@link CoreStateProjection} into the exact {@link HarnessState}
 * shape that existing `loadState`/`saveState` callers expect (so Phase 3 can swap the
 * read path without touching them). The result satisfies `HarnessStateSchema.parse`.
 */
export function toHarnessState(core: CoreStateProjection): HarnessState {
  return {
    schemaVersion: 1,
    position: core.position,
    decisions: core.decisions,
    blockers: core.blockers,
    progress: core.progress,
    ...(core.lastSession ? { lastSession: core.lastSession } : {}),
  };
}
