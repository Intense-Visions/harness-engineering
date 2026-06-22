import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { baselineUpdatesProvider } from '../../../../src/server/signals/providers/baseline-updates';
import { SignalTimelineStore } from '../../../../src/server/signals/timeline-store';
import type { SignalContext, CommandRunner } from '../../../../src/server/signals/types';

const RS = '\x1e'; // record separator
const US = '\x1f'; // unit separator
function logRecord(hash: string, author: string, subject: string, date: string) {
  // provider asks git for hash, author, subject, and committer date (YYYY-MM-DD)
  return [hash, author, subject, date].join(US);
}
function gitLog(records: string[]): string {
  return records.join(RS) + (records.length ? RS : '');
}
function tmpDir() {
  return path.join(__dirname, '__test-tmp-baseline-updates__');
}
function ctx(root: string, now: Date, runCommand: CommandRunner): SignalContext {
  return { projectPath: root, now, timeline: new SignalTimelineStore(root), runCommand };
}

describe('baselineUpdatesProvider', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes the correct static contract', () => {
    expect(baselineUpdatesProvider.id).toBe('baseline-auto-update-count');
    expect(baselineUpdatesProvider.label.length).toBeGreaterThan(0);
  });

  it('counts only github-actions[bot] refresh-baselines commits in the 30d window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner: CommandRunner = async () =>
      gitLog([
        logRecord(
          'a1',
          'github-actions[bot]',
          'chore: refresh baselines after merge [skip ci] (PR 578)',
          '2026-06-20'
        ),
        logRecord(
          'a2',
          'github-actions[bot]',
          'chore: refresh baselines after merge [skip ci]',
          '2026-06-18'
        ),
        logRecord('h1', 'Chad Warner', 'chore: refresh baselines for copy-craft', '2026-06-17'), // human -> excluded
        logRecord('m1', 'github-actions[bot]', 'chore: bump deps', '2026-06-16'), // wrong msg -> excluded
      ]);
    const r = await baselineUpdatesProvider.compute(ctx(root, now, runner));
    expect(r.id).toBe('baseline-auto-update-count');
    expect(r.value).toBe(2);
    expect(r.unit).toBe('count');
    expect(r.betterDirection).toBe('down');
    expect(r.threshold).toEqual({ warn: 1, alert: 5 });
    expect(r.status).toBe('warn'); // 2 >= warn(1), < alert(5)
  });

  it('returns ok at zero and alert at >=5', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const none: CommandRunner = async () => gitLog([]);
    expect((await baselineUpdatesProvider.compute(ctx(root, now, none))).status).toBe('ok');
    const many: CommandRunner = async () =>
      gitLog(
        Array.from({ length: 5 }, (_, i) =>
          logRecord(
            `b${i}`,
            'github-actions[bot]',
            'chore: refresh baselines after merge [skip ci]',
            `2026-06-1${i}`
          )
        )
      );
    const r = await baselineUpdatesProvider.compute(ctx(root, now, many));
    expect(r.value).toBe(5);
    expect(r.status).toBe('alert');
  });

  it('backfills daily buckets and mirrors the current day into the timeline store', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const store = new SignalTimelineStore(root);
    const runner: CommandRunner = async () =>
      gitLog([
        logRecord(
          'a1',
          'github-actions[bot]',
          'chore: refresh baselines after merge [skip ci]',
          '2026-06-20'
        ),
      ]);
    await baselineUpdatesProvider.compute({
      projectPath: root,
      now,
      timeline: store,
      runCommand: runner,
    });
    expect(store.has('baseline-auto-update-count', '2026-06-20')).toBe(true); // backfilled bucket
    expect(store.has('baseline-auto-update-count', '2026-06-22')).toBe(true); // current-day mirror
  });

  it('degrades to error (no throw) when git is unavailable', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const boom: CommandRunner = async () => {
      throw new Error('git not found');
    };
    const r = await baselineUpdatesProvider.compute(ctx(root, now, boom));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.history).toEqual([]);
  });

  it('requests git log scoped to a 30-day window over *-baselines.json', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    let capturedArgs: string[] = [];
    const runner: CommandRunner = async (_cmd, args) => {
      capturedArgs = args;
      return '';
    };
    await baselineUpdatesProvider.compute(ctx(root, now, runner));
    expect(capturedArgs).toContain('--since=30.days');
    expect(capturedArgs).toContain('*-baselines.json');
  });
});
