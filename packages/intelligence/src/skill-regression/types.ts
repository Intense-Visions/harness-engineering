/**
 * skill-regression contract types.
 *
 * The golden-fixture evaluation framework that detects when a skill REGRESSES:
 * given a golden fixture (input + a quality rubric + a recorded golden baseline
 * score), score one or more candidate outputs of the skill semantically against
 * the rubric and compare the aggregate score@k to the golden baseline. A score
 * that drops below `baseline.score - baseline.tolerance` is a regression.
 *
 * `authority` is DERIVED in TypeScript from (verdict, confidence) via
 * `deriveRegressionAuthority` in `./authority.js`. It is NEVER read from the LLM
 * response — see `criterionJudgmentSchema` in `./prompts.js`, which omits it.
 * This mirrors the outcome-eval false-positive-critical seam.
 */

export type RegressionVerdictKind = 'REGRESSED' | 'STABLE' | 'INCONCLUSIVE';

export type Confidence = 'low' | 'medium' | 'high';

/** Ship authority DERIVED in TS from (verdict, confidence); never from the LLM. */
export type RegressionAuthority = 'blocking' | 'advisory';

/**
 * A single semantic quality check a skill's output must satisfy. `weight`
 * (default 1) lets a fixture emphasize load-bearing criteria over cosmetic ones.
 */
export interface RubricCriterion {
  /** Stable slug, unique within a fixture (e.g. `weighs-tradeoffs`). */
  id: string;
  /** The quality property, phrased so a judge can rule met / not-met. */
  criterion: string;
  /** Relative weight in the aggregate score; defaults to 1 when omitted. */
  weight?: number;
}

/**
 * The recorded golden baseline for a fixture. `score` is the rubric score the
 * reference output earned at baseline time; `k` records how many samples that
 * baseline was aggregated over; `tolerance` is the allowed drop before a
 * candidate counts as a regression.
 */
export interface GoldenBaseline {
  /** Golden rubric score in [0,1], recorded via `--update-baseline`. */
  score: number;
  /** Number of samples the baseline score was aggregated over (>= 1). */
  k: number;
  /** Allowed downward drift in [0,1] before a candidate counts as regressed. */
  tolerance: number;
}

/**
 * A golden fixture for one skill. Stored as byte-stable JSON on disk (see
 * `./fixture.js`). `referenceOutput` is the golden, high-quality output the
 * baseline was measured against; it doubles as the default self-test candidate
 * so the gate runs end-to-end with no captured candidate supplied.
 */
export interface SkillRegressionFixture {
  /** Fixture format version; bumped only on a breaking schema change. */
  schemaVersion: 1;
  /** The skill under test (e.g. `harness-spec-craft`). */
  skill: string;
  /** Fixture id, unique per skill (e.g. `minimal-adr`). */
  id: string;
  /** Human note on what this fixture pins. */
  description?: string;
  /** The canonical input the skill runs against. */
  input: string;
  /** The quality rubric the output is scored against (non-empty). */
  rubric: RubricCriterion[];
  /** The golden reference output; also the default self-test candidate. */
  referenceOutput: string;
  /** The recorded golden baseline. */
  baseline: GoldenBaseline;
}

/** The judge's per-criterion ruling for one candidate output (from the LLM). */
export interface CriterionJudgment {
  /** Matches a `RubricCriterion.id`. */
  id: string;
  /** Whether the candidate output meets the criterion. */
  met: boolean;
  /** Short justification citing the output; never a secret or stack trace. */
  note: string;
}

export interface SkillRegressionInput {
  fixture: SkillRegressionFixture;
  /**
   * Candidate outputs of the skill to score (the k samples). Empty means
   * "self-test": the fixture's `referenceOutput` is scored as the sole
   * candidate, which should reproduce the baseline (STABLE).
   */
  candidates?: string[];
}

export interface SkillRegressionVerdict {
  /** REGRESSED iff the aggregate score dropped past the tolerance with confidence. */
  verdict: RegressionVerdictKind;
  confidence: Confidence;
  /** Aggregate rubric score@k over the scored candidates, in [0,1]. */
  score: number;
  /** The golden baseline score the candidate was compared against. */
  baselineScore: number;
  /** `baselineScore - score`; positive means the candidate scored lower. */
  delta: number;
  /** The tolerance applied (from the fixture). */
  tolerance: number;
  /** How many candidate samples were scored (the effective k). */
  sampledK: number;
  /** Cites which criteria drove the score. */
  rationale: string;
  /** DERIVED in TS from (verdict, confidence); never from the LLM. */
  authority: RegressionAuthority;
}
