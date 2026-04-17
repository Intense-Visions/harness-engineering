import { Command } from 'commander';
import { execSync } from 'child_process';
import type { Result } from '@harness-engineering/core';
import { Ok, Err, parseDiff, runReviewPipeline } from '@harness-engineering/core';
import type { ReviewPipelineResult } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { OutputMode, type OutputModeType } from '../../output/formatter';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface ReviewOptions {
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  comment?: boolean;
  ci?: boolean;
  deep?: boolean;
  noMechanical?: boolean;
  thorough?: boolean;
  isolated?: boolean;
}

export async function runAgentReview(options: ReviewOptions): Promise<
  Result<
    {
      passed: boolean;
      checklist: Array<{ check: string; passed: boolean; details?: string }>;
      pipelineResult?: ReviewPipelineResult;
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

  // Get commit message
  let commitMessage = '';
  try {
    commitMessage = execSync('git log --oneline -1', { encoding: 'utf-8' }).trim();
  } catch {
    // No commit message available
  }

  // Build DiffInfo
  const diffInfo = {
    changedFiles: codeChanges.files.map((f) => f.path),
    newFiles: codeChanges.files.filter((f) => f.status === 'added').map((f) => f.path),
    deletedFiles: codeChanges.files.filter((f) => f.status === 'deleted').map((f) => f.path),
    totalDiffLines: diff.split('\n').length,
    fileDiffs: new Map(codeChanges.files.map((f) => [f.path, ''])),
  };

  // Run the unified pipeline
  const pipelineResult = await runReviewPipeline({
    projectRoot: config.rootDir,
    diff: diffInfo,
    commitMessage,
    flags: {
      comment: options.comment ?? false,
      ci: options.ci ?? false,
      deep: options.deep ?? false,
      noMechanical: options.noMechanical ?? false,
      ...(options.thorough ? { thorough: true } : {}),
      ...(options.isolated ? { isolated: true } : {}),
    },
    config: config as unknown as Record<string, unknown>,
  });

  return Ok({
    passed: pipelineResult.exitCode === 0,
    checklist: pipelineResult.findings.map((f) => ({
      check: `[${f.domain}] ${f.title}`,
      passed: f.severity === 'suggestion',
      details: f.rationale,
    })),
    pipelineResult,
  });
}

function resolveReviewMode(globalOpts: Record<string, unknown>): OutputModeType {
  if (globalOpts.json) return OutputMode.JSON;
  if (globalOpts.quiet) return OutputMode.QUIET;
  return OutputMode.TEXT;
}

function printReviewResult(
  result: Awaited<ReturnType<typeof runAgentReview>>,
  mode: OutputModeType
): void {
  if (!result.ok) return;
  const { pipelineResult } = result.value;
  if (mode === OutputMode.JSON) {
    console.log(
      JSON.stringify(
        {
          ...result.value,
          pipelineResult: pipelineResult
            ? {
                assessment: pipelineResult.assessment,
                findings: pipelineResult.findings,
                exitCode: pipelineResult.exitCode,
              }
            : undefined,
        },
        null,
        2
      )
    );
  } else if (mode !== OutputMode.QUIET) {
    if (pipelineResult) {
      console.log(pipelineResult.terminalOutput);
    } else {
      console.log(result.value.passed ? 'v Self-review passed' : 'x Self-review found issues');
    }
  }
}

export function createReviewCommand(): Command {
  return new Command('review')
    .description('Run unified code review pipeline on current changes')
    .option('--comment', 'Post inline comments to GitHub PR')
    .option('--ci', 'Enable eligibility gate, non-interactive output')
    .option('--deep', 'Add threat modeling pass to security agent')
    .option('--no-mechanical', 'Skip mechanical checks')
    .option('--thorough', 'Generate task-specific rubric before reading implementation')
    .option(
      '--isolated',
      'Two-stage review: spec-compliance then code-quality with disjoint context'
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveReviewMode(globalOpts);

      const result = await runAgentReview({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        comment: opts.comment,
        ci: opts.ci,
        deep: opts.deep,
        noMechanical: opts.mechanical === false,
        thorough: opts.thorough,
        isolated: opts.isolated,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      printReviewResult(result, mode);
      const { pipelineResult } = result.value;
      process.exit(
        pipelineResult
          ? pipelineResult.exitCode
          : result.value.passed
            ? ExitCode.SUCCESS
            : ExitCode.VALIDATION_FAILED
      );
    });
}
