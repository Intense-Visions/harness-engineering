import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import {
  Ok,
  Err,
  ArchConfigSchema,
  ArchBaselineManager,
  runAll,
  diff,
} from '@harness-engineering/core';
import type {
  ArchConfig,
  ArchDiffResult,
  MetricResult,
  Violation,
} from '@harness-engineering/core';
import { findConfigFile, loadConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

interface CheckArchOptions {
  cwd?: string;
  configPath?: string;
  updateBaseline?: boolean;
  json?: boolean;
  module?: string;
  /** Permit a `--update-baseline` that WORSENS a metric (else such an update is rejected). */
  allowRegress?: boolean;
  /** Human reason for an accepted regression; required with `--allow-regress`, logged to audit. */
  reason?: string;
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
 * Append an accepted arch-baseline regression to `.harness/audit.log` (#530) so the
 * decision to worsen a metric is durable and reviewable. Best-effort — a logging failure
 * must not block an otherwise-authorized update (the reason was still supplied on the CLI).
 */
function appendArchRegressionAudit(
  cwd: string,
  reason: string,
  regressions: ArchDiffResult['regressions']
): void {
  try {
    const dir = path.join(cwd, '.harness');
    fs.mkdirSync(dir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      event: 'arch-baseline-regression-accepted',
      commit: getCommitHash(cwd),
      reason,
      regressions: regressions.map((r) => ({
        category: r.category,
        from: r.baselineValue,
        to: r.currentValue,
        delta: r.delta,
      })),
    };
    fs.appendFileSync(path.join(dir, 'audit.log'), JSON.stringify(entry) + '\n');
  } catch {
    // Best-effort audit — never block the update on a logging failure.
  }
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
  // Resolve the config file's location first so the working directory can
  // default to the project that owns the config rather than the process's cwd.
  // The baseline is read/written relative to `cwd` (via ArchBaselineManager),
  // so without this a caller that points `-c` at a config in another directory
  // — including every action-handler test that passes a mkdtemp fixture config
  // — would run the collectors against, and write the baseline into,
  // process.cwd() instead of the config's own project. That leaked writes into
  // this repo's tracked packages/cli/.harness/arch/baselines.json (issue #911).
  const configPathResult = options.configPath ? Ok(options.configPath) : findConfigFile();
  if (!configPathResult.ok) {
    return configPathResult;
  }
  const configPath = configPathResult.value;

  const configResult = loadConfig(configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  const cwd = options.cwd ?? path.dirname(configPath);

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

  // Guard (issue #594): a module-scoped run produces only a subset of the
  // repo's metrics, but the baseline stores one aggregate value per category.
  // Merging a `--module`-filtered result via `manager.update` would overwrite
  // the whole-repo aggregate with the subset, making every later whole-repo
  // `ci check` report a permanent false regression. `--module` is valid for
  // scoping a diff (read) run, but never for updating the shared baseline.
  if (options.updateBaseline && options.module) {
    return Err(
      new CLIError(
        'Cannot combine --update-baseline with --module: a module-scoped update ' +
          'would overwrite the whole-repo aggregate baseline with a subset, ' +
          'producing false regressions. Run --update-baseline without --module.',
        ExitCode.ERROR
      )
    );
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
    // #530: a baseline update that WORSENS a metric must be an explicit, recorded
    // decision — not a silent rewrite. Diff the new results against the CURRENT
    // baseline; if that update would regress any category, reject it unless the
    // caller passed `--allow-regress --reason "…"`, and log the acceptance to the
    // audit trail. No existing baseline ⇒ nothing to worsen (first capture).
    const existingBaseline = manager.load();
    if (existingBaseline) {
      const regressions = diff(results, existingBaseline, {
        regressionTolerance: archConfig.regressionTolerance,
      }).regressions;
      if (regressions.length > 0) {
        const summary = regressions
          .map((r) => `  - ${r.category}: ${r.baselineValue} → ${r.currentValue} (+${r.delta})`)
          .join('\n');
        if (!options.allowRegress || !options.reason || options.reason.trim() === '') {
          return Err(
            new CLIError(
              `Refusing to update the baseline: it WORSENS ${regressions.length} metric(s):\n${summary}\n\n` +
                `A regression must be an explicit decision. Re-run with:\n` +
                `  harness check-arch --update-baseline --allow-regress --reason "<why this regression is accepted>"\n` +
                `The reason is recorded in .harness/audit.log.`,
              ExitCode.ERROR
            )
          );
        }
        appendArchRegressionAudit(cwd, options.reason, regressions);
      }
    }
    const commitHash = getCommitHash(cwd);
    // Merge into the existing baseline so categories absent from `results`
    // (e.g. silent collector failures) are not silently dropped (issue #268).
    manager.update(results, commitHash);
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

  // Baseline mode: run diff. Honor the configured regression tolerance so a
  // branch does not report false regressions (and force a baseline rewrite)
  // for the sub-tolerance drift it inherits when it merges `main`.
  const diffResult: ArchDiffResult = diff(results, baseline, {
    regressionTolerance: archConfig.regressionTolerance,
  });

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

function resolveOutputMode(globalOpts: Record<string, unknown>): OutputModeType {
  if (globalOpts.json) return OutputMode.JSON;
  if (globalOpts.quiet) return OutputMode.QUIET;
  if (globalOpts.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

function buildArchIssues(value: CheckArchResult) {
  return [
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
}

function printArchResult(
  value: CheckArchResult,
  mode: OutputModeType,
  formatter: OutputFormatter
): void {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.resolvedViolations.length > 0 && mode !== OutputMode.QUIET) {
    logger.success(`${value.resolvedViolations.length} violation(s) resolved since baseline.`);
  }
  const output = formatter.formatValidation({
    valid: value.passed,
    issues: buildArchIssues(value),
  });
  if (output) console.log(output);
}

export function createCheckArchCommand(): Command {
  const command = new Command('check-arch')
    .description('Check architecture assertions against baseline and thresholds')
    .option('--update-baseline', 'Capture current state as new baseline')
    .option('--module <path>', 'Check a single module')
    .option(
      '--allow-regress',
      'Permit a --update-baseline that worsens a metric (requires --reason)'
    )
    .option('--reason <text>', 'Why an accepted regression is acceptable (logged to audit)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCheckArch({
        configPath: globalOpts.config,
        updateBaseline: opts.updateBaseline,
        json: globalOpts.json,
        module: opts.module,
        allowRegress: opts.allowRegress,
        reason: opts.reason,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      const value = result.value;
      if (value.warning && mode !== OutputMode.JSON) logger.warn(value.warning);

      if (value.baselineUpdated) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ baselineUpdated: true }));
        else logger.success('Baseline updated successfully.');
        process.exit(ExitCode.SUCCESS);
        return;
      }

      printArchResult(value, mode, formatter);
      process.exit(value.passed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
