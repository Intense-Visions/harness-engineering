import type { OrchestratorState } from '../types/internal';
import type { WorkflowConfig } from '@harness-engineering/types';

/**
 * Create an empty OrchestratorState initialized from config.
 */
export function createEmptyState(config: WorkflowConfig): OrchestratorState {
  return {
    pollIntervalMs: config.polling.intervalMs,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    globalCooldownMs: config.agent.globalCooldownMs ?? 60000,
    maxRequestsPerMinute: config.agent.maxRequestsPerMinute ?? 50,
    maxRequestsPerSecond: config.agent.maxRequestsPerSecond ?? 2,
    maxInputTokensPerMinute: config.agent.maxInputTokensPerMinute ?? 400000,
    maxOutputTokensPerMinute: config.agent.maxOutputTokensPerMinute ?? 80000,
    recentInputTokens: [],
    recentOutputTokens: [],
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Map(),
    tokenTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      secondsRunning: 0,
    },
    rateLimits: {
      requestsRemaining: null,
      requestsLimit: null,
      tokensRemaining: null,
      tokensLimit: null,
    },
    claimRejections: 0,
  };
}
