// packages/cli/src/commands/insights.ts
//
// Hermes Phase 1 — `harness insights` CLI: composite project report.
// Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D5)
import { Command } from 'commander';
import type { InsightsReport } from '@harness-engineering/types';
import { INSIGHTS_KEYS, type InsightsKey } from '@harness-engineering/types';
import { logger } from '../output/logger';

interface InsightsOptions {
  json?: boolean;
  skip?: string;
}

function parseSkip(raw: string | undefined): InsightsKey[] {
  if (!raw) return [];
  const valid = new Set<string>(INSIGHTS_KEYS);
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => valid.has(s)) as InsightsKey[];
}

function renderPretty(report: InsightsReport): void {
  logger.info(`Insights for ${report.project.name ?? report.project.root}`);
  logger.info(`Generated: ${report.generatedAt}\n`);
  // A block that FAILED (null plus a warning) is shown as not measured. A block
  // the caller skipped is null with no warning and stays omitted.
  const failed = (key: string): boolean => report.warnings.some((w) => w.startsWith(`${key}:`));
  if (report.health) {
    console.log(`Health      : ${report.health.passed ? 'PASS' : 'FAIL'}`);
    console.log(`            : ${report.health.summary}`);
  } else if (failed('health')) {
    console.log('Health      : NOT MEASURED (see warnings)');
  }
  if (report.entropy) {
    const e = report.entropy;
    console.log(
      `Entropy     : drift=${e.driftCount} deadFiles=${e.deadFiles} deadExports=${e.deadExports}`
    );
  } else if (failed('entropy')) {
    console.log('Entropy     : NOT MEASURED (see warnings)');
  }
  if (report.decay) {
    const top = report.decay.topAffected.join(', ') || '(none)';
    console.log(`Decay       : recentBumps=${report.decay.recentBumps} topAffected=${top}`);
  }
  if (report.attention) {
    const a = report.attention;
    console.log(`Attention   : active=${a.activeThreadCount} stale=${a.staleThreadCount}`);
  }
  if (report.impact) {
    const radii =
      report.impact.recentBlastRadius.map((r) => `${r.node}(${r.affected})`).join(', ') || '(none)';
    console.log(`Impact      : ${radii}`);
  }
  if (report.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of report.warnings) console.log(`  - ${w}`);
  }
}

export function createInsightsCommand(): Command {
  return new Command('insights')
    .description('Composite project report — health, entropy, decay, attention, impact.')
    .option('--json', 'Emit JSON to stdout instead of pretty text')
    .option('--skip <list>', `Comma-separated keys to skip (${INSIGHTS_KEYS.join(',')})`)
    .action(async (opts: InsightsOptions) => {
      const cwd = process.cwd();
      const skip = parseSkip(opts.skip);

      const { composeInsights } = await import('@harness-engineering/core');
      const report = await composeInsights(cwd, { skip });
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      renderPretty(report);
    });
}
