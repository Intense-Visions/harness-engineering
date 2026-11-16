import { Command } from 'commander';
import { loadAnalysisExclude } from '../config/analysis-schema.js';
import { withDependencyRules } from '../config/arch-dependency-rules';
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
import { resolveProject } from '../config/loader';
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

/**
 * What one collector actually measured, carried through to `--json` so a 0 can
 * be told apart from an abstention (issue #2235).
 *
 * `value` alone is ambiguous: `layer-violations: 0` is a clean result when
 * `layersConfigured > 0` and `modulesAnalyzed > 0`; an abstention when
 * `modulesAnalyzed` is 0 despite configured layers, when `skipped` is set (the
 * parser was unavailable and the collector fell back), or when `error` is set
 * (the collector threw and `runAll` substituted a zero); and merely *not
 * applicable* when the project declared no `layers` at all, because `layers` is
 * optional and a project without one has nothing to measure.
 * `classifyMeasurement` draws that three-way distinction — taking "did the
 * project declare this?" from `ConfiguredCategories` (the config) rather than
 * from `layersConfigured` (what the collector received), so configured rules
 * that never reached a collector stay loud. `baselines.json` and the arch
 * timeline store only `value` + violation IDs, so this is the surface those
 * denominators are observable on.
 */
export interface ArchMeasurement {
  category: ArchMetricCategory;
  scope: string;
  value: number;
  violationCount: number;
  metadata?: Record<string, unknown> | undefined;
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
  /**
   * Per-collector denominators and abstention markers; see `ArchMeasurement`.
   * Optional so that adding it stays purely additive for external consumers
   * that construct a `CheckArchResult`. `runCheckArch` always populates it.
   */
  measurements?: ArchMeasurement[];
  /**
   * Which rule-driven categories the project declared, read from the project
   * config — the authoritative answer to "is this category configured?" that a
   * collector's own denominator cannot give. Optional for the same additivity
   * reason; `runCheckArch` always populates it.
   */
  configuredCategories?: ConfiguredCategories;
  /**
   * Categories whose collector threw or abstained this run (#2268). They are
   * excluded from the baseline diff — their `0` is "unknown", not an
   * improvement — and `--update-baseline` leaves their baseline entries
   * untouched. Optional for additivity; `runCheckArch` populates it whenever
   * the collectors ran.
   */
  abstainedCategories?: ArchMetricCategory[];
  baselineUpdated?: boolean;
  warning?: string;
  /**
   * Allowance files present but not applied (bad JSON / schema mismatch), with why.
   * Optional for additivity; populated in baseline mode so the skip is never silent.
   */
  skippedAllowances?: Array<{ file: string; reason: string }>;
}

/**
 * Project each collector result down to its value plus the denominators it
 * recorded. Without this the `metadata` every collector populates is read by
 * exactly one place in the repo (`architecture/matchers.ts`, for module-size's
 * `fileCount`) and is dropped by both the baseline and the timeline writers, so
 * "measured nothing" would be indistinguishable from "0 violations" in every
 * user-visible output.
 */
function summarizeMeasurements(results: MetricResult[]): ArchMeasurement[] {
  return results.map((r) => ({
    category: r.category,
    scope: r.scope,
    value: r.value,
    violationCount: r.violations.length,
    ...(r.metadata ? { metadata: r.metadata } : {}),
  }));
}

/**
 * Which rule-driven categories the *project* declared, read from the project
 * config rather than from what a collector reported receiving.
 *
 * This distinction is the whole point. A collector's own `layersConfigured: 0`
 * cannot tell "the project configured no layers" apart from "the project
 * configured layers that never reached the collector" — and the second is
 * exactly the #2235 defect this reporting exists to catch. Sourcing the answer
 * from the config at the injection point makes the surface correct by
 * construction instead of correct by accident of the current validation: a
 * future `runCheckArch`-adjacent call site that forgets `withDependencyRules`
 * then *warns* rather than going quiet.
 */
export interface ConfiguredCategories {
  /** The project declared at least one entry in the top-level `layers` block. */
  layers: boolean;
  /** The project declared at least one top-level `forbiddenImports` rule. */
  forbiddenImports: boolean;
}

/**
 * The config denominator each rule-driven category reports, paired with the
 * `ConfiguredCategories` flag that is authoritative for it. Categories absent
 * from this map have no config gate — they always apply.
 */
const CONFIG_GATED_CATEGORIES = {
  'layer-violations': { denominator: 'layersConfigured', declared: 'layers' },
  'forbidden-imports': { denominator: 'rulesConfigured', declared: 'forbiddenImports' },
} as const satisfies Record<string, { denominator: string; declared: keyof ConfiguredCategories }>;

/**
 * What the config gate says about a rule-driven category.
 *
 * - `not-applicable` — the project declared no rules here. Silent.
 * - `rules-not-received` — the project DID declare rules, yet the collector
 *   reports having received none. That is the #2235 defect itself (rules
 *   configured but never injected), so it is an abstention however many modules
 *   were parsed.
 * - `pass` — no config gate for this category, or the rules arrived.
 */
type ConfigGateVerdict = 'not-applicable' | 'rules-not-received' | 'pass';

/**
 * Compare what the project *declared* against what the collector *received*.
 *
 * With `declared` in hand the answer comes from the project config, so rules
 * that never reached the collector stay loud. Without it — an external consumer
 * classifying measurements it did not produce — fall back to the collector's own
 * zero config denominator, which is the only signal available and is what
 * `runCheckArch` always supersedes.
 */
function configGate(
  category: string,
  meta: Record<string, unknown>,
  declared: ConfiguredCategories | undefined
): ConfigGateVerdict {
  const gate = (
    CONFIG_GATED_CATEGORIES as Record<
      string,
      { denominator: string; declared: keyof ConfiguredCategories }
    >
  )[category];
  if (!gate) return 'pass';
  const reported = meta[gate.denominator];
  const receivedNone = typeof reported === 'number' && reported === 0;
  if (!declared) return receivedNone ? 'not-applicable' : 'pass';
  if (!declared[gate.declared]) return 'not-applicable';
  return receivedNone ? 'rules-not-received' : 'pass';
}

/**
 * Denominators that record how much work the collector actually *did*. A 0 here
 * while the category is configured is a malfunction — the rules exist, yet
 * nothing was analysed against them.
 */
const WORK_DENOMINATORS = ['modulesAnalyzed', 'filesAnalyzed'] as const;

/**
 * Work units counted *inside* the analysed files. Their 0 is a malfunction only
 * when no positive `filesAnalyzed` says real files were read (#2317): over real
 * files, `functionsAnalyzed=0` is the honest answer for a declaration-only or
 * types-only package, and `edgeCount=0` for an import-free one (`edgeCount`
 * counts in-project edges only, so such a package cannot contain a cycle).
 * Measured on `.d.ts`-only, re-export-barrel, types-only `.ts` and
 * bare-specifier-only fixtures: every one reported `filesAnalyzed > 0` with a 0
 * here, and every one used to abstain on a package that was measured and clean.
 */
const FILE_SCOPED_DENOMINATORS = ['edgeCount', 'functionsAnalyzed'] as const;

/** A zero work count, judged per the two denominator lists above. */
function reportsNoWork(meta: Record<string, unknown>): boolean {
  if (WORK_DENOMINATORS.some((key) => meta[key] === 0)) return true;
  const filesRead = typeof meta.filesAnalyzed === 'number' && meta.filesAnalyzed > 0;
  return !filesRead && FILE_SCOPED_DENOMINATORS.some((key) => meta[key] === 0);
}

/**
 * Denominators whose 0 is ambiguous on its own, each paired with the count that
 * corroborates it. A 0 is a malfunction only when the corroborating count says
 * there was something to find.
 *
 * `importEdges` (coupling, #2304) cannot simply join `WORK_DENOMINATORS`: a
 * declaration-only or import-free package genuinely has zero import edges over
 * real files (measured on `.d.ts`-only, re-export-barrel and types-only `.ts`
 * fixtures), and listing it there would make every such package abstain. The
 * collector therefore reports `importStatements` — import syntax counted from
 * the file text, independently of the parser — whenever `importEdges` is 0.
 * Import syntax present with no parsed edges is the hollow-snapshot shape of
 * #2284; no import syntax is a clean zero.
 *
 * When the corroborating key is absent (a collector that predates it) the 0
 * cannot be told apart from a clean result, so it is NOT treated as an
 * abstention — the pre-#2304 behaviour, not a new silence.
 */
const CORROBORATED_DENOMINATORS = {
  importEdges: 'importStatements',
} as const satisfies Record<string, string>;

/** The corroborated denominators that are 0 while their corroborating count is not. */
function uncorroboratedZeros(
  meta: Record<string, unknown>
): Array<{ key: string; witness: string; seen: number }> {
  return Object.entries(CORROBORATED_DENOMINATORS).flatMap(([key, witness]) => {
    const seen = meta[witness];
    return meta[key] === 0 && typeof seen === 'number' && seen > 0 ? [{ key, witness, seen }] : [];
  });
}

/**
 * Why a measurement's `value` is what it is.
 *
 * - `measured` — a real denominator backed the number; a 0 is a clean result.
 * - `not-applicable` — the category is not configured at all, so there was
 *   nothing to measure and nothing to fix. Silent.
 * - `abstained` — the collector could not run, or ran against configured rules
 *   and analysed nothing. A 0 here must not read as clean.
 */
export type MeasurementStatus = 'measured' | 'not-applicable' | 'abstained';

/**
 * Separate *not applicable* from *could not run*. Both yield `value: 0`, but
 * only the second is actionable, and warning about the first on every run
 * dilutes the signal this reporting exists to add: "your parser broke" must not
 * look identical to "you did not configure layers" (#2235).
 */
export function classifyMeasurement(
  m: ArchMeasurement,
  declared?: ConfiguredCategories
): MeasurementStatus {
  const meta = m.metadata;
  if (!meta) return 'measured';
  // Checked before `skipped`/`error` and before the work denominators: a
  // category the project does not use analysed nothing by definition, and a
  // collector failure inside it is not actionable either. The parser-health
  // signal is not lost — `circular-deps`, `complexity` and `coupling` carry no
  // config gate at all, so a dead parser still abstains loudly on three
  // categories.
  const gate = configGate(m.category, meta, declared);
  if (gate === 'not-applicable') return 'not-applicable';
  // DO NOT DELETE THIS BRANCH. Declared rules the collector never received is
  // the #2235 defect itself, and in that case `modulesAnalyzed` is *large*, not
  // zero: the collector happily parsed the whole repo and applied no rules to
  // it. So the work denominators find nothing wrong, and without this branch
  // the measurement classifies `measured` — a silent structural zero on the
  // very surface built to catch it. Sourcing the config answer correctly is
  // necessary but NOT sufficient; this branch is the other half.
  //
  // It sits above the `skipped`/`error` and work-denominator checks because
  // that is the order the reasoning reads in, not because the position is
  // load-bearing: every branch below it also returns `abstained`, and the only
  // thing after them is the `measured` fallthrough. Measured: moving this line
  // to just below the work-denominator computation leaves
  // `tests/commands/check-arch*` fully green, while DELETING it fails "flags
  // rules the project declared that never reached the collector" in
  // `check-arch-dependency-rules.test.ts` with `expected 'measured' to be
  // 'abstained'`. That test is the guard against deletion, which is the
  // reachable way to lose the behaviour — an earlier version of this comment
  // claimed it guarded against reordering, which it does not.
  if (gate === 'rules-not-received') return 'abstained';
  if (meta.skipped !== undefined || meta.error !== undefined) return 'abstained';
  if (reportsNoWork(meta)) return 'abstained';
  return uncorroboratedZeros(meta).length > 0 ? 'abstained' : 'measured';
}

/**
 * The measurements worth warning about: the collector abstained (parser
 * unavailable), threw (and `runAll` substituted a 0), or had configured rules
 * and still analysed nothing. A category the project never declared is
 * excluded — see `classifyMeasurement`.
 */
export function abstainedMeasurements(
  measurements: ArchMeasurement[],
  declared?: ConfiguredCategories
): ArchMeasurement[] {
  return measurements.filter((m) => classifyMeasurement(m, declared) === 'abstained');
}

/**
 * The collector output split into what may be scored and what may not (#2268).
 *
 * `MetricResult.value` is a number, so a collector that threw (and `runAll`
 * substituted a 0) or abstained reaches `diff()` and the baseline writer as a
 * plain 0. Against a baseline of N > 0 that reads as an improvement: the
 * category's known violations are reported resolved, a real regression in it
 * is masked, and `--update-baseline` writes the 0 down — permanently
 * discarding that category's tracked allowlist. So a category with ANY
 * abstained measurement is withheld from scoring as a whole: its aggregate is
 * not trustworthy if part of it is unknown.
 */
interface ScoredRun {
  /** Every collector result — the source of `measurements` and threshold checks. */
  all: MetricResult[];
  /** Results of measured categories only — the only input `diff` / the baseline writer see. */
  scored: MetricResult[];
  abstained: ArchMetricCategory[];
}

function scoreRun(results: MetricResult[], declared: ConfiguredCategories): ScoredRun {
  const abstained = [
    ...new Set(
      abstainedMeasurements(summarizeMeasurements(results), declared).map((m) => m.category)
    ),
  ].sort();
  const withheld = new Set<string>(abstained);
  return { all: results, scored: results.filter((r) => !withheld.has(r.category)), abstained };
}

/** The baseline minus abstained categories, so `diff` neither scores nor "resolves" them. */
function withoutAbstained(baseline: ArchBaseline, run: ScoredRun): ArchBaseline {
  if (run.abstained.length === 0) return baseline;
  const metrics = { ...baseline.metrics };
  for (const category of run.abstained) delete metrics[category];
  return { ...baseline, metrics };
}

/**
 * True when the run measured nothing at all: at least one category abstained
 * and none was measured. Such a run validated nothing, so it must not exit as
 * a pass — it exits `ZERO_DENOMINATOR`, the repo's abstention code.
 */
export function measuredNothing(value: CheckArchResult): boolean {
  const statuses = (value.measurements ?? []).map((m) =>
    classifyMeasurement(m, value.configuredCategories)
  );
  return statuses.includes('abstained') && !statuses.includes('measured');
}

function abstainedUpdateWarning(abstained: ArchMetricCategory[]): string | undefined {
  if (abstained.length === 0) return undefined;
  return (
    `Not updating the baseline for ${abstained.length} abstained categor${abstained.length === 1 ? 'y' : 'ies'} ` +
    `(${abstained.join(', ')}): the collector crashed or measured nothing, so its 0 is unknown, ` +
    `not an improvement. Those baseline entries were left unchanged.`
  );
}

/** Render an unknown metadata value for a log line without risking `[object Object]`. */
function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message;
  return JSON.stringify(value) ?? 'unknown';
}

/**
 * One-line reason an abstained measurement did not measure anything.
 *
 * Exported for the same reason as `classifyMeasurement`: this string is the
 * entire user-visible deliverable of the abstention channel, so it is worth
 * asserting directly rather than only through the logger.
 */
export function abstentionReason(m: ArchMeasurement, declared?: ConfiguredCategories): string {
  const meta = m.metadata ?? {};
  // Say "the rules did not reach the collector", never `layersConfigured=0`.
  // To a project that DID configure layers, the bare denominator reads as "you
  // did not configure layers" — a wrong answer confidently delivered, and the
  // exact confusion the not-applicable/rules-not-received split exists to
  // remove. Undoing that distinction in the one place a human reads it would
  // make the whole channel self-inconsistent.
  if (configGate(m.category, meta, declared) === 'rules-not-received') {
    return 'rules are configured but the collector received none — they did not reach it';
  }
  if (meta.error !== undefined) return `collector failed: ${describe(meta.error)}`;
  if (meta.skipped !== undefined) return `abstained: ${describe(meta.skipped)}`;
  // Before the generic zero listing: `importEdges=0` reads as "nothing to
  // measure", which is the one thing it does not mean here — the files DO
  // contain imports, and the parse returned none of them.
  const hollow = uncorroboratedZeros(meta);
  if (hollow.length > 0) {
    return hollow
      .map(
        ({ key, witness, seen }) =>
          `${key}=0 although the analysed files contain ${witness}=${seen} — the parse returned none of them`
      )
      .join('; ');
  }
  const zeroed = Object.entries(meta)
    .filter(([, v]) => typeof v === 'number' && v === 0)
    .map(([k]) => `${k}=0`);
  return zeroed.length > 0 ? `nothing to measure (${zeroed.join(', ')})` : 'nothing measured';
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
    measurements: [],
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

/**
 * Build the allowance payload from the still-uncovered items of a filtered diff.
 *
 * Merges with the branch's previous allowance (#2474) rather than replacing it: ids that
 * were already acknowledged keep the reason they were recorded under (a legacy file with no
 * per-id map attributes them to its top-level reason), only newly-added ids take `reason`,
 * and the top-level `reason` accumulates every distinct justification instead of being
 * overwritten by the latest one.
 */
function buildAllowance(
  filtered: AllowanceFilteredDiff,
  reason: string,
  cwd: string,
  previous: ArchAllowance | undefined
): ArchAllowance {
  const categories: Partial<Record<ArchMetricCategory, number>> = {};
  for (const r of filtered.regressions) categories[r.category] = r.currentValue;
  const newReason = reason.trim();
  const violationIds = filtered.newViolations.map((v) => v.id).sort();
  const previousIds = new Set(previous?.violationIds ?? []);
  const violationReasons: Record<string, string> = {};
  for (const id of violationIds) {
    const recorded =
      previous?.violationReasons[id] ?? (previousIds.has(id) ? previous?.reason : undefined);
    violationReasons[id] = recorded ?? newReason;
  }
  // Line-wise union, so a bare re-run (which reuses the accumulated reason) adds nothing.
  const reasons: string[] = [];
  for (const line of `${previous?.reason ?? ''}\n${newReason}`.split('\n')) {
    if (line.trim() !== '' && !reasons.includes(line)) reasons.push(line);
  }
  return {
    reason: reasons.join('\n'),
    categories,
    violationIds,
    violationReasons,
    createdFrom: getCommitHash(cwd),
  };
}

/** This branch's existing allowance, if the file is present and parses; else undefined. */
function readOwnAllowance(ownFile: string): ArchAllowance | undefined {
  if (!fs.existsSync(ownFile)) return undefined;
  try {
    const parsed = ArchAllowanceSchema.safeParse(JSON.parse(fs.readFileSync(ownFile, 'utf-8')));
    return parsed.success ? parsed.data : undefined;
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
  run: ScoredRun,
  baseBaseline: ArchBaseline,
  reason: string | undefined
): Result<CheckArchResult, CLIError> {
  const results = run.all;
  const rawDiff = diff(run.scored, withoutAbstained(baseBaseline, run), {
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
        measurements: summarizeMeasurements(results),
        baselineUpdated: false,
        warning: 'Arch gate already passes against the base baseline; no allowance needed.',
      })
    );
  }

  // A bare `--update-baseline` re-run (no new --reason) reuses the reason already recorded
  // in this branch's own allowance, so iterating never demands the reason be re-typed.
  const previous = readOwnAllowance(ownFile);
  const effectiveReason = reason?.trim() || previous?.reason;
  if (!effectiveReason) return Err(missingReasonError(archConfig.baselinePath));

  const file = writeArchAllowance(
    cwd,
    archConfig.baselinePath,
    buildAllowance(filtered, effectiveReason, cwd, previous),
    slug
  );
  return Ok(
    cleanBaselineResult({
      measurements: summarizeMeasurements(results),
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
  run: ScoredRun,
  manager: ArchBaselineManager,
  options: CheckArchOptions
): Result<CheckArchResult, CLIError> {
  const existingBaseline = manager.load();
  if (existingBaseline) {
    const regressions = diff(run.scored, withoutAbstained(existingBaseline, run), {
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
  // `update` merges into the existing file, so a category withheld from `scored`
  // keeps its committed entry exactly as it was (#268's merge, reused for #2268).
  manager.update(run.scored, getCommitHash(cwd));
  return Ok(
    cleanBaselineResult({ measurements: summarizeMeasurements(run.all), baselineUpdated: true })
  );
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
  const projectResult = resolveProject(options.configPath, options.cwd);
  if (!projectResult.ok) {
    return projectResult;
  }
  const { config, root: cwd } = projectResult.value;

  // Resolve architecture config (defaults if not present). The project-wide
  // `analysis.exclude` list is stacked onto the arch-scoped patterns here — in
  // the CLI, not in core, because the loader lives in this package and core must
  // not depend on it. Keeps `check-arch` consistent with every other analysis
  // scanner (entropy, ingest, security, doc-coverage), which already honor it.
  const baseArchConfig: ArchConfig = config.architecture ?? ArchConfigSchema.parse({});
  // The top-level `layers` / `forbiddenImports` rules are injected too, or the
  // layer-violation and forbidden-import collectors measure nothing (#2235).
  const archConfig: ArchConfig = withDependencyRules(
    {
      ...baseArchConfig,
      excludePatterns: [...baseArchConfig.excludePatterns, ...loadAnalysisExclude(cwd)],
    },
    config,
    cwd
  );
  // Read from `config`, NOT from `archConfig` or from what a collector reports
  // receiving: this is the record of what the project *declared*, so a future
  // injection that silently drops the rules reads as a malfunction rather than
  // as "not configured" (see `ConfiguredCategories`).
  const configuredCategories: ConfiguredCategories = {
    layers: (config.layers ?? []).length > 0,
    forbiddenImports: (config.forbiddenImports ?? []).length > 0,
  };
  /** Stamp the declared-category record onto every success path out of here. */
  const withCategories = (
    r: Result<CheckArchResult, CLIError>
  ): Result<CheckArchResult, CLIError> => (r.ok ? Ok({ ...r.value, configuredCategories }) : r);

  if (!archConfig.enabled) {
    return withCategories(
      Ok({
        passed: true,
        mode: 'threshold-only',
        totalViolations: 0,
        newViolations: [],
        resolvedViolations: [],
        preExisting: [],
        regressions: [],
        thresholdViolations: [],
        measurements: [],
      })
    );
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
  const run = scoreRun(results, configuredCategories);
  /** Stamp the declared categories and the abstention record onto an update result. */
  const withRun = (r: Result<CheckArchResult, CLIError>): Result<CheckArchResult, CLIError> => {
    if (!r.ok) return r;
    const warning = [r.value.warning, abstainedUpdateWarning(run.abstained)].filter(Boolean);
    return Ok({
      ...r.value,
      configuredCategories,
      abstainedCategories: run.abstained,
      ...(warning.length > 0 ? { warning: warning.join(' ') } : {}),
    });
  };

  // --update-baseline mode
  if (options.updateBaseline) {
    // Base-aware routing: in a PR (feature-branch) context, acknowledging a regression must
    // NOT rewrite the shared snapshot (the merge-cascade root cause). Write a uniquely-named
    // per-PR allowance file instead. On main / non-git the whole-snapshot behavior below is
    // preserved (the refresh-baselines job is the single writer of the committed snapshot).
    const resolution = resolveArchBaseline(cwd, archConfig.baselinePath, manager);
    if (resolution.source === 'base-ref' && resolution.baseline) {
      return withRun(
        writeAllowanceUpdate(cwd, archConfig, run, resolution.baseline, options.reason)
      );
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
      return withRun(
        writeAllowanceUpdate(cwd, archConfig, run, resolution.baseline, options.reason)
      );
    }
    // Base branch / non-git / forced / genuine bootstrap: whole-snapshot (single-writer trunk).
    return withRun(wholeSnapshotUpdate(cwd, archConfig, run, manager, options));
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
      measurements: summarizeMeasurements(results),
      configuredCategories,
      abstainedCategories: run.abstained,
      warning:
        'No baseline found. Running in threshold-only mode. Run with --update-baseline to capture current state.',
    });
  }

  // Baseline mode: run diff. Honor the configured regression tolerance so a
  // branch does not report false regressions (and force a baseline rewrite)
  // for the sub-tolerance drift it inherits when it merges `main`.
  // Abstained categories are withheld from BOTH sides (#2268): an unknown 0 must
  // neither mask a regression nor celebrate the baseline's violations as resolved.
  const rawDiff: ArchDiffResult = diff(run.scored, withoutAbstained(baseline, run), {
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
    measurements: summarizeMeasurements(results),
    configuredCategories,
    abstainedCategories: run.abstained,
    skippedAllowances: coverage.skipped.map((s) => ({
      file: path.relative(cwd, s.file).replaceAll('\\', '/'),
      reason: s.reason,
    })),
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

/** A skipped allowance stops acknowledging its regression; say so instead of failing mysteriously. */
function warnSkippedAllowances(value: CheckArchResult): void {
  for (const s of value.skippedAllowances ?? []) {
    logger.warn(`Allowance ${s.file} ignored (${s.reason}); its regressions are NOT acknowledged.`);
  }
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
  // An abstention reads as a clean 0 in every other output and in baselines.json
  // (which records only the value), so say it out loud here (#2235). Non-fatal:
  // a host without a working parser must still be able to run the gate.
  if (mode !== OutputMode.QUIET) {
    for (const m of abstainedMeasurements(value.measurements ?? [], value.configuredCategories)) {
      logger.warn(
        `${m.category}: reported ${m.value} but measured nothing — ` +
          `${abstentionReason(m, value.configuredCategories)}. ` +
          `Treat this as "not measured", not as a clean result.`
      );
    }
  }
  if (mode !== OutputMode.QUIET) warnSkippedAllowances(value);
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

/**
 * A failure is a failure; otherwise a run in which every category abstained
 * validated nothing and exits `ZERO_DENOMINATOR` rather than a pass (#2268).
 */
function archExitCode(value: CheckArchResult): number {
  if (!value.passed) return ExitCode.VALIDATION_FAILED;
  return measuredNothing(value) ? ExitCode.ZERO_DENOMINATOR : ExitCode.SUCCESS;
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
      process.exit(archExitCode(value));
    });

  return command;
}
