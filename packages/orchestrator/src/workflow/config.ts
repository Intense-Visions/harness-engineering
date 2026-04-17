import { WorkflowConfig, Result, Ok, Err } from '@harness-engineering/types';

const REQUIRED_SECTIONS = ['tracker', 'polling', 'workspace', 'hooks', 'agent', 'server'] as const;

export function validateWorkflowConfig(config: unknown): Result<WorkflowConfig, Error> {
  if (!config || typeof config !== 'object')
    return Err(new Error('Config is missing or not an object'));

  const c = config as Record<string, unknown>;
  for (const section of REQUIRED_SECTIONS) {
    if (!c[section]) return Err(new Error(`Config is missing ${section} section`));
  }

  if (
    c.intelligence !== undefined &&
    (typeof c.intelligence !== 'object' || c.intelligence === null)
  ) {
    return Err(new Error('Config intelligence section must be an object if present'));
  }

  return Ok(config as WorkflowConfig);
}

export function getDefaultConfig(): WorkflowConfig {
  return {
    tracker: {
      kind: 'roadmap',
      filePath: 'docs/roadmap.md',
      activeStates: ['planned', 'in-progress'],
      terminalStates: ['done'],
    },
    polling: {
      intervalMs: 30000,
      jitterMs: 0,
    },
    workspace: {
      root: '.harness/workspaces',
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 1,
      maxTurns: 10,
      maxRetryBackoffMs: 5000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 300000,
      readTimeoutMs: 30000,
      stallTimeoutMs: 60000,
      escalation: {
        alwaysHuman: ['full-exploration'],
        autoExecute: ['quick-fix', 'diagnostic'],
        primaryExecute: [],
        signalGated: ['guided-change'],
        diagnosticRetryBudget: 1,
      },
    },
    server: {
      port: 8080,
    },
    intelligence: {
      enabled: false,
      requestTimeoutMs: 90_000,
      failureCacheTtlMs: 300_000,
    },
  };
}
