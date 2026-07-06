import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { coverageTrendProvider } from '../../src/providers/coverage-trend';
import { SignalTimelineStore } from '../../src/timeline-store';
import type { SignalContext, CommandRunner } from '../../src/types';

const US = '\x1f'; // unit (field) separator within a record

// Mirror git's REAL wire format: `--pretty=format:` separates records with a
// NEWLINE and emits NO trailing terminator after the final record. Each record
// is `<sha>\x1f<YYYY-MM-DD>` (the `--pretty=format:%H%x1f%cd --date=short` the
// provider requests).
function gitLog(records: Array<[sha: string, date: string]>): string {
  return records.map(([sha, date]) => `${sha}${US}${date}`).join('\n');
}

// Real `coverage-baselines.json` shape: a flat object keyed by package path,
// each value `{lines, branches, functions, statements}` numeric percentages.
// mean(lines) across the two packages === `lines` (both share the same value).
function covSnapshot(lines: number): string {
  return JSON.stringify({
    'packages/core': { lines, branches: 70, functions: 90, statements: 85 },
    'packages/graph': { lines, branches: 80, functions: 95, statements: 92 },
  });
}

// Dispatch a mock runner on the git subcommand, returning real-shape output.
// `snapshots` maps a sha -> mean-lines value used to build its covSnapshot.
function gitRunner(
  log: string,
  snapshots: Record<string, number | string>,
  opts: { capture?: (args: string[]) => void } = {}
): CommandRunner {
  return async (_cmd, args) => {
    opts.capture?.(args);
    if (args.includes('log')) return log;
    if (args.includes('show')) {
      // arg is the `<sha>:coverage-baselines.json` rev:path token.
      const revPath = args.find((a) => a.includes(':')) ?? '';
      const sha = revPath.split(':')[0]!;
      const snap = snapshots[sha];
      if (typeof snap === 'string') return snap; // unparseable / raw passthrough
      if (typeof snap === 'number') return covSnapshot(snap);
      return '';
    }
    return '';
  };
}

function tmpDir() {
  return path.join(__dirname, '__test-tmp-coverage-trend__');
}
function ctx(root: string, now: Date, runCommand: CommandRunner): SignalContext {
  return { projectPath: root, now, timeline: new SignalTimelineStore(root), runCommand };
}

describe('coverageTrendProvider', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes the correct static contract', () => {
    expect(coverageTrendProvider.id).toBe('coverage-trend-down-30d');
    expect(coverageTrendProvider.label.length).toBeGreaterThan(0);
  });

  it('computes latest mean-lines value and a down/alert trend over 30d', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const log = gitLog([
      ['s1', '2026-06-01'],
      ['s2', '2026-06-22'],
    ]);
    const runner = gitRunner(log, { s1: 90, s2: 84 }); // delta -6 => alert, trend down
    const r = await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(r.id).toBe('coverage-trend-down-30d');
    expect(r.value).toBe(84);
    expect(r.unit).toBe('%');
    expect(r.betterDirection).toBe('up');
    expect(r.threshold).toEqual({ warn: -1, alert: -5 });
    expect(r.trend).toBe('down');
    expect(r.status).toBe('alert');
    expect(r.history).toEqual([
      { date: '2026-06-01', value: 90 },
      { date: '2026-06-22', value: 84 },
    ]);
  });

  it('keeps the LATEST commit per day when multiple commits share a date', async () => {
    // git log emits newest→oldest, so the FIRST record for a day is the latest
    // commit. `s_new` (94) is newer than `s_old` (80) on the same date; the bucket
    // must keep 94. The old last-wins `.set` logic would overwrite with 80.
    const now = new Date('2026-06-22T00:00:00.000Z');
    const log = gitLog([
      ['s_new', '2026-06-10'], // newest on 06-10
      ['s_old', '2026-06-10'], // older on 06-10
    ]);
    const runner = gitRunner(log, { s_new: 94, s_old: 80 });
    const r = await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(r.history).toEqual([{ date: '2026-06-10', value: 94 }]);
    expect(r.value).toBe(94);
  });

  it('skips an empty-object snapshot rather than treating it as 0% coverage', async () => {
    // A committed `{}` snapshot is "no packages recorded", not 0% coverage; the
    // commit must be skipped so it does not poison the trend with a phantom 0.
    const now = new Date('2026-06-22T00:00:00.000Z');
    const log = gitLog([
      ['s2', '2026-06-22'], // newest: real coverage
      ['s1', '2026-06-01'], // older: empty snapshot {}
    ]);
    const runner = gitRunner(log, { s2: 88, s1: '{}' });
    const r = await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(r.history).toEqual([{ date: '2026-06-22', value: 88 }]);
    expect(r.value).toBe(88);
  });

  it('reports warn at -1..-5 delta and ok above -1', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');

    // delta -2 => warn
    const warnRunner = gitRunner(
      gitLog([
        ['s1', '2026-06-01'],
        ['s2', '2026-06-22'],
      ]),
      { s1: 90, s2: 88 }
    );
    const warn = await coverageTrendProvider.compute(ctx(root, now, warnRunner));
    expect(warn.status).toBe('warn');
    expect(warn.trend).toBe('down');

    // delta 0 => ok (and flat trend)
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    const okRunner = gitRunner(
      gitLog([
        ['s1', '2026-06-01'],
        ['s2', '2026-06-22'],
      ]),
      { s1: 90, s2: 90 }
    );
    const ok = await coverageTrendProvider.compute(ctx(root, now, okRunner));
    expect(ok.status).toBe('ok');
    expect(ok.trend).toBe('flat');
  });

  it('degrades to error (no throw) when git is unavailable', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const boom: CommandRunner = async () => {
      throw new Error('git not found');
    };
    const r = await coverageTrendProvider.compute(ctx(root, now, boom));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.detail).toMatch(/coverage/i);
  });

  it('degrades to error when coverage-baselines.json was never tracked (empty git log)', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner = gitRunner(gitLog([]), {});
    const r = await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.detail).toMatch(/coverage-ratchet/);
  });

  it('skips commits whose snapshot is unparseable and still degrades gracefully when none parse', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner = gitRunner(gitLog([['s1', '2026-06-10']]), { s1: 'not json' });
    const r = await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });

  it('requests git log scoped to a 30-day window over coverage-baselines.json', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    let capturedArgs: string[] = [];
    const runner = gitRunner(gitLog([]), {}, { capture: (a) => (capturedArgs = a) });
    await coverageTrendProvider.compute(ctx(root, now, runner));
    expect(capturedArgs).toContain('--since=30.days');
    expect(capturedArgs).toContain('coverage-baselines.json');
  });

  it('backfills daily buckets and mirrors the current day into the timeline store', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const store = new SignalTimelineStore(root);
    const runner = gitRunner(gitLog([['s1', '2026-06-10']]), { s1: 88 });
    await coverageTrendProvider.compute({
      projectPath: root,
      now,
      timeline: store,
      runCommand: runner,
    });
    expect(store.has('coverage-trend-down-30d', '2026-06-10')).toBe(true); // backfilled bucket
    expect(store.has('coverage-trend-down-30d', '2026-06-22')).toBe(true); // current-day mirror
  });
});
