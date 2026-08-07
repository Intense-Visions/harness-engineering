import { Command } from 'commander';
import type {
  Result,
  CICheckName,
  CICheckReport,
  CIFailOnSeverity,
  ConstraintStage,
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
  'traceability',
];

export async function runCICheck(options: {
  configPath?: string;
  skip?: CICheckName[];
  failOn?: CIFailOnSeverity;
  stage?: ConstraintStage;
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
  if (options.stage) input.stage = options.stage;

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

const VALID_STAGES: ConstraintStage[] = ['pre-commit', 'pre-merge', 'pre-release'];

function isValidStage(stage: string): stage is ConstraintStage {
  return VALID_STAGES.includes(stage as ConstraintStage);
}

function checkLogFn(status: string): (msg: string) => void {
  if (status === 'pass') return logger.success;
  if (status === 'fail') return logger.error;
  if (status === 'warn') return logger.warn;
  return logger.dim;
}

function printConstraintPacks(report: CICheckReport): void {
  if (report.constraintPacks && report.constraintPacks.length > 0) {
    console.log('');
    logger.dim('Constraint packs:');
    for (const pack of report.constraintPacks) {
      const stageSummary = pack.stages.map((s) => `${s.stage}: ${s.status}`).join(', ');
      const nonCompliant = pack.stages.some((s) => s.status === 'non-compliant');
      const line = `  ${pack.pack} — ${stageSummary}`;
      (nonCompliant ? logger.error : logger.dim)(line);
    }
    // The packs only govern the security check; if it was skipped, their
    // elevations never ran and every stage is reported n/a. Warn so the opt-in
    // is not silently a no-op.
    const securitySkipped = report.checks.some((c) => c.name === 'security' && c.status === 'skip');
    if (securitySkipped) {
      logger.warn(
        'Constraint packs are opted in but the security check was skipped — their rules were not enforced.'
      );
    }
  }
  if (report.unknownConstraintPacks && report.unknownConstraintPacks.length > 0) {
    logger.warn(`Unknown constraint pack(s) ignored: ${report.unknownConstraintPacks.join(', ')}`);
  }
}

function printCheckReport(report: CICheckReport): void {
  for (const check of report.checks) {
    checkLogFn(check.status)(`${check.name}: ${check.status} (${check.durationMs}ms)`);
    for (const issue of check.issues) {
      const prefix = issue.severity === 'error' ? '  x' : '  !';
      console.log(`${prefix} ${issue.message}${issue.file ? ` (${issue.file})` : ''}`);
    }
  }
  printConstraintPacks(report);
  console.log('');
  if (report.exitCode === 0) {
    logger.success(`All checks passed (${report.summary.passed}/${report.summary.total})`);
  } else {
    logger.error(
      `${report.summary.failed} failed, ${report.summary.warnings} warnings, ${report.summary.passed} passed`
    );
  }
}

async function runCheckAction(
  opts: { skip?: string; failOn?: string; stage?: string },
  globalOpts: Record<string, unknown>
): Promise<void> {
  const mode = resolveOutputMode(globalOpts);
  const skip = parseSkip(opts.skip);
  const failOn = parseFailOn(opts.failOn);

  // Reject an unrecognized --stage instead of silently falling back to running
  // every stage (the most conservative gate), which would surprise a caller who
  // asked for one specific stage.
  if (opts.stage !== undefined && !isValidStage(opts.stage)) {
    const message = `Unrecognized --stage "${opts.stage}". Valid stages: ${VALID_STAGES.join(', ')}.`;
    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: message }));
    } else {
      logger.error(message);
    }
    process.exit(ExitCode.ERROR);
  }
  const stage = opts.stage !== undefined && isValidStage(opts.stage) ? opts.stage : undefined;

  const opts2: {
    configPath?: string;
    skip?: CICheckName[];
    failOn?: CIFailOnSeverity;
    stage?: ConstraintStage;
  } = {
    skip,
    failOn,
  };
  if (stage) opts2.stage = stage;
  if (typeof globalOpts.config === 'string') opts2.configPath = globalOpts.config;
  const result = await runCICheck(opts2);

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
    printCheckReport(report);
  }

  process.exit(report.exitCode);
}

export function createCheckCommand(): Command {
  return new Command('check')
    .description('Run all harness checks for CI (validate, deps, docs, entropy, phase-gate, arch)')
    .option('--skip <checks>', 'Comma-separated checks to skip (e.g., entropy,docs)')
    .option('--fail-on <severity>', 'Fail on severity level: error (default) or warning', 'error')
    .option(
      '--stage <stage>',
      'Enforce only the opted-in constraint packs for this lifecycle stage: pre-commit, pre-merge, or pre-release'
    )
    .action(async (opts, cmd) => {
      await runCheckAction(opts, cmd.optsWithGlobals());
    });
}
