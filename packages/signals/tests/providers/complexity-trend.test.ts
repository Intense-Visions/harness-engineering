import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { complexityTrendProvider } from '../../src/providers/complexity-trend';
import { SignalTimelineStore } from '../../src/timeline-store';
import type { SignalContext } from '../../src/types';

function tmpDir(): string {
  return path.join(__dirname, '__test-tmp-complexity-trend__');
}
function archTimelinePath(root: string): string {
  return path.join(root, '.harness', 'arch', 'timeline.json');
}
function writeArchTimeline(root: string, snapshots: unknown[]): void {
  const p = archTimelinePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, snapshots }, null, 2));
}
function snapshot(capturedAt: string, complexity: number) {
  return {
    capturedAt,
    commitHash: 'abc1234',
    stabilityScore: 50,
    metrics: { complexity: { value: complexity, violationCount: complexity } },
  };
}
function ctx(root: string, now: Date): SignalContext {
  return { projectPath: root, now, timeline: new SignalTimelineStore(root) };
}

describe('complexityTrendProvider', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes the correct static contract', () => {
    expect(complexityTrendProvider.id).toBe('complexity-trend-up-30d');
    expect(complexityTrendProvider.label.length).toBeGreaterThan(0);
  });

  it('computes value, history, and an alert trend (>=15% rise)', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [
      snapshot('2026-06-01T10:00:00.000Z', 100),
      snapshot('2026-06-22T10:00:00.000Z', 120), // +20% -> alert
    ]);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.id).toBe('complexity-trend-up-30d');
    expect(r.value).toBe(120);
    expect(r.unit).toBe('count');
    expect(r.betterDirection).toBe('down');
    expect(r.threshold).toEqual({ warn: 5, alert: 15 });
    expect(r.source).toBe('arch/timeline.json');
    expect(r.trend).toBe('up');
    expect(r.status).toBe('alert');
    expect(r.history).toEqual([
      { date: '2026-06-01', value: 100 },
      { date: '2026-06-22', value: 120 },
    ]);
  });

  it('returns warn for a 5–15% rise', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [
      snapshot('2026-06-05T10:00:00.000Z', 100),
      snapshot('2026-06-22T10:00:00.000Z', 108), // +8% -> warn
    ]);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.status).toBe('warn');
    expect(r.trend).toBe('up');
  });

  it('returns ok/down when complexity falls', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [
      snapshot('2026-06-05T10:00:00.000Z', 100),
      snapshot('2026-06-22T10:00:00.000Z', 90),
    ]);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.status).toBe('ok');
    expect(r.trend).toBe('down');
    expect(r.value).toBe(90);
  });

  it('excludes snapshots older than 30 days from the window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [
      snapshot('2026-04-01T10:00:00.000Z', 50), // outside 30d window
      snapshot('2026-06-10T10:00:00.000Z', 100),
      snapshot('2026-06-22T10:00:00.000Z', 100), // flat in-window
    ]);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.history).toEqual([
      { date: '2026-06-10', value: 100 },
      { date: '2026-06-22', value: 100 },
    ]);
    expect(r.trend).toBe('flat');
    expect(r.status).toBe('ok');
  });

  it('handles a single in-window snapshot as flat/ok', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [snapshot('2026-06-22T10:00:00.000Z', 288)]);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.value).toBe(288);
    expect(r.trend).toBe('flat');
    expect(r.status).toBe('ok');
    expect(r.history).toEqual([{ date: '2026-06-22', value: 288 }]);
  });

  it('mirrors the current day point into the timeline store', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, [snapshot('2026-06-22T10:00:00.000Z', 288)]);
    const store = new SignalTimelineStore(root);
    await complexityTrendProvider.compute({ projectPath: root, now, timeline: store });
    expect(store.has('complexity-trend-up-30d', '2026-06-22')).toBe(true);
  });

  it('degrades to error when arch/timeline.json is missing', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.trend).toBe('flat');
    expect(r.detail).toContain('arch/timeline.json');
  });

  it('degrades to error on empty snapshots', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    writeArchTimeline(root, []);
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });

  it('degrades to error on corrupt JSON', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const p = archTimelinePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ not json ');
    const r = await complexityTrendProvider.compute(ctx(root, now));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });
});
