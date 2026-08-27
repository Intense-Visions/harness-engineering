import {
  buildCostReport,
  checkCostBands,
  human,
  linkPrs,
  loadConfig,
  readProvenance,
  readRecords,
  resolvePaths,
  writeCostReport,
  type BuildCostReportInput,
  type CostReport,
} from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

import { pad } from './format';

interface PerPrOptions {
  since?: string;
  until?: string;
  json?: boolean;
  write?: boolean;
}

function costCell(value: number | null): string {
  return value === null ? chalk.dim('n/a') : `${human(value)} u`;
}

/**
 * Render the cost-per-merged-PR report.
 *
 * Both denominators are shown side by side — a `cost_per_merged_pr` alone would
 * be the exact success-only figure the issue warns against, so the dispatched
 * -lane figure and the denominator note travel with it. A degraded run (spend
 * seen but no lane linked to a PR) is a headline, not a footnote.
 */
function renderReport(
  report: CostReport,
  bandFindings: ReturnType<typeof checkCostBands>
): string[] {
  const out: string[] = [
    '',
    `  ${chalk.bold('Cost per merged PR')} ${chalk.dim('(burn units)')}`,
    '',
  ];

  const t = report.totals;
  out.push(
    `  ${pad('merged PRs')} ${chalk.bold(String(t.prs_merged))}` +
      chalk.dim(`   dispatched lanes ${t.dispatched_lanes}`),
    `  ${pad('per merged PR')} ${chalk.bold(costCell(t.cost_per_merged_pr))}`,
    `  ${pad('per dispatched lane')} ${chalk.bold(costCell(t.cost_per_dispatched_lane))}`,
    `  ${pad('attributed spend')} ${human(t.units)} units ` +
      chalk.dim(
        `(${human(t.tokens_in)} in, ${human(t.tokens_out)} out, ${human(t.cache_read)} cache-rd)`
      )
  );

  if (report.pricing) {
    const perPr = report.pricing.usd_per_merged_pr;
    out.push(
      `  ${pad('priced ($)')} $${report.pricing.usd_total.toFixed(2)}` +
        (perPr === null ? '' : chalk.dim(`   $${perPr.toFixed(2)}/merged PR`))
    );
  }

  if (report.by_skill.length > 0) {
    out.push('', `  ${chalk.bold('by skill')}`);
    for (const s of report.by_skill.slice(0, 10)) {
      out.push(
        `  ${pad(s.skill)}${human(s.units).padStart(8)} u` +
          chalk.dim(
            `  ${costCell(s.cost_per_merged_pr)}/PR · ${s.lanes} lane${s.lanes === 1 ? '' : 's'}`
          )
      );
    }
  }

  if (report.degraded) {
    out.push(
      '',
      chalk.yellow('  ⚠ ATTRIBUTION DEGRADED — subagent spend was seen but no lane linked to a'),
      chalk.yellow('    merged PR. Per-lane cost/PR needs provenance files to stamp the lane id;'),
      chalk.yellow('    the fleet/skill rollup above still divides by the merged-PR count.')
    );
  }

  for (const f of bandFindings) {
    out.push(
      chalk.red(
        `  ⚠ COST BAND — ${f.skill} at ${human(f.cost_per_merged_pr)} u/PR is ${f.direction} its ` +
          `band (max ${human(f.band.max)}${f.band.min !== undefined ? `, min ${human(f.band.min)}` : ''}).`
      )
    );
  }

  out.push('', chalk.dim(`  ${report.denominator_note}`), '');
  return out;
}

function windowFromOptions(options: PerPrOptions): { since?: string; until?: string } {
  const window: { since?: string; until?: string } = {};
  if (options.since) window.since = options.since;
  if (options.until) window.until = options.until;
  return window;
}

export function printPerPr(options: PerPrOptions): number {
  const paths = resolvePaths();
  const cfg = loadConfig(paths);
  const records = readRecords(paths);
  const repoRoot = process.cwd();
  const provenance = readProvenance(repoRoot);
  const linkage = linkPrs(provenance);

  const input: BuildCostReportInput = {
    records: records.values(),
    provenance,
    linkage,
    window: windowFromOptions(options),
  };
  if (cfg.cost_price_table) input.priceTable = cfg.cost_price_table;

  const report = buildCostReport(input);
  const bandFindings = checkCostBands(report, cfg.cost_bands ?? {});

  if (options.write) writeCostReport(repoRoot, report);

  if (options.json) {
    console.log(JSON.stringify({ ...report, band_findings: bandFindings }, null, 2));
    return 0;
  }
  for (const line of renderReport(report, bandFindings)) console.log(line);
  return 0;
}

export function createPerPrCommand(): Command {
  return new Command('per-pr')
    .description('Cost per merged PR: join burn token attribution to shipped PRs')
    .option('--since <iso>', 'only count records at/after this ISO instant')
    .option('--until <iso>', 'only count records at/before this ISO instant')
    .option('--json', 'emit the raw cost report as JSON')
    .option('--write', 'persist the report to .harness/metrics/cost-per-pr.json')
    .action((_options: PerPrOptions, command: Command) => {
      // `--json` is also a global root option, so merge globals to honour it
      // whether it lands on the root or this subcommand.
      process.exitCode = printPerPr(command.optsWithGlobals() as PerPrOptions);
    });
}
