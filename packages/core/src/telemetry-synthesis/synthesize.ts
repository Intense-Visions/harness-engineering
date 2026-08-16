/**
 * Aggregate-telemetry synthesis — pure composer (#563).
 *
 * `composeSynthesis` folds already-read telemetry inputs into one
 * `TelemetrySynthesis`. It is PURE: every input is passed in, so callers can
 * supply a fixed `now` for deterministic output and unit-test present / absent
 * / mixed / windowed cases without touching disk.
 *
 * The CLI command (`packages/cli/src/commands/telemetry/synthesize.ts`) is the
 * composition root: it reads adoption + usage records (core), builds the
 * effectiveness projection from the intelligence scorers, reads
 * `execution_outcome` nodes from the graph, and runs `composeInsights` — then
 * hands them all here. This keeps `core` free of any `intelligence` / `graph`
 * dependency (the existing layer direction), exactly as `adoption.ts` imports
 * the intelligence scorers at the CLI layer rather than in core.
 *
 * Spec: docs/changes/aggregate-telemetry-synthesis/proposal.md
 */
import type {
  SkillInvocationRecord,
  UsageRecord,
  InsightsReport,
  TelemetrySynthesis,
  TelemetrySynthesisSection,
  AdoptionSection,
  EffectivenessSection,
  UsageSection,
  InsightsSection,
  OutcomeSection,
  SynthesisSection,
} from '@harness-engineering/types';
import { aggregateBySkill } from '../adoption/index.js';
import { aggregateByDay } from '../usage/aggregator.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many rows each ranked section keeps. */
const DEFAULT_TOP_N = 10;

/**
 * A structural view of an `execution_outcome` graph node's fields this composer
 * reads. Kept local so `core` takes no dependency on `graph` / `intelligence`.
 */
export interface OutcomeNodeLike {
  /** outcome-eval verdict when present: SATISFIED | NOT_SATISFIED | INCONCLUSIVE. */
  verdict?: string;
  /** Connector result when no verdict is carried: 'success' | 'failure'. */
  result?: string;
  /** ISO 8601 timestamp used for windowing. */
  timestamp?: string;
}

/** Inputs to the pure composer — everything already read by the caller. */
export interface SynthesisInputs {
  /** Raw adoption records (unwindowed); the composer applies the window. */
  adoptionRecords: SkillInvocationRecord[];
  /** Raw usage records (unwindowed); the composer applies the window. */
  usageRecords: UsageRecord[];
  /** `composeInsights` output, or null when unavailable (no window applies — insights is a snapshot). */
  insights: InsightsReport | null;
  /**
   * Builds the effectiveness projection from a record set — the composer passes
   * the WINDOWED adoption records so effectiveness stays consistent with the
   * adoption section. Injected so `core` never imports `intelligence`. Return
   * null to mark the section absent.
   */
  buildEffectiveness: (records: SkillInvocationRecord[]) => EffectivenessSection | null;
  /** `execution_outcome` nodes read from the graph, or null when no graph is present. */
  outcomeNodes: OutcomeNodeLike[] | null;
}

/** Options controlling the synthesis. */
export interface ComposeSynthesisOptions {
  /** Reference "now" for windowing. Defaults to the real clock. */
  now?: Date;
  /** Trailing-day window applied to adoption / usage / outcomes; null | undefined = all-time. */
  windowDays?: number | null;
  /** Sections to omit entirely (reported as `{ present: false, reason: 'skipped' }`). */
  skip?: TelemetrySynthesisSection[];
  /** Rows per ranked section. Default 10. */
  topN?: number;
}

/** An absent section with a reason. */
function absent(reason: string): { present: false; reason: string } {
  return { present: false, reason };
}

/** True when `iso` is within the trailing `windowDays` of `nowMs` (or the window is open). */
function withinWindow(iso: string | undefined, nowMs: number, windowDays: number | null): boolean {
  if (windowDays == null) return true;
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return nowMs - t <= windowDays * DAY_MS;
}

/** Build the adoption projection from records, or absent when none. */
function buildAdoptionSection(
  records: SkillInvocationRecord[],
  topN: number
): SynthesisSection<AdoptionSection> {
  if (records.length === 0) return absent('no adoption records in window');
  const summaries = aggregateBySkill(records);
  const completed = records.filter((r) => r.outcome === 'completed').length;
  return {
    present: true,
    totalInvocations: records.length,
    distinctSkills: summaries.length,
    successRate: completed / records.length,
    topSkills: summaries.slice(0, topN).map((s) => ({
      skill: s.skill,
      invocations: s.invocations,
      successRate: s.successRate,
      lastUsed: s.lastUsed,
    })),
  };
}

/** Build the usage projection from records, or absent when none. */
function buildUsageSection(records: UsageRecord[]): SynthesisSection<UsageSection> {
  if (records.length === 0) return absent('no usage records in window');
  const days = aggregateByDay(records);
  const sessions = new Set(records.map((r) => r.sessionId));
  let totalCostMicroUSD: number | null = 0;
  let totalTokens = 0;
  for (const r of records) {
    totalTokens += r.tokens.totalTokens;
    if (r.costMicroUSD == null) totalCostMicroUSD = null;
    else if (totalCostMicroUSD != null) totalCostMicroUSD += r.costMicroUSD;
  }
  return {
    present: true,
    totalCostMicroUSD,
    totalTokens,
    activeDays: days.length,
    sessionCount: sessions.size,
  };
}

/** Build the insights projection, or absent when the report is missing. */
function buildInsightsSection(report: InsightsReport | null): SynthesisSection<InsightsSection> {
  if (!report) return absent('no insights available');
  const health = report.health;
  const entropy = report.entropy;
  return {
    present: true,
    healthPassed: health ? health.passed : null,
    healthSummary: health ? health.summary : null,
    driftCount: entropy ? entropy.driftCount : null,
    deadFiles: entropy ? entropy.deadFiles : null,
    deadExports: entropy ? entropy.deadExports : null,
    warnings: report.warnings ?? [],
  };
}

/** Normalize an outcome node to one of the three verdict buckets, or null to ignore. */
function classifyOutcome(
  node: OutcomeNodeLike
): 'satisfied' | 'notSatisfied' | 'inconclusive' | null {
  const verdict = node.verdict?.toUpperCase();
  if (verdict === 'SATISFIED') return 'satisfied';
  if (verdict === 'NOT_SATISFIED') return 'notSatisfied';
  if (verdict === 'INCONCLUSIVE') return 'inconclusive';
  // Fallback for nodes without an outcome-eval verdict: map the connector result.
  if (verdict === undefined) {
    if (node.result === 'success') return 'satisfied';
    if (node.result === 'failure') return 'notSatisfied';
  }
  return null;
}

/** Build the outcomes projection from graph nodes, or absent when no graph. */
function buildOutcomeSection(
  nodes: OutcomeNodeLike[] | null,
  nowMs: number,
  windowDays: number | null
): SynthesisSection<OutcomeSection> {
  if (nodes == null) return absent('no knowledge graph present');
  let satisfied = 0;
  let notSatisfied = 0;
  let inconclusive = 0;
  for (const node of nodes) {
    if (!withinWindow(node.timestamp, nowMs, windowDays)) continue;
    const bucket = classifyOutcome(node);
    if (bucket === 'satisfied') satisfied++;
    else if (bucket === 'notSatisfied') notSatisfied++;
    else if (bucket === 'inconclusive') inconclusive++;
  }
  const total = satisfied + notSatisfied + inconclusive;
  if (total === 0) return absent('no execution_outcome nodes in window');
  return {
    present: true,
    satisfied,
    notSatisfied,
    inconclusive,
    total,
    satisfiedRate: satisfied / total,
  };
}

/**
 * Compose a `TelemetrySynthesis` from already-read inputs. Pure and total: a
 * missing/empty source yields `{ present: false }`, never a throw or a
 * fabricated zero.
 */
export function composeSynthesis(
  inputs: SynthesisInputs,
  opts: ComposeSynthesisOptions = {}
): TelemetrySynthesis {
  const windowDays = opts.windowDays ?? null;
  const nowMs = (opts.now ?? new Date()).getTime();
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const skip = new Set(opts.skip ?? []);

  const windowedAdoption = inputs.adoptionRecords.filter((r) =>
    withinWindow(r.startedAt, nowMs, windowDays)
  );
  const windowedUsage = inputs.usageRecords.filter((r) =>
    withinWindow(r.timestamp, nowMs, windowDays)
  );

  const adoption = skip.has('adoption')
    ? absent('skipped')
    : buildAdoptionSection(windowedAdoption, topN);

  const effectiveness: SynthesisSection<EffectivenessSection> = skip.has('effectiveness')
    ? absent('skipped')
    : (() => {
        if (windowedAdoption.length === 0) return absent('no adoption records in window');
        const built = inputs.buildEffectiveness(windowedAdoption);
        return built ? { present: true, ...built } : absent('no effectiveness data');
      })();

  const usage = skip.has('usage') ? absent('skipped') : buildUsageSection(windowedUsage);
  const insights = skip.has('insights') ? absent('skipped') : buildInsightsSection(inputs.insights);
  const outcomes = skip.has('outcomes')
    ? absent('skipped')
    : buildOutcomeSection(inputs.outcomeNodes, nowMs, windowDays);

  const headline = {
    totalSkillInvocations: adoption.present ? adoption.totalInvocations : null,
    skillSuccessRate: adoption.present ? adoption.successRate : null,
    outcomeSatisfiedRate: outcomes.present ? outcomes.satisfiedRate : null,
    totalCostUsd:
      usage.present && usage.totalCostMicroUSD != null ? usage.totalCostMicroUSD / 1_000_000 : null,
    healthPassed: insights.present ? insights.healthPassed : null,
  };

  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    windowDays,
    sources: { adoption, effectiveness, usage, insights, outcomes },
    headline,
  };
}
