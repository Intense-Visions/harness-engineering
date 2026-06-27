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

/** Narrow {@link Event} to one variant by its discriminant. */
type EventOf<T extends Event['type']> = Extract<Event, { type: T }>;

/** Mutable fold accumulator. Keyed maps give union semantics + insertion-order iteration. */
interface CoreAcc {
  position: { phase?: string; task?: string };
  decisions: Map<string, { date: string; decision: string; context: string }>;
  blockers: Map<string, { id: string; description: string; status: 'open' | 'resolved' }>;
  progress: Record<string, 'pending' | 'in_progress' | 'complete'>;
  lastSession?: CoreStateProjection['lastSession'];
}

/** Build a `lastSession` value, copying only defined optionals (exactOptionalPropertyTypes). */
function makeLastSession(src: {
  date: string;
  summary: string;
  lastSkill?: string | undefined;
  pendingTasks?: string[] | undefined;
}): NonNullable<CoreStateProjection['lastSession']> {
  const out: NonNullable<CoreStateProjection['lastSession']> = {
    date: src.date,
    summary: src.summary,
  };
  if (src.lastSkill !== undefined) out.lastSkill = src.lastSkill;
  if (src.pendingTasks !== undefined) out.pendingTasks = src.pendingTasks;
  return out;
}

/** Seed the baseline from a `state_imported` genesis event; ignore an unparseable legacyState. */
function applyStateImported(acc: CoreAcc, event: EventOf<'state_imported'>): void {
  const parsed = HarnessStateSchema.safeParse(event.payload.legacyState);
  if (!parsed.success) return;
  const legacy = parsed.data;
  const position: { phase?: string; task?: string } = {};
  if (legacy.position.phase !== undefined) position.phase = legacy.position.phase;
  if (legacy.position.task !== undefined) position.task = legacy.position.task;
  acc.position = position;
  // Legacy decisions carry no id; key them by a stable synthetic seed index.
  legacy.decisions.forEach((d, i) => acc.decisions.set(`__seed__${i}`, { ...d }));
  legacy.blockers.forEach((b) => acc.blockers.set(b.id, { ...b }));
  Object.assign(acc.progress, legacy.progress);
  if (legacy.lastSession) acc.lastSession = makeLastSession(legacy.lastSession);
}

function applyPositionSet(acc: CoreAcc, event: EventOf<'position_set'>): void {
  const next: { phase?: string; task?: string } = {};
  if (event.payload.phase !== undefined) next.phase = event.payload.phase;
  if (event.payload.task !== undefined) next.task = event.payload.task;
  acc.position = next; // last-event-wins overwrite
}

function applyBlockerResolved(acc: CoreAcc, id: string): void {
  const existing = acc.blockers.get(id);
  if (existing) existing.status = 'resolved';
  else acc.blockers.set(id, { id, description: '', status: 'resolved' });
}

function applyDecisionRecorded(acc: CoreAcc, event: EventOf<'decision_recorded'>): void {
  acc.decisions.set(event.payload.id, {
    date: event.timestamp,
    decision: event.payload.text,
    context: event.payload.context ?? '',
  });
}

function applyBlockerOpened(acc: CoreAcc, event: EventOf<'blocker_opened'>): void {
  acc.blockers.set(event.payload.id, {
    id: event.payload.id,
    description: event.payload.description,
    status: 'open',
  });
}

function applyProgressSet(acc: CoreAcc, event: EventOf<'progress_set'>): void {
  acc.progress[event.payload.task] = event.payload.status;
}

function applySessionSummarized(acc: CoreAcc, event: EventOf<'session_summarized'>): void {
  acc.lastSession = makeLastSession({
    ...event.payload,
    date: event.payload.date ?? event.timestamp,
  });
}

// Dispatch table keyed by event type — each handler receives the narrowed event, so the
// per-type branching lives in small handlers rather than one high-complexity fold function.
const CORE_HANDLERS: { [K in Event['type']]?: (acc: CoreAcc, event: EventOf<K>) => void } = {
  state_imported: applyStateImported,
  position_set: applyPositionSet,
  decision_recorded: applyDecisionRecorded,
  blocker_opened: applyBlockerOpened,
  blocker_resolved: (acc, event) => applyBlockerResolved(acc, event.payload.id),
  progress_set: applyProgressSet,
  session_summarized: applySessionSummarized,
};

/** Apply one ordered event to the accumulator (mutating); ignores non-core event types. */
function applyCoreEvent(acc: CoreAcc, event: Event): void {
  const handler = CORE_HANDLERS[event.type] as ((acc: CoreAcc, event: Event) => void) | undefined;
  handler?.(acc, event);
}

/**
 * PURE reducer: folds a core-state event sequence into the legacy projection.
 * Performs no IO. Defensively copies + sorts its input (never mutates it), seeds
 * the baseline from any `state_imported.legacyState` genesis event, then applies
 * events in ascending (seq, writerId) order so the highest-ordered event wins for
 * each scalar field while `decisions`/`blockers` union by id (no append is lost).
 */
export function projectCoreState(events: Event[]): CoreStateProjection {
  const acc: CoreAcc = {
    position: {},
    decisions: new Map(),
    blockers: new Map(),
    progress: {},
  };
  for (const event of [...events].sort(bySeqThenWriter)) applyCoreEvent(acc, event);

  return {
    position: acc.position,
    decisions: Array.from(acc.decisions.values()),
    blockers: Array.from(acc.blockers.values()),
    progress: acc.progress,
    ...(acc.lastSession ? { lastSession: acc.lastSession } : {}),
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
