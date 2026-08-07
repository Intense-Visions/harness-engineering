import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { BurnConfig } from './types';

/**
 * Where the HUD keeps its state.
 *
 * The `CLAUDE_HUD_*` env names are inherited from the Python HUD rather than
 * renamed: an existing install already sets them, and the test suite drives the
 * real code against a throwaway tree through the same three variables.
 */
export interface BurnPaths {
  hud: string;
  state: string;
  projects: string;
  config: string;
  summary: string;
  usageTsv: string;
  filesTsv: string;
  lock: string;
  lastNotify: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): BurnPaths {
  const home = env.HOME || homedir();
  const hud = env.CLAUDE_HUD_HOME || path.join(home, '.claude', 'hud');
  const state = env.CLAUDE_HUD_STATE || path.join(hud, 'state');
  const projects = env.CLAUDE_HUD_PROJECTS || path.join(home, '.claude', 'projects');
  return {
    hud,
    state,
    projects,
    config: path.join(hud, 'config.json'),
    summary: path.join(state, 'summary.json'),
    usageTsv: path.join(state, 'usage.tsv'),
    filesTsv: path.join(state, 'files.tsv'),
    lock: path.join(state, 'scan.lock'),
    lastNotify: path.join(state, 'last-notify.json'),
  };
}

export const DEFAULT_CONFIG: BurnConfig = {
  // Must mirror /usage. weekday: 0=Mon .. 6=Sun.
  week_reset: { weekday: 0, time: '00:00', tz: 'UTC' },
  weekly_budget_units: null,
  model_budgets: {},
  session_window_hours: 5,
  session_budget_units: null,
  warm_ratio: 1.25,
  hot_ratio: 1.6,
  baseline_weeks: 4,
  stale_after_minutes: 90,
};

function clone(cfg: BurnConfig): BurnConfig {
  return JSON.parse(JSON.stringify(cfg)) as BurnConfig;
}

/**
 * Read the user's config over the defaults.
 *
 * A broken config must not take the HUD down — an unreadable file falls back to
 * defaults, because a HUD that fails to start is indistinguishable from a HUD
 * reporting nothing to worry about.
 */
export function loadConfig(paths: BurnPaths): BurnConfig {
  const cfg = clone(DEFAULT_CONFIG);
  if (!existsSync(paths.config)) return cfg;

  let user: Record<string, unknown>;
  try {
    user = JSON.parse(readFileSync(paths.config, 'utf8')) as Record<string, unknown>;
  } catch {
    return cfg;
  }
  if (user === null || typeof user !== 'object') return cfg;

  // Legacy flat key, kept working so an old config cannot silently revert the
  // week window to Monday-UTC — the mismatch that understated a 97% week by ~81x.
  if ('week_reset_weekday' in user && !('week_reset' in user)) {
    const wd = Number(user.week_reset_weekday);
    if (Number.isFinite(wd)) cfg.week_reset.weekday = ((wd % 7) + 7) % 7;
  }

  for (const [k, v] of Object.entries(user)) {
    if (k === 'week_reset_weekday') continue;
    if (k === 'week_reset' && v !== null && typeof v === 'object') {
      Object.assign(cfg.week_reset, v);
    } else {
      (cfg as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return cfg;
}

/** Read the raw on-disk config (no defaults merged) — what `harness burn` edits. */
export function readRawConfig(paths: BurnPaths): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(paths.config, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function saveRawConfig(paths: BurnPaths, cfg: Record<string, unknown>): void {
  mkdirSync(path.dirname(paths.config), { recursive: true });
  writeFileSync(paths.config, JSON.stringify(cfg, null, 2) + '\n');
}
