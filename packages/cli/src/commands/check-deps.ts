import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import {
  validateDependencies,
  detectCircularDepsInFiles,
  defineLayer,
  TypeScriptParser,
} from '@harness-engineering/core';
import type { LayerConfig } from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
import { resolveConfig } from '../config/loader';
import { loadDepsExclude } from '../config/schema';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { findFiles } from '../utils/files';

interface CheckDepsOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * A check that ABSTAINED — it did not malfunction, it simply validated nothing
 * and said so (#2098).
 *
 * Distinct from an `analysisError` (#1996): an error says the engine broke, an
 * abstention says the engine declined to run. Both refuse to report clean, but
 * they are different verdicts and get different exit codes. Shape matches the
 * `unavailableChecks` entry `OutputFormatter.formatValidation` renders, and the
 * identical structure `harness validate` already emits.
 */
interface UnavailableCheck {
  /** The analysis that abstained. */
  check: string;
  /** Why it did not run. Carries the engine's own reason verbatim. */
  reason: string;
  /** What the operator should do about it. */
  suggestion?: string;
}

interface CheckDepsResult {
  valid: boolean;
  /** Number of unique modules (files) discovered and analyzed (#1188). */
  modulesAnalyzed: number;
  /** Number of layers configured in `harness.config.json` (#1188). */
  layersConfigured: number;
  /** Set when layers are configured but zero modules were analyzed — the
   *  reason check-deps refuses to report clean (#1188). */
  analysisNote?: string;
  /** Failures reported by an analysis engine — the reasons check-deps could not
   *  complete, and therefore refuses to report clean (#1996). Absent (not an
   *  empty array) when every engine ran, so a clean result is unchanged. */
  analysisErrors?: string[];
  /** Analyses that abstained — they validated nothing and said so (#2098).
   *  Absent (not an empty array) when every engine actually ran, so a clean
   *  result is unchanged. */
  unavailableChecks?: UnavailableCheck[];
  /** Set when `deps.fallbackBehavior: 'warn'` downgraded an abstention back to
   *  the pre-#2098 exit 0. The abstention is still reported — only its exit
   *  code is downgraded (#2098). */
  abstentionDowngraded?: boolean;
  layerViolations: Array<{
    file: string;
    imports: string;
    fromLayer: string;
    toLayer: string;
    message: string;
  }>;
  circularDeps: Array<{
    cycle: string[];
    /** Posix-relative path of the first module in the cycle (#1188). */
    file: string;
  }>;
}

/**
 * Record an analysis-engine failure on the result (#1996).
 *
 * Both engines return a `Result`. Their failure channel used to be discarded,
 * which left `valid` true and the finding lists empty — a result byte-identical
 * to a genuinely clean repo. A check that could not run is not a check that
 * passed, so an engine failure refuses to report clean and keeps its reason,
 * mirroring the #1188 zero-module abstention.
 *
 * @param result - The in-progress check-deps result to mark as not-clean.
 * @param stage - Human-readable name of the analysis that failed.
 * @param error - The engine error whose code and message explain the failure.
 */
function recordAnalysisError(
  result: CheckDepsResult,
  stage: string,
  error: { code: string; message: string }
): void {
  result.valid = false;
  result.analysisErrors ??= [];
  result.analysisErrors.push(
    `check-deps could not complete ${stage}: ${error.code}: ${error.message}`
  );
}

/**
 * Record an engine ABSTENTION on the result (#2098).
 *
 * `validateDependencies` already computes this verdict and labels it — an
 * unavailable parser returns `Ok({ valid: true, violations: [], skipped: true,
 * reason })`. Every consumer then read only `violations`, so the abstention was
 * computed and thrown away: `valid` stayed true, the finding lists stayed empty,
 * and the command exited 0 having validated nothing. Reading the flag is the
 * whole fix.
 *
 * `downgraded` is the documented escape hatch (`deps.fallbackBehavior: 'warn'`):
 * the abstention is still reported in every output mode, but the exit code stays
 * 0 for projects that need the old behaviour while they fix their setup.
 *
 * @param result - The in-progress check-deps result to annotate.
 * @param stage - Human-readable name of the analysis that abstained.
 * @param reason - The engine's own reason for not running.
 * @param downgraded - Whether `deps.fallbackBehavior: 'warn'` is in force.
 */
function recordAbstention(
  result: CheckDepsResult,
  stage: string,
  reason: string,
  downgraded: boolean
): void {
  result.unavailableChecks ??= [];
  result.unavailableChecks.push({
    check: stage,
    reason: `check-deps did not run ${stage}: ${reason}`,
    suggestion:
      'Restore the analysis engine (the parser reported itself unavailable). ' +
      'To keep exiting 0 meanwhile, set `deps.fallbackBehavior: "warn"` in harness.config.json.',
  });
  if (downgraded) {
    result.abstentionDowngraded = true;
    return;
  }
  result.valid = false;
}

export async function runCheckDeps(
  options: CheckDepsOptions
): Promise<Result<CheckDepsResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  const result: CheckDepsResult = {
    valid: true,
    modulesAnalyzed: 0,
    layersConfigured: 0,
    layerViolations: [],
    circularDeps: [],
  };

  // If no layers configured, skip layer validation
  if (!config.layers || config.layers.length === 0) {
    return Ok(result);
  }

  result.layersConfigured = config.layers.length;

  // Additional discovery-scoping globs (stacked on core's node_modules/skip-dir
  // defaults) — prefer the resolved config's `deps.exclude` (honors whatever
  // config path resolveConfig found), falling back to the best-effort
  // `loadDepsExclude(cwd)` loader for callers without a resolved block (#1188).
  const depsExclude =
    config.deps?.exclude && config.deps.exclude.length > 0
      ? config.deps.exclude
      : loadDepsExclude(cwd);

  // Abstention policy (#2098). Default `skip`: the engine abstains rather than
  // warning-and-continuing, and check-deps reports that abstention instead of
  // discarding it. `warn` is the documented downgrade back to exit 0.
  const fallbackBehavior = config.deps?.fallbackBehavior ?? 'skip';

  const rootDir = path.resolve(cwd, config.rootDir);
  const parser = new TypeScriptParser();

  // Define layers from config (convert pattern string to patterns array)
  const layers = config.layers.map((l) => defineLayer(l.name, [l.pattern], l.allowedDependencies));

  // Build layer config
  const layerConfig: LayerConfig = {
    layers,
    rootDir,
    parser,
    fallbackBehavior,
    extraIgnore: depsExclude,
  };

  // Validate dependencies
  const depsResult = await validateDependencies(layerConfig);
  if (depsResult.ok) {
    // The engine abstained — it validated nothing and labelled the result as
    // such. Reporting this as a clean pass is the #2098 defect.
    if (depsResult.value.skipped) {
      recordAbstention(
        result,
        'layer validation',
        depsResult.value.reason ?? 'the analysis engine abstained',
        fallbackBehavior === 'warn'
      );
    }
    for (const violation of depsResult.value.violations) {
      result.valid = false;
      result.layerViolations.push({
        file: violation.file,
        imports: violation.imports,
        fromLayer: violation.fromLayer ?? 'unknown',
        toLayer: violation.toLayer ?? 'unknown',
        message: violation.reason,
      });
    }
  } else {
    recordAnalysisError(result, 'layer validation', depsResult.error);
  }

  // Collect all files for circular dependency detection
  const allFiles: string[] = [];
  for (const layer of config.layers) {
    const files = await findFiles(layer.pattern, rootDir, depsExclude);
    allFiles.push(...files);
  }
  const uniqueFiles = [...new Set(allFiles)];
  result.modulesAnalyzed = uniqueFiles.length;

  // Zero-module abstention (D5): layers are configured but nothing was
  // discovered — refuse to report clean rather than silently pass (#1188).
  if (config.layers.length > 0 && uniqueFiles.length === 0) {
    result.valid = false;
    result.analysisNote =
      `check-deps analyzed 0 modules across ${config.layers.length} configured ` +
      `layer(s) — refusing to report clean (check layer patterns / deps.exclude).`;
  }

  // Detect circular dependencies
  if (uniqueFiles.length > 0) {
    const circularResult = await detectCircularDepsInFiles(uniqueFiles, parser);
    if (!circularResult.ok) {
      recordAnalysisError(result, 'circular-dependency detection', circularResult.error);
    } else if (circularResult.value.hasCycles) {
      result.valid = false;
      for (const cycle of circularResult.value.cycles) {
        // Attribute each finding to the first module in the cycle as a
        // posix-relative path (not "* unknown") (#1188).
        const first = cycle.cycle[0] ?? '';
        const file = first ? path.relative(rootDir, first).replaceAll('\\', '/') : '';
        result.circularDeps.push({ cycle: cycle.cycle, file });
      }
    }
  }

  return Ok(result);
}

async function runCheckDepsAction(
  globalOpts: {
    config?: string;
    json?: boolean;
    verbose?: boolean;
    quiet?: boolean;
  },
  localOpts: { findingsJson?: boolean } = {}
): Promise<void> {
  const mode: OutputModeType = globalOpts.json
    ? OutputMode.JSON
    : globalOpts.quiet
      ? OutputMode.QUIET
      : globalOpts.verbose
        ? OutputMode.VERBOSE
        : OutputMode.TEXT;

  const formatter = new OutputFormatter(mode);

  const result = await runCheckDeps({
    ...(globalOpts.config !== undefined && { configPath: globalOpts.config }),
    ...(globalOpts.json !== undefined && { json: globalOpts.json }),
    ...(globalOpts.verbose !== undefined && { verbose: globalOpts.verbose }),
    ...(globalOpts.quiet !== undefined && { quiet: globalOpts.quiet }),
  });

  if (!result.ok) {
    if (mode === OutputMode.JSON) {
      console.log(JSON.stringify({ error: result.error.message }));
    } else {
      logger.error(result.error.message);
    }
    process.exit(result.error.exitCode);
  }

  const issues: Array<{ file?: string; message: string }> = [
    ...result.value.layerViolations.map((v) => ({
      file: v.file,
      message: `Layer violation: ${v.fromLayer} -> ${v.toLayer} (${v.message})`,
    })),
    ...result.value.circularDeps.map((c) => ({
      ...(c.file ? { file: c.file } : {}),
      message: `Circular dependency: ${c.cycle.join(' -> ')}`,
    })),
  ];

  // Surface engine failures as issues (#1996) — a check that could not run must
  // never render, or be counted, as a clean pass.
  for (const analysisError of result.value.analysisErrors ?? []) {
    issues.push({ message: analysisError });
  }

  // Surface the zero-module abstention reason as an issue (#1188).
  if (result.value.analysisNote) {
    issues.push({ message: result.value.analysisNote });
  }

  // An engine abstention is reported in every output mode (#2098), but it is not
  // an `issue`: the formatter renders abstentions on their own "could not run"
  // channel precisely so a check that abstained never reads as a check that
  // failed — or, worse, as one that passed.
  const abstentions = result.value.unavailableChecks ?? [];
  const fatalAbstentions = result.value.abstentionDowngraded ? 0 : abstentions.length;

  // Print the analyzed-module denominator in human-facing modes (#1188).
  if (mode === OutputMode.TEXT || mode === OutputMode.VERBOSE) {
    console.log(
      `Analyzed ${result.value.modulesAnalyzed} module(s) across ${result.value.layersConfigured} layer(s).`
    );
  }

  const output = formatter.formatValidation({
    valid: result.value.valid,
    issues,
    modulesAnalyzed: result.value.modulesAnalyzed,
    layersConfigured: result.value.layersConfigured,
    // Omitted entirely on a clean run, so the clean JSON payload is unchanged (#1996).
    ...(result.value.analysisErrors ? { analysisErrors: result.value.analysisErrors } : {}),
    // Likewise omitted on a run where every engine actually ran (#2098).
    ...(abstentions.length > 0 ? { unavailableChecks: abstentions } : {}),
  });

  if (output) {
    console.log(output);
  }

  // #691: findings = layer violations + circular dependencies. A fatal
  // abstention counts too (#2098) — a run that validated nothing must never
  // hand a maintenance consumer `{ findings: 0 }`.
  if (localOpts.findingsJson) {
    console.log(formatFindingsContract(issues.length + fatalAbstentions, 'check-deps'));
  }

  // Four outcomes, four codes (#1996, #2098): the check ran and passed
  // (SUCCESS), the check ran and found violations (VALIDATION_FAILED), the check
  // could not run at all (ERROR), or the engine abstained and validated nothing
  // (ZERO_DENOMINATOR — nothing malfunctioned, nothing was examined). Collapsing
  // any of these into SUCCESS is what let `harness check-deps && deploy` proceed
  // on an analysis that never happened.
  const analysisFailed = (result.value.analysisErrors?.length ?? 0) > 0;
  process.exit(
    analysisFailed
      ? ExitCode.ERROR
      : fatalAbstentions > 0
        ? ExitCode.ZERO_DENOMINATOR
        : result.value.valid
          ? ExitCode.SUCCESS
          : ExitCode.VALIDATION_FAILED
  );
}

export function createCheckDepsCommand(): Command {
  const command = new Command('check-deps')
    .description('Validate dependency layers and detect circular dependencies')
    .option(
      '--findings-json',
      'Emit the machine-readable maintenance findings contract ({ findings: N }) as a trailing stdout line (#691)'
    )
    .action(async (opts, cmd) => {
      await runCheckDepsAction(cmd.optsWithGlobals(), { findingsJson: opts.findingsJson });
    });

  return command;
}
