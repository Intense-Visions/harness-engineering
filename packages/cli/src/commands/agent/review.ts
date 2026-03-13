import { Command } from 'commander';
import { execSync } from 'child_process';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { createSelfReview, parseDiff } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { OutputMode, type OutputModeType } from '../../output/formatter';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface ReviewOptions {
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export async function runAgentReview(options: ReviewOptions): Promise<
  Result<
    {
      passed: boolean;
      checklist: Array<{ check: string; passed: boolean; details?: string }>;
    },
    CLIError
  >
> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }

  const config = configResult.value;

  // Get git diff
  let diff: string;
  try {
    diff = execSync('git diff --cached', { encoding: 'utf-8' });
    if (!diff) {
      diff = execSync('git diff', { encoding: 'utf-8' });
    }
  } catch {
    return Err(new CLIError('Failed to get git diff', ExitCode.ERROR));
  }

  if (!diff) {
    return Ok({
      passed: true,
      checklist: [{ check: 'No changes to review', passed: true }],
    });
  }

  // Parse diff
  const parsedDiffResult = parseDiff(diff);
  if (!parsedDiffResult.ok) {
    return Err(new CLIError(parsedDiffResult.error.message, ExitCode.ERROR));
  }

  const codeChanges = parsedDiffResult.value;

  // Create self-review with proper config
  const review = await createSelfReview(codeChanges, {
    rootDir: config.rootDir,
    diffAnalysis: {
      enabled: true,
      checkTestCoverage: true,
    },
  });

  if (!review.ok) {
    return Err(new CLIError(review.error.message, ExitCode.ERROR));
  }

  return Ok({
    passed: review.value.passed,
    checklist: review.value.items.map((item) => ({
      check: item.check,
      passed: item.passed,
      details: item.details,
    })),
  });
}

export function createReviewCommand(): Command {
  return new Command('review')
    .description('Run self-review on current changes')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : OutputMode.TEXT;

      const result = await runAgentReview({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        console.log(result.value.passed ? 'v Self-review passed' : 'x Self-review found issues');
        console.log('');

        for (const item of result.value.checklist) {
          const icon = item.passed ? 'v' : 'x';
          console.log(`  ${icon} ${item.check}`);
          if (item.details && !item.passed) {
            console.log(`    ${item.details}`);
          }
        }
      }

      process.exit(result.value.passed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
