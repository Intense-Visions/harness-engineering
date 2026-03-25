import { WorkflowConfig, Result, Ok, Err } from '@harness-engineering/types';

export function validateWorkflowConfig(config: any): Result<WorkflowConfig, Error> {
  if (!config) return Err(new Error('Config is missing'));
  if (!config.tracker) return Err(new Error('Config is missing tracker section'));
  if (!config.polling) return Err(new Error('Config is missing polling section'));
  if (!config.workspace) return Err(new Error('Config is missing workspace section'));
  if (!config.hooks) return Err(new Error('Config is missing hooks section'));
  if (!config.agent) return Err(new Error('Config is missing agent section'));
  if (!config.server) return Err(new Error('Config is missing server section'));

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
    },
    server: {
      port: 8080,
    },
  };
}
