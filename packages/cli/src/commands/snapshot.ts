import { Command } from 'commander';
import { ArchConfigSchema, runAll, TimelineManager } from '@harness-engineering/core';
import type {
  ArchConfig,
  ArchMetricCategory,
  TimelineSnapshot,
  TrendResult,
  TrendLine,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError } from '../utils/errors';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

// --- Helpers ---

function getCommitHash(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function resolveArchConfig(
  configPath?: string
): { archConfig: ArchConfig; error?: never } | { archConfig?: never; error: CLIError } {
  const configResult = resolveConfig(configPath);
  if (!configResult.ok) {
    return { error: configResult.error };
  }
  const archConfig: ArchConfig = configResult.value.architecture ?? ArchConfigSchema.parse({});
  return { archConfig };
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  const sign = delta > 0 ? '+' : '';
  // Show up to 2 decimal places, but trim trailing zeros
  const formatted = Number.isInteger(delta)
    ? String(delta)
    : delta.toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${formatted}`;
}

function directionSymbol(direction: TrendLine['direction']): string {
  switch (direction) {
    case 'improving':
      return chalk.green('improving');
    case 'declining':
      return chalk.red('declining');
    case 'stable':
      return '=';
  }
}

const CATEGORY_ORDER: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

// --- Capture ---

export interface SnapshotCaptureResult {
  snapshot: TimelineSnapshot;
  previous: TimelineSnapshot | undefined;
}

export async function runSnapshotCapture(options: {
  cwd?: string;
  configPath?: string;
}): Promise<SnapshotCaptureResult> {
  const cwd = options.cwd ?? process.cwd();
  const resolved = resolveArchConfig(options.configPath);
  if (resolved.error) {
    throw resolved.error;
  }

  const manager = new TimelineManager(cwd);

  // Load timeline before capture to get previous snapshot
  const timelineBefore = manager.load();
  const previous =
    timelineBefore.snapshots.length > 0
      ? timelineBefore.snapshots[timelineBefore.snapshots.length - 1]
      : undefined;

  const results = await runAll(resolved.archConfig, cwd);
  const commitHash = getCommitHash(cwd);
  const snapshot = manager.capture(results, commitHash);

  return { snapshot, previous };
}

function printCaptureSummary(
  snapshot: TimelineSnapshot,
  previous: TimelineSnapshot | undefined
): void {
  const date = snapshot.capturedAt.slice(0, 10);
  const commit = snapshot.commitHash.slice(0, 7);

  console.log('');
  console.log(`Architecture Snapshot captured (${date}, ${commit})`);
  console.log('');

  // Stability line
  const stabilityDelta = previous
    ? ` (${formatDelta(snapshot.stabilityScore - previous.stabilityScore)} from last)`
    : '';
  console.log(`  Stability: ${snapshot.stabilityScore}/100${stabilityDelta}`);
  console.log('');

  // Category table
  const header = '  Category'.padEnd(22) + 'Value'.padStart(7) + 'Delta'.padStart(8) + '   Trend';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const current = snapshot.metrics[category];
    const prev = previous?.metrics[category];
    const value = current?.value ?? 0;
    const delta = prev ? value - prev.value : 0;

    const valueFmt = Number.isInteger(value) ? String(value) : value.toFixed(2);
    const deltaFmt = formatDelta(delta);
    const direction: TrendLine['direction'] =
      Math.abs(delta) < 0.01 ? 'stable' : delta < 0 ? 'improving' : 'declining';

    const line = `  ${category.padEnd(20)}${valueFmt.padStart(7)}${deltaFmt.padStart(8)}    ${directionSymbol(direction)}`;
    console.log(line);
  }

  console.log('');
}

// --- Trends ---

function printTrendsSummary(trends: TrendResult): void {
  if (trends.snapshotCount === 0) {
    logger.warn('No snapshots found. Run `harness snapshot capture` first.');
    return;
  }

  const fromDate = trends.from.slice(0, 10);
  const toDate = trends.to.slice(0, 10);

  console.log('');
  console.log(`Architecture Trends (${trends.snapshotCount} snapshots, ${fromDate} to ${toDate})`);
  console.log('');

  const stabilityDelta = formatDelta(trends.stability.delta);
  console.log(
    `  Stability: ${trends.stability.current}/100 (was ${trends.stability.previous} on ${fromDate}, ${stabilityDelta})`
  );
  console.log('');

  const header =
    '  Category'.padEnd(22) +
    'Current'.padStart(9) +
    'Start'.padStart(9) +
    'Delta'.padStart(9) +
    '   Trend';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const trend = trends.categories[category];
    if (!trend) continue;

    const currentFmt = Number.isInteger(trend.current)
      ? String(trend.current)
      : trend.current.toFixed(2);
    const prevFmt = Number.isInteger(trend.previous)
      ? String(trend.previous)
      : trend.previous.toFixed(2);
    const deltaFmt = formatDelta(trend.delta);

    const line = `  ${category.padEnd(20)}${currentFmt.padStart(9)}${prevFmt.padStart(9)}${deltaFmt.padStart(9)}    ${directionSymbol(trend.direction)}`;
    console.log(line);
  }

  console.log('');
}

// --- List ---

function printSnapshotList(manager: TimelineManager): void {
  const timeline = manager.load();

  if (timeline.snapshots.length === 0) {
    logger.warn('No snapshots found. Run `harness snapshot capture` first.');
    return;
  }

  console.log('');
  console.log(`Architecture Snapshots (${timeline.snapshots.length} total)`);
  console.log('');

  const header = '  #'.padEnd(6) + 'Date'.padEnd(14) + 'Commit'.padEnd(12) + 'Stability';
  console.log(header);

  timeline.snapshots.forEach((snap, idx) => {
    const date = snap.capturedAt.slice(0, 10);
    const commit = snap.commitHash.slice(0, 7);
    const num = String(idx + 1);
    const line = `  ${num.padEnd(4)}${date.padEnd(14)}${commit.padEnd(12)}${snap.stabilityScore}/100`;
    console.log(line);
  });

  console.log('');
}

// --- Command registration ---

export function createSnapshotCommand(): Command {
  const command = new Command('snapshot').description('Architecture timeline snapshot commands');

  command
    .command('capture')
    .description('Capture current architecture metrics as a timeline snapshot')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const { snapshot, previous } = await runSnapshotCapture({
          configPath: globalOpts.config,
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ snapshot, previous: previous ?? null }, null, 2));
        } else {
          printCaptureSummary(snapshot, previous);
        }
      } catch (err) {
        if (err instanceof CLIError) {
          if (mode === OutputMode.JSON) {
            console.log(JSON.stringify({ error: err.message }));
          } else {
            logger.error(err.message);
          }
          process.exit(err.exitCode);
        }
        throw err;
      }
    });

  command
    .command('trends')
    .description('Show architecture metric trends over time')
    .option('--last <n>', 'Number of recent snapshots to analyze', '10')
    .option('--since <date>', 'Show trends since ISO date')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;
      const cwd = process.cwd();

      const manager = new TimelineManager(cwd);
      const trends = manager.trends({
        last: parseInt(opts.last, 10),
        since: opts.since,
      });

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(trends, null, 2));
      } else {
        printTrendsSummary(trends);
      }
    });

  command
    .command('list')
    .description('List all captured architecture snapshots')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;
      const cwd = process.cwd();

      const manager = new TimelineManager(cwd);

      if (mode === OutputMode.JSON) {
        const timeline = manager.load();
        console.log(JSON.stringify(timeline, null, 2));
      } else {
        printSnapshotList(manager);
      }
    });

  return command;
}
