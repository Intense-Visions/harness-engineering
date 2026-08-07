/**
 * Budget, per-model-limit and forecast-escalation regressions, ported from the
 * Python HUD's `TestBudgetsAndModels`.
 *
 * The through-line: incurred spend is a fact and always escalates; a projection
 * is evidence whose weight grows with the week. Collapsing that distinction is
 * what made a 3-hour extrapolation shout CRITICAL, and an alarm that cries wolf
 * at 2% spent is an alarm nobody reads at 98%.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { refresh } from '../src/refresh';
import {
  daysAgo,
  hoursAgo,
  makeHud,
  minutesAgo,
  transcriptLine,
  utcIsoWeekday,
  type Hud,
} from './helpers';

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

/** A week that began ~6 days ago, i.e. late enough for a confident forecast. */
function lateWeekConfig(now: Date, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    week_reset: { weekday: (utcIsoWeekday(now) + 1) % 7, time: '00:00', tz: 'UTC' },
    ...extra,
  };
}

/**
 * A reset placed so that `now` sits exactly `days` into the current week.
 *
 * Deflake: this previously forced `time: '00:00'`, dropping `start`'s time-of-day.
 * That made the real days-into-week depend on `now`'s wall-clock time (and which
 * side of midnight `now - days` fell on), so the early-week tests intermittently
 * saw `frac >= 0.15` → 'medium' confidence instead of 'low' (summary.ts:162).
 * Preserving `start`'s HH:MM makes days-into-week == `days` for ANY `now`.
 */
function weekStartingDaysAgo(now: Date, days: number): Record<string, unknown> {
  const start = daysAgo(now, days);
  const hh = String(start.getUTCHours()).padStart(2, '0');
  const mm = String(start.getUTCMinutes()).padStart(2, '0');
  return { weekday: utcIsoWeekday(start), time: `${hh}:${mm}`, tz: 'UTC' };
}

/** `currentLines` plus enough prior-week volume to form a baseline. */
function withBaseline(now: Date, currentLines: string[], weeks = 3, perWeekOut = 4000): string[] {
  const lines = [...currentLines];
  for (let wk = 1; wk <= weeks; wk += 1) {
    for (let i = 0; i < 6; i += 1) {
      lines.push(
        transcriptLine(`w${wk}n${i}`, hoursAgo(daysAgo(now, 7 * wk), 2 + i), {
          out: Math.floor(perWeekOut / 6),
        })
      );
    }
  }
  return lines;
}

it('escalates when a per-model budget is exhausted', () => {
  // A family limit can be spent while the pooled bar looks survivable — Fable
  // hit 100% at 29% of the pooled week.
  const h = newHud();
  const now = new Date();
  h.writeConfig(
    lateWeekConfig(now, {
      weekly_budget_units: 10 ** 12,
      model_budgets: { 'claude-fable-5': 100 },
    })
  );
  h.writeTranscript('a.jsonl', [
    transcriptLine('r1', hoursAgo(now, 2), { model: 'claude-fable-5', out: 1000 }),
  ]);

  const s = refresh(h.paths);
  expect(s.models_exhausted).toContain('claude-fable-5');
  expect(['HOT', 'CRITICAL']).toContain(s.status);
});

describe('calibration validity', () => {
  it('flags a calibration that has expired', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig(
      lateWeekConfig(now, {
        weekly_budget_units: 10 ** 6,
        calibration: { reported_pct: 97, valid_until: '2000-01-01' },
      })
    );
    h.writeTranscript('a.jsonl', [transcriptLine('r1', hoursAgo(now, 2))]);
    expect(refresh(h.paths).calibration.expired).toBe(true);
  });

  it('reports days remaining on a live calibration', () => {
    const h = newHud();
    const now = new Date();
    const future = new Date(now.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
    h.writeConfig(
      lateWeekConfig(now, {
        weekly_budget_units: 10 ** 6,
        calibration: { reported_pct: 50, valid_until: future },
      })
    );
    h.writeTranscript('a.jsonl', [transcriptLine('r1', hoursAgo(now, 2))]);

    const cal = refresh(h.paths).calibration;
    expect(cal.expired).toBe(false);
    expect(cal.days_left ?? 0).toBeGreaterThan(0);
  });
});

describe('forecast escalation', () => {
  it('does not escalate on early-week noise', () => {
    // Regression: 2% of budget spent in the first hours extrapolated to 118%
    // and fired CRITICAL. A forecast resting on 2% of a week must not raise the
    // alarm at all — noise is what stops alarms being read.
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: weekStartingDaysAgo(now, 0.15),
      weekly_budget_units: 10 ** 7,
    });
    h.writeTranscript(
      'a.jsonl',
      withBaseline(now, [transcriptLine('cur', minutesAgo(now, 30), { out: 400 })])
    );

    const s = refresh(h.paths);
    expect(s.projection.confidence).toBe('low');
    expect(s.budget.pct_used!).toBeLessThan(20);
    expect(['HOT', 'CRITICAL']).not.toContain(s.status);
    expect(s.budget.exhausts_before_reset).toBeFalsy();
    expect(s.budget.exhaust_estimate_withheld).toBeDefined();
  });

  it('still escalates on real overspend early in the week', () => {
    // The other side of the same coin: incurred spend is a fact, so it
    // escalates whatever the forecast confidence. Muting noise must not mute an
    // actual blowout.
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: weekStartingDaysAgo(now, 0.15),
      weekly_budget_units: 10 ** 6,
    });
    h.writeTranscript(
      'a.jsonl',
      withBaseline(now, [transcriptLine('cur', minutesAgo(now, 30), { out: 10 ** 6 })])
    );

    const s = refresh(h.paths);
    expect(s.projection.confidence).toBe('low');
    expect(s.budget.pct_used!).toBeGreaterThanOrEqual(100);
    expect(s.status).toBe('CRITICAL');
  });

  it('allows a late-week projection full severity', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: weekStartingDaysAgo(now, 6.0),
      weekly_budget_units: 10 ** 6,
    });
    const lines = Array.from({ length: 5 }, (_, i) =>
      transcriptLine(`c${i}`, hoursAgo(now, i + 1), { out: 40_000 })
    );
    h.writeTranscript('a.jsonl', withBaseline(now, lines));

    const s = refresh(h.paths);
    expect(s.projection.confidence).toBe('high');
    expect(['WARM', 'HOT', 'CRITICAL']).toContain(s.status);
  });

  it('shrinks the early forecast toward the baseline, keeping both visible', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: weekStartingDaysAgo(now, 0.15),
      weekly_budget_units: 10 ** 7,
    });
    h.writeTranscript(
      'a.jsonl',
      withBaseline(now, [transcriptLine('cur', minutesAgo(now, 30), { out: 400 })])
    );

    const s = refresh(h.paths);
    const p = s.projection;
    const base = s.baseline.median_units!;
    expect(p.method).toBe('shrunk-to-baseline');
    // Shrinkage pulls TOWARD the baseline, which may be up or down — the
    // property is proximity to a normal week, not a smaller number.
    expect(Math.abs(p.units_at_reset - base)).toBeLessThan(
      Math.abs(p.units_at_reset_linear - base)
    );
    // And it must land between the two, never outside them.
    const [lo, hi] = [p.units_at_reset_linear, base].sort((a, b) => a - b) as [number, number];
    expect(p.units_at_reset).toBeGreaterThanOrEqual(lo);
    expect(p.units_at_reset).toBeLessThanOrEqual(hi);
  });

  it('falls back to a linear forecast with no baseline, still without escalating', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: weekStartingDaysAgo(now, 0.15),
      weekly_budget_units: 10 ** 7,
    });
    h.writeTranscript('a.jsonl', [transcriptLine('cur', minutesAgo(now, 30), { out: 400 })]);

    const s = refresh(h.paths);
    expect(s.projection.method).toBe('linear');
    expect(['HOT', 'CRITICAL']).not.toContain(s.status);
  });
});
