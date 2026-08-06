import {
  human,
  readRawConfig,
  readSummary,
  refresh,
  resolvePaths,
  saveRawConfig,
} from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

import { printReport } from './report';

/** Parse `250M`, `1.2B`, `800k`, `1.5x` (multiple of the 4wk median), or a raw number. */
export function parseBudget(arg: string, baselineMedian: number | null): number | null {
  const a = arg.trim().toLowerCase();
  const value = Number.parseFloat(a);
  if (!Number.isFinite(value)) return null;
  if (a.endsWith('x')) return baselineMedian ? value * baselineMedian : null;
  if (a.endsWith('b')) return value * 1e9;
  if (a.endsWith('m')) return value * 1e6;
  if (a.endsWith('k')) return value * 1e3;
  return value;
}

export function setBudget(arg: string | undefined): number {
  const paths = resolvePaths();

  if (arg === undefined) {
    const current = readRawConfig(paths).weekly_budget_units;
    console.log(`budget: ${current ? `${human(Number(current))} units` : 'not set'}`);
    return 0;
  }

  const cfg = readRawConfig(paths);
  if (['off', 'none', 'clear'].includes(arg.trim().toLowerCase())) {
    cfg.weekly_budget_units = null;
    saveRawConfig(paths, cfg);
    // Must rescan: the cached summary still holds a budget-derived status, so
    // skipping this leaves a stale CRITICAL on the statusline indefinitely.
    refresh(paths);
    console.log(`${chalk.green('Budget cleared')} — back to pace-vs-baseline only.`);
    return 0;
  }

  refresh(paths);
  const median = readSummary(paths)?.baseline.median_units ?? null;
  const value = parseBudget(arg, median);
  if (value === null) {
    console.log(
      chalk.yellow(
        arg.trim().toLowerCase().endsWith('x')
          ? 'No baseline yet — set an absolute number instead.'
          : `Could not read '${arg}'. Try: 250M, 1.2x, or off`
      )
    );
    return 1;
  }

  cfg.weekly_budget_units = Math.round(value);
  saveRawConfig(paths, cfg);
  refresh(paths);
  console.log(chalk.green(`Weekly budget set to ${human(value)} units.`));
  return printReport();
}

export function createBudgetCommand(): Command {
  return new Command('budget')
    .description('Set or clear the self-imposed weekly ceiling (250M, 1.2x, or off)')
    .argument('[value]', 'budget value; omit to show the current setting')
    .action((value?: string) => {
      process.exitCode = setBudget(value);
    });
}
