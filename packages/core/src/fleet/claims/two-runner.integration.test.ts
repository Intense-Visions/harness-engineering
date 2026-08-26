import { describe, it, expect } from 'vitest';
import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
import { buildClaimBody, parseClaimComment, isLeaseLive } from './index';
import { classifyClaim, type ItemClaimContext } from './select';

// --- In-memory fake GitHub claim store (offline stand-in for the gh layer) ---
// Models exactly the surface the skill's SELECT/CLAIM/HEARTBEAT/RELEASE touch:
// the `fleet:claimed` label, the (single, latest) claim comment with a
// server-stamped updated_at, and open-PR state.
interface ItemState {
  labeled: boolean;
  commentBody: string | null;
  serverUpdatedAt: string | null; // GitHub-server updated_at of the claim comment
  openPr: boolean;
}
class FakeClaimStore {
  private items = new Map<string, ItemState>();
  private state(item: string): ItemState {
    let s = this.items.get(item);
    if (!s) {
      s = { labeled: false, commentBody: null, serverUpdatedAt: null, openPr: false };
      this.items.set(item, s);
    }
    return s;
  }
  /** CLAIM / reclaim: add label + post (or replace) the claim comment. */
  claim(item: string, claim: FleetClaim, serverNow: string) {
    const s = this.state(item);
    s.labeled = true;
    s.commentBody = buildClaimBody(claim);
    s.serverUpdatedAt = serverNow;
  }
  /** HEARTBEAT: edit the comment → the SERVER bumps updated_at. */
  heartbeat(item: string, serverNow: string) {
    this.state(item).serverUpdatedAt = serverNow;
  }
  /** RELEASE: remove the label (comment stays as audit trail). */
  releaseLabel(item: string) {
    this.state(item).labeled = false;
  }
  openPullRequest(item: string) {
    this.state(item).openPr = true;
  }
  /** What SELECT reads back for one item. */
  contextFor(item: string): ItemClaimContext {
    const s = this.state(item);
    return {
      item,
      hasOpenPr: s.openPr,
      claimComment:
        s.commentBody && s.serverUpdatedAt
          ? { body: s.commentBody, serverUpdatedAt: s.serverUpdatedAt }
          : null,
    };
  }
  /** How many DISTINCT runs currently hold a LIVE lease on this item. */
  liveClaimRunIds(item: string, now: string): string[] {
    const s = this.state(item);
    if (!s.labeled || !s.commentBody || !s.serverUpdatedAt) return [];
    const parsed = parseClaimComment(s.commentBody);
    if (!parsed || !isLeaseLive(parsed, s.serverUpdatedAt, now)) return [];
    return [parsed.runId];
  }
}

const mkClaim = (runId: string, item: string, at: string): FleetClaim => ({
  v: FLEET_CLAIM_VERSION,
  owner: 'op',
  runId,
  fleet: 'roadmap-fleet',
  item,
  claimedAt: at,
  leaseSeconds: 720,
});

describe('two-runner simulation — SC1: no double-build under concurrency', () => {
  it('runner B drops an item runner A holds a live claim on', () => {
    const store = new FakeClaimStore();
    const item = '#1490';
    const t0 = '2026-08-26T14:00:00Z';

    // Runner A enters DISPATCH → claims the item.
    store.claim(item, mkClaim('rf-A', item, t0), t0);

    // Runner B's SELECT (a few seconds later) reads the claim and decides.
    const tB = '2026-08-26T14:00:20Z';
    const decision = classifyClaim(store.contextFor(item), { now: tB, myRunId: 'rf-B' });
    expect(decision).toEqual({ item, drop: true, reason: 'claimed-elsewhere' });

    // Invariant: exactly ONE runId holds a live claim (never both).
    expect(store.liveClaimRunIds(item, tB)).toEqual(['rf-A']);
  });
});

describe('two-runner simulation — SC3: the PR is the durable claim', () => {
  it('drops via the open-PR path (not the lease path) after RELEASE + lapse', () => {
    const store = new FakeClaimStore();
    const item = '#1491';
    const t0 = '2026-08-26T14:00:00Z';

    store.claim(item, mkClaim('rf-A', item, t0), t0); // A claims
    store.openPullRequest(item); // A opens its PR
    store.releaseLabel(item); // RELEASE: label removed

    // Time advances FAR past the lease so the lease path is definitively dead.
    const tLater = '2026-08-26T15:00:00Z';
    const decision = classifyClaim(store.contextFor(item), { now: tLater, myRunId: 'rf-B' });
    expect(decision.drop).toBe(true);
    expect(decision.reason).toBe('in-progress-elsewhere'); // open-PR path, NOT claimed-elsewhere

    // The label is releasable and now released; no live lease remains.
    expect(store.liveClaimRunIds(item, tLater)).toEqual([]);
  });
});

describe('two-runner simulation — SC4: graceful degradation when gh is absent', () => {
  it('falls back to open-PR-cross-check-only, never throws', () => {
    const store = new FakeClaimStore();
    const claimed = '#1492';
    const withPr = '#1493';
    const t0 = '2026-08-26T14:00:00Z';
    store.claim(claimed, mkClaim('rf-A', claimed, t0), t0);
    store.openPullRequest(withPr);

    const now = '2026-08-26T14:00:10Z';
    // gh auth absent → claimScanAvailable: false. The claimed item is KEPT
    // (lease path skipped); the open-PR item is still dropped.
    const keep = classifyClaim(store.contextFor(claimed), { now, claimScanAvailable: false });
    const drop = classifyClaim(store.contextFor(withPr), { now, claimScanAvailable: false });
    expect(keep.drop).toBe(false);
    expect(drop).toEqual({ item: withPr, drop: true, reason: 'in-progress-elsewhere' });
  });
});
