import {
  human,
  readRawConfig,
  readSummary,
  refresh,
  resolvePaths,
  saveRawConfig,
  type Calibration,
} from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

import { printReport } from './report';

/**
 * Turn the local proxy into a calibrated gauge.
 *
 * Given the percentage /usage reports right now, derive units-per-percent from
 * this week's measured burn and set the budget to the implied 100%. Only valid
 * if the reset day already matches, and only precise once enough of the week
 * has elapsed — /usage reports whole percents, so calibrating at 3% carries
 * ~17% error. Both caveats are printed rather than silently absorbed.
 */
export function calibrate(pctArg: string, validUntil?: string): number {
  const pct = Number.parseFloat(pctArg.trim().replace(/%$/, ''));
  if (!Number.isFinite(pct)) {
    console.log(chalk.yellow('Give the percentage /usage shows, e.g. harness burn calibrate 34'));
    return 1;
  }
  if (!(pct > 0 && pct <= 100)) {
    console.log(chalk.yellow('Percentage must be between 0 and 100.'));
    return 1;
  }

  const paths = resolvePaths();
  refresh(paths);
  const summary = readSummary(paths);
  if (!summary) {
    console.log(chalk.yellow('No usage cache — run harness burn scan first.'));
    return 1;
  }

  const wtd = summary.wtd.units;
  if (wtd <= 0) {
    console.log(chalk.yellow('Zero units measured this week — nothing to calibrate against.'));
    console.log(chalk.dim('A zero denominator is an abstention, not a calibration.'));
    return 1;
  }

  const budget = (wtd * 100) / pct;
  const err = (0.5 / pct) * 100; // /usage rounds to whole percents

  const cfg = readRawConfig(paths);
  const previous = (cfg.calibration ?? {}) as Calibration;
  cfg.weekly_budget_units = Math.round(budget);

  const cal: Calibration = {
    at: new Date().toISOString(),
    reported_pct: pct,
    wtd_units_then: wtd,
    implied_units_per_pct: Math.round(wtd / pct),
  };
  // Carry forward an expiry/note so a promo caveat is not silently dropped by a
  // routine re-calibration.
  if (validUntil) cal.valid_until = validUntil;
  else if (previous.valid_until) cal.valid_until = previous.valid_until;
  if (previous.note) cal.note = previous.note;

  cfg.calibration = cal;
  saveRawConfig(paths, cfg);
  refresh(paths);

  printCalibration({ pct, wtd, budget, err, mondayAssumed: assumesMonday(cfg) });
  return printReport();
}

function assumesMonday(cfg: Record<string, unknown>): boolean {
  const weekReset = cfg.week_reset as { weekday?: number } | undefined;
  return !weekReset || (weekReset.weekday ?? 0) === 0;
}

/**
 * Report what was derived, and the two caveats that decide whether to believe
 * it. Both are printed rather than silently absorbed: a calibration taken at a
 * low percentage, or against the wrong week window, produces a confident wrong
 * ceiling — which is worse than no ceiling.
 */
function printCalibration(v: {
  pct: number;
  wtd: number;
  budget: number;
  err: number;
  mondayAssumed: boolean;
}): void {
  console.log('');
  console.log(
    `  ${chalk.green('Calibrated.')} /usage said ${v.pct}% at ${human(v.wtd)} units week-to-date.`
  );
  console.log(`  ${'1% ≈'.padEnd(22)}${human(v.wtd / v.pct)} units`);
  console.log(
    `  ${'implied weekly limit'.padEnd(22)}${chalk.bold(human(v.budget))} units  ${chalk.dim('(= your 100%)')}`
  );
  console.log(chalk.dim(`  ±${Math.round(v.err)}% precision — /usage reports whole percents.`));
  if (v.pct < 10) {
    console.log(chalk.yellow(`  ⚠ Calibrated at only ${v.pct}%, so this is rough.`));
    console.log(chalk.yellow('    Re-run mid-week at a higher percentage to tighten it.'));
  }
  if (v.mondayAssumed) {
    console.log(chalk.dim('  Assumes a Monday reset. If /usage shows otherwise:'));
    console.log(chalk.dim('    harness burn reset-day <mon..sun>   then re-calibrate.'));
  }
  console.log('');
}

export function createCalibrateCommand(): Command {
  return new Command('calibrate')
    .description('Anchor the budget to a real /usage reading')
    .argument('<percent>', 'the percentage /usage reports right now')
    .argument('[valid-until]', 'YYYY-MM-DD after which this calibration is distrusted')
    .action((percent: string, validUntil?: string) => {
      process.exitCode = calibrate(percent, validUntil);
    });
}
