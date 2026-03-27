import { Command } from 'commander';
import type {
  Result,
  CICheckName,
  CICheckReport,
  CIFailOnSeverity,
} from '@harness-engineering/core';
import { runCIChecks } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

const VALID_CHECKS: CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'arch',
];

export async function runCICheck(options: {
  configPath?: string;
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
}): Promise<Result<CICheckReport, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }

  const input: Parameters<typeof runCIChecks>[0] = {
    projectRoot: process.cwd(),
    config: configResult.value as unknown as Record<string, unknown>,
  };
  if (options.skip) input.skip = options.skip;
  if (options.failOn) input.failOn = options.failOn;

  const result = await runCIChecks(input);

  if (!result.ok) {
    return {
      ok: false,
      error: new CLIError(result.error.message, ExitCode.ERROR),
    };
  }

  return { ok: true, value: result.value };
}

function parseSkip(skip?: string): CICheckName[] {
  if (!skip) return [];
  return skip
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CICheckName => VALID_CHECKS.includes(s as CICheckName));
}

function parseFailOn(failOn?: string): CIFailOnSeverity {
  if (failOn === 'warning') return 'warning';
  return 'error';
}

export function createCheckCommand(): Command {
  return new Command('check')
    .description('Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch)')
    .option('--skip <checks>', 'Comma-separated checks to skip (e.g., entropy,docs)')
    .option('--fail-on <severity>', 'Fail on severity level: error (default) or warning', 'error')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const skip = parseSkip(opts.skip);
      const failOn = parseFailOn(opts.failOn);

      const result = await runCICheck({
        configPath: globalOpts.config,
        skip,
        failOn,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(ExitCode.ERROR);
      }

      const report = result.value;

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(report, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        for (const check of report.checks) {
          const logFn =
            check.status === 'pass'
              ? logger.success
              : check.status === 'fail'
                ? logger.error
                : check.status === 'warn'
                  ? logger.warn
                  : logger.dim;
          logFn(`${check.name}: ${check.status} (${check.durationMs}ms)`);
          for (const issue of check.issues) {
            const prefix = issue.severity === 'error' ? '  x' : '  !';
            console.log(`${prefix} ${issue.message}${issue.file ? ` (${issue.file})` : ''}`);
          }
        }
        console.log('');
        if (report.exitCode === 0) {
          logger.success(`All checks passed (${report.summary.passed}/${report.summary.total})`);
        } else {
          logger.error(
            `${report.summary.failed} failed, ${report.summary.warnings} warnings, ${report.summary.passed} passed`
          );
        }
      }

      process.exit(report.exitCode);
    });
}
