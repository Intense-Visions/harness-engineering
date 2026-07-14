// packages/core/src/state/event-sourcing/triage.ts
//
// Roadmap Auto-Triage — Phase 0, Contract 1 (storage half): the outcome-log store.
//
// Append-only triage record store built on the event-sourced substrate (log.ts),
// NOT a bespoke DB — replay-safe and concurrency-safe for free, mirroring the lane
// writers in transition.ts. One record per roadmap item accretes across separate
// appends keyed by `externalId`:
//   - recordTriagePrediction → `triage_predicted` (Phase 3, at dispatch)
//   - recordTriageOutcome    → `triage_outcome`   (Phase 4, at retrospective)
// projectTriageRecords folds the log into per-item StoredTriageRecords; a later
// append for the same `externalId` overwrites that slice (last-writer-wins in the
// deterministic (seq, writerId) order loadEvents already guarantees).
//
// The pure precedent aggregation (`aggregatePrecedent`) lives in the intelligence
// layer over the semantic TriageRecord — core cannot import intelligence. This
// module owns only the IO + the projection into the storage shape.
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import { emitEvent, loadEvents, type EventLogOptions, type EmitResult } from './log';
import type { Event, TriagePredictedInput, TriageOutcomeInput } from './events';

/** The stored verdict slice (structural mirror of intelligence's ComplexityVerdict). */
export interface StoredVerdict {
  level: 'trivial' | 'simple' | 'moderate' | 'complex';
  confidence: 'high' | 'medium' | 'low';
  signals: Record<string, number | boolean | string>;
  source: 'static' | 'llm-tiebreak' | 'escalated';
}

/** The stored prediction slice (Phase 3). */
export interface StoredPrediction {
  verdict: StoredVerdict;
  levers: Record<string, unknown>;
  scopeEstimate: number;
  ratchetStage: 1 | 2 | 3 | 4;
}

/** The stored outcome slice (Phase 4). */
export interface StoredOutcome {
  actual: StoredVerdict;
  exceededBy: number;
  matched: boolean;
}

/**
 * A triage record as materialized from the log. `prediction`/`outcome` are present
 * only once their owning phase has appended; a record with a populated `outcome` is
 * a graded, precedent-eligible record. `ts` is the timestamp of the latest slice in
 * (seq, writerId) fold order (not necessarily the max wall-clock time) — it tracks the
 * last-writer-wins slice, so a slice appended later in the deterministic log order stamps
 * `ts` even if its wall-clock timestamp is earlier than an already-folded slice.
 */
export interface StoredTriageRecord {
  externalId: string;
  shapeKey: string;
  prediction?: StoredPrediction;
  outcome?: StoredOutcome;
  ts: string;
}

/** Emit a `triage_predicted` event (Phase 3 writes the prediction slice at dispatch). */
export async function recordTriagePrediction(
  projectPath: string,
  payload: TriagePredictedInput,
  options?: EventLogOptions
): Promise<Result<EmitResult, Error>> {
  return emitEvent(projectPath, { type: 'triage_predicted', payload }, options);
}

/** Emit a `triage_outcome` event (Phase 4 writes the graded outcome slice). */
export async function recordTriageOutcome(
  projectPath: string,
  payload: TriageOutcomeInput,
  options?: EventLogOptions
): Promise<Result<EmitResult, Error>> {
  return emitEvent(projectPath, { type: 'triage_outcome', payload }, options);
}

type EventOf<T extends Event['type']> = Extract<Event, { type: T }>;

/**
 * Pure fold: reduce triage events into per-`externalId` records. Input is assumed to
 * already be in the deterministic (seq, writerId) order loadEvents returns; the last
 * append for a given item's slice wins. Non-triage events are ignored. Performs no IO.
 */
export function projectTriageRecords(events: readonly Event[]): StoredTriageRecord[] {
  const byId = new Map<string, StoredTriageRecord>();
  const seed = (externalId: string, shapeKey: string, ts: string): StoredTriageRecord => {
    const existing = byId.get(externalId);
    if (existing) {
      existing.shapeKey = shapeKey; // latest slice's shapeKey wins
      existing.ts = ts;
      return existing;
    }
    const created: StoredTriageRecord = { externalId, shapeKey, ts };
    byId.set(externalId, created);
    return created;
  };
  for (const event of events) {
    if (event.type === 'triage_predicted') {
      const e = event as EventOf<'triage_predicted'>;
      const rec = seed(e.payload.externalId, e.payload.shapeKey, e.timestamp);
      rec.prediction = {
        verdict: e.payload.verdict,
        levers: e.payload.levers,
        scopeEstimate: e.payload.scopeEstimate,
        ratchetStage: e.payload.ratchetStage,
      };
    } else if (event.type === 'triage_outcome') {
      const e = event as EventOf<'triage_outcome'>;
      const rec = seed(e.payload.externalId, e.payload.shapeKey, e.timestamp);
      rec.outcome = {
        actual: e.payload.actual,
        exceededBy: e.payload.exceededBy,
        matched: e.payload.matched,
      };
    }
  }
  return Array.from(byId.values());
}

/** Read-back: load the event log and project it into triage records (IO). */
export async function loadTriageRecords(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<StoredTriageRecord[], Error>> {
  const loaded = await loadEvents(projectPath, options);
  if (!loaded.ok) return loaded;
  return Ok(projectTriageRecords(loaded.value));
}
