/**
 * Roadmap Auto-Triage — shared contracts (Phase 0 foundations).
 *
 * Inert substrate consumed by later phases: the triage record data model +
 * `shapeKey` bucketing (Contract 1), the `PrecedentLookup` seam P1 injects, and
 * the naive entity extractor the scope lever depends on (Contract 4). No feature
 * behavior lives here.
 */

export { shapeKey } from './record.js';
export { aggregatePrecedent, precedentLookupFromRecords } from './precedent.js';
export type {
  TriageRecord,
  TriagePrediction,
  TriageOutcome,
  PrecedentLookup,
  PrecedentRate,
  EscalationCategory,
  RatchetStage,
} from './record.js';
