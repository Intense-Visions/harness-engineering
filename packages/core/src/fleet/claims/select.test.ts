import { describe, it, expect } from 'vitest';
import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
import { buildClaimBody } from './index';
import { classifyClaim, selectUnclaimed, type ItemClaimContext } from './select';

const NOW = '2026-08-26T14:30:00Z';
const FRESH = '2026-08-26T14:28:00Z'; // +2m ago, well within a 720s lease
const STALE = '2026-08-26T14:00:00Z'; // 30m ago, past a 720s lease

const claim = (over: Partial<FleetClaim> = {}): FleetClaim => ({
  v: FLEET_CLAIM_VERSION,
  owner: 'chadjw',
  runId: 'rf-AAA',
  fleet: 'roadmap-fleet',
  item: '#1490',
  claimedAt: '2026-08-26T14:28:00Z',
  leaseSeconds: 720,
  ...over,
});
const ctx = (over: Partial<ItemClaimContext> = {}): ItemClaimContext => ({
  item: '#1490',
  hasOpenPr: false,
  claimComment: { body: buildClaimBody(claim()), serverUpdatedAt: FRESH },
  ...over,
});

describe('classifyClaim — precedence', () => {
  it('drops an open-PR item as in-progress-elsewhere (durable claim wins)', () => {
    // open PR AND a live lease → open-PR path wins (SC3 / D6)
    expect(classifyClaim(ctx({ hasOpenPr: true }), { now: NOW })).toEqual({
      item: '#1490',
      drop: true,
      reason: 'in-progress-elsewhere',
    });
  });

  it('drops a live lease from another run as claimed-elsewhere', () => {
    expect(classifyClaim(ctx(), { now: NOW, myRunId: 'rf-BBB' })).toEqual({
      item: '#1490',
      drop: true,
      reason: 'claimed-elsewhere',
    });
  });

  it('keeps an item whose live lease is our own run', () => {
    expect(classifyClaim(ctx(), { now: NOW, myRunId: 'rf-AAA' }).drop).toBe(false);
  });

  it('keeps an item with a stale lease (reclaimable)', () => {
    const stale = ctx({ claimComment: { body: buildClaimBody(claim()), serverUpdatedAt: STALE } });
    expect(classifyClaim(stale, { now: NOW, myRunId: 'rf-BBB' }).drop).toBe(false);
  });

  it('keeps a novel item (no PR, no claim comment)', () => {
    expect(classifyClaim(ctx({ claimComment: null }), { now: NOW }).drop).toBe(false);
  });

  it('keeps an item whose claim comment is foreign/unparseable (never throws)', () => {
    const foreign = ctx({
      claimComment: { body: 'just a normal comment', serverUpdatedAt: FRESH },
    });
    expect(classifyClaim(foreign, { now: NOW }).drop).toBe(false);
  });
});

describe('classifyClaim — pr-fleet safe usage (hasOpenPr contract)', () => {
  // Every pr-fleet item IS itself an open PR. The contract is that hasOpenPr
  // means "a DISTINCT open PR resolves this item" — so pr-fleet passes false
  // and its candidates must NOT be dropped as in-progress-elsewhere.
  it('does NOT drop a pr-fleet item (its own PR, hasOpenPr:false, no lease)', () => {
    const prItem = ctx({ item: '#2001', hasOpenPr: false, claimComment: null });
    expect(classifyClaim(prItem, { now: NOW, myRunId: 'pf-AAA' })).toEqual({
      item: '#2001',
      drop: false,
      reason: null,
    });
  });

  it('keeps an entire pr-fleet batch (all its own PRs, hasOpenPr:false)', () => {
    const batch = [
      ctx({ item: '#2001', hasOpenPr: false, claimComment: null }),
      ctx({ item: '#2002', hasOpenPr: false, claimComment: null }),
      ctx({ item: '#2003', hasOpenPr: false, claimComment: null }),
    ];
    const kept = selectUnclaimed(batch, { now: NOW, myRunId: 'pf-AAA' }).map((i) => i.item);
    expect(kept).toEqual(['#2001', '#2002', '#2003']); // none dropped
  });

  it('still drops a pr-fleet item another run holds a LIVE lease on (lease path)', () => {
    // pr-fleet dedup rides the lease path, never the open-PR path.
    const leased = ctx({ item: '#2004', hasOpenPr: false });
    expect(classifyClaim(leased, { now: NOW, myRunId: 'pf-BBB' })).toEqual({
      item: '#2004',
      drop: true,
      reason: 'claimed-elsewhere',
    });
  });
});

describe('classifyClaim — degradation (SC4)', () => {
  it('ignores the lease path when the claim-scan is unavailable', () => {
    // live lease present, but scan unavailable → only the open-PR path is consulted
    expect(
      classifyClaim(ctx(), { now: NOW, myRunId: 'rf-BBB', claimScanAvailable: false }).drop
    ).toBe(false);
  });
  it('still drops an open PR even when the claim-scan is unavailable', () => {
    expect(
      classifyClaim(ctx({ hasOpenPr: true }), { now: NOW, claimScanAvailable: false }).reason
    ).toBe('in-progress-elsewhere');
  });
});

describe('selectUnclaimed', () => {
  it('returns only the items SELECT should still build', () => {
    const items = [
      ctx({ item: '#1', claimComment: null }), // novel → keep
      ctx({ item: '#2', hasOpenPr: true }), // open PR → drop
      ctx({ item: '#3' }), // live foreign lease → drop
      ctx({
        item: '#4',
        claimComment: { body: buildClaimBody(claim({ item: '#4' })), serverUpdatedAt: STALE },
      }), // stale → keep
    ];
    const kept = selectUnclaimed(items, { now: NOW, myRunId: 'rf-BBB' }).map((i) => i.item);
    expect(kept).toEqual(['#1', '#4']);
  });
});
