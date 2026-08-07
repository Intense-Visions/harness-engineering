/**
 * Hook behaviour: what gets said, to whom, and how often.
 *
 * The Stop hook fires after EVERY assistant turn, so the bar for speaking is
 * high. A warning repeated every turn becomes wallpaper, and wallpaper is how a
 * real limit gets hit anyway — so the ladder and the cooldown are asserted, not
 * just the wording.
 */
import { describe, expect, it } from 'vitest';

import { escalation, sessionBrief, type NotifyState } from '../src/hooks';
import type { Summary } from '../src/types';

function summary(over: Record<string, unknown> = {}): Summary {
  const base = {
    generated_at: '2026-08-06T12:00:00+00:00',
    scan: { files_total: 1, files_rescanned: 0, records_added: 0, records_total: 10 },
    status: 'OK',
    week: { days_left: 3.2, hours_left: 76.8, tz: 'America/Chicago' },
    wtd: { units: 12_400_000, requests: 400, output_tokens: 100_000 },
    baseline: { median_units: 200_000_000 },
    projection: { units_at_reset: 180_000_000, confidence: 'high', ratio_vs_baseline: 0.9 },
    budget: { set: false },
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

/** The fixture's `generated_at`, so staleness only fires when a test asks for it. */
const FRESH = new Date('2026-08-06T12:00:00Z');

describe('session brief', () => {
  it('states ignorance loudly when there is no cache', () => {
    // A cache that cannot be read is a finding, not an all-clear.
    const out = sessionBrief(null, null);
    expect(out.systemMessage).toContain('blind, not clear');
    expect(out.hookSpecificOutput.additionalContext).toContain('UNKNOWN');
  });

  it('always briefs the model but stays silent to the user when on pace', () => {
    const out = sessionBrief(summary(), null, FRESH);
    expect(out.hookSpecificOutput.additionalContext).toContain('status=OK');
    expect(out.systemMessage).toBeUndefined();
  });

  it('tells the model never to invent a percentage with no budget set', () => {
    expect(sessionBrief(summary(), null, FRESH).hookSpecificOutput.additionalContext).toContain(
      'Never invent one'
    );
  });

  it('interrupts the user once the pace is elevated', () => {
    const out = sessionBrief(summary({ status: 'HOT' }), null, FRESH);
    expect(out.systemMessage).toContain('Burn HOT');
  });

  it('surfaces a merged branch as the /clear signal in both channels', () => {
    const out = sessionBrief(summary(), 'feat/x', FRESH);
    expect(out.hookSpecificOutput.additionalContext).toContain('ALREADY MERGED');
    expect(out.systemMessage).toContain('/clear');
  });

  it('reports a stale cache rather than swallowing it', () => {
    const out = sessionBrief(summary(), null, new Date('2026-08-06T15:00:00Z'));
    expect(out.systemMessage).toContain('180m stale');
  });
});

describe('escalation ladder', () => {
  const hot = summary({ status: 'HOT' });
  const now = new Date('2026-08-06T12:00:00Z');

  it('says nothing below WARM, and resets the ladder', () => {
    const out = escalation(summary({ status: 'OK' }), { level: 2, status: 'HOT', ts: '' }, now);
    expect(out.message).toBeNull();
    // Reset so a later re-entry into WARM notifies again.
    expect(out.nextNotify?.level).toBe(0);
  });

  it('speaks when the level rises', () => {
    const prev: NotifyState = { level: 1, status: 'WARM', ts: now.toISOString() };
    expect(escalation(hot, prev, now).message).toContain('Burn HOT');
  });

  it('stays quiet at the same level inside the cooldown', () => {
    const prev: NotifyState = { level: 2, status: 'HOT', ts: now.toISOString() };
    const out = escalation(hot, prev, new Date(now.getTime() + 10 * 60_000));
    expect(out.message).toBeNull();
    // And leaves the ladder untouched, so the cooldown keeps running.
    expect(out.nextNotify).toBeNull();
  });

  it('speaks again once the cooldown has passed', () => {
    const prev: NotifyState = { level: 2, status: 'HOT', ts: now.toISOString() };
    const out = escalation(hot, prev, new Date(now.getTime() + 46 * 60_000));
    expect(out.message).toContain('Burn HOT');
  });

  it('leads with spend, not the forecast, when a budget is set', () => {
    // "5.8M used ... 108% of your weekly budget" read as self-contradictory and
    // taught the reader to discount the alarm.
    const s = summary({
      status: 'CRITICAL',
      budget: { set: true, pct_used: 104, pct_projected: 130 },
    });
    const msg = escalation(s, null, now).message!;
    expect(msg.indexOf('104% of your weekly budget')).toBeLessThan(msg.indexOf('130%'));
    expect(msg).toContain('on current pace');
  });

  it('marks a weakly-supported forecast as one', () => {
    const s = summary({ status: 'WARM', projection: { confidence: 'low' } });
    expect(escalation(s, null, now).message).toContain('weakly supported');
  });

  it('names an exhausted model family and an expired calibration', () => {
    const s = summary({
      status: 'HOT',
      models_exhausted: ['claude-fable-5'],
      calibration: { expired: true, valid_until: '2026-08-01' },
    });
    const msg = escalation(s, null, now).message!;
    expect(msg).toContain('claude-fable-5 is at 100%');
    expect(msg).toContain('may under-warn');
  });

  it('reports the run-dry time in the account reset timezone, not UTC', () => {
    // /usage speaks that timezone; a UTC time would not line up with what the
    // user reads there.
    const s = summary({
      status: 'CRITICAL',
      budget: {
        set: true,
        pct_used: 101,
        pct_projected: 140,
        exhausts_before_reset: true,
        exhausts_at: '2026-08-07T18:30:00+00:00',
      },
    });
    // 18:30 UTC is 13:30 in America/Chicago (CDT).
    expect(escalation(s, null, now).message).toContain('13:30');
  });
});
