import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  configureFeedback,
  resetFeedbackConfig,
  createSelfReview,
  requestPeerReview,
  getActionEmitter,
  parseDiff,
  NoOpExecutor,
  NoOpSink,
} from '../../../src/feedback';

describe('Feedback Module Integration', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
      emitEvents: true,
    });
  });

  it('should run complete self-review workflow', async () => {
    const eventHandler = vi.fn();
    const unsubscribe = getActionEmitter().on('action:*', eventHandler);

    // Parse diff
    const diffResult = parseDiff(`diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
+import { newFunc } from './new';
+
 export function main() {
+  newFunc();
 }`);

    expect(diffResult.ok).toBe(true);
    if (!diffResult.ok) return;

    // Run self-review with a custom rule that will always produce an item
    const reviewResult = await createSelfReview(diffResult.value, {
      rootDir: process.cwd(),
      diffAnalysis: {
        enabled: true,
        maxChangedFiles: 10,
      },
      customRules: [
        {
          id: 'has-commit-message',
          name: 'Commit message check',
          description: 'Ensure commit message is present',
          severity: 'info',
          check: async (changes) => ({
            passed: !!changes.commitMessage,
            details: changes.commitMessage ? 'Has commit message' : 'No commit message',
          }),
        },
      ],
    });

    expect(reviewResult.ok).toBe(true);
    if (reviewResult.ok) {
      // Custom rule always produces at least 1 item
      expect(reviewResult.value.items.length).toBeGreaterThanOrEqual(1);
      expect(reviewResult.value.summary).toBeDefined();
      // Verify our custom rule ran
      expect(reviewResult.value.items.some((i) => i.id === 'has-commit-message')).toBe(true);
    }

    unsubscribe();
  });

  it('should run complete peer review workflow', async () => {
    const eventHandler = vi.fn();
    const unsubscribe = getActionEmitter().on('action:completed', eventHandler);

    const result = await requestPeerReview('architecture-enforcer', {
      files: ['src/index.ts'],
      diff: 'test diff',
      commitMessage: 'feat: add new feature',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentType).toBe('architecture-enforcer');
      expect(result.value.approved).toBeDefined();
    }

    // Events should have been emitted
    expect(eventHandler).toHaveBeenCalled();

    unsubscribe();
  });

  it('should combine self-review and peer review', async () => {
    const changes = {
      diff: '+export function test() {}',
      files: [{ path: 'src/test.ts', status: 'added' as const, additions: 1, deletions: 0 }],
      commitMessage: 'feat: add test function',
    };

    // Self-review first
    const selfReview = await createSelfReview(changes, {
      rootDir: process.cwd(),
    });

    expect(selfReview.ok).toBe(true);

    // Then peer review
    const peerReview = await requestPeerReview('test-reviewer', {
      files: changes.files.map((f) => f.path),
      diff: changes.diff,
      commitMessage: changes.commitMessage,
    });

    expect(peerReview.ok).toBe(true);
  });
});
