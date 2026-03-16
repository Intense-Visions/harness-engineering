// packages/cli/src/commands/fix-drift.ts
import { Command } from 'commander';
import * as path from 'path';
import type { Result, EntropyConfig } from '@harness-engineering/core';
import {
  Ok,
  Err,
  buildSnapshot,
  detectDocDrift,
  detectDeadCode,
  createFixes,
  applyFixes,
  generateSuggestions,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface FixDriftOptions {
  cwd?: string;
  configPath?: string;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface FixDriftResult {
  dryRun: boolean;
  fixes: Array<{
    file: string;
    action: string;
    applied: boolean;
  }>;
  suggestions: Array<{
    file: string;
    suggestion: string;
  }>;
}

export async function runFixDrift(
  options: FixDriftOptions
): Promise<Result<FixDriftResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  // Default to dry-run mode
  const dryRun = options.dryRun !== false;

  // Load config
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return Err(configResult.error);
  }
  const config = configResult.value;

  const rootDir = path.resolve(cwd, config.rootDir);
  const docsDir = path.resolve(cwd, config.docsDir);

  // Build entropy config for snapshot
  const entropyConfig: EntropyConfig = {
    rootDir,
    entryPoints: [path.join(rootDir, 'src/index.ts')],
    docPaths: [docsDir],
    analyze: {
      drift: true,
      deadCode: true,
      patterns: false,
    },
    exclude: config.entropy?.excludePatterns ?? ['**/node_modules/**', '**/*.test.ts'],
  };

  // 1. Build codebase snapshot
  const snapshotResult = await buildSnapshot(entropyConfig);
  if (!snapshotResult.ok) {
    return Err(
      new CLIError(`Failed to build snapshot: ${snapshotResult.error.message}`, ExitCode.ERROR)
    );
  }
  const snapshot = snapshotResult.value;

  // 2. Detect drift
  const driftResult = await detectDocDrift(snapshot);
  if (!driftResult.ok) {
    return Err(
      new CLIError(`Failed to detect drift: ${driftResult.error.message}`, ExitCode.ERROR)
    );
  }
  const driftReport = driftResult.value;

  // 3. Detect dead code
  const deadCodeResult = await detectDeadCode(snapshot);
  if (!deadCodeResult.ok) {
    return Err(
      new CLIError(`Failed to detect dead code: ${deadCodeResult.error.message}`, ExitCode.ERROR)
    );
  }
  const deadCodeReport = deadCodeResult.value;

  // 4. Generate fixes from dead code report
  const fixes = createFixes(deadCodeReport);

  // 5. Apply fixes if not dry-run
  const appliedFixes: Array<{ file: string; action: string; applied: boolean }> = [];

  if (!dryRun && fixes.length > 0) {
    const applyResult = await applyFixes(fixes, { dryRun: false });
    if (!applyResult.ok) {
      return Err(
        new CLIError(`Failed to apply fixes: ${applyResult.error.message}`, ExitCode.ERROR)
      );
    }

    for (const fix of applyResult.value.applied) {
      appliedFixes.push({
        file: fix.file,
        action: fix.action,
        applied: true,
      });
    }

    for (const fix of applyResult.value.skipped) {
      appliedFixes.push({
        file: fix.file,
        action: fix.action,
        applied: false,
      });
    }

    for (const { fix } of applyResult.value.errors) {
      appliedFixes.push({
        file: fix.file,
        action: fix.action,
        applied: false,
      });
    }
  } else {
    // In dry-run mode, list all fixes as not applied
    for (const fix of fixes) {
      appliedFixes.push({
        file: fix.file,
        action: fix.action,
        applied: false,
      });
    }
  }

  // 6. Generate suggestions
  const suggestionReport = generateSuggestions(deadCodeReport, driftReport);

  const suggestions: Array<{ file: string; suggestion: string }> = [];
  for (const suggestion of suggestionReport.suggestions) {
    for (const file of suggestion.files) {
      suggestions.push({
        file,
        suggestion: suggestion.title,
      });
    }
  }

  const result: FixDriftResult = {
    dryRun,
    fixes: appliedFixes,
    suggestions,
  };

  return Ok(result);
}

export function createFixDriftCommand(): Command {
  const command = new Command('fix-drift')
    .description('Auto-fix entropy issues (doc drift, dead code)')
    .option('--no-dry-run', 'Actually apply fixes (default is dry-run mode)')
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

      const result = await runFixDrift({
        configPath: globalOpts.config,
        dryRun: opts.dryRun,
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

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (
        mode !== OutputMode.QUIET ||
        result.value.fixes.length > 0 ||
        result.value.suggestions.length > 0
      ) {
        const { value } = result;

        const statusMessage = value.dryRun ? '(dry-run)' : '';
        console.log(
          formatter.formatSummary(
            `Fix drift ${statusMessage}`,
            `${value.fixes.length} fixes, ${value.suggestions.length} suggestions`,
            value.fixes.length === 0 && value.suggestions.length === 0
          )
        );

        if (value.fixes.length > 0) {
          console.log('\nFixes:');
          for (const fix of value.fixes.slice(0, 10)) {
            const status = fix.applied ? '[applied]' : '[pending]';
            console.log(`  ${status} ${fix.action}: ${fix.file}`);
          }
          if (value.fixes.length > 10) {
            console.log(`  ... and ${value.fixes.length - 10} more`);
          }
        }

        if (
          value.suggestions.length > 0 &&
          (mode === OutputMode.VERBOSE || value.fixes.length === 0)
        ) {
          console.log('\nSuggestions:');
          for (const suggestion of value.suggestions.slice(0, 10)) {
            console.log(`  - ${suggestion.file}: ${suggestion.suggestion}`);
          }
          if (value.suggestions.length > 10) {
            console.log(`  ... and ${value.suggestions.length - 10} more`);
          }
        }

        if (value.dryRun && value.fixes.length > 0) {
          console.log('\nRun with --no-dry-run to apply fixes.');
        }
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
