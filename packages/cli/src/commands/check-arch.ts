import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import {
  Ok,
  Err,
  ArchConfigSchema,
  ArchBaselineManager,
  runAll,
  diff,
  resolveArchBaseline,
  isWholeSnapshotContext,
  loadArchAllowances,
  filterDiffByAllowances,
  writeArchAllowance,
  archAllowancesDir,
  archAllowanceSlug,
  ArchAllowanceSchema,
} from '@harness-engineering/core';
import type {
  ArchConfig,
  ArchBaseline,
  ArchDiffResult,
  ArchMetricCategory,
  ArchAllowance,
  AllowanceFilteredDiff,
  MetricResult,
  Violation,
} from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
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

/** A CheckArchResult that reports a clean baseline pass (no violations to surface). */
function cleanBaselineResult(extra: Partial<CheckArchResult>): CheckArchResult {
  return {
    passed: true,
    mode: 'baseline',
    totalViolations: 0,
    newViolations: [],
    resolvedViolations: [],
    preExisting: [],
    regressions: [],
    thresholdViolations: [],
    ...extra,
  };
}

/** A genuine error-severity threshold breach can never be waived by an allowance. */
function errorSeverityRefusal(errorNew: Violation[]): CLIError {
  const summary = errorNew.map((v) => `  - ${v.file}: ${v.detail}`).join('\n');
  return new CLIError(
    `Cannot allowance ${errorNew.length} error-severity violation(s) — a genuine ` +
      `threshold breach must be FIXED, not acknowledged:\n${summary}`,
    ExitCode.ERROR
  );
}

function missingReasonError(baselinePath: string): CLIError {
  return new CLIError(
    `Writing an arch allowance requires a reason. Re-run with:\n` +
      `  harness check-arch --update-baseline --reason "<why this regression is accepted>"\n` +
      `This writes a per-PR file under ${baselinePath.replace(/baselines\.json$/, 'allowances/')} ` +
      `and leaves baselines.json unchanged.`,
    ExitCode.ERROR
  );
}

/** Build the allowance payload from the still-uncovered items of a filtered diff. */
function buildAllowance(
  filtered: AllowanceFilteredDiff,
  reason: string,
  cwd: string
): ArchAllowance {
  const categories: Partial<Record<ArchMetricCategory, number>> = {};
  for (const r of filtered.regressions) categories[r.category] = r.currentValue;
  return {
    reason: reason.trim(),
    categories,
    violationIds: filtered.newViolations.map((v) => v.id).sort(),
    createdFrom: getCommitHash(cwd),
  };
}

/** The `reason` recorded in an existing allowance file, if it parses; else undefined. */
function existingAllowanceReason(ownFile: string): string | undefined {
  if (!fs.existsSync(ownFile)) return undefined;
  try {
    const parsed = ArchAllowanceSchema.safeParse(JSON.parse(fs.readFileSync(ownFile, 'utf-8')));
    return parsed.success ? parsed.data.reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * PR-context `--update-baseline`: write a uniquely-named per-PR ALLOWANCE file instead of
 * rewriting the shared snapshot (which is what caused the baselines.json merge cascade).
 * The allowance acknowledges the regression the branch introduces relative to the base
 * baseline; `refresh-baselines` on main later folds it in and deletes it. A genuine
 * error-severity threshold breach can never be allowanced — it must be fixed.
 */
function writeAllowanceUpdate(
  cwd: string,
  archConfig: ArchConfig,
  results: MetricResult[],
  baseBaseline: ArchBaseline,
  reason: string | undefined
): Result<CheckArchResult, CLIError> {
  const rawDiff = diff(results, baseBaseline, {
    regressionTolerance: archConfig.regressionTolerance,
  });
  const errorNew = rawDiff.newViolations.filter((v) => v.severity === 'error');
  if (errorNew.length > 0) return Err(errorSeverityRefusal(errorNew));

  // Exclude THIS branch's own allowance from the coverage filter so a re-run rebuilds the
  // FULL set of the branch's acknowledged violations vs base — not just the newly-uncovered
  // ones. Otherwise iterating (ack A, later add B) would rewrite the file as {B} and DROP A.
  const slug = archAllowanceSlug(cwd);
  const ownFile = path.join(archAllowancesDir(cwd, archConfig.baselinePath), `${slug}.json`);
  const coverage = loadArchAllowances(cwd, archConfig.baselinePath, { excludeFiles: [ownFile] });
  const filtered = filterDiffByAllowances(rawDiff, coverage);
  if (filtered.newViolations.length === 0 && filtered.regressions.length === 0) {
    return Ok(
      cleanBaselineResult({
        baselineUpdated: false,
        warning: 'Arch gate already passes against the base baseline; no allowance needed.',
      })
    );
  }

  // A bare `--update-baseline` re-run (no new --reason) reuses the reason already recorded
  // in this branch's own allowance, so iterating never demands the reason be re-typed.
  const effectiveReason = reason?.trim() || existingAllowanceReason(ownFile);
  if (!effectiveReason) return Err(missingReasonError(archConfig.baselinePath));

  const file = writeArchAllowance(
    cwd,
    archConfig.baselinePath,
    buildAllowance(filtered, effectiveReason, cwd),
    slug
  );
  return Ok(
    cleanBaselineResult({
      baselineUpdated: true,
      warning:
        `Wrote arch allowance ${file} ` +
        `(${filtered.regressions.length} regression(s), ${filtered.newViolations.length} new violation(s)). ` +
        `Commit it — baselines.json stays byte-identical to the base.`,
    })
  );
}

/**
 * Whole-snapshot `--update-baseline` (base branch / non-git context): the pre-existing
 * behavior. #530: an update that WORSENS a metric must be an explicit, recorded decision
 * (`--allow-regress --reason`), not a silent rewrite. #268: merge into the existing baseline
 * so categories absent from a partial collector run are not silently dropped.
 */
function wholeSnapshotUpdate(
  cwd: string,
  archConfig: ArchConfig,
  results: MetricResult[],
  manager: ArchBaselineManager,
  options: CheckArchOptions
): Result<CheckArchResult, CLIError> {
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
  manager.update(results, getCommitHash(cwd));
  return Ok(cleanBaselineResult({ baselineUpdated: true }));
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
    // Base-aware routing: in a PR (feature-branch) context, acknowledging a regression must
    // NOT rewrite the shared snapshot (the merge-cascade root cause). Write a uniquely-named
    // per-PR allowance file instead. On main / non-git the whole-snapshot behavior below is
    // preserved (the refresh-baselines job is the single writer of the committed snapshot).
    const resolution = resolveArchBaseline(cwd, archConfig.baselinePath, manager);
    if (resolution.source === 'base-ref' && resolution.baseline) {
      return writeAllowanceUpdate(cwd, archConfig, results, resolution.baseline, options.reason);
    }
    // Feature-branch SAFETY NET: the base ref was EXPECTED but unreadable (unfetched worktree,
    // shallow clone, or an unreadable base copy) AND this branch already has a committed
    // baseline. Falling through to `wholeSnapshotUpdate` here would REWRITE that shared snapshot
    // on the branch — silently reintroducing the exact `baselines.json` merge cascade #1140
    // exists to prevent. So acknowledge against the working-tree baseline via an allowance
    // instead; the snapshot stays byte-identical. Only the legitimate single-writer contexts
    // (base branch / non-git / HARNESS_ARCH_FORCE_WORKING_TREE / a genuine bootstrap where the
    // base has no baseline) still reach the whole-snapshot path below.
    if (
      !isWholeSnapshotContext(resolution) &&
      resolution.source === 'working-tree' &&
      resolution.baseline
    ) {
      return writeAllowanceUpdate(cwd, archConfig, results, resolution.baseline, options.reason);
    }
    // Base branch / non-git / forced / genuine bootstrap: whole-snapshot (single-writer trunk).
    return wholeSnapshotUpdate(cwd, archConfig, results, manager, options);
  }

  // Collect threshold violations from metric results. These are ALWAYS enforced and are
  // never subject to allowances — a genuine error-severity threshold breach hard-fails.
  const thresholdViolations = findThresholdViolations(results);

  // Load baseline, base-aware: in a PR context this is the base ref's committed baseline
  // (a true delta-vs-main); on main / non-git it is the working-tree file, as before.
  const resolution = resolveArchBaseline(cwd, archConfig.baselinePath, manager);
  const baseline = resolution.baseline;

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
  const rawDiff: ArchDiffResult = diff(results, baseline, {
    regressionTolerance: archConfig.regressionTolerance,
  });

  // Fold in per-PR allowances: an intentional (warning-level) regression acknowledged by an
  // allowance file no longer fails the gate, WITHOUT any change to baselines.json. Error-
  // severity new violations are never covered (see filterDiffByAllowances).
  const coverage = loadArchAllowances(cwd, archConfig.baselinePath);
  const diffResult = filterDiffByAllowances(rawDiff, coverage);

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

/** #691: emit the findings contract (new + threshold violations + regressions)
 * when `--findings-json` is set. Extracted so the action stays under the
 * complexity/length arch thresholds. */
function maybeEmitArchFindings(findingsJson: boolean | undefined, value: CheckArchResult): void {
  if (findingsJson) {
    console.log(formatFindingsContract(buildArchIssues(value).length, 'check-arch'));
  }
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
    .option('--findings-json', 'Emit findings contract as a trailing JSON line (#691)')
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
      maybeEmitArchFindings(opts.findingsJson, value);
      process.exit(value.passed ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
