/**
 * Aggregate-telemetry synthesis surface (#563).
 *
 * Wire types for `harness telemetry synthesize` — a read-only, local,
 * single-project report that COMPOSES the five telemetry surfaces that already
 * accrue in-repo (adoption, effectiveness, usage, insights, execution-outcome
 * verdicts) into one object. It collects nothing new; every section is a thin
 * projection of an existing reader's output.
 *
 * A missing source contributes an explicit `{ present: false }` — never a
 * fabricated zero — so a consumer can always tell "no data" from "zero".
 *
 * Spec: docs/changes/aggregate-telemetry-synthesis/proposal.md
 */

/** The five sources this surface synthesizes. */
export const TELEMETRY_SYNTHESIS_SECTIONS = [
  'adoption',
  'effectiveness',
  'usage',
  'insights',
  'outcomes',
] as const;

/** A section name the caller can skip or that can be reported absent. */
export type TelemetrySynthesisSection = (typeof TELEMETRY_SYNTHESIS_SECTIONS)[number];

/**
 * Sentinel for a source that has no data (missing file, no graph, or skipped).
 * Deliberately not a zero-valued section — the Iron Law of the catalog
 * retrospective: never collapse "no telemetry" into "zero".
 */
export interface SourceAbsent {
  present: false;
  /** Human-readable reason the source is absent (e.g. "no adoption.jsonl", "skipped"). */
  reason: string;
}

/** A section that is either present (projection `T`) or explicitly absent. */
export type SynthesisSection<T> = (T & { present: true }) | SourceAbsent;

/** Source 1 — skill-adoption telemetry, projected from `aggregateBySkill`. */
export interface AdoptionSection {
  /** Total invocation records considered (post-window). */
  totalInvocations: number;
  /** Distinct skills that emitted at least one record. */
  distinctSkills: number;
  /** Invocation-weighted success rate across all skills (0-1). */
  successRate: number;
  /** Most-invoked skills, descending; each carries invocations + success rate. */
  topSkills: Array<{
    skill: string;
    invocations: number;
    successRate: number;
    lastUsed: string;
  }>;
}

/** Source 2 — Bayesian skill effectiveness, projected from the intelligence scorers. */
export interface EffectivenessSection {
  /** Least-effective skills first (smoothed success rate ascending). */
  leastEffective: Array<{
    skill: string;
    invocations: number;
    completed: number;
    failed: number;
    abandonedMidWorkflow: number;
    /** Laplace-smoothed success rate (0-1). */
    successRate: number;
  }>;
  /** Skills above the failing-rate threshold (sample-aware ranked). */
  failing: Array<{ skill: string; invocations: number; failed: number; failureRate: number }>;
  /** Skills abandoned mid-workflow above threshold. */
  abandoned: Array<{
    skill: string;
    invocations: number;
    abandonedMidWorkflow: number;
    abandonmentRate: number;
  }>;
}

/** Source 3 — usage / cost telemetry, projected from the usage aggregator. */
export interface UsageSection {
  /** Total cost in micro-USD across the window, or null when any record has unknown pricing. */
  totalCostMicroUSD: number | null;
  /** Total tokens (input + output) across the window. */
  totalTokens: number;
  /** Number of distinct days with usage in the window. */
  activeDays: number;
  /** Number of distinct sessions in the window. */
  sessionCount: number;
}

/** Source 4 — composite code-health insights, projected from `composeInsights`. */
export interface InsightsSection {
  /** Whether the structural health check passed (null when the health block was unavailable). */
  healthPassed: boolean | null;
  /** Short health summary line. */
  healthSummary: string | null;
  /** Drift findings, dead files, dead exports (0 when the block is present-but-clean). */
  driftCount: number | null;
  deadFiles: number | null;
  deadExports: number | null;
  /** Warnings emitted by any sub-aggregator that failed. */
  warnings: string[];
}

/** Source 5 — `execution_outcome` graph nodes, projected from a graph count. */
export interface OutcomeSection {
  satisfied: number;
  notSatisfied: number;
  inconclusive: number;
  /** Total outcome nodes counted (satisfied + notSatisfied + inconclusive). */
  total: number;
  /** satisfied / total, or null when total is 0. */
  satisfiedRate: number | null;
}

/**
 * Headline block — a few cross-source figures for the top of the report.
 * Every field is nullable: a source that is absent yields `null`, never a zero.
 */
export interface TelemetrySynthesisHeadline {
  totalSkillInvocations: number | null;
  /** From adoption. */
  skillSuccessRate: number | null;
  /** From execution_outcome nodes: satisfied / total. */
  outcomeSatisfiedRate: number | null;
  /** From usage, in whole USD (micro-USD / 1e6), or null when cost is unknown/absent. */
  totalCostUsd: number | null;
  /**
   * From insights: whether the structural health check passed. Replaces the
   * spec's `healthScore` — `composeInsights` yields a pass/fail signal, not a
   * numeric score, so a boolean is the honest projection (Decision 6).
   */
  healthPassed: boolean | null;
}

/** The unified synthesis object emitted by `harness telemetry synthesize --json`. */
export interface TelemetrySynthesis {
  /** ISO 8601 generation timestamp. */
  generatedAt: string;
  /** Trailing-day window applied to adoption/usage/outcome sources; null = all-time. */
  windowDays: number | null;
  sources: {
    adoption: SynthesisSection<AdoptionSection>;
    effectiveness: SynthesisSection<EffectivenessSection>;
    usage: SynthesisSection<UsageSection>;
    insights: SynthesisSection<InsightsSection>;
    outcomes: SynthesisSection<OutcomeSection>;
  };
  headline: TelemetrySynthesisHeadline;
}
