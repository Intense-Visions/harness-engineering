import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { coverageTrendProvider } from '../../../../src/server/signals/providers/coverage-trend';
import { SignalTimelineStore } from '../../../../src/server/signals/timeline-store';
import type { SignalContext, CommandRunner } from '../../../../src/server/signals/types';

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
});
