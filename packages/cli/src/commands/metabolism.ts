import { Command } from 'commander';
import { logger } from '../output/logger';

/**
 * `harness metabolism` — basal token metabolism (#1628).
 *
 * Classifies token spend from the existing adoption + usage telemetry into
 * basal (maintenance burn that produced no new artifact/decision/fact) vs
 * anabolic (spend that did), with an unattributable bucket, and reports the
 * basal-share metric plus a ranked maintenance-waste list.
 *
 * Read-only and report-only: this slice does not wire basal-share into any
 * budget/governor gate (deferred, #1628).
 */

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

type MetabolismReport = Awaited<
  ReturnType<typeof import('@harness-engineering/core').buildMetabolismReport>
>;

function printReport(report: MetabolismReport): void {
  logger.info('Basal token metabolism');
  logger.info('======================');
  logger.info(`Events classified:     ${report.eventCount}`);
  logger.info(`Total tokens:          ${formatTokenCount(report.totalTokens)}`);
  logger.info(`  Basal (maintenance): ${formatTokenCount(report.basalTokens)}`);
  logger.info(`  Anabolic (new work): ${formatTokenCount(report.anabolicTokens)}`);
  logger.info(`  Unattributable:      ${formatTokenCount(report.unattributableTokens)}`);
  logger.info('');
  logger.info(
    `Basal share:           ${formatShare(report.basalShare)} ` +
      `(denominator = basal + anabolic = ${formatTokenCount(report.denominatorTokens)} tokens)`
  );
  logger.info(`Unattributable share:  ${formatShare(report.unattributableShare)} (of total spend)`);

  if (report.rankedWaste.length > 0) {
    logger.info('');
    logger.info('Ranked maintenance waste (basal burn by loop):');
    logger.info('Loop                             | Basal tokens | Share of basal');
    logger.info('---------------------------------|--------------|---------------');
    for (const entry of report.rankedWaste) {
      const loop = entry.loop.slice(0, 32).padEnd(32);
      const tokens = formatTokenCount(entry.basalTokens).padStart(12);
      const share = formatShare(entry.shareOfBasal).padStart(14);
      logger.info(`${loop} | ${tokens} | ${share}`);
    }
  }
}

function registerReportCommand(metabolism: Command): void {
  metabolism
    .command('report', { isDefault: true })
    .description('Classify token spend into basal vs anabolic and rank maintenance waste')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const {
        readAdoptionRecords,
        readCostRecords,
        buildSpendLedgerFromTelemetry,
        buildMetabolismReport,
      } = await import('@harness-engineering/core');

      const invocations = readAdoptionRecords(cwd);
      const usageRecords = readCostRecords(cwd);

      if (invocations.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ error: 'No adoption telemetry found', eventCount: 0 }));
        } else {
          logger.info(
            'No adoption telemetry found (.harness/metrics/adoption.jsonl). Run some harness sessions first.'
          );
        }
        return;
      }

      const ledger = buildSpendLedgerFromTelemetry({ invocations, usageRecords });
      const report = buildMetabolismReport(ledger.events);

      if (globalOpts.json) {
        console.log(
          JSON.stringify({ ...report, tokenSourceCounts: ledger.tokenSourceCounts }, null, 2)
        );
        return;
      }

      printReport(report);
      logger.info('');
      logger.info(
        `Token magnitudes: ${ledger.tokenSourceCounts.measured} measured, ` +
          `${ledger.tokenSourceCounts['duration-proxy']} duration-proxied.`
      );
    });
}

export function createMetabolismCommand(): Command {
  const metabolism = new Command('metabolism').description(
    'Classify token spend into basal (maintenance) vs anabolic (productive) and rank maintenance waste'
  );

  registerReportCommand(metabolism);

  return metabolism;
}
