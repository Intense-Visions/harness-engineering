import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import { Ok, ArchConfigSchema, ArchBaselineManager, runAll, diff } from '@harness-engineering/core';
import type {
  ArchConfig,
  ArchDiffResult,
  MetricResult,
  Violation,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { execSync } from 'node:child_process';

interface CheckArchOptions {
  cwd?: string;
  configPath?: string;
  updateBaseline?: boolean;
  json?: boolean;
  module?: string;
}

export interface CheckArchResult {
  passed: boolean;
  mode: 'baseline' | 'threshold-only';
  totalViolations: number;
  newViolations: Violation[];
  resolvedViolations: string[];
  preExisting: string[];
  regressions: Array<{
    category: string;
    baselineValue: number;
    currentValue: number;
    delta: number;
  }>;
  thresholdViolations: Violation[];
  baselineUpdated?: boolean;
  warning?: string;
}

function getCommitHash(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function filterByModule(results: MetricResult[], modulePath: string): MetricResult[] {
  const normalized = modulePath.replace(/\/+$/, '');
  return results.filter((r) => r.scope === normalized || r.scope.startsWith(normalized + '/'));
}

/**
 * Check whether any metric results contain threshold violations (severity: error).
 * This is used in threshold-only mode and combined with baseline diff in baseline mode.
 */
function findThresholdViolations(results: MetricResult[]): Violation[] {
  const violations: Violation[] = [];
  for (const result of results) {
    for (const v of result.violations) {
      if (v.severity === 'error') {
        violations.push(v);
      }
    }
  }
  return violations;
}

export async function runCheckArch(
  options: CheckArchOptions
): Promise<Result<CheckArchResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  // Resolve architecture config (defaults if not present)
  const archConfig: ArchConfig = config.architecture ?? ArchConfigSchema.parse({});

  if (!archConfig.enabled) {
    return Ok({
      passed: true,
      mode: 'threshold-only',
      totalViolations: 0,
      newViolations: [],
      resolvedViolations: [],
      preExisting: [],
      regressions: [],
      thresholdViolations: [],
    });
  }

  // Run all collectors
  let results = await runAll(archConfig, cwd);

  // Filter by module if --module specified
  if (options.module) {
    results = filterByModule(results, options.module);
  }

  const manager = new ArchBaselineManager(cwd, archConfig.baselinePath);

  // --update-baseline mode
  if (options.updateBaseline) {
    const commitHash = getCommitHash(cwd);
    const baseline = manager.capture(results, commitHash);
    manager.save(baseline);
    return Ok({
      passed: true,
      mode: 'baseline',
      totalViolations: 0,
      newViolations: [],
      resolvedViolations: [],
      preExisting: [],
      regressions: [],
      thresholdViolations: [],
      baselineUpdated: true,
    });
  }

  // Collect threshold violations from metric results
  const thresholdViolations = findThresholdViolations(results);

  // Load baseline
  const baseline = manager.load();

  if (!baseline) {
    // Threshold-only mode
    const passed = thresholdViolations.length === 0;
    return Ok({
      passed,
      mode: 'threshold-only',
      totalViolations: thresholdViolations.length,
      newViolations: [],
      resolvedViolations: [],
      preExisting: [],
      regressions: [],
      thresholdViolations,
      warning:
        'No baseline found. Running in threshold-only mode. Run with --update-baseline to capture current state.',
    });
  }

  // Baseline mode: run diff
  const diffResult: ArchDiffResult = diff(results, baseline);

  // Fail if EITHER threshold exceeded OR baseline regressed
  const passed = diffResult.passed && thresholdViolations.length === 0;

  return Ok({
    passed,
    mode: 'baseline',
    totalViolations: diffResult.newViolations.length + thresholdViolations.length,
    newViolations: diffResult.newViolations,
    resolvedViolations: diffResult.resolvedViolations,
    preExisting: diffResult.preExisting,
    regressions: diffResult.regressions,
    thresholdViolations,
  });
}

export function createCheckArchCommand(): Command {
  const command = new Command('check-arch')
    .description('Check architecture assertions against baseline and thresholds')
    .option('--update-baseline', 'Capture current state as new baseline')
    .option('--module <path>', 'Check a single module')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runCheckArch({
        configPath: globalOpts.config,
        updateBaseline: opts.updateBaseline,
        json: globalOpts.json,
        module: opts.module,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      const value = result.value;

      // Emit warning if in threshold-only mode
      if (value.warning && mode !== OutputMode.JSON) {
        logger.warn(value.warning);
      }

      if (value.baselineUpdated) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ baselineUpdated: true }));
        } else {
          logger.success('Baseline updated successfully.');
        }
        process.exit(ExitCode.SUCCESS);
        return;
      }

      // Build issues list for formatter
      const issues = [
        ...value.newViolations.map((v) => ({
          file: v.file,
          message: `New violation [${v.severity}]: ${v.detail}`,
        })),
        ...value.thresholdViolations.map((v) => ({
          file: v.file,
          message: `Threshold exceeded: ${v.detail}`,
        })),
        ...value.regressions.map((r) => ({
          message: `Regression in ${r.category}: ${r.baselineValue} -> ${r.currentValue} (+${r.delta})`,
        })),
      ];

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(value, null, 2));
      } else {
        // Show resolved violations as positive feedback
        if (value.resolvedViolations.length > 0 && mode !== OutputMode.QUIET) {
          logger.success(
            `${value.resolvedViolations.length} violation(s) resolved since baseline.`
          );
        }

        const output = formatter.formatValidation({
          valid: value.passed,
          issues,
        });

        if (output) {
          console.log(output);
        }
      }

      process.exit(value.passed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
