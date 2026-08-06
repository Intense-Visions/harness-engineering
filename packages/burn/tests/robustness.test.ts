/**
 * Malformed-input behaviour.
 *
 * The HUD's whole premise is that a green readout must never be reachable by a
 * path that did not actually measure anything. Every case here feeds it
 * something broken — a half-written store, a config with the wrong types, a
 * summary from another version — and asserts it degrades to stated ignorance
 * rather than to a confident number.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readSummary } from '../src/read-summary';
import { refresh } from '../src/refresh';
import { parseTranscript } from '../src/scan';
import { renderStatusline, type GitSegment } from '../src/statusline';
import { readFingerprints, readRecords } from '../src/store';
import type { Summary, UsageRecord } from '../src/types';
import { weekBounds } from '../src/window';
import { DEFAULT_WEEK, makeHud, transcriptLine, type Hud } from './helpers';

const ANSI = /\u001b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}

/** The smallest summary the statusline should still be able to render. */
function minimalSummary(over: Record<string, unknown> = {}): Summary {
  return {
    status: 'OK',
    generated_at: new Date().toISOString(),
    week: { hours_left: 72, days_left: 3 },
    wtd: { units: 1000 },
    projection: { units_at_reset: 2000, confidence: 'high', ratio_vs_baseline: 1 },
    budget: { set: false },
    ...over,
  } as unknown as Summary;
}

let hud: Hud | null = null;

function newHud(): Hud {
  hud = makeHud();
  return hud;
}

afterEach(() => {
  hud?.cleanup();
  hud = null;
});

describe('store', () => {
  it('discards malformed rows instead of importing partial records', () => {
    // A partial row is exactly what a torn write leaves behind; importing it
    // would put a bogus record into the totals.
    const h = newHud();
    writeFileSync(
      h.paths.usageTsv,
      ['good\t2026-08-06T00:00:00Z\tclaude-opus-5\t1\t2\t3\t4', 'short\trow', '', 'a\tb'].join('\n')
    );
    expect([...readRecords(h.paths).keys()]).toEqual(['good']);
  });

  it('ignores a fingerprint header that is not a number', () => {
    const h = newHud();
    writeFileSync(h.paths.filesTsv, ['#count\tnonsense', '/a.jsonl\t123\t456'].join('\n'));
    const { fingerprints, expected } = readFingerprints(h.paths);
    expect(expected).toBeNull();
    expect(fingerprints.size).toBe(1);
  });

  it('returns empty structures when nothing has been written yet', () => {
    const h = newHud();
    expect(readRecords(h.paths).size).toBe(0);
    expect(readFingerprints(h.paths).expected).toBeNull();
  });
});

describe('transcript parsing', () => {
  it('skips unparseable lines, lines without usage, and missing files', () => {
    const h = newHud();
    const file = path.join(h.paths.projects, '-proj', 'mixed.jsonl');
    writeFileSync(
      file,
      [
        '{ this is not json but mentions "usage"',
        JSON.stringify({ type: 'user', message: { content: 'hi' } }),
        JSON.stringify({ requestId: 'no-usage-block', message: { model: 'x' } }),
        JSON.stringify({ timestamp: 'x', message: { usage: { output_tokens: 5 } } }), // no id
        transcriptLine('good', new Date()),
      ].join('\n')
    );

    const records = new Map<string, UsageRecord>();
    expect(parseTranscript(file, records)).toBe(1);
    expect([...records.keys()]).toEqual(['good']);
    expect(parseTranscript(path.join(h.paths.projects, 'missing.jsonl'), records)).toBe(0);
  });

  it('defaults an absent model and absent token counts rather than failing', () => {
    const h = newHud();
    const file = path.join(h.paths.projects, '-proj', 'sparse.jsonl');
    writeFileSync(
      file,
      JSON.stringify({ requestId: 'r', timestamp: '2026-08-06T00:00:00Z', message: { usage: {} } })
    );
    const records = new Map<string, UsageRecord>();
    parseTranscript(file, records);
    expect(records.get('r')).toEqual({
      ts: '2026-08-06T00:00:00Z',
      model: 'unknown',
      out: 0,
      in: 0,
      cacheWrite: 0,
      cacheRead: 0,
    });
  });

  it('stores but does not count a record whose timestamp will not parse', () => {
    // An unparseable timestamp cannot be filed into any week, and guessing one
    // would move real spend into the wrong window.
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    writeFileSync(
      path.join(h.paths.projects, '-proj', 'bad-ts.jsonl'),
      JSON.stringify({
        requestId: 'r',
        timestamp: 'not-a-date',
        message: { model: 'claude-opus-5', usage: { output_tokens: 10_000 } },
      })
    );
    const s = refresh(h.paths);
    expect(s.scan.records_total).toBe(1);
    expect(s.wtd.requests).toBe(0);
  });

  it('walks past a directory it cannot read', () => {
    const h = newHud();
    h.writeConfig({ week_reset: DEFAULT_WEEK });
    const locked = path.join(h.paths.projects, 'locked');
    mkdirSync(locked, { recursive: true });
    chmodSync(locked, 0o000);
    h.writeTranscript('a.jsonl', [transcriptLine('r1', new Date())]);
    try {
      expect(refresh(h.paths).scan.records_total).toBe(1);
    } finally {
      chmodSync(locked, 0o755); // so the temp dir can be cleaned up
    }
  });
});

describe('week window with a hostile config', () => {
  const at = new Date('2026-08-06T12:00:00Z'); // a Thursday
  const mondayBefore = '2026-08-03T00:00:00.000Z';

  it('falls back to midnight when time is not a string', () => {
    const cfg = { week_reset: { weekday: 0, time: { hour: 9 } as unknown as string, tz: 'UTC' } };
    expect(weekBounds(at, cfg).start.toISOString()).toBe(mondayBefore);
  });

  it('falls back to midnight when time is unparseable', () => {
    const cfg = { week_reset: { weekday: 0, time: 'lunchtime', tz: 'UTC' } };
    expect(weekBounds(at, cfg).start.toISOString()).toBe(mondayBefore);
  });

  it('normalises an out-of-range weekday', () => {
    const nine = weekBounds(at, { week_reset: { weekday: 9, time: '00:00', tz: 'UTC' } }).start;
    const two = weekBounds(at, { week_reset: { weekday: 2, time: '00:00', tz: 'UTC' } }).start;
    expect(nine.toISOString()).toBe(two.toISOString());
  });

  it('defaults to Monday UTC when week_reset is missing entirely', () => {
    expect(weekBounds(at, {}).start.toISOString()).toBe(mondayBefore);
  });

  it('falls back to UTC for an unknown timezone', () => {
    const cfg = { week_reset: { weekday: 0, time: '00:00', tz: 'Nowhere/Special' } };
    expect(weekBounds(at, cfg).start.toISOString()).toBe(mondayBefore);
  });
});

describe('statusline with a summary from another version', () => {
  it('renders an unrecognised status without pretending it is fine', () => {
    const out = stripAnsi(
      renderStatusline({ summary: minimalSummary({ status: 'SOMETHING_NEW' }) })
    );
    expect(out).toContain('❔'); // no green tick for a status we cannot interpret
    expect(out).toContain('1k'); // measured spend is still shown
  });

  it('survives a summary missing every optional block', () => {
    const out = stripAnsi(
      renderStatusline({
        summary: { status: 'OK', generated_at: new Date().toISOString() } as unknown as Summary,
      })
    );
    expect(out).toContain('no baseline yet');
    // A missing week block degrades to "0h", i.e. toward urgency rather than
    // toward reassurance — the safe direction for a wrong read.
    expect(out).toContain('0h to reset');
  });

  it('colours the countdown urgently inside twelve hours', () => {
    const near = renderStatusline({
      summary: minimalSummary({ week: { hours_left: 6, days_left: 0.25 } }),
    });
    expect(stripAnsi(near)).toContain('6h to reset');
    expect(near).toContain('\u001b[33m'); // yellow, not dim
  });

  it('renders an unmerged branch and the model name without a /clear nudge', () => {
    const git: GitSegment = { kind: 'plain', label: 'feat/x +3' };
    const out = stripAnsi(
      renderStatusline({ summary: minimalSummary(), git, modelName: 'Opus 5' })
    );
    expect(out).toContain('feat/x +3');
    expect(out).toContain('Opus 5');
    expect(out).not.toContain('/clear');
  });
});

describe('summary reading', () => {
  it('treats a non-object summary as no summary at all', () => {
    const h = newHud();
    writeFileSync(h.paths.summary, '"just a string"');
    expect(readSummary(h.paths)).toBeNull();
    writeFileSync(h.paths.summary, 'null');
    expect(readSummary(h.paths)).toBeNull();
  });
});
