import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  gitScan,
  computeHotspots,
  crossReferenceUndocumentedFixes,
  assembleCandidateReport,
  isoWeek,
  formatIsoWeek,
} from '@harness-engineering/core';

export interface ScanCandidatesOptions {
  cwd?: string | undefined;
  lookback?: string | undefined;
  configPath: string;
  outputPath?: string | undefined;
  solutionsDir: string;
  nonInteractive: boolean;
}

export interface ScanCandidatesStatus {
  status: 'success' | 'no-issues' | 'failure';
  path?: string;
  candidatesFound?: number;
  lookback?: string;
  durationMs?: number;
  reason?: string;
}

const HOTSPOT_THRESHOLD = 7;
const DEFAULT_LOOKBACK = '7d';

export async function runCompoundScanCandidatesCommand(
  opts: ScanCandidatesOptions
): Promise<ScanCandidatesStatus> {
  const startedAt = Date.now();
  const cwd = opts.cwd ?? process.cwd();
  const lookback = opts.lookback ?? DEFAULT_LOOKBACK;

  let undocumented: Awaited<ReturnType<typeof gitScan>>;
  let hotspots: Awaited<ReturnType<typeof computeHotspots>>;
  try {
    const fixes = await gitScan({ since: lookback, cwd });
    undocumented = await crossReferenceUndocumentedFixes(fixes, opts.solutionsDir);
    hotspots = await computeHotspots({ since: lookback, cwd, threshold: HOTSPOT_THRESHOLD });
  } catch (err) {
    return emit(
      { status: 'failure', reason: err instanceof Error ? err.message : String(err), lookback },
      opts.nonInteractive
    );
  }

  const week = isoWeek(new Date());
  const report = assembleCandidateReport({
    undocumentedFixes: undocumented,
    hotspotCandidates: hotspots,
    isoWeek: week,
    lookback,
  });

  const outputPath =
    opts.outputPath ?? join(cwd, 'docs/solutions/.candidates', `${formatIsoWeek(week)}.md`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report);

  const candidatesFound = undocumented.length + hotspots.length;
  const status: ScanCandidatesStatus = {
    status: candidatesFound === 0 ? 'no-issues' : 'success',
    path: outputPath,
    candidatesFound,
    lookback,
    durationMs: Date.now() - startedAt,
  };
  return emit(status, opts.nonInteractive);
}

function emit(status: ScanCandidatesStatus, nonInteractive: boolean): ScanCandidatesStatus {
  if (nonInteractive) {
    process.stdout.write(JSON.stringify(status) + '\n');
  } else if (status.status === 'failure') {
    process.stderr.write(`scan-candidates failed: ${status.reason}\n`);
  } else {
    process.stdout.write(
      `${status.candidatesFound} candidate(s) over ${status.lookback}\n→ ${status.path}\n`
    );
  }
  return status;
}

export function createScanCandidatesCommand(): Command {
  return new Command('scan-candidates')
    .description(
      'Scan recent fixes and hotspots for undocumented learnings; write candidate prompts'
    )
    .option('--lookback <window>', 'Lookback window (e.g. 7d, 14d).', DEFAULT_LOOKBACK)
    .option(
      '--non-interactive',
      'Emit single-line JSON status on stdout. Auto-detected when stdout is not a TTY.'
    )
    .option('--config <path>', 'Path to harness.config.json', 'harness.config.json')
    .option(
      '--output-path <path>',
      'Override output file path (default: docs/solutions/.candidates/<YYYY-WW>.md)'
    )
    .option('--solutions-dir <path>', 'Solutions directory to cross-reference', 'docs/solutions')
    .action(
      async (options: {
        lookback: string;
        nonInteractive?: boolean;
        config: string;
        outputPath?: string;
        solutionsDir: string;
      }) => {
        const nonInteractive = options.nonInteractive === true || !process.stdout.isTTY;
        const status = await runCompoundScanCandidatesCommand({
          lookback: options.lookback,
          configPath: resolve(process.cwd(), options.config),
          outputPath: options.outputPath ? resolve(process.cwd(), options.outputPath) : undefined,
          solutionsDir: resolve(process.cwd(), options.solutionsDir),
          nonInteractive,
        });
        if (status.status === 'failure') process.exitCode = 1;
      }
    );
}
