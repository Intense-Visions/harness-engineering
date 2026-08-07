/**
 * End-to-end behaviour of the config-mutating burn commands.
 *
 * These drive the real functions against a throwaway HUD tree via the same
 * `CLAUDE_HUD_*` variables a real install uses, so the config round-trip and
 * the "rescan after every mutation" rule are exercised rather than mocked.
 * The rescan matters: skipping it leaves a stale budget-derived status on the
 * statusline indefinitely.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setBudget } from './budget';
import { calibrate } from './calibrate';
import { setResetDay } from './reset-day';
import { printWeeks } from './weeks';

let root: string;
let configPath: string;
let logged: string[];
const originalEnv = { ...process.env };

/** `{}` when no config exists — a command that refuses must not write one. */
function config(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'burn-cmd-'));
  const hud = path.join(root, 'hud');
  mkdirSync(hud, { recursive: true });
  configPath = path.join(hud, 'config.json');
  process.env.CLAUDE_HUD_HOME = hud;
  process.env.CLAUDE_HUD_STATE = path.join(hud, 'state');
  process.env.CLAUDE_HUD_PROJECTS = path.join(root, 'projects');

  logged = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.CLAUDE_HUD_HOME = originalEnv.CLAUDE_HUD_HOME;
  process.env.CLAUDE_HUD_STATE = originalEnv.CLAUDE_HUD_STATE;
  process.env.CLAUDE_HUD_PROJECTS = originalEnv.CLAUDE_HUD_PROJECTS;
  rmSync(root, { recursive: true, force: true });
});

/** Seed a transcript so the week has measurable spend to calibrate against. */
function seedUsage(outTokens = 100_000): void {
  const dir = path.join(root, 'projects', '-proj');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'a.jsonl'),
    JSON.stringify({
      requestId: 'r1',
      timestamp: new Date().toISOString(),
      message: {
        model: 'claude-opus-5',
        usage: {
          output_tokens: outTokens,
          input_tokens: 10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    }) + '\n'
  );
}

describe('calibrate', () => {
  it('derives a ceiling from a real /usage reading', () => {
    seedUsage();
    expect(calibrate('25')).toBe(0);
    const cal = config().calibration as { reported_pct: number; implied_units_per_pct: number };
    expect(cal.reported_pct).toBe(25);
    // 500,010 units at 25% implies ~2.0M for 100%.
    expect(config().weekly_budget_units).toBe(2_000_040);
    expect(cal.implied_units_per_pct).toBe(20_000);
  });

  it('records an expiry so a promo-inflated ceiling flags itself', () => {
    // A calibration taken during a temporary limit increase under-warns once
    // the promo lapses; the date is what makes the HUD nag instead of trust it.
    seedUsage();
    calibrate('25', '2026-08-19');
    expect((config().calibration as { valid_until: string }).valid_until).toBe('2026-08-19');
  });

  it('carries a previous expiry through a routine re-calibration', () => {
    seedUsage();
    calibrate('25', '2026-08-19');
    calibrate('30');
    expect((config().calibration as { valid_until: string }).valid_until).toBe('2026-08-19');
  });

  it('refuses to calibrate against a zero denominator', () => {
    // A zero denominator is an abstention, not a calibration.
    expect(calibrate('25')).toBe(1);
    expect(logged.join('\n')).toContain('abstention');
  });

  it('rejects a percentage it cannot read or that is out of range', () => {
    seedUsage();
    expect(calibrate('lots')).toBe(1);
    expect(calibrate('0')).toBe(1);
    expect(calibrate('101')).toBe(1);
    expect(config().calibration).toBeUndefined();
  });

  it('warns that a low-percentage calibration is rough', () => {
    seedUsage();
    calibrate('3');
    expect(logged.join('\n')).toContain('so this is rough');
  });
});

describe('weeks', () => {
  it('states ignorance rather than printing an empty table', () => {
    expect(printWeeks()).toBe(1);
    expect(logged.join('\n')).toContain('Blind, not clear');
  });

  it('prints a history row anchored to the configured reset', () => {
    seedUsage();
    setResetDay('wed', '08:59', 'America/Chicago');
    logged = [];
    expect(printWeeks()).toBe(0);
    const out = logged.join('\n');
    expect(out).toContain('weeks anchored to reset');
    expect(out).toContain('current (partial)');
  });
});

describe('budget', () => {
  it('writes an absolute ceiling and reports it', () => {
    expect(setBudget('250M')).toBe(0);
    expect(config().weekly_budget_units).toBe(250_000_000);
    expect(logged.join('\n')).toContain('250.0M');
  });

  it('clears the ceiling back to baseline-relative', () => {
    setBudget('250M');
    expect(setBudget('off')).toBe(0);
    expect(config().weekly_budget_units).toBeNull();
    expect(logged.join('\n')).toContain('pace-vs-baseline only');
  });

  it('reports the current setting when given no value', () => {
    setBudget('1B');
    logged = [];
    expect(setBudget(undefined)).toBe(0);
    expect(logged.join('\n')).toContain('1.00B');
  });

  it('says "not set" rather than inventing a number', () => {
    expect(setBudget(undefined)).toBe(0);
    expect(logged.join('\n')).toContain('not set');
  });

  it('refuses a multiplier when there is no baseline to multiply', () => {
    // Deriving a ceiling from no baseline is the fabricated precision the HUD
    // exists to refuse.
    expect(setBudget('1.5x')).toBe(1);
    expect(logged.join('\n')).toContain('No baseline yet');
  });

  it('refuses input it cannot read, without writing a config', () => {
    expect(setBudget('some')).toBe(1);
    expect(config().weekly_budget_units).toBeUndefined();
  });
});

describe('reset-day', () => {
  it('records weekday, time and timezone together', () => {
    // Weekday alone is not enough: a time-of-day error is a multi-hour window
    // shift, and the two together caused the ~81x understatement.
    setResetDay('wed', '08:59', 'America/Chicago');
    expect(config().week_reset).toEqual({
      weekday: 2,
      time: '08:59',
      tz: 'America/Chicago',
    });
  });

  it('drops the legacy flat key when the anchor is set', () => {
    writeFileSync(configPath, JSON.stringify({ week_reset_weekday: 5 }));
    setResetDay('tue');
    expect(config().week_reset_weekday).toBeUndefined();
    expect((config().week_reset as { weekday: number }).weekday).toBe(1);
  });

  it('keeps the existing time and zone when only the day is given', () => {
    setResetDay('wed', '08:59', 'America/Chicago');
    setResetDay('thu');
    expect(config().week_reset).toEqual({
      weekday: 3,
      time: '08:59',
      tz: 'America/Chicago',
    });
  });

  it('warns that an existing budget no longer matches the moved window', () => {
    setBudget('250M');
    logged = [];
    setResetDay('fri');
    expect(logged.join('\n')).toContain('re-run harness burn calibrate');
  });

  it('reports the current anchor when given no day', () => {
    setResetDay('wed', '08:59', 'America/Chicago');
    logged = [];
    expect(setResetDay(undefined)).toBe(0);
    expect(logged.join('\n')).toContain('Wed');
    expect(logged.join('\n')).toContain('America/Chicago');
  });

  it('rejects a day it cannot parse without touching the config', () => {
    expect(setResetDay('someday')).toBe(1);
    expect(config().week_reset).toBeUndefined();
  });
});
