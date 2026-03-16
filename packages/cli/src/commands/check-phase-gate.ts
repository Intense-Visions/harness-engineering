import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { findFiles } from '../utils/files';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface CheckPhaseGateOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CheckPhaseGateResult {
  pass: boolean;
  skipped: boolean;
  severity?: 'error' | 'warning';
  missingSpecs: Array<{ implFile: string; expectedSpec: string }>;
  checkedFiles: number;
}

/**
 * Resolve an implementation file path to an expected spec path.
 *
 * Default mapping: `src/<feature>/file.ts` -> `docs/specs/<feature>.md`
 * The specPattern supports `{feature}` as a placeholder for the first
 * directory segment under the impl pattern's base.
 */
function resolveSpecPath(
  implFile: string,
  implPattern: string,
  specPattern: string,
  cwd: string
): string {
  // Get relative path from cwd
  const relImpl = path.relative(cwd, implFile);

  // Determine the base directory of the impl pattern (everything before the first glob)
  const implBase = (implPattern.split('*')[0] ?? '').replace(/\/+$/, '');

  // Extract the portion after the base
  const afterBase = relImpl.startsWith(implBase + '/')
    ? relImpl.slice(implBase.length + 1)
    : relImpl;

  // The "feature" is the first directory segment after the base
  const segments = afterBase.split('/');
  const firstSegment = segments[0] ?? '';
  const feature =
    segments.length > 1 ? firstSegment : path.basename(firstSegment, path.extname(firstSegment));

  // Replace {feature} placeholder in specPattern
  const specRelative = specPattern.replace('{feature}', feature);

  return path.resolve(cwd, specRelative);
}

export async function runCheckPhaseGate(
  options: CheckPhaseGateOptions
): Promise<Result<CheckPhaseGateResult, CLIError>> {
  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }
  const config = configResult.value;

  const cwd =
    options.cwd ??
    (options.configPath ? path.dirname(path.resolve(options.configPath)) : process.cwd());

  // If phase gates not enabled, skip
  if (!config.phaseGates?.enabled) {
    return Ok({
      pass: true,
      skipped: true,
      missingSpecs: [],
      checkedFiles: 0,
    });
  }

  const phaseGates = config.phaseGates;
  const missingSpecs: Array<{ implFile: string; expectedSpec: string }> = [];
  let checkedFiles = 0;

  // Process each mapping
  for (const mapping of phaseGates.mappings) {
    const implFiles = await findFiles(mapping.implPattern, cwd);

    for (const implFile of implFiles) {
      checkedFiles++;
      const expectedSpec = resolveSpecPath(implFile, mapping.implPattern, mapping.specPattern, cwd);

      if (!fs.existsSync(expectedSpec)) {
        missingSpecs.push({
          implFile: path.relative(cwd, implFile),
          expectedSpec: path.relative(cwd, expectedSpec),
        });
      }
    }
  }

  const pass = missingSpecs.length === 0;

  return Ok({
    pass,
    skipped: false,
    severity: phaseGates.severity,
    missingSpecs,
    checkedFiles,
  });
}

export function createCheckPhaseGateCommand(): Command {
  const command = new Command('check-phase-gate')
    .description('Verify that implementation files have matching spec documents')
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

      const result = await runCheckPhaseGate({
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

      const value = result.value;

      if (value.skipped) {
        if (mode === OutputMode.JSON) {
          console.log(formatter.format(value));
        } else if (mode !== OutputMode.QUIET) {
          logger.dim('Phase gates not enabled, skipping.');
        }
        process.exit(ExitCode.SUCCESS);
      }

      // Format output
      const output = formatter.formatValidation({
        valid: value.pass,
        issues: value.missingSpecs.map((m) => ({
          file: m.implFile,
          message: `Missing spec: ${m.expectedSpec}`,
        })),
      });

      if (output) {
        console.log(output);
      }

      const summary = formatter.formatSummary(
        'Phase gate check',
        `${value.checkedFiles} files checked, ${value.missingSpecs.length} missing specs`,
        value.pass
      );
      if (summary) {
        console.log(summary);
      }

      // Severity determines exit code: warning always passes, error fails
      if (!value.pass && value.severity === 'error') {
        process.exit(ExitCode.VALIDATION_FAILED);
      }
      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
