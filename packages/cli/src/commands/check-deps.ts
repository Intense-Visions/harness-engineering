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

interface CheckDepsResult {
  valid: boolean;
  /** Number of unique modules (files) discovered and analyzed (#1188). */
  modulesAnalyzed: number;
  /** Number of layers configured in `harness.config.json` (#1188). */
  layersConfigured: number;
  /** Set when layers are configured but zero modules were analyzed — the
   *  reason check-deps refuses to report clean (#1188). */
  analysisNote?: string;
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

  const rootDir = path.resolve(cwd, config.rootDir);
  const parser = new TypeScriptParser();

  // Define layers from config (convert pattern string to patterns array)
  const layers = config.layers.map((l) => defineLayer(l.name, [l.pattern], l.allowedDependencies));

  // Build layer config
  const layerConfig: LayerConfig = {
    layers,
    rootDir,
    parser,
    fallbackBehavior: 'warn',
    extraIgnore: depsExclude,
  };

  // Validate dependencies
  const depsResult = await validateDependencies(layerConfig);
  if (depsResult.ok) {
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
    if (circularResult.ok && circularResult.value.hasCycles) {
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

  // Surface the zero-module abstention reason as an issue (#1188).
  if (result.value.analysisNote) {
    issues.push({ message: result.value.analysisNote });
  }

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
  });

  if (output) {
    console.log(output);
  }

  // #691: findings = layer violations + circular dependencies.
  if (localOpts.findingsJson) {
    console.log(formatFindingsContract(issues.length, 'check-deps'));
  }

  process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
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
