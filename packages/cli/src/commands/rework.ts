import { Command } from 'commander';
import {
  computeRework,
  plannedIssuesFromExternalIds,
  resolveRoadmapStore,
  roadmapSourceExists,
} from '@harness-engineering/core';
import type { ReworkReport } from '@harness-engineering/core';

const DEFAULT_SINCE = '30d';
const DEFAULT_MIN_COMMITS = 2;

export interface ReworkCommandOptions {
  /** Repository root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Lookback window shorthand (default `30d`). */
  since?: string;
  /** Exclude surfaces with fewer than this many commits (default 2). */
  minCommits?: number;
  /** Cap the ranked rows printed in the human table (JSON is never truncated). */
  top?: number;
  /** Emit the machine-readable JSON report instead of the human table. */
  json?: boolean;
}

/**
 * Resolve the planned-issue set from roadmap shard `External-ID`s. Best-effort:
 * a missing/unreadable roadmap yields an empty set (degrade-safe), so all rework
 * is then classified as unplanned. Keeps core roadmap-agnostic — the resolution
 * lives here in the cli and is injected into `computeRework`.
 */
async function resolvePlannedIssues(cwd: string): Promise<Set<number>> {
  try {
    if (!roadmapSourceExists(cwd)) return new Set();
    const store = resolveRoadmapStore({ projectRoot: cwd });
    const loaded = await store.load();
    if (!loaded.ok) return new Set();
    const externalIds: string[] = [];
    for (const milestone of loaded.value.milestones) {
      for (const feature of milestone.features) {
        if (feature.externalId) externalIds.push(feature.externalId);
      }
    }
    return plannedIssuesFromExternalIds(externalIds);
  } catch {
    return new Set();
  }
}

/** Render the ranked human table (highest unplanned rework rate first). */
function renderTable(report: ReworkReport, top?: number): string {
  const rows = top !== undefined ? report.surfaces.slice(0, top) : report.surfaces;
  const lines: string[] = [];
  lines.push(
    `Rework over ${report.resolvedWindow} — denominator: ${report.denominatorLabel} ` +
      `(${report.totalCommitsScanned} commits scanned)`
  );
  if (rows.length === 0) {
    lines.push('No surfaces met the reporting threshold.');
    return lines.join('\n') + '\n';
  }
  lines.push('');
  lines.push('  unplanned  surface');
  for (const s of rows) {
    const pct = `${(s.unplannedReworkRate * 100).toFixed(1)}%`.padStart(9);
    lines.push(
      `  ${pct}  ${s.path} ` +
        `(${s.totalCommits} commits, ${s.unplannedReworkCommits} unplanned / ` +
        `${s.reworkCommits} rework)`
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Compute and emit the per-surface rework report. Report-only and degrade-safe:
 * a non-git / empty repo yields an empty report and never sets a non-zero exit.
 * Returns the full {@link ReworkReport} (never truncated by `--top`).
 */
export async function runReworkCommand(opts: ReworkCommandOptions): Promise<ReworkReport> {
  const cwd = opts.cwd ?? process.cwd();
  const since = opts.since ?? DEFAULT_SINCE;
  const minCommits = opts.minCommits ?? DEFAULT_MIN_COMMITS;

  const plannedIssues = await resolvePlannedIssues(cwd);
  const report = await computeRework({ since, cwd, minCommits, plannedIssues });

  const asJson = opts.json === true || !process.stdout.isTTY;
  if (asJson) {
    process.stdout.write(JSON.stringify(report) + '\n');
  } else {
    process.stdout.write(renderTable(report, opts.top));
  }
  return report;
}

export function createReworkCommand(): Command {
  return new Command('rework')
    .description(
      'Report per-surface rework rate from git history (planned vs unplanned; report-only)'
    )
    .option('--since <window>', 'Lookback window (e.g. 24h, 7d, 4w, 3mo).', DEFAULT_SINCE)
    .option(
      '--min-commits <n>',
      'Exclude surfaces with fewer than n commits in the window.',
      String(DEFAULT_MIN_COMMITS)
    )
    .option('--top <n>', 'Cap the ranked rows printed (JSON is never truncated).')
    .option('--json', 'Emit the machine-readable ReworkReport as JSON.')
    .action(
      async (options: { since: string; minCommits: string; top?: string; json?: boolean }) => {
        const commandOpts: ReworkCommandOptions = {
          cwd: process.cwd(),
          since: options.since,
          minCommits: Number.parseInt(options.minCommits, 10),
        };
        if (options.top !== undefined) commandOpts.top = Number.parseInt(options.top, 10);
        if (options.json === true) commandOpts.json = true;
        await runReworkCommand(commandOpts);
        // Report-only: never sets a non-zero exit code.
      }
    );
}
