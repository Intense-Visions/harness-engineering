import type { ComplexityVerdict } from '@harness-engineering/types';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { ComplexitySignals, Phase } from './types.js';
import { runStaticPass } from './static-pass.js';
import { llmTiebreak } from './tiebreak.js';

type Confidence = ComplexityVerdict['confidence'];
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * S3-001: pre-diff invocations never earn `high` confidence — even after an LLM
 * tie-break/escalation — because no diff evidence exists yet. Cap to `medium`.
 */
function capForPhase(confidence: Confidence, phase: Phase): Confidence {
  if (phase === 'pre-diff' && CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK.medium) {
    return 'medium';
  }
  return confidence;
}

/** Inputs to the cheap-first complexity cascade (D4). */
export interface ClassifyInput {
  signals: ComplexitySignals;
  phase: Phase;
  /** Whether the invocation's risk band is high (drives standard-tier escalation). */
  riskHigh: boolean;
  /** Prompt handed to the LLM tie-break / escalation. */
  prompt: string;
}

/**
 * D4 cascade: static pass → (if low confidence) fast-tier tie-break → (if still
 * low AND risk high) standard-tier escalation. Emits a `ComplexityVerdict` whose
 * `source` records which stage produced it. The static-only path resolves
 * without any LLM call ("never pay strong to route"); when `provider` is absent
 * the classifier stays fully offline and returns the static verdict.
 *
 * The LLM only sets `level`/`confidence`; the tier is always TS-derived (D3).
 */
export async function classify(
  input: ClassifyInput,
  provider?: AnalysisProvider,
  models?: { fast?: string; standard?: string }
): Promise<ComplexityVerdict> {
  const staticVerdict = runStaticPass(input.signals, input.phase);

  // High/medium-confidence static, or no provider available → static wins.
  if (staticVerdict.confidence !== 'low' || provider === undefined) {
    return {
      level: staticVerdict.level,
      confidence: staticVerdict.confidence,
      signals: staticVerdict.signals,
      source: 'static',
    };
  }

  // D4b: fast-tier tie-break. Never throws (conservative fallback internally).
  const tiebreak = await llmTiebreak(provider, input.prompt, models?.fast);

  // D4c: escalate to standard tier only when confidence stays low AND risk is high.
  if (tiebreak.confidence === 'low' && input.riskHigh) {
    const escalated = await llmTiebreak(provider, input.prompt, models?.standard);
    return {
      level: escalated.level,
      confidence: capForPhase(escalated.confidence, input.phase),
      signals: staticVerdict.signals,
      source: 'escalated',
    };
  }

  return {
    level: tiebreak.level,
    confidence: capForPhase(tiebreak.confidence, input.phase),
    signals: staticVerdict.signals,
    source: 'llm-tiebreak',
  };
}
