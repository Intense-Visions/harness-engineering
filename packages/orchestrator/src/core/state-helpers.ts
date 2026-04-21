import type { OrchestratorState } from '../types/internal';
import type { WorkflowConfig } from '@harness-engineering/types';

const RATE_LIMIT_DEFAULTS = {
  globalCooldownMs: 60000,
  maxRequestsPerMinute: 50,
  maxRequestsPerSecond: 2,
  maxInputTokensPerMinute: 400000,
  maxOutputTokensPerMinute: 80000,
} as const;

function resolveRateLimits(agent: WorkflowConfig['agent']) {
  const overrides: Record<string, number> = {};
  for (const key of Object.keys(RATE_LIMIT_DEFAULTS) as (keyof typeof RATE_LIMIT_DEFAULTS)[]) {
    overrides[key] = agent[key] ?? RATE_LIMIT_DEFAULTS[key];
  }
  return overrides as Record<keyof typeof RATE_LIMIT_DEFAULTS, number>;
}

/**
 * Create an empty OrchestratorState initialized from config.
 */
export function createEmptyState(config: WorkflowConfig): OrchestratorState {
  const limits = resolveRateLimits(config.agent);
  return {
    pollIntervalMs: config.polling.intervalMs,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    globalCooldownUntilMs: null,
    recentRequestTimestamps: [],
    ...limits,
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
