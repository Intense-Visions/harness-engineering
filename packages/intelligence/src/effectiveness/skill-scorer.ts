import type { SkillInvocationRecord } from '@harness-engineering/types';
import type { SkillEffectivenessScore, FailingSkill, AbandonedSkill } from './types.js';

/**
 * Skill-grain effectiveness scoring over `.harness/metrics/adoption.jsonl`
 * records. The catalog-skill counterpart to the persona scorer in
 * `./scorer.ts`: same Bayesian (Laplace α = 1) smoothing, same
 * threshold-based detectors, same deterministic sorting — but the unit of
 * analysis is a skill and the evidence is an adoption record rather than a
 * graph-attributed `execution_outcome` node.
 */

/** Laplace smoothing constant (α = 1). Shares the +2 denominator with the persona scorer. */
const LAPLACE_ALPHA = 1;

/** Defaults for `detectFailingSkills`. */
const DEFAULT_MIN_FAILURES = 2;
const DEFAULT_MIN_FAILURE_RATE = 0.5;

/** Defaults for `detectAbandonedSkills`. */
const DEFAULT_MIN_ABANDONMENTS = 2;
const DEFAULT_MIN_ABANDONMENT_RATE = 0.5;

interface SkillCounts {
  invocations: number;
  completed: number;
  failed: number;
  abandonedMidWorkflow: number;
  /** Non-completed runs tallied by FailureCategory (only observed keys present). */
  failureCategories: Record<string, number>;
}

/**
 * Classifies a record as "abandoned mid-workflow": either an explicit
 * `abandoned` outcome, or a non-completed run that had already reached at least
 * one phase before stopping (partial progress then gave up).
 *
 * Mirrors `isAbandonedMidWorkflow` in `@harness-engineering/core`
 * (`adoption/retrospective.ts`); duplicated as a small self-contained predicate
 * so the intelligence layer does not take a dependency on core.
 */
function isAbandonedMidWorkflow(record: SkillInvocationRecord): boolean {
  if (record.outcome === 'abandoned') return true;
  return record.outcome !== 'completed' && record.phasesReached.length > 0;
}

function emptyCounts(): SkillCounts {
  return {
    invocations: 0,
    completed: 0,
    failed: 0,
    abandonedMidWorkflow: 0,
    failureCategories: {},
  };
}

/** Fold a single record's outcome and failure category into the running counts. */
function tallyRecord(counts: SkillCounts, record: SkillInvocationRecord): void {
  counts.invocations += 1;
  if (record.outcome === 'completed') counts.completed += 1;
  else if (record.outcome === 'failed') counts.failed += 1;
  if (isAbandonedMidWorkflow(record)) counts.abandonedMidWorkflow += 1;
  const category = record.failureCategory;
  if (category) {
    counts.failureCategories[category] = (counts.failureCategories[category] ?? 0) + 1;
  }
}

/**
 * Traverse the records once and tally per-skill outcome counts. Records whose
 * `skill` is missing or empty are ignored.
 *
 * Note: each exported function calls this once. If invoking several on the same
 * record set, consider sharing the result in a future optimisation.
 */
function gatherCounts(records: SkillInvocationRecord[]): Map<string, SkillCounts> {
  const map = new Map<string, SkillCounts>();
  for (const record of records) {
    const skill = record.skill;
    if (typeof skill !== 'string' || skill.length === 0) continue;
    let counts = map.get(skill);
    if (!counts) {
      counts = emptyCounts();
      map.set(skill, counts);
    }
    tallyRecord(counts, record);
  }
  return map;
}

/**
 * Laplace-smoothed success rate: `(completed + 1) / (invocations + 2)`.
 */
function smoothedSuccessRate(counts: SkillCounts): number {
  return (counts.completed + LAPLACE_ALPHA) / (counts.invocations + 2 * LAPLACE_ALPHA);
}

/**
 * Per-skill effectiveness scores derived from adoption records.
 *
 * Results are sorted by `successRate` descending, then by `invocations`
 * descending, then by `skill` ascending, for stable deterministic iteration.
 */
export function computeSkillEffectiveness(
  records: SkillInvocationRecord[],
  opts?: { skill?: string }
): SkillEffectivenessScore[] {
  const map = gatherCounts(records);
  const rows: SkillEffectivenessScore[] = [];

  for (const [skill, counts] of map) {
    if (opts?.skill !== undefined && skill !== opts.skill) continue;
    if (counts.invocations === 0) continue;
    rows.push({
      skill,
      invocations: counts.invocations,
      completed: counts.completed,
      failed: counts.failed,
      abandonedMidWorkflow: counts.abandonedMidWorkflow,
      successRate: smoothedSuccessRate(counts),
    });
  }

  rows.sort((a, b) => {
    const rateDiff = b.successRate - a.successRate;
    if (Math.abs(rateDiff) > 1e-10) return rateDiff;
    const sizeDiff = b.invocations - a.invocations;
    if (sizeDiff !== 0) return sizeDiff;
    return a.skill.localeCompare(b.skill);
  });
  return rows;
}

/**
 * Failing skills: those that fail often enough to warrant catalog attention.
 *
 * Mirrors `detectBlindSpots` — uses the *raw* failure rate (not smoothed) so
 * thresholds stay intuitive. A skill must satisfy BOTH `failed >= minFailures`
 * AND `rawFailureRate >= minFailureRate`. The `minFailures` floor keeps n=1
 * noise out.
 *
 * Results are sorted by `failureRate` descending, then `failed` descending,
 * then `skill` ascending.
 */
export function detectFailingSkills(
  records: SkillInvocationRecord[],
  opts?: { minFailures?: number; minFailureRate?: number }
): FailingSkill[] {
  const minFailures = opts?.minFailures ?? DEFAULT_MIN_FAILURES;
  const minFailureRate = opts?.minFailureRate ?? DEFAULT_MIN_FAILURE_RATE;
  const map = gatherCounts(records);
  const failing: FailingSkill[] = [];

  for (const [skill, counts] of map) {
    if (counts.invocations === 0) continue;
    const failureRate = counts.failed / counts.invocations;
    if (counts.failed < minFailures) continue;
    if (failureRate < minFailureRate) continue;
    failing.push({
      skill,
      invocations: counts.invocations,
      completed: counts.completed,
      failed: counts.failed,
      failureRate,
      smoothedSuccessRate: smoothedSuccessRate(counts),
      failureCategories: { ...counts.failureCategories },
    });
  }

  failing.sort((a, b) => {
    const rateDiff = b.failureRate - a.failureRate;
    if (Math.abs(rateDiff) > 1e-10) return rateDiff;
    const countDiff = b.failed - a.failed;
    if (countDiff !== 0) return countDiff;
    return a.skill.localeCompare(b.skill);
  });
  return failing;
}

/**
 * Abandoned-mid-workflow skills: those users start and bail out of often enough
 * to warrant attention.
 *
 * Mirrors `detectBlindSpots` — uses the *raw* abandonment rate. A skill must
 * satisfy BOTH `abandonedMidWorkflow >= minAbandonments` AND
 * `rawAbandonmentRate >= minAbandonmentRate`.
 *
 * Results are sorted by `abandonmentRate` descending, then
 * `abandonedMidWorkflow` descending, then `skill` ascending.
 */
export function detectAbandonedSkills(
  records: SkillInvocationRecord[],
  opts?: { minAbandonments?: number; minAbandonmentRate?: number }
): AbandonedSkill[] {
  const minAbandonments = opts?.minAbandonments ?? DEFAULT_MIN_ABANDONMENTS;
  const minAbandonmentRate = opts?.minAbandonmentRate ?? DEFAULT_MIN_ABANDONMENT_RATE;
  const map = gatherCounts(records);
  const abandoned: AbandonedSkill[] = [];

  for (const [skill, counts] of map) {
    if (counts.invocations === 0) continue;
    const abandonmentRate = counts.abandonedMidWorkflow / counts.invocations;
    if (counts.abandonedMidWorkflow < minAbandonments) continue;
    if (abandonmentRate < minAbandonmentRate) continue;
    abandoned.push({
      skill,
      invocations: counts.invocations,
      completed: counts.completed,
      abandonedMidWorkflow: counts.abandonedMidWorkflow,
      abandonmentRate,
      smoothedSuccessRate: smoothedSuccessRate(counts),
    });
  }

  abandoned.sort((a, b) => {
    const rateDiff = b.abandonmentRate - a.abandonmentRate;
    if (Math.abs(rateDiff) > 1e-10) return rateDiff;
    const countDiff = b.abandonedMidWorkflow - a.abandonedMidWorkflow;
    if (countDiff !== 0) return countDiff;
    return a.skill.localeCompare(b.skill);
  });
  return abandoned;
}
