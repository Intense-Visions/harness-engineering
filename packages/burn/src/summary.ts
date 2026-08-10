import { mkdirSync } from 'node:fs';

import type { BurnPaths } from './config';
import { atomicWrite } from './store';
import { readRecords } from './store';
import type {
  AgentBlock,
  AttributionBlock,
  BudgetBlock,
  BurnConfig,
  BurnStatus,
  Calibration,
  Confidence,
  ModelBlock,
  ScanInfo,
  SessionBlock,
  Summary,
} from './types';
import { units } from './units';
import { weekBounds } from './window';

const WEEK_SECONDS = 7 * 86_400;

function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

function median(sorted: number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  if (n % 2 === 1) return sorted[Math.floor(n / 2)]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** Rank used to compare status severities. */
const RANK: Record<string, number> = { OK: 0, WARM: 1, HOT: 2, CRITICAL: 3 };

function band(pct: number): 'OK' | 'WARM' | 'HOT' | 'CRITICAL' {
  if (pct >= 100) return 'CRITICAL';
  if (pct >= 85) return 'HOT';
  if (pct >= 65) return 'WARM';
  return 'OK';
}

/**
 * How far a FORECAST may escalate, by how much of the week it rests on.
 *
 * Incurred spend is a fact and always escalates; a projection is evidence whose
 * weight grows with the week, so it earns severity gradually. Without this
 * split, 2% of budget spent in one morning extrapolated to 118% and fired
 * CRITICAL — and noise is what stops alarms being read at all.
 */
const PROJECTION_CEILING: Record<Confidence, 'OK' | 'HOT' | 'CRITICAL'> = {
  low: 'OK',
  medium: 'HOT',
  high: 'CRITICAL',
};

/**
 * `2026-08-05T14:00:00.000+00:00` rather than Node's default `...Z`.
 *
 * Both are valid ISO 8601, but Python's `datetime.fromisoformat` did not accept
 * the `Z` suffix before 3.11, and during cutover an older consumer may still be
 * reading a summary this code wrote. Matching the Python HUD's own output keeps
 * the rollback path open for the cost of one string replacement.
 */
function isoUtc(d: Date): string {
  return d.toISOString().replace('Z', '+00:00');
}

function utcDateOnly(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function withCalibrationValidity(cal: Calibration | undefined, now: Date): Calibration {
  const out: Calibration = cal ? { ...cal } : {};
  if (!cal?.valid_until) return out;
  const parsed = Date.parse(`${cal.valid_until}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return out;
  out.expired = utcDateOnly(now) > parsed;
  out.days_left = Math.round((parsed - utcDateOnly(now)) / 86_400_000);
  return out;
}

/**
 * Roll the stored records up into the summary every consumer reads.
 *
 * `now` is injectable so the suite can place itself anywhere in a week without
 * waiting for one.
 */
export function buildSummary(
  paths: BurnPaths,
  scanInfo: ScanInfo,
  cfg: BurnConfig,
  now: Date = new Date()
): Summary {
  const records = readRecords(paths);
  const { start: curStart, end: curEnd } = weekBounds(now, cfg);

  const sessionHours = Number(cfg.session_window_hours ?? 5) || 5;
  const sessionCut = now.getTime() - sessionHours * 3_600_000;

  // Bucketed in whole weeks back from the current window, so history stays
  // aligned to the same anchor as the live week.
  const buckets = new Map<number, { requests: number; out: number; units: number }>();
  const perModel = new Map<string, { requests: number; units: number }>();
  const perAgent = new Map<string, { requests: number; units: number; lanes: Set<string> }>();
  let sessionUnits = 0;
  let sessionRequests = 0;

  for (const rec of records.values()) {
    if (!rec.ts) continue;
    const t = Date.parse(rec.ts);
    if (!Number.isFinite(t)) continue;

    const u = units(rec.out, rec.in, rec.cacheWrite, rec.cacheRead);
    const deltaSeconds = (curStart.getTime() - t) / 1000;
    const idx = deltaSeconds <= 0 ? 0 : Math.floor(deltaSeconds / WEEK_SECONDS) + 1;

    const bucket = buckets.get(idx) ?? { requests: 0, out: 0, units: 0 };
    bucket.requests += 1;
    bucket.out += rec.out;
    bucket.units += u;
    buckets.set(idx, bucket);

    if (idx === 0) {
      const m = perModel.get(rec.model) ?? { requests: 0, units: 0 };
      m.requests += 1;
      m.units += u;
      perModel.set(rec.model, m);

      // Defensive: a hand-edited store could carry an empty label, which would
      // open a nameless bucket nobody reads. It falls to `pre-migration` (the
      // provenance-unknown label), never to `unattributed` — the latter drives
      // the degradation alarm, and a corrupt row is not evidence of a broken
      // transcript shape. This matches the store reader's own fallback.
      const label = rec.agent || 'pre-migration';
      const a = perAgent.get(label) ?? { requests: 0, units: 0, lanes: new Set<string>() };
      a.requests += 1;
      a.units += u;
      // `main` carries an empty agentId, so it counts zero lanes.
      if (rec.agentId) a.lanes.add(rec.agentId);
      perAgent.set(label, a);
    }
    if (t >= sessionCut) {
      sessionUnits += u;
      sessionRequests += 1;
    }
  }

  const cur = buckets.get(0) ?? { requests: 0, out: 0, units: 0 };

  // Trailing COMPLETE weeks only; the partial current week must never dilute
  // its own baseline.
  const baselineWeeks = Number(cfg.baseline_weeks ?? 4) || 4;
  const tail: number[] = [];
  for (let i = 1; i <= baselineWeeks; i += 1) {
    const b = buckets.get(i);
    if (b) tail.push(b.units);
  }
  const tailSorted = [...tail].sort((a, b) => a - b);
  const baseMedian = median(tailSorted);
  const baseMax = tailSorted.length ? tailSorted[tailSorted.length - 1]! : null;

  const elapsedSeconds = (now.getTime() - curStart.getTime()) / 1000;
  const frac = Math.max(Math.min(elapsedSeconds / WEEK_SECONDS, 1.0), 1e-6);
  const linear = cur.units / frac;

  // Shrink the forecast toward the trailing baseline in proportion to how much
  // of the week has NOT yet happened. A linear extrapolation from three hours
  // carries almost no information about where the week lands — the best
  // available estimate that early is "a normal week".
  const projected = baseMedian ? frac * linear + (1 - frac) * baseMedian : linear;
  const projectionMethod = baseMedian ? 'shrunk-to-baseline' : 'linear';

  const ratio = baseMedian ? projected / baseMedian : null;
  const confidence: Confidence = frac >= 0.3 ? 'high' : frac >= 0.15 ? 'medium' : 'low';

  // ---- budget
  const budgetUnits = cfg.weekly_budget_units;
  const budget: BudgetBlock = { set: budgetUnits !== null && budgetUnits !== undefined };
  if (budgetUnits) {
    budget.units = budgetUnits;
    budget.pct_used = (100 * cur.units) / budgetUnits;
    budget.pct_projected = (100 * projected) / budgetUnits;
    budget.remaining_units = Math.max(budgetUnits - cur.units, 0);

    const rate = cur.units / Math.max(elapsedSeconds, 1);
    if (cur.units >= budgetUnits) {
      budget.exhausts_at = isoUtc(now);
      budget.exhausts_before_reset = true;
    } else if (confidence === 'low') {
      // "You run dry Tuesday" derived from one morning is the same noise as the
      // projection itself. Withhold the date rather than dress a guess up with
      // a timestamp, which reads far more certain than it is.
      budget.exhausts_before_reset = false;
      budget.exhaust_estimate_withheld = 'too early in the week to forecast';
    } else if (rate > 0) {
      // Only materialise a date when it actually lands before the reset. A tiny
      // rate against a large budget yields a runway of millions of days, which
      // overflowed Python's timedelta and killed the whole scan.
      const seconds = (budgetUnits - cur.units) / rate;
      const horizon = Math.max((curEnd.getTime() - now.getTime()) / 1000, 0);
      if (seconds <= horizon) {
        budget.exhausts_at = isoUtc(new Date(now.getTime() + seconds * 1000));
        budget.exhausts_before_reset = true;
      } else {
        budget.exhausts_before_reset = false;
        budget.runway_days = roundTo(Math.min(seconds / 86_400, 99_999), 1);
      }
    }
  }

  // A budget that outlived its basis is a false-green risk, so expiry is
  // surfaced rather than silently trusted.
  const calibration = withCalibrationValidity(cfg.calibration, now);

  // ---- per-model, with optional per-family budgets (Fable has its own limit)
  const modelBudgets = cfg.model_budgets ?? {};
  const models: Record<string, ModelBlock> = {};
  const sortedModels = [...perModel.entries()].sort((a, b) => b[1].units - a[1].units);
  for (const [name, m] of sortedModels) {
    const entry: ModelBlock = {
      requests: m.requests,
      units: Math.round(m.units),
      pct_of_week: cur.units ? roundTo((100 * m.units) / cur.units, 1) : 0,
    };
    const familyBudget = modelBudgets[name];
    if (familyBudget) {
      entry.budget_units = familyBudget;
      entry.pct_of_budget = roundTo((100 * m.units) / familyBudget, 1);
    }
    models[name] = entry;
  }

  // ---- per-agent. Same shape as `models`, so an existing consumer reads it
  // without learning a second idiom.
  const agents: Record<string, AgentBlock> = {};
  for (const [label, a] of [...perAgent.entries()].sort((x, y) => y[1].units - x[1].units)) {
    agents[label] = {
      requests: a.requests,
      units: Math.round(a.units),
      pct_of_week: cur.units ? roundTo((100 * a.units) / cur.units, 1) : 0,
      lanes: a.lanes.size,
    };
  }

  const mainUnits = perAgent.get('main')?.units ?? 0;
  const unattributedUnits = perAgent.get('unattributed')?.units ?? 0;
  const preMigrationUnits = perAgent.get('pre-migration')?.units ?? 0;
  // Summed directly rather than subtracted from the week: a float residue from
  // subtraction would make the `=== 0` degradation test unreliable. Note that
  // `pre-migration` is excluded from BOTH sides — counting it as attributed
  // would let one legacy row suppress a real degradation alarm.
  let attributedUnits = 0;
  const allLanes = new Set<string>();
  for (const [label, a] of perAgent) {
    if (label !== 'main' && label !== 'unattributed' && label !== 'pre-migration') {
      attributedUnits += a.units;
    }
    // Union across labels, so a lane seen under two labels mid-migration
    // counts once. This is deliberately not the sum of per-label lanes.
    for (const id of a.lanes) allLanes.add(id);
  }

  const attribution: AttributionBlock = {
    attributed_units: Math.round(attributedUnits),
    main_units: Math.round(mainUnits),
    unattributed_units: Math.round(unattributedUnits),
    pre_migration_units: Math.round(preMigrationUnits),
    lanes: allLanes.size,
    // Subagent spend was seen in the current week and none of it carried a
    // readable label: the transcript shape changed and attribution has stopped
    // working. Legacy rows cannot raise this alarm — they are not evidence
    // about the current shape.
    degraded: unattributedUnits > 0 && attributedUnits === 0,
  };

  // ---- session window
  const session: SessionBlock = {
    window_hours: sessionHours,
    requests: sessionRequests,
    units: Math.round(sessionUnits),
  };
  if (cfg.session_budget_units) {
    session.budget_units = cfg.session_budget_units;
    session.pct_used = roundTo((100 * sessionUnits) / cfg.session_budget_units, 1);
  }

  // ---- status. A zero denominator is an abstention, never a pass.
  let status: BurnStatus;
  if ((scanInfo.records_total ?? 0) === 0) {
    status = 'NO_DATA';
  } else if (budgetUnits) {
    const used = band(budget.pct_used!);
    let proj = band(budget.pct_projected!);
    const ceiling = PROJECTION_CEILING[confidence];
    if (RANK[proj]! > RANK[ceiling]!) proj = ceiling;
    status = RANK[used]! >= RANK[proj]! ? used : proj;
  } else if (ratio === null) {
    status = 'NO_BASELINE';
  } else {
    status = ratio >= cfg.hot_ratio ? 'HOT' : ratio >= cfg.warm_ratio ? 'WARM' : 'OK';
  }

  // Incurred spend is real whatever the forecast confidence, so an elevated
  // status always stands. Only a reassuring verdict is held back on a thin
  // sample — that is the direction in which a wrong read does harm.
  if (confidence === 'low' && status === 'OK') status = 'EARLY';

  // A per-model limit can be exhausted while the pooled limit still looks fine.
  const exhausted = Object.entries(models)
    .filter(([, e]) => (e.pct_of_budget ?? 0) >= 100)
    .map(([m]) => m);
  if (exhausted.length && (status === 'OK' || status === 'EARLY' || status === 'WARM')) {
    status = 'HOT';
  }

  // If rows were lost and could not all be re-read from source, every number
  // above is an UNDERCOUNT. Say so rather than let a rebuilt-but-incomplete
  // store report a confident figure.
  if ((scanInfo.unrecovered ?? 0) > 0) status = 'UNDERCOUNT';

  const wr = cfg.week_reset;
  const perWeekBack: Record<string, number> = {};
  for (let i = 1; i <= baselineWeeks; i += 1) {
    const b = buckets.get(i);
    if (b) perWeekBack[String(i)] = Math.round(b.units);
  }

  return {
    generated_at: isoUtc(now),
    scan: scanInfo,
    week: {
      start: isoUtc(curStart),
      reset_at: isoUtc(curEnd),
      reset_spec: `${wr.weekday}@${wr.time} ${wr.tz}`,
      tz: wr.tz || 'UTC',
      elapsed_frac: roundTo(frac, 4),
      days_left: roundTo(7 * (1 - frac), 2),
      hours_left: roundTo((curEnd.getTime() - now.getTime()) / 3_600_000, 1),
    },
    wtd: { requests: cur.requests, output_tokens: cur.out, units: Math.round(cur.units) },
    baseline: {
      complete_weeks_used: tail.length,
      median_units: baseMedian ? Math.round(baseMedian) : null,
      max_units: baseMax ? Math.round(baseMax) : null,
      per_week_back: perWeekBack,
    },
    projection: {
      units_at_reset: Math.round(projected),
      units_at_reset_linear: Math.round(linear),
      method: projectionMethod,
      ratio_vs_baseline: ratio ? roundTo(ratio, 2) : null,
      confidence,
    },
    budget,
    calibration,
    models,
    models_exhausted: exhausted,
    agents,
    attribution,
    session,
    status,
  };
}

/** Publish the summary atomically — the statusline must never read a half file. */
export function writeSummary(paths: BurnPaths, summary: Summary): void {
  mkdirSync(paths.state, { recursive: true });
  atomicWrite(paths.summary, JSON.stringify(summary, null, 2));
}
