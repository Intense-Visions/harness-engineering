import { readRawConfig, refresh, resolvePaths, saveRawConfig } from '@harness-engineering/burn';
import chalk from 'chalk';
import { Command } from 'commander';

import { printReport } from './report';

const WEEKDAYS: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Align the HUD's week window with the account's real reset.
 *
 * Time-of-day matters more than it looks: a Monday-midnight-UTC assumption
 * against a real Wednesday-08:59-Chicago reset understated week-to-date burn by
 * ~81x and showed a calm green at 97% of the actual limit.
 */
/** `mon`..`sun` or `0`..`6` (0=Mon), or null when it is neither. */
export function parseWeekday(day: string): number | null {
  const key = day.trim().toLowerCase().slice(0, 3);
  if (key in WEEKDAYS) return WEEKDAYS[key]!;
  const n = Number.parseInt(day, 10);
  return Number.isFinite(n) ? ((n % 7) + 7) % 7 : null;
}

function weekdayName(weekday: number): string {
  const name = Object.keys(WEEKDAYS).find((k) => WEEKDAYS[k] === weekday) ?? String(weekday);
  return `${name[0]!.toUpperCase()}${name.slice(1)}`;
}

interface WeekResetConfig {
  weekday?: number;
  time?: string;
  tz?: string;
}

function showCurrentReset(existing: WeekResetConfig): number {
  const wd = existing.weekday ?? 0;
  console.log(
    `week resets on ${weekdayName(wd)} (${wd}) at ${existing.time ?? '00:00'} ${existing.tz ?? 'UTC'}`
  );
  return 0;
}

/** Persist the new anchor, rescan against it, and say what moved. */
function applyReset(
  cfg: Record<string, unknown>,
  existing: WeekResetConfig,
  weekday: number,
  time?: string,
  tz?: string
): number {
  const weekReset = {
    weekday,
    time: time ?? existing.time ?? '00:00',
    tz: tz ?? existing.tz ?? 'UTC',
  };
  cfg.week_reset = weekReset;
  delete cfg.week_reset_weekday; // drop the legacy flat key

  const paths = resolvePaths();
  saveRawConfig(paths, cfg);
  refresh(paths);

  console.log(
    chalk.green(`Week now resets ${weekdayName(weekday)} ${weekReset.time} ${weekReset.tz}.`)
  );
  console.log(chalk.dim('Baseline weeks recut against the new anchor.'));
  if (cfg.weekly_budget_units) {
    console.log(
      chalk.yellow(
        'The window moved, so the existing budget no longer matches what it was calibrated against — re-run harness burn calibrate.'
      )
    );
  }
  return printReport();
}

export function setResetDay(day: string | undefined, time?: string, tz?: string): number {
  const cfg = readRawConfig(resolvePaths());
  const existing = (cfg.week_reset ?? {}) as WeekResetConfig;

  if (day === undefined) return showCurrentReset(existing);

  const weekday = parseWeekday(day);
  if (weekday === null) {
    console.log(chalk.yellow('Use mon..sun or 0..6 (0=Mon).'));
    return 1;
  }
  return applyReset(cfg, existing, weekday, time, tz);
}

export function createResetDayCommand(): Command {
  return new Command('reset-day')
    .description('Align the week window with the reset /usage reports')
    .argument('[day]', 'mon..sun or 0..6 (0=Mon); omit to show the current setting')
    .argument('[time]', 'local time of the reset, e.g. 08:59')
    .argument('[tz]', 'IANA timezone, e.g. America/Chicago')
    .action((day?: string, time?: string, tz?: string) => {
      process.exitCode = setResetDay(day, time, tz);
    });
}
