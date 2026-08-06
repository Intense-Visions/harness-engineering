/**
 * Config resolution and unit formatting.
 *
 * Both are small, but both sit under every number the HUD prints: a config that
 * silently reverts to defaults measures the wrong seven days, and a formatter
 * that rounds up shows a threshold being crossed that was not.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFIG,
  loadConfig,
  readRawConfig,
  resolvePaths,
  saveRawConfig,
} from '../src/config';
import { readSummary } from '../src/read-summary';
import { refresh, refreshIfStale } from '../src/refresh';
import { human, units } from '../src/units';
import { safeZone } from '../src/window';
import { DEFAULT_WEEK, makeHud, transcriptLine, type Hud } from './helpers';

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

describe('config', () => {
  it('returns defaults when no config file exists', () => {
    const h = newHud();
    expect(loadConfig(h.paths)).toEqual(DEFAULT_CONFIG);
  });

  it('merges week_reset field-by-field rather than replacing it', () => {
    // A config that sets only the timezone must not lose the weekday, or the
    // window silently slides back to Monday.
    const h = newHud();
    h.writeConfig({ week_reset: { tz: 'America/Chicago' } });
    const cfg = loadConfig(h.paths);
    expect(cfg.week_reset.tz).toBe('America/Chicago');
    expect(cfg.week_reset.weekday).toBe(0);
    expect(cfg.week_reset.time).toBe('00:00');
  });

  it('prefers an explicit week_reset over the legacy flat key', () => {
    const h = newHud();
    h.writeConfig({ week_reset_weekday: 5, week_reset: { weekday: 2, time: '08:59', tz: 'UTC' } });
    expect(loadConfig(h.paths).week_reset.weekday).toBe(2);
  });

  it('round-trips a raw config without inventing defaults', () => {
    const h = newHud();
    saveRawConfig(h.paths, { weekly_budget_units: 123 });
    expect(readRawConfig(h.paths)).toEqual({ weekly_budget_units: 123 });
    // The raw read must not synthesise keys the user never wrote.
    expect(readRawConfig(h.paths).week_reset).toBeUndefined();
  });

  it('treats a corrupt raw config as empty rather than throwing', () => {
    const h = newHud();
    writeFileSync(h.paths.config, '}{');
    expect(readRawConfig(h.paths)).toEqual({});
  });

  it('resolves paths from the CLAUDE_HUD_* overrides', () => {
    const home = path.join(path.sep, 'tmp', 'x');
    const paths = resolvePaths({ CLAUDE_HUD_HOME: home, HOME: path.join(path.sep, 'nobody') });
    expect(paths.hud).toBe(home);
    // Built with path.join, so the separator is the platform's — asserting a
    // literal '/' here is what failed the Windows leg of CI.
    expect(paths.summary).toBe(path.join(home, 'state', 'summary.json'));
  });

  it('falls back to UTC for an unknown timezone instead of throwing', () => {
    expect(safeZone('Mars/Olympus_Mons')).toBe('UTC');
    expect(safeZone('America/Chicago')).toBe('America/Chicago');
  });
});

describe('units', () => {
  it('weights output far above cache reads', () => {
    expect(units(1, 0, 0, 0)).toBe(5);
    expect(units(0, 1, 0, 0)).toBe(1);
    expect(units(0, 0, 1, 0)).toBe(1.25);
    expect(units(0, 0, 0, 1)).toBe(0.1);
  });

  it('formats across every magnitude', () => {
    expect(human(2_400_000_000)).toBe('2.40B');
    expect(human(21_400_000)).toBe('21.4M');
    expect(human(21_400)).toBe('21k');
    expect(human(42)).toBe('42');
    expect(human(null)).toBe('0');
  });
});

describe('refresh throttling', () => {
  it('skips the rescan while the cache is warm', () => {
    // The Stop hook fires after every turn; not stampeding is cheaper than
    // relying on the lock to sort out six concurrent scans.
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('a.jsonl', [transcriptLine('r1', new Date())]);
    refresh(h.paths);

    h.writeTranscript('b.jsonl', [transcriptLine('r2', new Date())]);
    refreshIfStale(h.paths, 60);
    // The new transcript is deliberately NOT picked up yet: the published
    // summary still describes one record.
    expect(readSummary(h.paths)!.scan.records_total).toBe(1);
  });

  it('rescans once the cache has gone cold', () => {
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('a.jsonl', [transcriptLine('r1', new Date())]);
    refresh(h.paths);

    h.writeTranscript('b.jsonl', [transcriptLine('r2', new Date())]);
    // Pretend two minutes have passed rather than sleeping.
    refreshIfStale(h.paths, 60, new Date(Date.now() + 120_000));
    expect(readSummary(h.paths)!.scan.records_total).toBe(2);
  });
});
