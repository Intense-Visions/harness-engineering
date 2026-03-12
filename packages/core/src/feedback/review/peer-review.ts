import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type {
  AgentType,
  ReviewContext,
  PeerReview,
  PeerReviewOptions,
  FeedbackError,
} from '../types';
import { getFeedbackConfig } from '../config';
import { trackAction } from '../logging/emitter';

export async function requestPeerReview(
  agentType: AgentType,
  context: ReviewContext,
  options?: PeerReviewOptions
): Promise<Result<PeerReview, FeedbackError>> {
  const config = getFeedbackConfig();
  const executor = config.executor;

  if (!executor) {
    return Err({
      code: 'AGENT_SPAWN_ERROR',
      message: 'No agent executor configured',
      details: {},
      suggestions: ['Configure an AgentExecutor via configureFeedback()'],
    });
  }

  const tracker = trackAction('peer-review', {
    trigger: 'agent',
    files: context.files,
  });

  try {
    // Spawn the agent
    const spawnResult = await executor.spawn({
      type: agentType,
      customType: options?.customAgentType,
      context,
      skills: options?.skills,
      timeout: options?.timeout ?? config.defaultTimeout,
    });

    if (!spawnResult.ok) {
      await tracker.fail({ code: spawnResult.error.code, message: spawnResult.error.message });
      return spawnResult as Result<PeerReview, FeedbackError>;
    }

    // Wait for completion (default behavior)
    if (options?.wait !== false) {
      const waitResult = await executor.wait(
        spawnResult.value.id,
        options?.timeout ?? config.defaultTimeout
      );

      if (!waitResult.ok) {
        await tracker.fail({ code: waitResult.error.code, message: waitResult.error.message });
        return waitResult;
      }

      await tracker.complete({
        outcome: waitResult.value.approved ? 'success' : 'failure',
        summary: waitResult.value.approved
          ? 'Review approved'
          : `Review rejected: ${waitResult.value.comments.length} comments`,
        data: waitResult.value,
      });

      return waitResult;
    }

    // Return immediately without waiting
    await tracker.complete({
      outcome: 'success',
      summary: `Agent spawned: ${spawnResult.value.id}`,
      data: { processId: spawnResult.value.id },
    });

    // Return a placeholder review for non-wait case
    return Ok({
      agentId: spawnResult.value.id,
      agentType,
      approved: false, // Unknown until wait
      comments: [],
      suggestions: [],
      duration: 0,
      completedAt: '',
    });
  } catch (error) {
    await tracker.fail({
      code: 'AGENT_SPAWN_ERROR',
      message: String(error),
    });

    return Err({
      code: 'AGENT_SPAWN_ERROR',
      message: 'Failed to request peer review',
      details: { reason: String(error) },
      suggestions: ['Check executor configuration', 'Verify agent availability'],
    });
  }
}

export async function requestMultiplePeerReviews(
  requests: Array<{
    agentType: AgentType;
    context: ReviewContext;
    options?: PeerReviewOptions;
  }>
): Promise<Result<PeerReview[], FeedbackError>> {
  if (requests.length === 0) {
    return Ok([]);
  }

  const results = await Promise.all(
    requests.map(({ agentType, context, options }) =>
      requestPeerReview(agentType, context, options)
    )
  );

  // Check if any failed
  const firstError = results.find(r => !r.ok);
  if (firstError && !firstError.ok) {
    return Err(firstError.error);
  }

  // All succeeded
  return Ok(results.map(r => (r as { ok: true; value: PeerReview }).value));
}
