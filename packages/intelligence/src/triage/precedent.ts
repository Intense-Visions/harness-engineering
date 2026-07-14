// packages/intelligence/src/triage/precedent.ts
//
// Roadmap Auto-Triage — Phase 0, Contract 1 (aggregation half): the precedent lever.
//
// A pure aggregation over triage records: for a given `shapeKey`, the autonomous-
// success base-rate = matched / total, counted ONLY over records with a populated
// `outcome` (a graded record). Absent history for a shape ⇒ `unknown` (the P1
// degrade-empty path) — never a block on emptiness. This is the real PrecedentLookup
// Phase 4 wires; Phase 1 uses the empty path at cold-start.
//
// Layer note: pure over the intelligence-layer TriageRecord. No IO, no core import —
// the storage/read half lives in core's event-sourcing store; this consumes the
// materialized records.

import type { TriageRecord, PrecedentRate, PrecedentLookup } from './record.js';

/**
 * Base-rate for a single shape over the supplied records. Counts only outcome-bearing
 * records matching `shapeKey`; returns `unknown` when there are none (cold-start).
 */
export function aggregatePrecedent(
  records: readonly TriageRecord[],
  shapeKey: string
): PrecedentRate {
  let matched = 0;
  let total = 0;
  for (const rec of records) {
    if (rec.shapeKey !== shapeKey) continue;
    if (!rec.outcome) continue; // only graded records count toward precedent
    total += 1;
    if (rec.outcome.matched) matched += 1;
  }
  if (total === 0) return { kind: 'unknown' };
  return { kind: 'rate', matched, total, rate: matched / total };
}

/**
 * Build a {@link PrecedentLookup} backed by a fixed record set — the real precedent
 * lever Phase 4 injects once outcomes exist. With no outcome-bearing records for a
 * shape it returns `unknown`, so an empty set yields the Phase-1 cold-start behavior
 * for every shape.
 */
export function precedentLookupFromRecords(records: readonly TriageRecord[]): PrecedentLookup {
  return {
    rateForShape: (shapeKey: string): PrecedentRate => aggregatePrecedent(records, shapeKey),
  };
}
