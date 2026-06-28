import { Command } from 'commander';
import chalk from 'chalk';
import { detectStaleConstraints } from '@harness-engineering/core';
import type {
  ConstraintNodeStore,
  ArchMetricCategory,
  DetectStaleResult,
} from '@harness-engineering/core';
import { loadGraphStore } from '../mcp/utils/graph-loader';
import { OutputMode, type OutputModeType } from '../output/formatter';
import { ExitCode } from '../utils/errors';

const CATEGORIES: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

interface StaleConstraintsCommandOptions {
  window?: string;
  category?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

function resolveOutputMode(options: StaleConstraintsCommandOptions): OutputModeType {
  if (options.json) return OutputMode.JSON;
  if (options.quiet) return OutputMode.QUIET;
  if (options.verbose) return OutputMode.VERBOSE;
  return OutputMode.TEXT;
}

/**
 * Emit the missing-graph precondition signal and exit non-zero.
 *
 * This is a precondition-gated check (like `traceability` / `predict`): an
 * arbitrary repo may simply not have ingested a knowledge graph yet. The
 * maintenance runner classifies this exact "No knowledge graph found. Run
 * `harness scan` first." signature (matched against the leading output, paired
 * with a non-zero exit and no parseable count) as a `skipped`, NOT a failure.
 */
function handleNoStore(mode: OutputModeType): never {
  const message = 'No knowledge graph found. Run `harness scan` first.';
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ error: message, staleConstraints: [], totalConstraints: 0 }));
  } else {
    console.error(message);
  }
  process.exit(ExitCode.ERROR);
}

function emitInputError(message: string, mode: OutputModeType): void {
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(`Error: ${message}`);
  }
}

/** Validate --window and --category; exit(ERROR) on bad input, else return the
 * parsed window. */
function validateInputs(options: StaleConstraintsCommandOptions, mode: OutputModeType): number {
  const windowDays = options.window ? Number(options.window) : 30;
  if (!Number.isFinite(windowDays) || windowDays < 1) {
    emitInputError('--window must be a finite number >= 1', mode);
    process.exit(ExitCode.ERROR);
  }
  if (options.category && !CATEGORIES.includes(options.category as ArchMetricCategory)) {
    emitInputError(`unknown --category '${options.category}'`, mode);
    process.exit(ExitCode.ERROR);
  }
  return windowDays;
}

function emitStaleResult(
  result: DetectStaleResult,
  windowDays: number,
  mode: OutputModeType
): void {
  const count = result.staleConstraints.length;
  if (mode === OutputMode.JSON) {
    console.log(JSON.stringify(result));
    return;
  }
  if (mode === OutputMode.QUIET) return;

  console.log('');
  console.log(chalk.bold(`Stale architectural constraints (window: ${windowDays}d)`));
  console.log('');
  if (count === 0) {
    console.log(
      chalk.green(
        `  All ${result.totalConstraints} constraints have been exercised within ${windowDays} days.`
      )
    );
  } else {
    for (const c of result.staleConstraints) {
      console.log(
        `  ${chalk.yellow('!')} ${c.id} (${c.category}) — ${c.daysSinceLastViolation}d since last violation`
      );
    }
  }
  console.log('');
  // Machine-parseable count line consumed by the maintenance check runner.
  console.log(`Stale constraints: ${count} findings`);
}

/**
 * `harness stale-constraints` — read-only detection of architectural constraint
 * rules that have not been violated within a window (candidates for removal /
 * relaxation). Surfaces the `detect_stale_constraints` MCP tool's core in-process.
 *
 * The maintenance `stale-constraints` task points its `checkCommand` here. The
 * runner parses the `Stale constraints: N findings` count line and the exit code:
 *   - no graph → exit 2 with a precondition signature → classified `skipped`
 *   - 0 stale  → exit 0 (clean / no-issues)
 *   - N stale  → exit 1 with the parseable count (recorded as N findings)
 */
async function runStaleConstraintsCommand(options: StaleConstraintsCommandOptions): Promise<void> {
  const mode = resolveOutputMode(options);
  const windowDays = validateInputs(options, mode);

  const store = await loadGraphStore(process.cwd());
  if (!store) handleNoStore(mode);

  const result = detectStaleConstraints(
    store as unknown as ConstraintNodeStore,
    windowDays,
    options.category as ArchMetricCategory | undefined
  );

  emitStaleResult(result, windowDays, mode);
  process.exit(
    result.staleConstraints.length === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED
  );
}

export function createStaleConstraintsCommand(): Command {
  return new Command('stale-constraints')
    .description(
      'Detect architectural constraints not violated within a window (candidates for removal)'
    )
    .option(
      '--window <days>',
      'Days without violation to consider a constraint stale (default: 30)'
    )
    .option('--category <category>', `Filter by category (${CATEGORIES.join(', ')})`)
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await runStaleConstraintsCommand({
        window: opts.window,
        category: opts.category,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });
    });
}
