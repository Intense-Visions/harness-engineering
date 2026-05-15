import { Command } from 'commander';
import { execSync } from 'child_process';
import { validateBranchName, type BranchingConfig } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface VerifyOptions {
  configPath?: string;
}

export async function runVerify(options: VerifyOptions): Promise<void> {
  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    logger.error(configResult.error.message);
    process.exit(configResult.error.exitCode);
  }
  const config = configResult.value;

  const branchingConfig: BranchingConfig = {
    prefixes: config.compliance?.branching?.prefixes ?? [
      'feat',
      'fix',
      'chore',
      'docs',
      'refactor',
      'test',
      'perf',
    ],
    enforceKebabCase: config.compliance?.branching?.enforceKebabCase ?? true,
    customRegex: config.compliance?.branching?.customRegex,
    ignore: config.compliance?.branching?.ignore ?? [
      'main',
      'release/**',
      'dependabot/**',
      'harness/**',
    ],
  };

  // Get current branch name
  let branchName: string;
  try {
    branchName = execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    logger.error('Failed to determine current branch name. Are you in a git repository?');
    process.exit(ExitCode.ERROR);
  }

  const result = validateBranchName(branchName, branchingConfig);

  if (result.valid) {
    logger.success(`Branch name "${branchName}" is compliant.`);
    process.exit(ExitCode.SUCCESS);
  } else {
    logger.error(result.message || `Branch name "${branchName}" is not compliant.`);
    if (result.suggestion) {
      logger.info(`Suggestion: ${result.suggestion}`);
    }
    process.exit(ExitCode.VALIDATION_FAILED);
  }
}

export function createVerifyCommand(): Command {
  return new Command('verify')
    .description('Verify project conventions (e.g., branch naming)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await runVerify({
        configPath: globalOpts.config,
      });
    });
}
