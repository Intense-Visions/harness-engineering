import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  runPulse,
  computeWindow,
  assembleReport,
  extractHeadlines,
} from '@harness-engineering/core';
import type { PulseConfig, PulseRunStatus } from '@harness-engineering/types';

export interface PulseRunOptions {
  configPath: string;
  outputDir: string;
  nonInteractive: boolean;
  lookback?: string | undefined;
}

/**
 * Run a single pulse: load config, dispatch adapters, assemble report, write
 * file. Designed to be invoked from the CLI subcommand and from automated
 * maintenance task wiring (Phase 6) — both consume the returned PulseRunStatus.
 */
export async function runPulseRunCommand(opts: PulseRunOptions): Promise<PulseRunStatus> {
  const startedAt = Date.now();

  // Load config.
  let raw: { pulse?: PulseConfig; name?: string };
  try {
    raw = JSON.parse(readFileSync(opts.configPath, 'utf-8'));
  } catch (err) {
    return emit(
      {
        status: 'failure',
        reason: `cannot read ${opts.configPath}: ${err instanceof Error ? err.message : String(err)}`,
      },
      opts.nonInteractive
    );
  }

  if (!raw.pulse?.enabled) {
    return emit(
      { status: 'skipped', reason: 'pulse.enabled is false or missing' },
      opts.nonInteractive
    );
  }

  // Compute window (CLI flag > config default > '24h' fallback).
  const lookback = opts.lookback ?? raw.pulse.lookbackDefault ?? '24h';
  const window = computeWindow(new Date(), lookback);

  // Orchestrate.
  const result = await runPulse(raw.pulse, window);

  // Assemble report. Product name resolution is conservative: until the
  // strategy/business-knowledge wiring lands (Phase 7), use the config name as
  // a stand-in. Falls back to 'Project'.
  const productName = typeof raw.name === 'string' ? raw.name : 'Project';
  const report = assembleReport(result, productName, lookback);

  // Write file with stable timestamped name.
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filePath = join(opts.outputDir, `${ts}.md`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, report);

  // Headlines summary is extracted structurally (title + ## Headlines block,
  // up to the next H2). This keeps every bullet — total events, sources
  // queried, sources skipped — even if the bullet count drifts.
  const headlines = extractHeadlines(report);
  return emit(
    {
      status: 'success',
      path: filePath,
      headlinesSummary: headlines,
      durationMs: Date.now() - startedAt,
      sourcesQueried: result.sourcesQueried,
      sourcesSkipped: result.sourcesSkipped,
    },
    opts.nonInteractive
  );
}

function emit(status: PulseRunStatus, nonInteractive: boolean): PulseRunStatus {
  if (nonInteractive) {
    process.stdout.write(JSON.stringify(status) + '\n');
  } else if (status.status === 'success') {
    process.stdout.write(`${status.headlinesSummary ?? ''}\n\n→ ${status.path}\n`);
  } else if (status.status === 'skipped') {
    process.stdout.write(`pulse skipped: ${status.reason}\n`);
  } else {
    process.stderr.write(`pulse failed: ${status.reason}\n`);
  }
  return status;
}

/**
 * Build the `harness pulse run` subcommand. Registered on the parent `pulse`
 * command (see ./index.ts), which itself is wired into the program by the
 * auto-generated commands/_registry.ts.
 */
export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a pulse: query configured adapters, sanitize, assemble single-page report')
    .option(
      '--lookback <window>',
      'Lookback window (e.g. 24h, 7d). Defaults to pulse.lookbackDefault.'
    )
    .option(
      '--non-interactive',
      'Emit single-line JSON status on stdout instead of headlines+path. Auto-detected when stdout is not a TTY.'
    )
    .option('--config <path>', 'Path to harness.config.json', 'harness.config.json')
    .option('--output-dir <dir>', 'Directory to write the report into', 'docs/pulse-reports')
    .action(
      async (options: {
        lookback?: string;
        nonInteractive?: boolean;
        config: string;
        outputDir: string;
      }) => {
        const nonInteractive = options.nonInteractive === true || !process.stdout.isTTY;
        const status = await runPulseRunCommand({
          configPath: resolve(process.cwd(), options.config),
          outputDir: resolve(process.cwd(), options.outputDir),
          nonInteractive,
          lookback: options.lookback,
        });
        if (status.status === 'failure') {
          process.exitCode = 1;
        }
      }
    );
}
