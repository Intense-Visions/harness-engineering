import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, EntropyAnalyzer } from '@harness-engineering/core';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

interface CheckPerfOptions {
  structural?: boolean;
  size?: boolean;
  coupling?: boolean;
}

interface CheckPerfResult {
  valid: boolean;
  violations: Array<{
    tier: number;
    severity: string;
    metric: string;
    file: string;
    value: number;
    threshold: number;
    message: string;
  }>;
  stats: {
    filesAnalyzed: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export async function runCheckPerf(
  cwd: string,
  options: CheckPerfOptions
): Promise<Result<CheckPerfResult, Error>> {
  const runAll = !options.structural && !options.size && !options.coupling;

  const analyzer = new EntropyAnalyzer({
    rootDir: path.resolve(cwd),
    analyze: {
      complexity: runAll || !!options.structural,
      coupling: runAll || !!options.coupling,
      sizeBudget: runAll || !!options.size,
    },
  });

  const analysisResult = await analyzer.analyze();
  if (!analysisResult.ok) {
    return Ok({
      valid: false,
      violations: [
        {
          tier: 1,
          severity: 'error',
          metric: 'analysis-error',
          file: '',
          value: 0,
          threshold: 0,
          message: `Analysis failed: ${analysisResult.error.message}`,
        },
      ],
      stats: { filesAnalyzed: 0, violationCount: 1, errorCount: 1, warningCount: 0, infoCount: 0 },
    });
  }

  const report = analysisResult.value;
  const violations: CheckPerfResult['violations'] = [];

  if (report.complexity) {
    for (const v of report.complexity.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: v.metric,
        file: v.file,
        value: v.value,
        threshold: v.threshold,
        message:
          v.message || `[Tier ${v.tier}] ${v.metric}: ${v.function} (${v.value} > ${v.threshold})`,
      });
    }
  }

  if (report.coupling) {
    for (const v of report.coupling.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: v.metric,
        file: v.file,
        value: v.value,
        threshold: v.threshold,
        message:
          v.message || `[Tier ${v.tier}] ${v.metric}: ${v.file} (${v.value} > ${v.threshold})`,
      });
    }
  }

  if (report.sizeBudget) {
    for (const v of report.sizeBudget.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: 'sizeBudget',
        file: v.package,
        value: v.currentSize,
        threshold: v.budgetSize,
        message: `[Tier ${v.tier}] Size: ${v.package} (${v.currentSize}B > ${v.budgetSize}B)`,
      });
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    valid: !hasErrors,
    violations,
    stats: {
      filesAnalyzed: report.complexity?.stats.filesAnalyzed ?? 0,
      violationCount: violations.length,
      errorCount,
      warningCount,
      infoCount,
    },
  });
}

async function runCheckPerfAction(
  opts: { structural?: boolean; coupling?: boolean; size?: boolean },
  globalOpts: { json?: boolean; quiet?: boolean; verbose?: boolean }
): Promise<void> {
  const mode: OutputModeType = globalOpts.json
    ? OutputMode.JSON
    : globalOpts.quiet
      ? OutputMode.QUIET
      : globalOpts.verbose
        ? OutputMode.VERBOSE
        : OutputMode.TEXT;

  const formatter = new OutputFormatter(mode);

  const result = await runCheckPerf(process.cwd(), {
    ...(opts.structural !== undefined && { structural: opts.structural }),
    ...(opts.coupling !== undefined && { coupling: opts.coupling }),
    ...(opts.size !== undefined && { size: opts.size }),
  });

  if (!result.ok) {
    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: result.error.message }));
    } else {
      logger.error(result.error.message);
    }
    process.exit(ExitCode.ERROR);
  }

  const issues = result.value.violations.map((v) => ({
    file: v.file,
    message: v.message,
  }));

  const output = formatter.formatValidation({
    valid: result.value.valid,
    issues,
  });

  if (output) {
    console.log(output);
  }

  process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

export function createCheckPerfCommand(): Command {
  const command = new Command('check-perf')
    .description('Run performance checks: structural complexity, coupling, and size budgets')
    .option('--structural', 'Run structural complexity checks only')
    .option('--coupling', 'Run coupling metric checks only')
    .option('--size', 'Run size budget checks only')
    .action(async (opts, cmd) => {
      await runCheckPerfAction(opts, cmd.optsWithGlobals());
    });

  return command;
}
