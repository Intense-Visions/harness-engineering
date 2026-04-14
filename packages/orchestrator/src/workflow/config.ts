import { WorkflowConfig, Result, Ok, Err } from '@harness-engineering/types';

export function validateWorkflowConfig(config: unknown): Result<WorkflowConfig, Error> {
  if (!config || typeof config !== 'object')
    return Err(new Error('Config is missing or not an object'));

  const c = config as Record<string, unknown>;
  if (!c.tracker) return Err(new Error('Config is missing tracker section'));
  if (!c.polling) return Err(new Error('Config is missing polling section'));
  if (!c.workspace) return Err(new Error('Config is missing workspace section'));
  if (!c.hooks) return Err(new Error('Config is missing hooks section'));
  if (!c.agent) return Err(new Error('Config is missing agent section'));
  if (!c.server) return Err(new Error('Config is missing server section'));

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
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 300000,
      readTimeoutMs: 30000,
      stallTimeoutMs: 60000,
      escalation: {
        alwaysHuman: ['full-exploration'],
        autoExecute: ['quick-fix', 'diagnostic'],
        signalGated: ['guided-change'],
        diagnosticRetryBudget: 1,
      },
    },
    server: {
      port: 8080,
    },
  };
}
