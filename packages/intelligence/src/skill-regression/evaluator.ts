import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type {
  Confidence,
  SkillRegressionFixture,
  SkillRegressionInput,
  SkillRegressionVerdict,
} from './types.js';
import { deriveRegressionAuthority } from './authority.js';
import { SKILL_REGRESSION_SYSTEM_PROMPT, buildUserPrompt, judgeResponseSchema } from './prompts.js';
import type { JudgeResponse } from './prompts.js';
import { aggregateAtK, deriveRegressionVerdict, weightedScore } from './scorer.js';

export interface SkillRegressionEvaluatorOptions {
  /** Override model for the judge LLM call. */
  model?: string;
}

/** The lowest of a set of confidences (bias toward the least-certain sample). */
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
function lowestConfidence(confidences: Confidence[]): Confidence {
  if (confidences.length === 0) return 'low';
  return confidences.reduce((a, b) => (CONFIDENCE_RANK[b] < CONFIDENCE_RANK[a] ? b : a));
}

/**
 * The golden-fixture skill-regression judge. Scores k candidate outputs of a
 * skill against the fixture's quality rubric and compares the aggregate score@k
 * to the recorded golden baseline. Mirrors OutcomeEvaluator's shape: a
 * (provider, options) constructor, a strict re-parse of the LLM payload, and a
 * TS-derived ship authority that the LLM can never inject.
 *
 * Degrade-safe throughout: no provider, a provider rejection, or a malformed /
 * authority-injected payload yields an INCONCLUSIVE/low/advisory verdict rather
 * than throwing — a skill PR is never blocked on infrastructure noise.
 */
export class SkillRegressionEvaluator {
  private readonly provider: AnalysisProvider;
  private readonly options: SkillRegressionEvaluatorOptions;

  constructor(provider: AnalysisProvider, options: SkillRegressionEvaluatorOptions = {}) {
    this.provider = provider;
    this.options = options;
  }

  async evaluate(input: SkillRegressionInput): Promise<SkillRegressionVerdict> {
    const { fixture } = input;
    // Empty candidates → self-test against the golden reference output.
    const candidates =
      input.candidates && input.candidates.length > 0
        ? input.candidates
        : [fixture.referenceOutput];

    const perCandidate: Array<{ score: number; confidence: Confidence }> = [];
    for (const candidate of candidates) {
      const judged = await this.judgeCandidate(fixture, candidate);
      if (judged === null) return this.degradedVerdict(fixture, candidates.length);
      perCandidate.push({
        score: weightedScore(fixture.rubric, judged.criteria),
        confidence: judged.confidence,
      });
    }

    const score = aggregateAtK(perCandidate.map((c) => c.score));
    const { verdict, delta } = deriveRegressionVerdict(score, fixture.baseline);
    const confidence = lowestConfidence(perCandidate.map((c) => c.confidence));

    return this.buildVerdict({
      verdict,
      confidence,
      score,
      baselineScore: fixture.baseline.score,
      delta,
      tolerance: fixture.baseline.tolerance,
      sampledK: candidates.length,
      rationale: this.buildRationale(verdict, score, fixture, delta),
    });
  }

  /**
   * Run the judge for one candidate and strict re-parse. ANY failure — provider
   * rejection or a strict-parse rejection of a malformed / authority-injected
   * payload — returns null so the caller degrades safely to INCONCLUSIVE.
   */
  private async judgeCandidate(
    fixture: SkillRegressionFixture,
    candidate: string
  ): Promise<JudgeResponse | null> {
    try {
      const response = await this.provider.analyze<JudgeResponse>({
        prompt: buildUserPrompt(fixture.skill, fixture.input, fixture.rubric, candidate),
        systemPrompt: SKILL_REGRESSION_SYSTEM_PROMPT,
        responseSchema: judgeResponseSchema,
        ...(this.options.model !== undefined && { model: this.options.model }),
      });
      // Defensive strict re-parse: rejects any injected extra key (e.g.
      // `authority` or `score`) even if the provider did not enforce strict mode.
      return judgeResponseSchema.parse(response.result);
    } catch {
      return null;
    }
  }

  private buildRationale(
    verdict: SkillRegressionVerdict['verdict'],
    score: number,
    fixture: SkillRegressionFixture,
    delta: number
  ): string {
    const floor = (fixture.baseline.score - fixture.baseline.tolerance).toFixed(3);
    const scoreStr = score.toFixed(3);
    const baseStr = fixture.baseline.score.toFixed(3);
    if (verdict === 'REGRESSED') {
      return `Skill "${fixture.skill}" fixture "${fixture.id}" scored ${scoreStr}, below the regression floor ${floor} (baseline ${baseStr}, drop ${delta.toFixed(3)}).`;
    }
    return `Skill "${fixture.skill}" fixture "${fixture.id}" scored ${scoreStr}, at or above the regression floor ${floor} (baseline ${baseStr}).`;
  }

  private degradedVerdict(
    fixture: SkillRegressionFixture,
    sampledK: number
  ): SkillRegressionVerdict {
    return this.buildVerdict({
      verdict: 'INCONCLUSIVE',
      confidence: 'low',
      score: 0,
      baselineScore: fixture.baseline.score,
      delta: 0,
      tolerance: fixture.baseline.tolerance,
      sampledK,
      rationale:
        'Skill-regression scoring could not be completed; defaulting to an inconclusive, advisory verdict.',
    });
  }

  private buildVerdict(v: Omit<SkillRegressionVerdict, 'authority'>): SkillRegressionVerdict {
    return { ...v, authority: deriveRegressionAuthority(v.verdict, v.confidence) };
  }
}

/**
 * Compute the golden baseline score for a fixture by judging its
 * `referenceOutput` against its own rubric. Used by `--update-baseline` to
 * record the number that future candidates are compared against. Returns null
 * on any degrade (no provider / malformed payload) so the caller can leave the
 * existing baseline untouched rather than writing a degenerate 0.
 */
export async function computeBaselineScore(
  provider: AnalysisProvider,
  fixture: SkillRegressionFixture,
  options: SkillRegressionEvaluatorOptions = {}
): Promise<{ score: number; k: number } | null> {
  const evaluator = new SkillRegressionEvaluator(provider, options);
  const verdict = await evaluator.evaluate({ fixture, candidates: [fixture.referenceOutput] });
  if (verdict.verdict === 'INCONCLUSIVE') return null;
  return { score: verdict.score, k: 1 };
}
