import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestPeerReview,
  requestMultiplePeerReviews,
} from '../../../src/feedback/review/peer-review';
import { configureFeedback, resetFeedbackConfig } from '../../../src/feedback/config';
import { NoOpExecutor } from '../../../src/feedback/executor/noop';
import { NoOpSink } from '../../../src/feedback/logging/sink';

describe('requestPeerReview()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
    });
  });

  it('should request review from architecture-enforcer', async () => {
    const result = await requestPeerReview('architecture-enforcer', {
      files: ['src/index.ts'],
      diff: 'test diff',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentType).toBe('architecture-enforcer');
      expect(result.value.approved).toBe(true); // NoOp always approves
    }
  });

  it('should request review with options', async () => {
    const result = await requestPeerReview(
      'test-reviewer',
      { files: ['src/test.ts'] },
      { skills: ['test-skill'], timeout: 60000 }
    );

    expect(result.ok).toBe(true);
  });

  it('should handle custom agent type', async () => {
    const result = await requestPeerReview(
      'custom',
      { files: ['src/index.ts'] },
      { customAgentType: 'my-custom-agent' }
    );

    expect(result.ok).toBe(true);
  });
});

describe('requestMultiplePeerReviews()', () => {
  beforeEach(() => {
    resetFeedbackConfig();
    configureFeedback({
      executor: new NoOpExecutor(),
      sinks: [new NoOpSink()],
    });
  });

  it('should request multiple reviews in parallel', async () => {
    const result = await requestMultiplePeerReviews([
      { agentType: 'architecture-enforcer', context: { files: ['src/a.ts'] } },
      { agentType: 'test-reviewer', context: { files: ['src/b.ts'] } },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0].agentType).toBe('architecture-enforcer');
      expect(result.value[1].agentType).toBe('test-reviewer');
    }
  });

  it('should return empty array for empty requests', async () => {
    const result = await requestMultiplePeerReviews([]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});
