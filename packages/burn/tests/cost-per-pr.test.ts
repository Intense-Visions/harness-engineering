/**
 * Cost-per-merged-PR join (#1522).
 *
 * These tests assert the acceptance criteria directly: raw token sums trace to
 * the records (SC1), a window bounds the fold (SC2), BOTH denominators are
 * carried and labelled (SC3), a fixture out-of-band skill trips the check
 * (SC4), and missing linkage degrades to `unattributed` — never to a free lane
 * (SC5).
 */
import { describe, expect, it } from 'vitest';

import { buildCostReport, checkCostBands } from '../src/cost-per-pr';
import type { LinkResult } from '../src/pr-linkage';
import type { ProvenanceEntry } from '../src/provenance';
import type { UsageRecord } from '../src/types';

function rec(over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: '2026-08-20T12:00:00.000Z',
    model: 'claude-opus-4-8',
    out: 100,
    in: 200,
    cacheWrite: 0,
    cacheRead: 1000,
    agent: 'harness-task-executor',
    agentId: 'lane-1',
    ...over,
  };
}

function linkage(pairs: Array<[string, LinkResult]>): Map<string, LinkResult> {
  return new Map(pairs);
}

describe('buildCostReport — attribution and denominators', () => {
  it('SC1: per-lane raw token sums equal the records for that lane', () => {
    const records = [
      rec({ agentId: 'lane-1', in: 200, out: 100, cacheRead: 1000 }),
      rec({ agentId: 'lane-1', in: 300, out: 50, cacheRead: 500 }),
      rec({ agentId: 'lane-2', in: 10, out: 10, cacheRead: 0 }),
    ];
    const report = buildCostReport({ records, provenance: [], linkage: linkage([]) });
    const lane1 = report.by_lane.find((l) => l.lane_id === 'lane-1')!;
    expect(lane1.tokens_in).toBe(500);
    expect(lane1.tokens_out).toBe(150);
    expect(lane1.cache_read).toBe(1500);
  });

  it('SC2: a window bounds which records are folded per skill', () => {
    const records = [
      rec({ agentId: 'lane-1', ts: '2026-08-10T00:00:00.000Z', out: 100 }),
      rec({ agentId: 'lane-1', ts: '2026-08-20T00:00:00.000Z', out: 100 }),
    ];
    const full = buildCostReport({ records, provenance: [], linkage: linkage([]) });
    const windowed = buildCostReport({
      records,
      provenance: [],
      linkage: linkage([]),
      window: { since: '2026-08-15T00:00:00.000Z' },
    });
    expect(full.by_skill[0]!.tokens_out).toBe(200);
    expect(windowed.by_skill[0]!.tokens_out).toBe(100);
    expect(windowed.window.since).toBe('2026-08-15T00:00:00.000Z');
  });

  it('SC3: both denominators and a note are always emitted', () => {
    const provenance: ProvenanceEntry[] = [{ slug: 'feat-x', issues: [42] }];
    const records = [rec({ agentId: 'lane-1' }), rec({ agentId: 'lane-2' })];
    const report = buildCostReport({
      records,
      provenance,
      linkage: linkage([['feat-x', { mergedPrs: [7], ok: true }]]),
    });
    expect(report.totals.prs_merged).toBe(1);
    expect(report.totals.dispatched_lanes).toBe(2);
    expect(report.totals.cost_per_merged_pr).not.toBeNull();
    expect(report.totals.cost_per_dispatched_lane).not.toBeNull();
    expect(report.denominator_note).toContain('merged PR');
    expect(report.denominator_note).toContain('dispatched lane');
    // The field names themselves carry the denominator — no bare `cost_per_pr`.
    expect(Object.keys(report.totals)).not.toContain('cost_per_pr');
  });

  it('SC5: a lane with no laneId linkage is unattributed, and the run is degraded', () => {
    const provenance: ProvenanceEntry[] = [{ slug: 'feat-x', issues: [42] }]; // no laneId
    const records = [rec({ agentId: 'lane-1' })];
    const report = buildCostReport({
      records,
      provenance,
      linkage: linkage([['feat-x', { mergedPrs: [7], ok: true }]]),
    });
    const lane = report.by_lane[0]!;
    expect(lane.attribution).toBe('unattributed');
    expect(lane.prs_merged).toBe(0);
    // Fleet-level merged PRs still count (the aggregate join works)...
    expect(report.totals.prs_merged).toBe(1);
    // ...but no lane linked, so attribution is flagged degraded.
    expect(report.degraded).toBe(true);
  });

  it('links a lane exactly when a provenance laneId matches the burn agentId', () => {
    const provenance: ProvenanceEntry[] = [{ slug: 'feat-x', issues: [42], laneId: 'lane-1' }];
    const records = [rec({ agentId: 'lane-1' }), rec({ agentId: 'lane-2' })];
    const report = buildCostReport({
      records,
      provenance,
      linkage: linkage([['feat-x', { mergedPrs: [7, 8], ok: true }]]),
    });
    const linked = report.by_lane.find((l) => l.lane_id === 'lane-1')!;
    const unlinked = report.by_lane.find((l) => l.lane_id === 'lane-2')!;
    expect(linked.attribution).toBe('linked');
    expect(linked.prs_merged).toBe(2);
    expect(unlinked.attribution).toBe('unattributed');
    expect(report.degraded).toBe(false);
  });

  it('excludes main/unattributed/pre-migration from attributed spend and skills', () => {
    const records = [
      rec({ agent: 'main', agentId: '' }),
      rec({ agent: 'unattributed', agentId: 'lane-x' }),
      rec({ agent: 'harness-task-executor', agentId: 'lane-1' }),
    ];
    const report = buildCostReport({ records, provenance: [], linkage: linkage([]) });
    expect(report.by_skill.map((s) => s.skill)).toEqual(['harness-task-executor']);
    // main carries no lane; unattributed lane still counts as dispatched.
    expect(report.totals.dispatched_lanes).toBe(2);
  });

  it('abstains (null cost/PR) rather than dividing by zero merged PRs', () => {
    const records = [rec({ agentId: 'lane-1' })];
    const report = buildCostReport({ records, provenance: [], linkage: linkage([]) });
    expect(report.totals.cost_per_merged_pr).toBeNull();
    expect(report.by_skill[0]!.cost_per_merged_pr).toBeNull();
  });

  it('de-dups merged PRs across entries so one PR closing two issues counts once', () => {
    const provenance: ProvenanceEntry[] = [
      { slug: 'a', issues: [1] },
      { slug: 'b', issues: [2] },
    ];
    const report = buildCostReport({
      records: [rec({ agentId: 'lane-1' })],
      provenance,
      linkage: linkage([
        ['a', { mergedPrs: [9], ok: true }],
        ['b', { mergedPrs: [9], ok: true }],
      ]),
    });
    expect(report.totals.prs_merged).toBe(1);
  });
});

describe('buildCostReport — optional pricing', () => {
  it('omits pricing entirely when no price table is supplied', () => {
    const report = buildCostReport({
      records: [rec({ agentId: 'lane-1' })],
      provenance: [],
      linkage: linkage([]),
    });
    expect(report.pricing).toBeUndefined();
  });

  it('derives $ only from a supplied table, keyed per model', () => {
    const records = [rec({ agentId: 'lane-1', in: 1000, out: 100, cacheRead: 0 })];
    const report = buildCostReport({
      records,
      provenance: [{ slug: 'x', issues: [1] }],
      linkage: linkage([['x', { mergedPrs: [5], ok: true }]]),
      priceTable: { 'claude-opus-4-8': { in: 0.00001, out: 0.00005, cache_read: 0 } },
    });
    expect(report.pricing!.usd_total).toBeCloseTo(1000 * 0.00001 + 100 * 0.00005, 9);
    expect(report.pricing!.usd_per_merged_pr).toBeCloseTo(report.pricing!.usd_total / 1, 9);
    expect(report.pricing!.models_priced).toBe(1);
  });
});

describe('checkCostBands — cost regression check (SC4)', () => {
  const records = [
    // 2 records under a fixture skill, one merged PR ⇒ a large cost/PR.
    rec({ agent: 'fixture-skill', agentId: 'lane-1', out: 100000, in: 0, cacheRead: 0 }),
  ];
  const provenance: ProvenanceEntry[] = [{ slug: 'x', issues: [1] }];
  const link = new Map<string, LinkResult>([['x', { mergedPrs: [5], ok: true }]]);

  it('trips when a fixture skill exceeds its declared band', () => {
    const report = buildCostReport({ records, provenance, linkage: link });
    const findings = checkCostBands(report, { 'fixture-skill': { max: 1000 } });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.skill).toBe('fixture-skill');
    expect(findings[0]!.direction).toBe('above');
  });

  it('stays silent when within band', () => {
    const report = buildCostReport({ records, provenance, linkage: link });
    const findings = checkCostBands(report, { 'fixture-skill': { max: 10_000_000 } });
    expect(findings).toHaveLength(0);
  });

  it('flags below-min regressions and skips null cost/PR skills', () => {
    const report = buildCostReport({ records, provenance, linkage: link });
    const below = checkCostBands(report, { 'fixture-skill': { min: 10_000_000, max: 20_000_000 } });
    expect(below[0]!.direction).toBe('below');
    // A skill with no merged PR (null cost/PR) is not judged.
    const noPr = buildCostReport({ records, provenance: [], linkage: new Map() });
    expect(checkCostBands(noPr, { 'fixture-skill': { max: 1 } })).toHaveLength(0);
  });
});
