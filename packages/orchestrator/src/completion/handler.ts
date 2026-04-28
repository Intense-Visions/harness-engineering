import * as path from 'node:path';
import type { ExecutionOutcome } from '@harness-engineering/intelligence';
import { GitHubIssuesSyncAdapter, loadTrackerSyncConfig } from '@harness-engineering/core';
import { applyEvent } from '../core/state-machine';
import { extractHighlights, renderPRComment } from '../core/highlight-extractor';
import type { OrchestratorEvent, SideEffect } from '../types/events';
import type { OrchestratorContext } from '../types/orchestrator-context';

export type PostLifecycleCommentFn = (
  identifier: string,
  externalId: string | null,
  event: 'claimed' | 'completed' | 'released'
) => Promise<void>;

/**
 * Handles agent worker completion: outcome recording, tracker write-back,
 * highlight extraction, and PR comment posting.
 *
 * Extracted from the Orchestrator class to reduce file size and isolate
 * completion concerns.
 */
export class CompletionHandler {
  private ctx: OrchestratorContext;
  private postLifecycleComment: PostLifecycleCommentFn;

  constructor(ctx: OrchestratorContext, postLifecycleComment: PostLifecycleCommentFn) {
    this.ctx = ctx;
    this.postLifecycleComment = postLifecycleComment;
  }

  /**
   * Handles the full worker exit flow: finish recording, record outcome,
   * handle completion side effects, apply the state machine event, and
   * return effects for the orchestrator to process.
   */
  async handleWorkerExit(
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error: string | undefined,
    handleEffect: (effect: SideEffect) => Promise<void>
  ): Promise<void> {
    const entry = this.ctx.getState().running.get(issueId);

    // Finish stream recording with session stats
    if (entry?.session) {
      this.ctx.recorder.finishRecording(issueId, attempt ?? 1, reason, {
        inputTokens: entry.session.inputTokens,
        outputTokens: entry.session.outputTokens,
        turnCount: entry.session.turnCount,
      });
    }

    await this.recordOutcomeIfPipelineEnabled(issueId, reason, attempt, error, entry);
    await this.handleCompletionSideEffects(issueId, reason, entry);

    const event: OrchestratorEvent = {
      type: 'worker_exit',
      issueId,
      reason,
      error,
      attempt,
    };
    const { nextState, effects } = applyEvent(this.ctx.getState(), event, this.ctx.config);
    this.ctx.setState(nextState);

    // Process side effects immediately and await them
    for (const effect of effects) {
      await handleEffect(effect);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Infer a TaskType from issue labels.
   * Looks for common label patterns: bug/bugfix → 'bugfix', feat/feature → 'feature', etc.
   */
  private inferTaskType(labels: string[]): ExecutionOutcome['taskType'] {
    const joined = labels.map((l) => l.toLowerCase()).join(' ');
    if (/\bbug(fix)?\b/.test(joined)) return 'bugfix';
    if (/\bfeat(ure)?\b/.test(joined)) return 'feature';
    if (/\brefactor\b/.test(joined)) return 'refactor';
    if (/\bdoc(s|umentation)?\b/.test(joined)) return 'docs';
    if (/\btest(s|ing)?\b/.test(joined)) return 'test';
    if (/\bchore\b/.test(joined)) return 'chore';
    return undefined;
  }

  private async recordOutcomeIfPipelineEnabled(
    issueId: string,
    reason: 'normal' | 'error',
    attempt: number | null,
    error: string | undefined,
    entry:
      | {
          identifier: string;
          startedAt: string;
          session?: { backendName?: string };
          issue?: { labels?: string[] };
        }
      | undefined
  ): Promise<void> {
    if (!this.ctx.pipeline) return;

    const enrichedSpec = this.ctx.enrichedSpecsByIssue.get(issueId);
    const affectedSystemNodeIds = enrichedSpec
      ? enrichedSpec.affectedSystems
          .filter((s) => s.graphNodeId !== null)
          .map((s) => s.graphNodeId!)
      : [];

    // Derive agentPersona from the already-captured entry (avoids re-fetching
    // from state which may have been mutated by handleCompletionSideEffects)
    const agentPersona = entry?.session?.backendName ?? this.ctx.config.agent.backend ?? 'default';

    // Derive taskType from issue labels
    const labels = entry?.issue?.labels ?? [];
    const taskType = this.inferTaskType(labels);

    const outcome: ExecutionOutcome = {
      id: `outcome:${issueId}:${attempt ?? 0}`,
      issueId,
      identifier: entry?.identifier ?? issueId,
      result: reason === 'normal' ? 'success' : 'failure',
      retryCount: attempt ?? 0,
      failureReasons: error ? [error] : [],
      durationMs: entry ? Date.now() - new Date(entry.startedAt).getTime() : 0,
      linkedSpecId: enrichedSpec?.id ?? null,
      affectedSystemNodeIds,
      timestamp: new Date().toISOString(),
      agentPersona,
      ...(taskType ? { taskType } : {}),
    };

    try {
      this.ctx.pipeline.recordOutcome(outcome);
      this.ctx.logger.info(`Recorded execution outcome for ${issueId}: ${reason}`, {
        issueId,
        result: outcome.result,
      });
      if (this.ctx.graphStore) {
        const graphDir = path.join(this.ctx.config.workspace.root, '..', 'graph');
        await this.ctx.graphStore.save(graphDir);
      }
    } catch (err) {
      this.ctx.logger.warn(`Failed to record execution outcome for ${issueId}`, {
        error: String(err),
      });
    }

    if (reason === 'normal') {
      this.ctx.enrichedSpecsByIssue.delete(issueId);
    }
  }

  private async handleCompletionSideEffects(
    issueId: string,
    reason: 'normal' | 'error',
    entry?: { identifier: string; issue: { externalId?: string | null } }
  ): Promise<void> {
    if (reason !== 'normal') return;

    if (entry) {
      await this.postLifecycleComment(
        entry.identifier,
        entry.issue.externalId ?? null,
        'completed'
      );
    }

    // Extract highlights and post session summary to PR
    await this.postSessionHighlights(issueId, entry);

    try {
      const result = await this.ctx.tracker.markIssueComplete(issueId);
      if (!result.ok) {
        this.ctx.logger.warn(`Tracker write-back failed for ${issueId}: ${String(result.error)}`, {
          issueId,
        });
      }
    } catch (err) {
      this.ctx.logger.warn(`Tracker write-back threw for ${issueId}`, {
        issueId,
        error: String(err),
      });
    }
  }

  private async postSessionHighlights(
    issueId: string,
    entry?: { identifier: string; issue: { externalId?: string | null } }
  ): Promise<void> {
    try {
      const manifest = this.ctx.recorder.getManifest(issueId);
      if (!manifest) return;

      // Try to detect and link PR
      if (entry) {
        const prResult = await this.ctx.prDetector.branchHasPullRequest(entry.identifier);
        if (prResult.found) {
          // We don't have the PR number directly from branchHasPullRequest, so
          // the linkage will happen when the sweep detects PR status. For now,
          // focus on highlight extraction and comment posting.
        }
      }

      const latestAttempt = manifest.attempts[manifest.attempts.length - 1];
      if (!latestAttempt) return;

      const streamContent = this.ctx.recorder.getStream(issueId, latestAttempt.attempt);
      if (!streamContent) return;

      const highlights = extractHighlights(streamContent);
      this.ctx.recorder.updateHighlights(issueId, highlights);

      // Post highlights comment to PR if we have an external ID
      if (entry?.issue.externalId && highlights.length > 0) {
        const trackerConfig = loadTrackerSyncConfig(this.ctx.projectRoot);
        if (!trackerConfig) return;

        const token = process.env.GITHUB_TOKEN;
        if (!token) return;

        const orchestratorId = await this.ctx.orchestratorIdPromise;
        const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
        const comment = renderPRComment(latestAttempt.stats, highlights, orchestratorId);

        const result = await adapter.addComment(entry.issue.externalId, comment);
        if (result.ok) {
          this.ctx.recorder.markHighlightsPosted(issueId);
        } else {
          this.ctx.logger.warn(
            `Session highlight comment failed for ${issueId}: ${result.error.message}`
          );
        }
      }
    } catch (err) {
      this.ctx.logger.warn(`Highlight extraction/posting failed for ${issueId}`, {
        issueId,
        error: String(err),
      });
    }
  }
}
