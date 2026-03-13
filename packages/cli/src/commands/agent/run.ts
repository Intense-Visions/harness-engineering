import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { requestPeerReview, type AgentType } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface RunOptions {
  configPath?: string;
  timeout?: number;
}

export async function runAgentTask(
  task: string,
  options: RunOptions
): Promise<Result<{ success: boolean; output: string }, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }

  // Map task to agent type
  const agentTypeMap: Record<string, AgentType> = {
    review: 'architecture-enforcer',
    'doc-review': 'documentation-maintainer',
    'test-review': 'test-reviewer',
  };

  const agentType = agentTypeMap[task];
  if (!agentType) {
    return Err(
      new CLIError(
        `Unknown task: ${task}. Available: ${Object.keys(agentTypeMap).join(', ')}`,
        ExitCode.ERROR
      )
    );
  }

  const config = configResult.value;
  const timeout = options.timeout ?? config.agent?.timeout ?? 300000;

  // Request peer review using core library's executor
  const reviewResult = await requestPeerReview(
    agentType,
    {
      files: [],
      diff: '',
      commitMessage: task,
      metadata: { task, timeout },
    },
    { timeout }
  );

  if (!reviewResult.ok) {
    return Err(
      new CLIError(`Agent task failed: ${reviewResult.error.message}`, ExitCode.ERROR)
    );
  }

  const review = reviewResult.value;
  return Ok({
    success: review.approved,
    output: review.approved
      ? `Agent task '${task}' completed successfully`
      : `Agent task '${task}' found issues:\n${review.comments.map((c) => `  - ${c.message}`).join('\n')}`,
  });
}

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run an agent task')
    .argument('<task>', 'Task to run (review, doc-review, test-review)')
    .option('--timeout <ms>', 'Timeout in milliseconds', '300000')
    .action(async (task, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runAgentTask(task, {
        configPath: globalOpts.config,
        timeout: parseInt(opts.timeout, 10),
      });

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      logger.success(result.value.output);
      process.exit(ExitCode.SUCCESS);
    });
}
