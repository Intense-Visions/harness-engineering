import { Command } from 'commander';
import * as path from 'path';
import * as childProcess from 'child_process';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { requestPeerReview, type AgentType } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';
import { loadPersona } from '../../persona/loader';
import { runPersona, type CommandExecutor } from '../../persona/runner';

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
    .argument('[task]', 'Task to run (review, doc-review, test-review)')
    .option('--timeout <ms>', 'Timeout in milliseconds', '300000')
    .option('--persona <name>', 'Run a persona by name')
    .action(async (task, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      if (opts.persona) {
        const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
        const personasDir = path.join(repoRoot, 'agents', 'personas');
        const filePath = path.join(personasDir, `${opts.persona}.yaml`);
        const personaResult = loadPersona(filePath);
        if (!personaResult.ok) {
          logger.error(personaResult.error.message);
          process.exit(ExitCode.ERROR);
        }
        const persona = personaResult.value;

        const executor: CommandExecutor = async (command: string) => {
          try {
            childProcess.execSync(`npx harness ${command}`, { stdio: 'inherit' });
            return Ok(null);
          } catch (error) {
            return Err(new Error(error instanceof Error ? error.message : String(error)));
          }
        };

        const report = await runPersona(persona, executor);

        if (!globalOpts.quiet) {
          logger.info(`Persona '${report.persona}' status: ${report.status}`);
          for (const c of report.commands) {
            const icon = c.status === 'pass' ? 'v' : c.status === 'fail' ? 'x' : '-';
            console.log(`  [${icon}] ${c.name} (${c.durationMs}ms)`);
          }
        }

        process.exit(report.status === 'fail' ? ExitCode.ERROR : ExitCode.SUCCESS);
      }

      if (!task) {
        logger.error('Either a task argument or --persona flag is required.');
        process.exit(ExitCode.ERROR);
      }

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
