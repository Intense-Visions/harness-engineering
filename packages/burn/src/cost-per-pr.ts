import type { LinkResult } from './pr-linkage';
import type { ProvenanceEntry } from './provenance';
import type { UsageRecord } from './types';
import { units } from './units';

/** Raw token counts, snake_cased to match burn's on-disk / summary vocabulary. */
export interface TokenTotals {
  tokens_in: number;
  tokens_out: number;
  cache_read: number;
  /** Kept for completeness; deliberately not part of the cost headline. */
  cache_write: number;
}

/** Per-skill (burn `agent` label) cost roll-up. */
export interface SkillCost extends TokenTotals {
  skill: string;
  /** Distinct non-empty `agentId`s that ran under this skill. */
  lanes: number;
  /** Weighted units spent under this skill. */
  units: number;
  /** units / (fleet-wide merged PRs). `null` when no merged PR was linked. */
  cost_per_merged_pr: number | null;
  /** units / (this skill's dispatched lanes). `null` when this skill ran no lane. */
  cost_per_dispatched_lane: number | null;
}

/** Per-lane (burn `agentId`) cost roll-up. */
export interface LaneCost extends TokenTotals {
  lane_id: string;
  skill: string;
  units: number;
  /** Merged PRs tied to this lane via a provenance `laneId` match. 0 when unlinked. */
  prs_merged: number;
  /** `linked` only when a provenance `laneId` matched AND it had merged PRs. */
  attribution: 'linked' | 'unattributed';
}

/** Optional per-model price table (USD per token). Absent ⇒ no `$` figure. */
export type PriceTable = Record<string, { in: number; out: number; cache_read: number }>;

/** Optional per-skill expected cost/PR band. */
export interface CostBand {
  min?: number;
  max: number;
}

export interface CostReport {
  window: { since: string | null; until: string | null };
  totals: TokenTotals & {
    units: number;
    prs_merged: number;
    dispatched_lanes: number;
    cost_per_merged_pr: number | null;
    cost_per_dispatched_lane: number | null;
  };
  by_skill: SkillCost[];
  by_lane: LaneCost[];
  /** Spells out both denominators so no figure is a silent success-only number. */
  denominator_note: string;
  /** Present only when a price table was supplied. */
  pricing?: { models_priced: number; usd_total: number; usd_per_merged_pr: number | null };
  /** True when subagent spend was seen but no lane could be linked to a PR. */
  degraded: boolean;
}

export interface CostBandFinding {
  skill: string;
  cost_per_merged_pr: number;
  band: CostBand;
  direction: 'above' | 'below';
}

export interface BuildCostReportInput {
  records: Iterable<UsageRecord>;
  provenance: ProvenanceEntry[];
  linkage: Map<string, LinkResult>;
  priceTable?: PriceTable;
  window?: { since?: string; until?: string };
}

/** Labels that are not fleet-lane skill spend and never carry a cost/PR. */
const NON_SKILL_LABELS = new Set(['main', 'unattributed', 'pre-migration']);

interface Bucket extends TokenTotals {
  units: number;
  lanes: Set<string>;
}

function emptyBucket(): Bucket {
  return { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0, units: 0, lanes: new Set() };
}

function addRecord(bucket: Bucket, rec: UsageRecord): void {
  bucket.tokens_in += rec.in;
  bucket.tokens_out += rec.out;
  bucket.cache_read += rec.cacheRead;
  bucket.cache_write += rec.cacheWrite;
  bucket.units += units(rec.out, rec.in, rec.cacheWrite, rec.cacheRead);
  if (rec.agentId) bucket.lanes.add(rec.agentId);
}

/** A parsed [since, until] window; NaN bound means "unbounded on that side". */
function parseBounds(since?: string, until?: string): { lo: number; hi: number } {
  return {
    lo: since ? Date.parse(since) : NaN,
    hi: until ? Date.parse(until) : NaN,
  };
}

function inWindow(ts: string, bounds: { lo: number; hi: number }): boolean {
  if (Number.isNaN(bounds.lo) && Number.isNaN(bounds.hi)) return true;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  if (Number.isFinite(bounds.lo) && t < bounds.lo) return false;
  return !(Number.isFinite(bounds.hi) && t > bounds.hi);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round(numerator / denominator) : null;
}

/** Union of every merged PR number across all linked provenance entries. */
function collectMergedPrs(linkage: Map<string, LinkResult>): Set<number> {
  const prs = new Set<number>();
  for (const result of linkage.values()) {
    if (result.ok) for (const pr of result.mergedPrs) prs.add(pr);
  }
  return prs;
}

/** Per-lane PR counts, keyed by the burn lane id a provenance `laneId` matched. */
function laneToMergedPrs(
  provenance: ProvenanceEntry[],
  linkage: Map<string, LinkResult>
): Map<string, number> {
  const byLane = new Map<string, number>();
  for (const entry of provenance) {
    if (!entry.laneId) continue;
    const result = linkage.get(entry.slug);
    if (result?.ok && result.mergedPrs.length > 0) {
      byLane.set(entry.laneId, (byLane.get(entry.laneId) ?? 0) + result.mergedPrs.length);
    }
  }
  return byLane;
}

/**
 * USD cost of a single usage record under a price table. Returns `0` for a model
 * with no table entry — the single multiply-add reused by the cost-per-PR report
 * and the burn summary's dollar-cost reconciliation so the token→USD arithmetic
 * lives in exactly one place. Tokens remain the source of truth; this is derived.
 */
export function priceRecord(rec: UsageRecord, table: PriceTable): number {
  const price = table[rec.model];
  if (!price) return 0;
  return rec.in * price.in + rec.out * price.out + rec.cacheRead * price.cache_read;
}

function priceRecords(records: UsageRecord[], table: PriceTable): { usd: number; priced: number } {
  let usd = 0;
  const models = new Set<string>();
  for (const rec of records) {
    if (!table[rec.model]) continue;
    models.add(rec.model);
    usd += priceRecord(rec, table);
  }
  return { usd, priced: models.size };
}

function tokenTotals(b: Bucket): TokenTotals {
  return {
    tokens_in: b.tokens_in,
    tokens_out: b.tokens_out,
    cache_read: b.cache_read,
    cache_write: b.cache_write,
  };
}

interface Folded {
  perSkill: Map<string, Bucket>;
  perLane: Map<string, { bucket: Bucket; skill: string }>;
  attributed: Bucket;
  dispatchedLanes: Set<string>;
}

/** Fold the kept records into per-skill, per-lane, and attributed buckets. */
function foldRecords(kept: UsageRecord[]): Folded {
  const perSkill = new Map<string, Bucket>();
  const perLane = new Map<string, { bucket: Bucket; skill: string }>();
  const attributed = emptyBucket();
  const dispatchedLanes = new Set<string>();

  for (const rec of kept) {
    const skill = perSkill.get(rec.agent) ?? emptyBucket();
    addRecord(skill, rec);
    perSkill.set(rec.agent, skill);

    if (rec.agentId) {
      dispatchedLanes.add(rec.agentId);
      const lane = perLane.get(rec.agentId) ?? { bucket: emptyBucket(), skill: rec.agent };
      addRecord(lane.bucket, rec);
      perLane.set(rec.agentId, lane);
    }
    if (!NON_SKILL_LABELS.has(rec.agent)) addRecord(attributed, rec);
  }
  return { perSkill, perLane, attributed, dispatchedLanes };
}

function toSkillRows(perSkill: Map<string, Bucket>, mergedCount: number): SkillCost[] {
  return [...perSkill.entries()]
    .filter(([label]) => !NON_SKILL_LABELS.has(label))
    .map(([skill, b]) => ({
      skill,
      ...tokenTotals(b),
      lanes: b.lanes.size,
      units: Math.round(b.units),
      cost_per_merged_pr: ratio(b.units, mergedCount),
      cost_per_dispatched_lane: ratio(b.units, b.lanes.size),
    }))
    .sort((a, b) => b.units - a.units);
}

function toLaneRows(
  perLane: Map<string, { bucket: Bucket; skill: string }>,
  laneMerged: Map<string, number>
): LaneCost[] {
  return [...perLane.entries()]
    .map(([laneId, { bucket, skill }]) => {
      const prsMerged = laneMerged.get(laneId) ?? 0;
      return {
        lane_id: laneId,
        skill,
        ...tokenTotals(bucket),
        units: Math.round(bucket.units),
        prs_merged: prsMerged,
        attribution: prsMerged > 0 ? ('linked' as const) : ('unattributed' as const),
      };
    })
    .sort((a, b) => b.units - a.units);
}

function denominatorNote(mergedCount: number, dispatched: number, lanesWithNoPr: number): string {
  return (
    `Attributed lane spend divided by ${mergedCount} merged PR(s) ` +
    `[cost_per_merged_pr] and by ${dispatched} dispatched lane(s) ` +
    `[cost_per_dispatched_lane]. ${lanesWithNoPr} lane(s) have no linked merged PR ` +
    `(counted in the lane denominator, not the merged-PR denominator).`
  );
}

/** Filter an incoming record stream down to those inside the [since, until] window. */
function keepInWindow(
  records: Iterable<UsageRecord>,
  since?: string,
  until?: string
): UsageRecord[] {
  const bounds = parseBounds(since, until);
  const kept: UsageRecord[] = [];
  for (const rec of records) {
    if (!rec.ts || inWindow(rec.ts, bounds)) kept.push(rec);
  }
  return kept;
}

function buildPricing(
  kept: UsageRecord[],
  table: PriceTable,
  mergedCount: number
): NonNullable<CostReport['pricing']> {
  const { usd, priced } = priceRecords(
    kept.filter((r) => !NON_SKILL_LABELS.has(r.agent)),
    table
  );
  return {
    models_priced: priced,
    usd_total: usd,
    usd_per_merged_pr: mergedCount > 0 ? usd / mergedCount : null,
  };
}

/**
 * Join burn's per-lane / per-skill token attribution to the merged PRs its
 * lanes produced, and emit a denominator-explicit cost report.
 *
 * The numerator is fleet-lane spend (records whose label is a real skill, not
 * `main` / `unattributed` / `pre-migration`); the two denominators — merged PRs
 * (from provenance + `gh`) and dispatched lanes (distinct `agentId`) — are
 * carried side by side, never collapsed into one "cost per PR" that hides which
 * was used. Missing linkage degrades a lane to `unattributed`; it is never
 * counted as a lane that shipped for free.
 */
export function buildCostReport(input: BuildCostReportInput): CostReport {
  const { provenance, linkage, priceTable } = input;
  const since = input.window?.since;
  const until = input.window?.until;

  const kept = keepInWindow(input.records, since, until);
  const { perSkill, perLane, attributed, dispatchedLanes } = foldRecords(kept);
  const mergedCount = collectMergedPrs(linkage).size;

  const byLane = toLaneRows(perLane, laneToMergedPrs(provenance, linkage));
  const lanesWithNoPr = byLane.filter((l) => l.prs_merged === 0).length;

  const report: CostReport = {
    window: { since: since ?? null, until: until ?? null },
    totals: {
      ...tokenTotals(attributed),
      units: Math.round(attributed.units),
      prs_merged: mergedCount,
      dispatched_lanes: dispatchedLanes.size,
      cost_per_merged_pr: ratio(attributed.units, mergedCount),
      cost_per_dispatched_lane: ratio(attributed.units, dispatchedLanes.size),
    },
    by_skill: toSkillRows(perSkill, mergedCount),
    by_lane: byLane,
    denominator_note: denominatorNote(mergedCount, dispatchedLanes.size, lanesWithNoPr),
    degraded: dispatchedLanes.size > 0 && !byLane.some((l) => l.attribution === 'linked'),
  };

  if (priceTable) report.pricing = buildPricing(kept, priceTable, mergedCount);

  return report;
}

/**
 * Flag any skill whose window cost/PR has left its declared band — the cost
 * analogue of a performance budget. Skills with a `null` cost/PR (no merged PR
 * to divide by) are skipped: there is no figure to judge, and an abstention is
 * not a regression.
 */
export function checkCostBands(
  report: CostReport,
  bands: Record<string, CostBand>
): CostBandFinding[] {
  const findings: CostBandFinding[] = [];
  for (const skill of report.by_skill) {
    const band = bands[skill.skill];
    if (!band || skill.cost_per_merged_pr === null) continue;
    const value = skill.cost_per_merged_pr;
    if (value > band.max) {
      findings.push({ skill: skill.skill, cost_per_merged_pr: value, band, direction: 'above' });
    } else if (band.min !== undefined && value < band.min) {
      findings.push({ skill: skill.skill, cost_per_merged_pr: value, band, direction: 'below' });
    }
  }
  return findings;
}
