import { writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { buildSummary } from '../src/summary';
import { DEFAULT_CONFIG } from '../src/config';
import type { BurnConfig, ScanInfo } from '../src/types';
import { DEFAULT_WEEK, makeHud, type Hud } from './helpers';

/**
 * Direct-call coverage for `buildSummary`. The existing suites drive it through
 * `refresh`/`recompute`; these tests call it directly with a fixed `now`, a
 * hand-seeded store, and an explicit `ScanInfo`, to pin branches that the
 * attribution / budget suites don't reach:
 *
 *  - NO_BASELINE when there is spend but no trailing complete weeks;
 *  - per-model budget exhaustion forcing HOT even when the pooled ratio is OK;
 *  - the trailing-week baseline rollup (median + per_week_back);
 *  - the ISO `+00:00` timestamp contract and week/wtd shape;
 *  - the session-window block.
 *
 * `now` is a fixed mid-week instant so the elapsed fraction (~0.36) yields
 * high projection confidence deterministically.
 */

const NOW = new Date('2026-08-12T12:00:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

interface Row {
  id: string;
  atMsAgo: number;
  out?: number;
  model?: string;
}

/** Seed the 9-column store directly with fully-attributed `main` rows. */
function seed(h: Hud, rows: Row[]): void {
  const lines = rows.map((r) => {
    const ts = new Date(NOW.getTime() - r.atMsAgo).toISOString();
    const model = r.model ?? 'claude-opus-5';
    const out = r.out ?? 100;
    return `${r.id}\t${ts}\t${model}\t${out}\t0\t0\t0\tmain\t`;
  });
  writeFileSync(h.paths.usageTsv, lines.join('\n') + '\n');
}

function cfg(overrides: Partial<BurnConfig> = {}): BurnConfig {
  return { ...DEFAULT_CONFIG, week_reset: DEFAULT_WEEK, ...overrides };
}

function scan(recordsTotal: number, extra: Partial<ScanInfo> = {}): ScanInfo {
  return {
    files_total: 1,
    files_rescanned: 1,
    records_added: recordsTotal,
    records_total: recordsTotal,
    ...extra,
  };
}

describe('buildSummary — status without a baseline', () => {
  it('reports NO_BASELINE when there is current spend but no trailing weeks', () => {
    const h = newHud();
    seed(h, [{ id: 'a', atMsAgo: HOUR }]);

    const s = buildSummary(h.paths, scan(1), cfg(), NOW);

    expect(s.status).toBe('NO_BASELINE');
    expect(s.baseline.median_units).toBeNull();
    expect(s.projection.confidence).toBe('high');
  });

  it('reports NO_DATA when the scan counted zero records regardless of store contents', () => {
    const h = newHud();
    seed(h, [{ id: 'a', atMsAgo: HOUR }]);

    const s = buildSummary(h.paths, scan(0), cfg(), NOW);

    expect(s.status).toBe('NO_DATA');
  });
});

describe('buildSummary — per-model budget exhaustion', () => {
  it('forces HOT when a model exhausts its family budget even though the pooled ratio is OK', () => {
    const h = newHud();
    // Two trailing complete weeks (~500 units each) establish an OK baseline;
    // a small current week keeps the pooled ratio well under warm.
    seed(h, [
      { id: 'cur', atMsAgo: HOUR, out: 10 },
      { id: 'w1', atMsAgo: 10 * DAY, out: 100 },
      { id: 'w2', atMsAgo: 17 * DAY, out: 100 },
    ]);

    const s = buildSummary(h.paths, scan(3), cfg({ model_budgets: { 'claude-opus-5': 1 } }), NOW);

    expect(s.projection.ratio_vs_baseline).not.toBeNull();
    expect(s.projection.ratio_vs_baseline!).toBeLessThan(1.25); // would be OK on its own
    expect(s.models_exhausted).toContain('claude-opus-5');
    expect(s.status).toBe('HOT');
  });
});

describe('buildSummary — baseline rollup and shape', () => {
  it('rolls trailing complete weeks into a median and per_week_back map', () => {
    const h = newHud();
    seed(h, [
      { id: 'cur', atMsAgo: HOUR, out: 20 },
      { id: 'w1', atMsAgo: 10 * DAY, out: 100 },
      { id: 'w2', atMsAgo: 17 * DAY, out: 100 },
    ]);

    const s = buildSummary(h.paths, scan(3), cfg(), NOW);

    expect(s.baseline.complete_weeks_used).toBe(2);
    expect(s.baseline.median_units).toBe(500); // out=100 → 500 units per week
    expect(Object.keys(s.baseline.per_week_back).sort()).toEqual(['2', '3']);
  });

  it('emits ISO timestamps with a +00:00 suffix and a coherent week/wtd block', () => {
    const h = newHud();
    seed(h, [{ id: 'a', atMsAgo: HOUR, out: 100 }]);

    const s = buildSummary(h.paths, scan(1), cfg(), NOW);

    expect(s.generated_at.endsWith('+00:00')).toBe(true);
    expect(s.generated_at).not.toContain('Z');
    expect(s.week.start.endsWith('+00:00')).toBe(true);
    expect(s.week.tz).toBe('UTC');
    expect(s.wtd.requests).toBe(1);
    expect(s.wtd.units).toBe(500); // single out=100 record
  });

  it('counts recent spend in the session window and reports the window hours', () => {
    const h = newHud();
    seed(h, [{ id: 'a', atMsAgo: HOUR, out: 100 }]);

    const s = buildSummary(h.paths, scan(1), cfg({ session_window_hours: 5 }), NOW);

    expect(s.session.window_hours).toBe(5);
    expect(s.session.requests).toBe(1);
    expect(s.session.units).toBeGreaterThan(0);
  });

  it('excludes spend older than the session window from the session block', () => {
    const h = newHud();
    // One in-window (1h) and one out-of-window (10h) record; window is 5h.
    seed(h, [
      { id: 'recent', atMsAgo: HOUR, out: 100 },
      { id: 'old', atMsAgo: 10 * HOUR, out: 100 },
    ]);

    const s = buildSummary(h.paths, scan(2), cfg({ session_window_hours: 5 }), NOW);

    expect(s.session.requests).toBe(1);
  });
});
