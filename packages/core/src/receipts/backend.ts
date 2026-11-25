import type { ReviewBackend, ReviewTier } from '@harness-engineering/types';

export interface ResolveReviewBackendInput {
  /** `review.backend` from harness.config.json; undefined when unset. */
  configured: ReviewBackend | undefined;
  /** Whether a coded-pipeline runner is callable in the reviewing session. */
  pipelineRunnerAvailable: boolean;
  /** The review's tier. The coded pipeline applies to `full` only. */
  tier: ReviewTier;
}

export interface ResolvedReviewBackend {
  /** The backend the review actually runs on. This is what the receipt records. */
  backend: ReviewBackend;
  /** True when `pipeline` was configured and the review fell back to `agent`. */
  degraded: boolean;
  reason?: string;
}

/**
 * Spec D8: the coded pipeline is opt-in for the full tier; a light review always runs on the
 * agent backend. When the pipeline is configured and no runner resolves, the review runs on the
 * agent backend and says so; it never claims `pipeline`.
 */
export function resolveReviewBackend(input: ResolveReviewBackendInput): ResolvedReviewBackend {
  if (input.configured !== 'pipeline') return { backend: 'agent', degraded: false };
  if (input.tier === 'light') {
    const reason = 'review.backend "pipeline" applies to the full tier only';
    return { backend: 'agent', degraded: false, reason };
  }
  if (input.pipelineRunnerAvailable) return { backend: 'pipeline', degraded: false };
  return {
    backend: 'agent',
    degraded: true,
    reason:
      'review.backend is "pipeline" but no pipeline runner resolved; ran on the agent backend',
  };
}
