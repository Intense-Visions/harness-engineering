import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { runCrossCheck } from './validate-cross-check';
import { OutputMode, type OutputModeType } from '../output/formatter';
import { ExitCode } from '../utils/errors';

interface CrossCheckCommandOptions {
  specsDir?: string;
  plansDir?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface CrossCheckValue {
  specToPlan: string[];
  planToImpl: string[];
  staleness: string[];
  warnings: number;
}

function resolveOutputMode(options: CrossCheckCommandOptions): OutputModeType {
  if (options.json) return OutputMode.JSON;
  if (options.quiet) return OutputMode.QUIET;
  if (options.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

/**
 * `harness cross-check` — read-only cross-artifact consistency check.
 *
 * Surfaces JUST the cross-check concern that the `validate_cross_check` MCP tool
 * exposes (plan→implementation coverage + staleness), WITHOUT running the full
 * `harness validate` suite. The maintenance `cross-check` task points its
 * `checkCommand` here; the runner parses the `Cross-check: N issues` count line
 * (primary `N issue` parser) and the exit code:
 *   - 0 issues → exit 0 (clean / no-issues)
 *   - N issues → exit 1 with the parseable count (real findings, dispatch fixer)
 */
async function runCrossCheckCommand(options: CrossCheckCommandOptions): Promise<void> {
  const mode = resolveOutputMode(options);
  const projectPath = process.cwd();
  const specsDir = path.resolve(projectPath, options.specsDir ?? 'docs/specs');
  const plansDir = path.resolve(projectPath, options.plansDir ?? 'docs/plans');

  const result = await runCrossCheck({ projectPath, specsDir, plansDir });

  if (!result.ok) {
    emitCrossCheckError(result.error.message, mode);
    process.exit(ExitCode.ERROR);
  }

  const { warnings } = result.value;
  emitCrossCheckResult(result.value, mode);
  process.exit(warnings === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
}

function emitCrossCheckError(message: string, mode: OutputModeType): void {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(message);
  }
}

function emitCrossCheckResult(value: CrossCheckValue, mode: OutputModeType): void {
  const { specToPlan, planToImpl, staleness, warnings } = value;
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ specToPlan, planToImpl, staleness, warnings }));
    return;
  }
  if (mode === OutputMode.QUIET) return;

  console.log('');
  console.log(chalk.bold('Cross-artifact consistency'));
  console.log('');
  if (warnings === 0) {
    console.log(chalk.green('  All plans trace to implementations and are up to date.'));
  } else {
    for (const w of [...planToImpl, ...staleness, ...specToPlan]) {
      console.log(`  ${chalk.yellow('!')} ${w}`);
    }
  }
  console.log('');
  // Machine-parseable count line consumed by the maintenance check runner
  // (`(\d+)\s+issue` parser). Keep the number adjacent to the keyword and
  // free of ANSI styling so the count is always recoverable.
  console.log(`Cross-check: ${warnings} issues`);
}

export function createCrossCheckCommand(): Command {
  return new Command('cross-check')
    .description('Check cross-artifact consistency (plan-to-implementation coverage and staleness)')
    .option('--specs-dir <path>', 'Specs directory relative to project root (default: docs/specs)')
    .option('--plans-dir <path>', 'Plans directory relative to project root (default: docs/plans)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await runCrossCheckCommand({
        specsDir: opts.specsDir,
        plansDir: opts.plansDir,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });
    });
}
