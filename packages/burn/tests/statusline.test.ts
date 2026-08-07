/**
 * Regression suite for the statusline's *presentation*, ported from the Python
 * HUD's `tests/test_statusline.py`.
 *
 * Ordering here is not cosmetic. The projected percentage once occupied the
 * headline slot, so a statusline reading
 *
 *     🔴 277.5M wtd → 381.1M proj · 133% of budget
 *
 * was taken to mean 133% consumed when actual spend was 7%. A forecast that
 * sits where a reader will take it for a measurement is a false reading even
 * when every number in it is correct — so what leads, and how the forecast is
 * labelled, is asserted the same way the scanner's arithmetic is.
 */
import { describe, expect, it } from 'vitest';

import { renderStatusline } from '../src/statusline';
import type { Summary } from '../src/types';

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

function summary(over: Record<string, unknown> = {}): Summary {
  const base = {
    generated_at: '2099-01-01T00:00:00+00:00',
    status: 'EARLY',
    week: { days_left: 6.5, hours_left: 156.0, tz: 'UTC' },
    wtd: { units: 21_400_000 },
    projection: {
      units_at_reset: 249_000_000,
      confidence: 'low',
      ratio_vs_baseline: 1.01,
      method: 'shrunk-to-baseline',
    },
    budget: { set: true, pct_used: 4.0, pct_projected: 46.0 },
    models_exhausted: [],
    session: {},
    calibration: {},
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

/** The fixture's `generated_at` is in 2099, so staleness never fires here. */
function render(over: Record<string, unknown> = {}): string {
  return stripAnsi(
    renderStatusline({ summary: summary(over), config: { stale_after_minutes: 90 } })
  );
}

describe('used leads the projection', () => {
  it('puts actual spend before the forecast', () => {
    // The regression: a reader takes the first percentage as spend.
    const out = render();
    expect(out).toContain('4% used');
    expect(out).toContain('proj');
    expect(out.indexOf('4% used')).toBeLessThan(out.indexOf('46% proj'));
  });

  it('marks the forecast explicitly as a forecast', () => {
    // A bare percentage is indistinguishable from a measurement.
    expect(render()).toMatch(/~\s*46%\s*proj/);
  });

  it('never uses the bare "% of budget" phrasing', () => {
    // '133% of budget' was the exact wording that misled, because it names the
    // budget without saying whether it is spent or predicted.
    expect(render()).not.toMatch(/\d+%\s+of\s+budget/);
  });

  it('shows used and projected as distinct figures', () => {
    const out = render({ budget: { set: true, pct_used: 4.0, pct_projected: 46.0 } });
    expect(out).toContain('4% used');
    expect(out).toContain('46% proj');
  });
});

describe('abstention surfaces', () => {
  it('states ignorance when the cache is missing', () => {
    // No summary must read as unknown, never as a green figure.
    const out = stripAnsi(renderStatusline({ summary: null }));
    expect(out).toContain('no cache');
    expect(out).not.toContain('% used');
  });

  it('shouts an UNDERCOUNT status', () => {
    // A rebuilt-but-incomplete store must not present a confident number.
    expect(render({ status: 'UNDERCOUNT' })).toContain('UNDERCOUNT');
  });

  it('surfaces an exhausted model family', () => {
    const out = render({ models_exhausted: ['claude-fable-5'] });
    expect(out).toContain('fable-5');
    expect(out).toContain('spent');
  });

  it('surfaces an expired calibration', () => {
    expect(render({ calibration: { expired: true } })).toContain('recalibrate');
  });

  it('labels the baseline ratio as a projection when no budget is set', () => {
    // Without a budget the only figure is baseline-relative — and it is still a
    // forecast, so it must say so rather than imply consumption.
    const out = render({ budget: { set: false } });
    expect(out).toContain('4wk median');
    expect(out).toContain('proj');
  });

  it('announces a stale cache rather than swallowing it', () => {
    // Silently-degraded tooling is a headline, not a footnote.
    const out = stripAnsi(
      renderStatusline({
        summary: summary({ generated_at: '2026-01-01T00:00:00+00:00' }),
        config: { stale_after_minutes: 90 },
        now: new Date('2026-01-01T04:00:00Z'),
      })
    );
    expect(out).toMatch(/\[stale 240m\]/);
  });
});

describe('segments', () => {
  it('counts down in hours once inside two days', () => {
    // "2d" reads as plenty of runway when it is really one working afternoon.
    expect(render({ week: { days_left: 1.5, hours_left: 36.0 } })).toContain('36h to reset');
    expect(render({ week: { days_left: 6.5, hours_left: 156.0 } })).toContain('7d to reset');
  });

  it('renders the merged-branch /clear nudge', () => {
    const out = stripAnsi(
      renderStatusline({
        summary: summary(),
        git: { kind: 'merged', label: 'feat/x' },
      })
    );
    expect(out).toContain('feat/x merged → /clear');
  });

  it('shows the session window only once it is worth knowing about', () => {
    expect(render({ session: { pct_used: 40 } })).not.toContain('session');
    expect(render({ session: { pct_used: 82 } })).toContain('session ~82%');
  });

  it('truncates units rather than rounding up', () => {
    // Showing 250.0M when 249.96M was measured reads as crossing a threshold
    // that was not crossed.
    expect(render({ wtd: { units: 249_960_000 } })).toContain('249.9M');
  });
});
