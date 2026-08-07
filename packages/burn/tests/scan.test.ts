/**
 * Regression suite for the burn scanner, ported 1:1 from the Python HUD's
 * `tests/test_scan.py`.
 *
 * Every test here corresponds to a defect that ACTUALLY SHIPPED and that a
 * human caught before the tool did. They are regression tests in the strict
 * sense, not coverage decoration:
 *
 *   week anchor    the Monday-UTC assumption that understated a 97% week by
 *                  ~81x and displayed a calm green
 *   data loss      the write race that silently dropped 85% of the record store
 *                  while reporting OK at 3% of budget
 *   dedupe         transcripts repeat each usage block ~3x; naive counting
 *                  inflates totals ~3.5x
 *   abstention     a zero or short denominator must never read as a pass
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';
import { refresh } from '../src/refresh';
import { withScanLock } from '../src/store';
import { units } from '../src/units';
import { weekBounds } from '../src/window';
import {
  DEFAULT_WEEK,
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

describe('dedupe', () => {
  it('collapses repeated usage blocks within a transcript', () => {
    // Transcripts repeat the same usage block ~3x per request. Counting rows
    // instead of requestIds inflates every figure ~3.5x.
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    const line = transcriptLine('req_A', hoursAgo(now, 1), { out: 1000 });
    h.writeTranscript('a.jsonl', [line, line, line]);

    const s = refresh(h.paths);
    expect(s.scan.records_total).toBe(1);
    expect(s.wtd.output_tokens).toBe(1000);
  });

  it('collapses the same requestId across two transcripts', () => {
    const h = newHud();
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    const line = transcriptLine('req_dup', hoursAgo(now, 1), { out: 500 });
    h.writeTranscript('a.jsonl', [line]);
    h.writeTranscript('b.jsonl', [line]);

    expect(refresh(h.paths).scan.records_total).toBe(1);
  });
});

describe('week anchor', () => {
  // The 81x regression. weekBounds is pure, so assert it exactly.
  it('anchors a Wednesday 08:59 America/Chicago window', () => {
    const cfg = { week_reset: { weekday: 2, time: '08:59', tz: 'America/Chicago' } };
    const now = new Date('2026-08-04T18:00:00Z'); // a Tuesday
    const { start, end } = weekBounds(now, cfg);
    expect(start.toISOString()).toBe('2026-07-29T13:59:00.000Z');
    expect(end.toISOString()).toBe('2026-08-05T13:59:00.000Z');
  });

  it('documents how far the Monday-UTC assumption missed', () => {
    // The same instant bucketed under a Monday-UTC week starts 4.5 days later,
    // so days of spend fall outside "week to date" and the HUD under-reports.
    const now = new Date('2026-08-04T18:00:00Z');
    const wed = weekBounds(now, {
      week_reset: { weekday: 2, time: '08:59', tz: 'America/Chicago' },
    }).start;
    const mon = weekBounds(now, { week_reset: DEFAULT_WEEK }).start;
    expect((mon.getTime() - wed.getTime()) / 1000).toBeGreaterThan(4 * 86_400);
  });

  it('places the reset instant itself in the new week', () => {
    const cfg = { week_reset: { weekday: 2, time: '08:59', tz: 'America/Chicago' } };
    const at = new Date('2026-08-05T13:59:00Z');
    expect(weekBounds(at, cfg).start.getTime()).toBe(at.getTime());
  });

  it('honours the legacy flat weekday key', () => {
    // An old config must not silently revert to Monday-UTC — that is how the
    // 81x understatement would come back.
    const h = newHud();
    h.writeConfig({ week_reset_weekday: 2 });
    expect(loadConfig(h.paths).week_reset.weekday).toBe(2);
  });

  it('survives a DST boundary without moving the weekday', () => {
    // Not in the Python suite: the port swapped zoneinfo for Intl, so the
    // two-pass offset resolution needs its own guard. US DST ended
    // 2026-11-01; the Wednesday reset either side must stay 08:59 local.
    const cfg = { week_reset: { weekday: 2, time: '08:59', tz: 'America/Chicago' } };
    const before = weekBounds(new Date('2026-10-30T12:00:00Z'), cfg).start;
    const after = weekBounds(new Date('2026-11-06T12:00:00Z'), cfg).start;
    // Compare parts rather than a formatted string: the separators between
    // weekday and time are locale data, and asserting them makes the test fail
    // on an ICU update rather than on a real regression.
    const localParts = (d: Date): Record<string, string> =>
      Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Chicago',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(d)
          .map((p) => [p.type, p.value])
      );
    for (const d of [before, after]) {
      expect(localParts(d).weekday).toBe('Wed');
      expect(`${localParts(d).hour}:${localParts(d).minute}`).toBe('08:59');
    }
    // ...and the offset really did change across the boundary.
    expect(before.toISOString().slice(11, 16)).toBe('13:59');
    expect(after.toISOString().slice(11, 16)).toBe('14:59');
  });
});

describe('abstention', () => {
  // A zero or short denominator is an abstention, never a pass.
  it('reports NO_DATA rather than OK when there are no records', () => {
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    expect(refresh(h.paths).status).toBe('NO_DATA');
  });

  it('downgrades a would-be OK to EARLY on a thin sample', () => {
    // Early in the week a full-week forecast is noise, so a reassuring verdict
    // is withheld. Needs prior weeks present, since without a baseline the
    // status is the (also correct) NO_BASELINE abstention instead.
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: { weekday: utcIsoWeekday(now), time: '00:00', tz: 'UTC' },
    });
    const lines = [transcriptLine('cur1', minutesAgo(now, 5), { out: 10 })];
    for (let wk = 1; wk <= 3; wk += 1) {
      for (let i = 0; i < 5; i += 1) {
        lines.push(
          transcriptLine(`w${wk}n${i}`, hoursAgo(daysAgo(now, 7 * wk), 3 + i), { out: 200 })
        );
      }
    }
    h.writeTranscript('a.jsonl', lines);

    const s = refresh(h.paths);
    expect(s.projection.confidence).toBe('low');
    expect(s.baseline.median_units).not.toBeNull();
    expect(s.status).toBe('EARLY');
  });

  it('does not crash on a huge budget against a low burn rate', () => {
    // Regression: a low rate against a large budget produced a multi-million-day
    // runway, overflowed Python's timedelta, and killed the scan outright —
    // leaving no summary and a blank HUD.
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: { weekday: (utcIsoWeekday(now) + 1) % 7, time: '00:00', tz: 'UTC' },
      weekly_budget_units: 10 ** 15,
    });
    h.writeTranscript('a.jsonl', [transcriptLine('r1', hoursAgo(now, 2), { out: 1 })]);

    const s = refresh(h.paths);
    expect(s.budget.exhausts_before_reset).toBeFalsy();
    expect(s.budget.runway_days).toBeDefined();
  });

  it('does not suppress an elevated status on a thin sample', () => {
    // Incurred spend is real whatever the forecast confidence. Only a
    // reassuring verdict is held back — the asymmetry is deliberate.
    const h = newHud();
    const now = new Date();
    h.writeConfig({
      week_reset: { weekday: utcIsoWeekday(now), time: '00:00', tz: 'UTC' },
      weekly_budget_units: 1000,
    });
    h.writeTranscript('a.jsonl', [transcriptLine('r1', minutesAgo(now, 5), { out: 100_000 })]);

    const s = refresh(h.paths);
    expect(s.projection.confidence).toBe('low');
    expect(s.status).toBe('CRITICAL');
  });

  it('falls back to defaults on a corrupt config instead of failing', () => {
    const h = newHud();
    writeFileSync(h.paths.config, 'NOT JSON {{{');
    const now = new Date();
    h.writeTranscript('a.jsonl', [transcriptLine('r1', hoursAgo(now, 1))]);
    expect(refresh(h.paths).status).toBeDefined();
  });

  it('weights cache reads far below output tokens', () => {
    // Raw token counts are a misleading headline: cache reads dominate volume
    // but are nearly free.
    expect(units(1000, 0, 0, 0)).toBeGreaterThan(units(0, 0, 0, 1000));
  });
});

describe('data loss', () => {
  // The 85% silent loss. Fingerprints must not outlive their records.
  function seed(h: Hud, n = 40): number {
    const now = new Date();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript(
      'a.jsonl',
      Array.from({ length: n }, (_, i) => transcriptLine(`r${i}`, hoursAgo(now, 1), { out: 100 }))
    );
    refresh(h.paths);
    return n;
  }

  it('writes the count header alongside the fingerprints', () => {
    const h = newHud();
    const n = seed(h);
    expect(readFileSync(h.paths.filesTsv, 'utf8').split('\n')[0]).toBe(`#count\t${n}`);
  });

  it('self-heals a truncated store whose fingerprints survived', () => {
    // The exact production failure: the store loses rows, the fingerprints
    // survive claiming everything was scanned, so nothing is ever re-read.
    const h = newHud();
    const n = seed(h);
    const rows = readFileSync(h.paths.usageTsv, 'utf8').split('\n').filter(Boolean);
    writeFileSync(h.paths.usageTsv, rows.slice(0, 5).join('\n') + '\n'); // lose 35 of 40

    const s = refresh(h.paths);
    expect(s.scan.data_loss_detected).toBe(true);
    expect(s.scan.records_total).toBe(n); // fully rebuilt
    expect(s.scan.unrecovered).toBe(0);
    expect(s.status).not.toBe('UNDERCOUNT');
  });

  it('reports UNDERCOUNT when the loss cannot be recovered', () => {
    // When the source transcripts are gone the rows cannot come back, so the
    // figures are a floor and must be labelled as such.
    const h = newHud();
    seed(h);
    const lines = readFileSync(h.paths.filesTsv, 'utf8').split('\n').filter(Boolean);
    lines[0] = '#count\t9999'; // claim far more were scanned
    writeFileSync(h.paths.filesTsv, lines.join('\n') + '\n');

    const s = refresh(h.paths);
    expect(s.scan.data_loss_detected).toBe(true);
    expect(s.scan.unrecovered ?? 0).toBeGreaterThan(0);
    expect(s.status).toBe('UNDERCOUNT');
  });

  it('rebuilds cleanly when the fingerprints are missing entirely', () => {
    const h = newHud();
    const n = seed(h);
    rmSync(h.paths.filesTsv);
    expect(refresh(h.paths).scan.records_total).toBe(n);
  });

  it('leaves no .tmp files behind', () => {
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    h.writeTranscript('a.jsonl', [transcriptLine('r1', new Date())]);
    refresh(h.paths);
    expect(readdirSync(h.paths.state).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('releases the scan lock when the body throws', () => {
    // Not in the Python suite, and required by the port: flock was released by
    // the kernel when the holder died, but this port holds a mkdir lock that
    // only its own `finally` clears. A leaked lock wedges every later scan
    // until the staleness window expires.
    const h = newHud();
    expect(() =>
      withScanLock(h.paths, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(existsSync(h.paths.lock)).toBe(false);
  });

  it('reclaims a lock whose owner process is gone', () => {
    // The other half of losing flock's kernel cleanup: a lock left behind by a
    // crashed scan must not lock the HUD out permanently.
    const h = newHud();
    mkdirSync(h.paths.lock, { recursive: true });
    writeFileSync(
      path.join(h.paths.lock, 'owner.json'),
      // A pid that cannot be running, with a fresh timestamp so only the
      // liveness check (not the age check) can break the lock.
      JSON.stringify({ pid: 0x7ffffff0, at: Date.now() })
    );

    let acquired = false;
    withScanLock(h.paths, (got) => {
      acquired = got;
    });
    expect(acquired).toBe(true);
  });
});
