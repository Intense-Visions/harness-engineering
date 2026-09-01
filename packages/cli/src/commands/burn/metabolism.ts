import chalk from 'chalk';
import { Command } from 'commander';

import { logger } from '../../output/logger';
import { pad } from './format';

/**
 * `harness burn metabolism` — basal token metabolism (#1628).
 *
 * Classifies token spend from the existing adoption + usage telemetry into
 * basal (maintenance burn that produced no new artifact/decision/fact) vs
 * anabolic (spend that did), with an unattributable bucket, and reports the
 * basal-share metric plus a ranked maintenance-waste list.
 *
 * Lives under `burn` because it is another lens on "where did the tokens go" —
 * a sibling of `burn per-pr` and the by-skill/by-agent report sections. It
 * reads a DIFFERENT source from the rest of burn, though: adoption.jsonl (for
 * the outcome linkage that decides basal vs anabolic) joined with the usage
 * ledger, not the transcript summary. So it is its own section, clearly
 * labelled, rather than folded into the pace numbers.
 *
 * Read-only and report-only: this slice does not wire basal-share into any
 * budget/governor gate (deferred, #1628).
 */

type Core = typeof import('@harness-engineering/core');
type MetabolismReport = ReturnType<Core['buildMetabolismReport']>;
type SpendLedger = ReturnType<Core['buildSpendLedgerFromTelemetry']>;

export interface MetabolismResult {
  report: MetabolismReport;
  ledger: SpendLedger;
}

function formatTokenCount(count: number): string {
  const rounded = Math.round(count);
  if (rounded >= 1_000_000) return (rounded / 1_000_000).toFixed(1) + 'M';
  if (rounded >= 1_000) return (rounded / 1_000).toFixed(1) + 'K';
  return String(rounded);
}

function formatShare(ratio: number | null): string {
  if (ratio == null) return 'N/A';
  return (ratio * 100).toFixed(1) + '%';
}

/**
 * Load and classify the telemetry. Returns `null` when there is no adoption
 * telemetry to classify, so callers (the subcommand and the `burn report`
 * section) can render an empty/absent block rather than a misleading zero.
 */
export async function loadMetabolism(cwd: string): Promise<MetabolismResult | null> {
  const {
    readAdoptionRecords,
    readCostRecords,
    buildSpendLedgerFromTelemetry,
    buildMetabolismReport,
  } = await import('@harness-engineering/core');

  const invocations = readAdoptionRecords(cwd);
  if (invocations.length === 0) return null;

  const usageRecords = readCostRecords(cwd);
  const ledger = buildSpendLedgerFromTelemetry({ invocations, usageRecords });
  const report = buildMetabolismReport(ledger.events);
  return { report, ledger };
}

/**
 * Styled report lines, matching the `burn report` section idiom (bold header,
 * a dim window/provenance line, aligned rows). Used both by the standalone
 * subcommand and as an embedded section of the full burn report.
 */
export function renderMetabolism({ report, ledger }: MetabolismResult): string[] {
  const out = [
    '',
    `  ${chalk.bold('by token metabolism')} ${chalk.dim('— basal (maintenance) vs anabolic (new work)')}`,
    chalk.dim(
      '  source: adoption + usage telemetry (a different lens from the pace numbers above)'
    ),
    `  ${pad('total')}${formatTokenCount(report.totalTokens).padStart(8)} tokens ${chalk.dim(
      `(${report.eventCount} events)`
    )}`,
    `  ${pad('basal')}${formatTokenCount(report.basalTokens).padStart(8)} tokens ${chalk.dim(
      `— ${formatShare(report.basalShare)} basal share (denom = basal + anabolic)`
    )}`,
    `  ${pad('anabolic')}${formatTokenCount(report.anabolicTokens).padStart(8)} tokens`,
    `  ${pad('unattributable')}${formatTokenCount(report.unattributableTokens).padStart(8)} tokens ${chalk.dim(
      `(${formatShare(report.unattributableShare)} of total)`
    )}`,
  ];

  if (report.rankedWaste.length > 0) {
    out.push('', `  ${chalk.dim('ranked maintenance waste (basal burn by loop)')}`);
    for (const entry of report.rankedWaste) {
      out.push(
        `  ${pad(entry.loop.slice(0, 24))}${formatTokenCount(entry.basalTokens).padStart(8)} tokens ${chalk.dim(
          `(${formatShare(entry.shareOfBasal)} of basal)`
        )}`
      );
    }
  }

  out.push(
    chalk.dim(
      `  token magnitudes: ${ledger.tokenSourceCounts.measured} measured, ` +
        `${ledger.tokenSourceCounts['duration-proxy']} duration-proxied`
    )
  );
  return out;
}

/**
 * The metabolism block for embedding in the full `burn report`. Empty when
 * there is no adoption telemetry, so it stays invisible on repos that have not
 * run harness sessions.
 */
export async function metabolismSection(cwd: string): Promise<string[]> {
  const result = await loadMetabolism(cwd);
  return result ? renderMetabolism(result) : [];
}

export function createMetabolismCommand(): Command {
  return new Command('metabolism')
    .description(
      'Classify token spend into basal (maintenance) vs anabolic (productive) and rank maintenance waste'
    )
    .option('--json', 'Emit machine-readable JSON')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      const cwd = process.cwd();
      const result = await loadMetabolism(cwd);

      if (!result) {
        if (opts.json) {
          console.log(JSON.stringify({ error: 'No adoption telemetry found', eventCount: 0 }));
        } else {
          logger.info(
            'No adoption telemetry found (.harness/metrics/adoption.jsonl). Run some harness sessions first.'
          );
        }
        return;
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            { ...result.report, tokenSourceCounts: result.ledger.tokenSourceCounts },
            null,
            2
          )
        );
        return;
      }

      for (const line of renderMetabolism(result)) console.log(line);
    });
}
