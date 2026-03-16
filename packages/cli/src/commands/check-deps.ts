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
import { resolveConfig } from '../config/loader';
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
  layerViolations: Array<{
    file: string;
    imports: string;
    fromLayer: string;
    toLayer: string;
    message: string;
  }>;
  circularDeps: Array<{
    cycle: string[];
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
    layerViolations: [],
    circularDeps: [],
  };

  // If no layers configured, skip layer validation
  if (!config.layers || config.layers.length === 0) {
    return Ok(result);
  }

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
    const files = await findFiles(layer.pattern, rootDir);
    allFiles.push(...files);
  }
  const uniqueFiles = [...new Set(allFiles)];

  // Detect circular dependencies
  if (uniqueFiles.length > 0) {
    const circularResult = await detectCircularDepsInFiles(uniqueFiles, parser);
    if (circularResult.ok && circularResult.value.hasCycles) {
      result.valid = false;
      for (const cycle of circularResult.value.cycles) {
        result.circularDeps.push({ cycle: cycle.cycle });
      }
    }
  }

  return Ok(result);
}

export function createCheckDepsCommand(): Command {
  const command = new Command('check-deps')
    .description('Validate dependency layers and detect circular dependencies')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runCheckDeps({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      const issues = [
        ...result.value.layerViolations.map((v) => ({
          file: v.file,
          message: `Layer violation: ${v.fromLayer} -> ${v.toLayer} (${v.message})`,
        })),
        ...result.value.circularDeps.map((c) => ({
          message: `Circular dependency: ${c.cycle.join(' -> ')}`,
        })),
      ];

      const output = formatter.formatValidation({
        valid: result.value.valid,
        issues,
      });

      if (output) {
        console.log(output);
      }

      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
