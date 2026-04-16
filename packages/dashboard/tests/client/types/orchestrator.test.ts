import { describe, it, expect } from 'vitest';
import type {
  OrchestratorSnapshot,
  RunningAgent,
  TokenTotals,
  PendingInteraction,
  WebSocketMessage,
  ChatSSEEvent,
} from '../../../src/client/types/orchestrator';

describe('orchestrator dashboard types', () => {
  it('OrchestratorSnapshot has all required fields', () => {
    const snapshot: OrchestratorSnapshot = {
      running: [],
      retryAttempts: [],
      claimed: [],
      tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
      maxConcurrentAgents: 5,
      globalCooldownUntilMs: null,
      recentRequestTimestamps: [],
      recentInputTokens: [],
      recentOutputTokens: [],
      maxRequestsPerMinute: 50,
      maxRequestsPerSecond: 2,
      maxInputTokensPerMinute: 0,
      maxOutputTokensPerMinute: 0,
    };
    expect(snapshot.maxConcurrentAgents).toBe(5);
  });

  it('RunningAgent has session fields', () => {
    const agent: RunningAgent = {
      issueId: 'issue-1',
      identifier: 'test-issue',
      phase: 'StreamingTurn',
      session: {
        backendName: 'local',
        totalTokens: 100,
        turnCount: 3,
        lastMessage: 'Working...',
      },
    };
    expect(agent.session?.totalTokens).toBe(100);
  });

  it('PendingInteraction has context fields', () => {
    const interaction: PendingInteraction = {
      id: 'int-1',
      issueId: 'issue-1',
      type: 'needs-human',
      reasons: ['full-exploration scope'],
      context: {
        issueTitle: 'Add feature X',
        issueDescription: 'Description',
        specPath: null,
        planPath: null,
        relatedFiles: [],
      },
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    expect(interaction.status).toBe('pending');
  });

  it('WebSocketMessage discriminates by type', () => {
    const msg: WebSocketMessage = {
      type: 'state_change',
      data: {
        running: [],
        retryAttempts: [],
        claimed: [],
        tokenTotals: { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 },
        maxConcurrentAgents: 5,
        globalCooldownUntilMs: null,
        recentRequestTimestamps: [],
        recentInputTokens: [],
        recentOutputTokens: [],
        maxRequestsPerMinute: 50,
        maxRequestsPerSecond: 2,
        maxInputTokensPerMinute: 0,
        maxOutputTokensPerMinute: 0,
      },
    };
    expect(msg.type).toBe('state_change');
  });

  it('ChatSSEEvent covers text, usage, error, and done', () => {
    const text: ChatSSEEvent = { type: 'text', text: 'Hello' };
    const usage: ChatSSEEvent = { type: 'usage', inputTokens: 10, outputTokens: 20 };
    const error: ChatSSEEvent = { type: 'error', error: 'fail' };
    expect(text.type).toBe('text');
    expect(usage.type).toBe('usage');
    expect(error.type).toBe('error');
  });
});
