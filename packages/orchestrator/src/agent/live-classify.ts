import type { ComplexityVerdict, RoutingRequest } from '@harness-engineering/types';
import {
  classify,
  type AnalysisProvider,
  type ClassifyInput,
  type ComplexitySignals,
} from '@harness-engineering/intelligence';

/** Conservative verdict used when no text signals are available (D4). */
const CONSERVATIVE: ComplexityVerdict = {
  level: 'moderate',
  confidence: 'low',
  signals: {},
  source: 'static',
};

/**
 * AMR live-classifier seam (final-review finding #2). Binds the REAL intelligence
 * `classify` cascade into the {@link AdaptiveRouter}'s `classify(req)` seam,
 * replacing the Phase-3 constant `{moderate, low}` stub.
 *
 * Phase-awareness (S3-001): every dispatch-time invocation is `phase: 'pre-diff'`
 * — the classifier consumes ONLY the text signals the orchestrator actually knows
 * (`req.taskText`) and NEVER fabricates diff-based signals (no fake blast-radius).
 * The static pass caps pre-diff confidence at `medium`.
 *
 * Provider handling: when `resolveProvider()` returns an {@link AnalysisProvider},
 * the cascade may spend a fast-tier tie-break to sharpen a low-confidence static
 * verdict; when it returns `undefined` (no intelligence provider configured, or
 * the pipeline hasn't started yet) the cascade stays FULLY OFFLINE and returns
 * the static verdict — it never throws.
 *
 * `req.taskText` absent ⇒ conservative `{moderate, low}` (D4). The wrapping
 * `AdaptiveRouter.classifySafe` still catches any unexpected throw/timeout, so a
 * classifier failure can never block dispatch.
 *
 * `resolveProvider` is a thunk (not an eager provider) because the orchestrator's
 * AnalysisProvider is only built in `start()`, AFTER the AdaptiveRouter is
 * constructed — the seam resolves it lazily, per dispatch.
 */
export function makeLiveClassify(
  resolveProvider: () => AnalysisProvider | undefined
): (req: RoutingRequest) => Promise<ComplexityVerdict> {
  return async (req: RoutingRequest): Promise<ComplexityVerdict> => {
    const taskText = req.taskText;
    // No pre-diff text signals available ⇒ conservative fallback (D4). This is
    // the "genuinely no signal" path, not a fabricated one.
    if (taskText === undefined) return CONSERVATIVE;

    // Pre-diff signals: text-only. Diff-based fields (filesTouched/blastRadius/…)
    // are intentionally left undefined — that is the whole point of S3-001.
    const signals: ComplexitySignals = {
      descriptionLength: taskText.descriptionLength,
      specExists: taskText.specExists,
      acceptanceMeasurable: taskText.acceptanceMeasurable,
    };

    // `riskHigh` gates the second (standard-tier) tie-break inside the cascade.
    // Derive it from the request's blast-radius/sensitivity when present; the
    // deriveRequiredTier D5 veto is applied independently downstream.
    const riskHigh =
      req.risk !== undefined &&
      (req.risk.sensitivePath === true ||
        req.risk.publicApi === true ||
        req.risk.layer === 'core' ||
        req.risk.layer === 'types');

    const input: ClassifyInput = {
      signals,
      phase: 'pre-diff',
      riskHigh,
      prompt: taskText.prompt,
    };

    return classify(input, resolveProvider());
  };
}
