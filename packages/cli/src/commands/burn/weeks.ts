import {
  human,
  loadConfig,
  readRecords,
  refresh,
  resolvePaths,
  units,
  weekBounds,
} from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

const WEEK_SECONDS = 7 * 86_400;

/**
 * Weekly history, bucketed against the SAME anchored reset the live report
 * uses.
 *
 * It previously used the legacy flat weekday key, which left this table
 * Monday-anchored while the main report was Wednesday-anchored — two views of
 * the same data disagreeing about the same week.
 */
export function printWeeks(): number {
  const paths = resolvePaths();
  refresh(paths);
  const cfg = loadConfig(paths);
  const { start: curStart } = weekBounds(new Date(), cfg);

  const rows = new Map<number, { requests: number; out: number; units: number }>();
  for (const rec of readRecords(paths).values()) {
    const t = Date.parse(rec.ts);
    if (!Number.isFinite(t)) continue;
    const delta = (curStart.getTime() - t) / 1000;
    const idx = delta <= 0 ? 0 : Math.floor(delta / WEEK_SECONDS) + 1;
    const row = rows.get(idx) ?? { requests: 0, out: 0, units: 0 };
    row.requests += 1;
    row.out += rec.out;
    row.units += units(rec.out, rec.in, rec.cacheWrite, rec.cacheRead);
    rows.set(idx, row);
  }

  if (rows.size === 0) {
    console.log(chalk.yellow('⚠ No usage records. Blind, not clear.'));
    return 1;
  }

  const budget = cfg.weekly_budget_units;
  const indexes = [...rows.keys()].filter((i) => i <= 11).sort((a, b) => a - b);
  const peak = Math.max(...indexes.map((i) => rows.get(i)!.units));
  const wr = cfg.week_reset;

  console.log('');
  console.log(chalk.dim(`  weeks anchored to reset: weekday ${wr.weekday} ${wr.time} ${wr.tz}`));
  console.log(
    chalk.bold(
      `  ${'week of'.padEnd(12)}${'requests'.padStart(10)}${'output'.padStart(10)}${'units'.padStart(10)}`
    )
  );
  for (const i of [...indexes].reverse()) {
    const v = rows.get(i)!;
    const start = new Date(curStart.getTime() - i * WEEK_SECONDS * 1000).toISOString().slice(0, 10);
    const blocks = Math.round((v.units / peak) * 20);
    const tag = i === 0 ? chalk.dim('  ← current (partial)') : '';
    const over =
      budget && i > 0 && v.units > budget
        ? `  ${chalk.red(`${Math.round((100 * v.units) / budget)}% of today's budget`)}`
        : '';
    console.log(
      `  ${start.padEnd(12)}${v.requests.toLocaleString('en-US').padStart(10)}` +
        `${human(v.out).padStart(10)}${human(v.units).padStart(10)}  ` +
        `${chalk.dim('▂'.repeat(blocks))}${tag}${over}`
    );
  }
  console.log('');
  return 0;
}

export function createWeeksCommand(): Command {
  return new Command('weeks')
    .description('Weekly usage history, anchored to the configured reset')
    .action(() => {
      process.exitCode = printWeeks();
    });
}
