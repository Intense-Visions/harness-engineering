import type { Summary } from '@harness-engineering/burn';
import { describe, expect, it } from 'vitest';

import { bar, localTime, pad } from './format';
import { renderReport } from './report';
import { parseWeekday } from './reset-day';

function summary(over: Record<string, unknown> = {}): Summary {
  const base = {
    generated_at: '2026-08-06T20:00:00+00:00',
    scan: { files_total: 588, files_rescanned: 0, records_added: 0, records_total: 33_359 },
    status: 'OK',
    week: {
      start: '2026-08-05T14:00:00+00:00',
      reset_at: '2026-08-12T14:00:00+00:00',
      reset_spec: '2@09:00 America/Chicago',
      tz: 'America/Chicago',
      elapsed_frac: 0.18,
      days_left: 5.7,
      hours_left: 138,
    },
    wtd: { requests: 3713, output_tokens: 2_400_000, units: 114_400_000 },
    baseline: {
      complete_weeks_used: 4,
      median_units: 233_400_000,
      max_units: 300_000_000,
      per_week_back: {},
    },
    projection: {
      units_at_reset: 305_800_000,
      units_at_reset_linear: 635_900_000,
      method: 'shrunk-to-baseline',
      ratio_vs_baseline: 1.31,
      confidence: 'medium',
    },
    budget: { set: false },
    calibration: {},
    models: {},
    models_exhausted: [],
    session: { window_hours: 5, requests: 100, units: 20_100_000 },
  } as unknown as Record<string, unknown>;

  for (const [k, v] of Object.entries(over)) {
    const existing = base[k];
    base[k] =
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
        ? { ...(existing as object), ...(v as object) }
        : v;
  }
  return base as unknown as Summary;
}

function render(over: Record<string, unknown> = {}): string {
  return renderReport(summary(over)).join('\n');
}

describe('report — what it must always say', () => {
  it('never omits what the numbers are and are not', () => {
    // The footer is the standing disclaimer: a local proxy, this machine only,
    // /usage is the authority. A healthy-looking report is exactly when a
    // reader is most likely to mistake it for the real quota.
    const out = render();
    expect(out).toContain('THIS MACHINE ONLY');
    expect(out).toContain('For actual limit status run /usage');
    expect(out).toContain('weighted proxy');
  });

  it('reports spend before the forecast', () => {
    const out = render();
    expect(out.indexOf('week to date')).toBeLessThan(out.indexOf('projected at reset'));
  });

  it('shows the raw extrapolation alongside a shrunk forecast', () => {
    // Quietly adjusting a number the user reads daily is its own kind of
    // untrustworthiness, even when the adjustment is the sound one.
    const out = render();
    expect(out).toContain('blended toward your baseline');
    expect(out).toContain('635.9M'); // the un-shrunk figure stays visible
  });

  it('hides the blending note once the forecast is well supported', () => {
    expect(render({ projection: { confidence: 'high' } })).not.toContain('blended toward');
  });

  it('states the status blurb, not just the label', () => {
    expect(render({ status: 'NO_DATA' })).toContain('the HUD is blind, not clear');
    expect(render({ status: 'UNDERCOUNT' })).toContain('FLOOR, not a total');
  });

  it('falls back to a readable line for a status it does not know', () => {
    expect(render({ status: 'FUTURE_STATUS' })).toContain('FUTURE_STATUS');
  });
});

describe('report — budget section', () => {
  it('offers to set a budget when none is configured', () => {
    const out = render();
    expect(out).toContain('No weekly budget set');
    expect(out).toContain('harness burn budget 1.2x');
  });

  it('shows used and projected bars once a budget exists', () => {
    const out = render({
      budget: {
        set: true,
        units: 535_000_000,
        pct_used: 21,
        pct_projected: 57,
        remaining_units: 420_600_000,
      },
    });
    expect(out).toContain('used');
    expect(out).toContain('21%');
    expect(out).toContain('57%');
    expect(out).toContain('remaining');
  });

  it('warns, in the reset timezone, when the budget runs dry first', () => {
    const out = render({
      budget: {
        set: true,
        units: 100,
        pct_used: 90,
        pct_projected: 140,
        exhausts_before_reset: true,
        exhausts_at: '2026-08-11T11:20:00+00:00',
      },
    });
    expect(out).toContain('you run dry');
    // 11:20 UTC is 06:20 in America/Chicago (CDT), which is what /usage shows.
    expect(out).toContain('06:20');
  });
});

describe('report — per-model and degraded states', () => {
  it('flags a family limit that is spent even when the pooled bar looks fine', () => {
    // Fable ran out at 29% of the pooled week; this is not decoration.
    const out = render({
      models: {
        'claude-fable-5': {
          requests: 10,
          units: 5_000_000,
          pct_of_week: 29,
          budget_units: 5_000_000,
          pct_of_budget: 100,
        },
      },
      models_exhausted: ['claude-fable-5'],
    });
    expect(out).toContain('fable-5');
    expect(out).toContain('100% of its own limit');
    expect(out).toContain('is spent');
  });

  it('omits models below the noise floor', () => {
    const out = render({
      models: { 'claude-tiny': { requests: 1, units: 12, pct_of_week: 0 } },
    });
    expect(out).not.toContain('tiny');
  });

  it('shouts unrecoverable record loss rather than printing a confident total', () => {
    const out = render({
      status: 'UNDERCOUNT',
      scan: {
        data_loss_detected: true,
        records_lost: 9999,
        records_recovered: 40,
        unrecovered: 9959,
      },
    });
    expect(out).toContain('UNRECOVERABLE');
    expect(out).toContain('treat the figures above as a floor');
  });

  it('reports a recovered loss without calling the figures a floor', () => {
    const out = render({
      scan: { data_loss_detected: true, records_lost: 35, records_recovered: 35, unrecovered: 0 },
    });
    expect(out).toContain('recovered');
    expect(out).not.toContain('UNRECOVERABLE');
  });

  it('surfaces an expired calibration as a warning to re-run', () => {
    const out = render({ calibration: { expired: true, valid_until: '2026-08-01' } });
    expect(out).toContain('Calibration expired');
    expect(out).toContain('may under-warn');
  });

  it('reports remaining validity on a live calibration', () => {
    const out = render({
      calibration: {
        at: '2026-08-05T00:00:00+00:00',
        reported_pct: 4,
        days_left: 2,
        valid_until: '2026-08-08',
      },
    });
    expect(out).toContain('valid 2d more');
  });

  it('shows the session window only when a budget makes it meaningful', () => {
    expect(render()).not.toContain('session (5h)');
    expect(render({ session: { pct_used: 29 } })).toContain('session (5h)');
  });
});

describe('format helpers', () => {
  it('renders a bar that goes over-full rather than clamping silently', () => {
    // Clamping at 100% would hide exactly the case worth seeing.
    expect(bar(0.5, 10)).toContain('█');
    expect(bar(0.5, 10)).toContain('░');
    expect(bar(1.4, 10)).not.toContain('░');
  });

  it('renders a timestamp in the requested zone and survives a bad one', () => {
    expect(localTime('2026-08-11T11:20:00+00:00', 'America/Chicago')).toContain('06:20');
    expect(localTime('not-a-date', 'UTC')).toBe('not-a-date');
    expect(localTime('2026-08-11T11:20:00+00:00', 'Nowhere/Special')).toContain('2026');
  });

  it('pads labels to a stable column', () => {
    expect(pad('x')).toHaveLength(18);
    expect(pad('a-very-long-label-indeed')).toBe('a-very-long-label-indeed');
  });
});

describe('weekday parsing', () => {
  it('accepts names, prefixes and numbers', () => {
    expect(parseWeekday('mon')).toBe(0);
    expect(parseWeekday('Wednesday')).toBe(2);
    expect(parseWeekday('SUN')).toBe(6);
    expect(parseWeekday('2')).toBe(2);
  });

  it('normalises out-of-range numbers and rejects nonsense', () => {
    expect(parseWeekday('9')).toBe(2);
    expect(parseWeekday('-1')).toBe(6);
    expect(parseWeekday('someday')).toBeNull();
  });
});
