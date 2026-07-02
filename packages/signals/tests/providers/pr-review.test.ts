import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prReviewProvider } from '../../src/providers/pr-review';
import { SignalTimelineStore } from '../../src/timeline-store';
import type { SignalContext, CommandRunner } from '../../src/types';

function tmpDir() {
  return path.join(__dirname, '__test-tmp-pr-review__');
}
function ctx(root: string, now: Date, runCommand: CommandRunner): SignalContext {
  return { projectPath: root, now, timeline: new SignalTimelineStore(root), runCommand };
}
function ghPayload(
  prs: Array<{ number: number; mergedAt: string; reviews: Array<{ body: string }> }>
) {
  return JSON.stringify(prs);
}
const REVIEWED = { body: '## Strengths\nlooks good\n## Assessment: Approve' };
const PLAIN = { body: 'lgtm' };

describe('prReviewProvider', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes the correct static contract', () => {
    expect(prReviewProvider.id).toBe('pr-merged-without-multi-persona-review');
    expect(prReviewProvider.label.length).toBeGreaterThan(0);
  });

  it('counts merged PRs lacking a multi-persona review assessment marker', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner: CommandRunner = async () =>
      ghPayload([
        { number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [REVIEWED] }, // reviewed -> not counted
        { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] }, // no marker -> counted
        { number: 3, mergedAt: '2026-06-18T10:00:00Z', reviews: [] }, // no reviews -> counted
      ]);
    const r = await prReviewProvider.compute(ctx(root, now, runner));
    expect(r.id).toBe('pr-merged-without-multi-persona-review');
    expect(r.value).toBe(2);
    expect(r.betterDirection).toBe('down');
    expect(r.threshold).toEqual({ warn: 1, alert: 3 });
    expect(r.status).toBe('warn'); // 2 >= warn(1), < alert(3)
  });

  it('returns ok at zero and alert at >=3', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const allReviewed: CommandRunner = async () =>
      ghPayload([{ number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [REVIEWED] }]);
    expect((await prReviewProvider.compute(ctx(root, now, allReviewed))).status).toBe('ok');
    const threeBad: CommandRunner = async () =>
      ghPayload([
        { number: 1, mergedAt: '2026-06-20T10:00:00Z', reviews: [] },
        { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] },
        { number: 3, mergedAt: '2026-06-18T10:00:00Z', reviews: [] },
      ]);
    const r = await prReviewProvider.compute(ctx(root, now, threeBad));
    expect(r.value).toBe(3);
    expect(r.status).toBe('alert');
  });

  it('mirrors and backfills daily buckets into the timeline store', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const store = new SignalTimelineStore(root);
    const runner: CommandRunner = async () =>
      ghPayload([{ number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] }]);
    await prReviewProvider.compute({
      projectPath: root,
      now,
      timeline: store,
      runCommand: runner,
    });
    expect(store.has('pr-merged-without-multi-persona-review', '2026-06-19')).toBe(true);
    expect(store.has('pr-merged-without-multi-persona-review', '2026-06-22')).toBe(true);
  });

  it('degrades to error (no throw) when gh is unavailable', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const boom: CommandRunner = async () => {
      throw new Error('gh: command not found');
    };
    const r = await prReviewProvider.compute(ctx(root, now, boom));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.detail.toLowerCase()).toContain('gh');
  });

  it('degrades to error on unparseable gh output', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const garbage: CommandRunner = async () => 'not json';
    const r = await prReviewProvider.compute(ctx(root, now, garbage));
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
  });

  it('annotates detail as a lower bound when gh returns the full fetch cap (possible truncation)', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const FETCH_LIMIT = 500; // mirrors the provider cap
    // Exactly FETCH_LIMIT rows -> window may be clipped by gh.
    const runner: CommandRunner = async () =>
      ghPayload(
        Array.from({ length: FETCH_LIMIT }, (_, i) => ({
          number: i + 1,
          mergedAt: '2026-06-19T10:00:00Z',
          reviews: [],
        }))
      );
    const r = await prReviewProvider.compute(ctx(root, now, runner));
    expect(r.value).toBe(FETCH_LIMIT);
    expect(r.detail.toLowerCase()).toContain('lower bound');
    expect(r.detail).toContain(String(FETCH_LIMIT));
  });

  it('does not annotate truncation when gh returns fewer than the fetch cap', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner: CommandRunner = async () =>
      ghPayload([{ number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [PLAIN] }]);
    const r = await prReviewProvider.compute(ctx(root, now, runner));
    expect(r.detail.toLowerCase()).not.toContain('lower bound');
  });

  it('excludes PRs merged outside the 30-day window', async () => {
    const now = new Date('2026-06-22T00:00:00.000Z');
    const runner: CommandRunner = async () =>
      JSON.stringify([
        { number: 9, mergedAt: '2026-04-01T10:00:00Z', reviews: [] }, // outside window
        { number: 2, mergedAt: '2026-06-19T10:00:00Z', reviews: [{ body: 'lgtm' }] },
      ]);
    const r = await prReviewProvider.compute(ctx(root, now, runner));
    expect(r.value).toBe(1);
    expect(r.history.some((p) => p.date === '2026-04-01')).toBe(false);
  });
});
