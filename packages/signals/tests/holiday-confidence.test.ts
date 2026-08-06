import { describe, it, expect } from 'vitest';
import { computeHolidayConfidence } from '../src/holiday-confidence';
import type { OutcomeQueryStore } from '../src/holiday-confidence';
import type { CommandRunner, SignalId, SignalResult, SignalStatus } from '../src/types';

const NOW = new Date('2026-06-22T00:00:00.000Z');
const IN_WINDOW = '2026-06-19T10:00:00Z';
const OUT_OF_WINDOW = '2026-04-01T10:00:00Z';
const REVIEWED = { body: '## Strengths\nsolid\n## Assessment: Approve' };
const PLAIN = { body: 'lgtm' };

interface PrRow {
  number: number;
  mergedAt: string;
  reviews: Array<{ body: string }>;
  headRefOid?: string;
  mergeCommit?: { oid: string } | null;
}

function ghRunner(prs: PrRow[]): CommandRunner {
  return async () => JSON.stringify(prs);
}

/** Minimal curated signal stub. */
function sig(id: SignalId, value: number | null, status: SignalStatus): SignalResult {
  return {
    id,
    label: id,
    value,
    unit: 'count',
    trend: 'flat',
    betterDirection: 'down',
    status,
    threshold: { warn: 1, alert: 3 },
    history: [],
    detail: '',
    source: 'test',
  };
}

/** All-clear signal set: baseline at 0, nothing in breach. */
function healthySignals(): SignalResult[] {
  return [
    sig('pr-merged-without-multi-persona-review', 0, 'ok'),
    sig('coverage-trend-down-30d', 0, 'ok'),
    sig('complexity-trend-up-30d', 0, 'ok'),
    sig('baseline-auto-update-count', 0, 'ok'),
    sig('eval-fail-rate', 0, 'ok'),
  ];
}

function graphWith(failedShas: string[]): OutcomeQueryStore {
  return {
    findNodes: () => failedShas.map((sha) => ({ metadata: { result: 'failure', commit: sha } })),
  };
}

describe('computeHolidayConfidence', () => {
  it('reports 100% when every merged PR cleared all four gates', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
        { number: 2, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'b' },
      ]),
      graphStore: graphWith([]),
      signals: healthySignals(),
    });
    expect(r.value).toBe(100);
    expect(r.status).toBe('ok');
    expect(r.mergedPrs).toBe(2);
    expect(r.confidentPrs).toBe(2);
    expect(r.criteria.reviewFired).toEqual({ passed: 2, total: 2 });
  });

  // (a) multi-persona review fired — per-PR
  it('excludes PRs that lack a multi-persona review (criterion a)', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
        { number: 2, mergedAt: IN_WINDOW, reviews: [PLAIN], headRefOid: 'b' },
        { number: 3, mergedAt: IN_WINDOW, reviews: [], headRefOid: 'c' },
        { number: 4, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'd' },
      ]),
      graphStore: graphWith([]),
      signals: healthySignals(),
    });
    expect(r.criteria.reviewFired).toEqual({ passed: 2, total: 4 });
    expect(r.value).toBe(50);
    expect(r.confidentPrs).toBe(2);
  });

  // (b) outcome-eval passed — per-PR, linked by commit sha
  it('excludes a PR whose linked outcome-eval failed (criterion b)', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'ok-sha' },
        { number: 2, mergedAt: IN_WINDOW, reviews: [REVIEWED], mergeCommit: { oid: 'bad-sha' } },
      ]),
      graphStore: graphWith(['bad-sha']),
      signals: healthySignals(),
    });
    expect(r.criteria.outcomeEvalPassed.passed).toBe(1);
    expect(r.criteria.outcomeEvalPassed.total).toBe(2);
    expect(r.criteria.outcomeEvalPassed.degraded).toBe(false);
    expect(r.value).toBe(50);
  });

  it('marks (b) degraded and passes all PRs when no graph store is available', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([{ number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED] }]),
      signals: healthySignals(),
    });
    expect(r.criteria.outcomeEvalPassed).toMatchObject({ passed: 1, degraded: true });
    expect(r.notes.some((n) => n.includes('graph unavailable'))).toBe(true);
    expect(r.value).toBe(100);
  });

  // (c) no auto-baseline-update — window gate
  it('collapses confidence to 0 when a baseline auto-update occurred (criterion c)', async () => {
    const signals = healthySignals();
    // Force baseline count > 0 but keep its status ok to isolate (c) from (d).
    signals[3] = sig('baseline-auto-update-count', 2, 'ok');
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
      ]),
      graphStore: graphWith([]),
      signals,
    });
    expect(r.criteria.noBaselineAutoUpdate).toEqual({ held: false, count: 2 });
    expect(r.criteria.noSignalBreach.held).toBe(true);
    expect(r.confidentPrs).toBe(0);
    expect(r.value).toBe(0);
    expect(r.status).toBe('alert');
    expect(r.detail.toLowerCase()).toContain('baseline auto-updates present');
  });

  // (d) no signal exceeded threshold — window gate
  it('collapses confidence to 0 when a curated signal is in breach (criterion d)', async () => {
    const signals = healthySignals();
    signals[2] = sig('complexity-trend-up-30d', 20, 'alert');
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
      ]),
      graphStore: graphWith([]),
      signals,
    });
    expect(r.criteria.noBaselineAutoUpdate.held).toBe(true);
    expect(r.criteria.noSignalBreach).toEqual({
      held: false,
      breached: ['complexity-trend-up-30d'],
    });
    expect(r.value).toBe(0);
  });

  it('honours the window and excludes PRs merged before the cutoff', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      windowDays: 30,
      runCommand: ghRunner([
        { number: 1, mergedAt: OUT_OF_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
        { number: 2, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'b' },
      ]),
      graphStore: graphWith([]),
      signals: healthySignals(),
    });
    expect(r.mergedPrs).toBe(1);
    expect(r.value).toBe(100);
  });

  it('returns pending with a null value when no PRs merged in the window', async () => {
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([]),
      graphStore: graphWith([]),
      signals: healthySignals(),
    });
    expect(r.status).toBe('pending');
    expect(r.value).toBeNull();
    expect(r.mergedPrs).toBe(0);
  });

  it('degrades to error (never throws) when gh is unavailable', async () => {
    const boom: CommandRunner = async () => {
      throw new Error('gh: command not found');
    };
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: boom,
      graphStore: graphWith([]),
      signals: healthySignals(),
    });
    expect(r.status).toBe('error');
    expect(r.value).toBeNull();
    expect(r.detail.toLowerCase()).toContain('gh');
  });

  it('gathers signals via the injected seam when none are supplied', async () => {
    let gathered = false;
    const r = await computeHolidayConfidence({
      projectPath: '/x',
      now: NOW,
      runCommand: ghRunner([
        { number: 1, mergedAt: IN_WINDOW, reviews: [REVIEWED], headRefOid: 'a' },
      ]),
      graphStore: graphWith([]),
      gatherSignals: async () => {
        gathered = true;
        return { signals: healthySignals() };
      },
    });
    expect(gathered).toBe(true);
    expect(r.value).toBe(100);
  });
});
