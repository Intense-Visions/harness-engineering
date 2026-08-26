import { describe, it, expect } from 'vitest';
import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
import { buildClaimBody, parseClaimComment, isLeaseLive } from './index';
import { classifyClaim, type ItemClaimContext } from './select';

// --- In-memory fake GitHub claim store (offline stand-in for the gh layer) ---
// Models the surface the skill's SELECT/CLAIM/HEARTBEAT/RELEASE touch: the
// `fleet:claimed` label, the claim COMMENTS (append-only — CLAIM/reclaim posts
// a fresh comment, never overwrites; heartbeat edits an existing one so the
// SERVER bumps its updated_at), and open-PR state.
//
// Append-only is load-bearing: it lets two runs that reclaim near-simultaneously
// BOTH leave a live comment, so the reclaim tiebreak (earliest server stamp
// wins) can be validated rather than assumed away by last-writer-wins replace.
interface ClaimComment {
  runId: string;
  body: string;
  serverUpdatedAt: string; // GitHub-server updated_at of this claim comment
}
interface ItemState {
  labeled: boolean;
  comments: ClaimComment[]; // append-only audit trail
  openPr: boolean;
}
class FakeClaimStore {
  private items = new Map<string, ItemState>();
  private state(item: string): ItemState {
    let s = this.items.get(item);
    if (!s) {
      s = { labeled: false, comments: [], openPr: false };
      this.items.set(item, s);
    }
    return s;
  }
  /** CLAIM / reclaim: add label + APPEND a fresh claim comment (never replace). */
  claim(item: string, claim: FleetClaim, serverNow: string) {
    const s = this.state(item);
    s.labeled = true;
    s.comments.push({
      runId: claim.runId,
      body: buildClaimBody(claim),
      serverUpdatedAt: serverNow,
    });
  }
  /** HEARTBEAT: edit THIS run's latest comment → the SERVER bumps its updated_at. */
  heartbeat(item: string, runId: string, serverNow: string) {
    const mine = this.state(item).comments.filter((c) => c.runId === runId);
    const latest = mine[mine.length - 1];
    if (latest) latest.serverUpdatedAt = serverNow;
  }
  /** RELEASE: remove the label (comments stay as an audit trail). */
  releaseLabel(item: string) {
    this.state(item).labeled = false;
  }
  openPullRequest(item: string) {
    this.state(item).openPr = true;
  }
  /**
   * What SELECT reads back for one item: the LATEST claim comment by server
   * stamp (the reader's single-comment view of an append-only history).
   */
  contextFor(item: string): ItemClaimContext {
    const s = this.state(item);
    const latest = [...s.comments].sort((a, b) =>
      a.serverUpdatedAt < b.serverUpdatedAt ? -1 : a.serverUpdatedAt > b.serverUpdatedAt ? 1 : 0
    )[s.comments.length - 1];
    return {
      item,
      hasOpenPr: s.openPr,
      claimComment: latest ? { body: latest.body, serverUpdatedAt: latest.serverUpdatedAt } : null,
    };
  }
  /** Every LIVE claim comment on this item (append-only ⇒ may be more than one). */
  liveClaimEntries(item: string, now: string): { claim: FleetClaim; serverUpdatedAt: string }[] {
    const s = this.state(item);
    if (!s.labeled) return [];
    const out: { claim: FleetClaim; serverUpdatedAt: string }[] = [];
    for (const c of s.comments) {
      const parsed = parseClaimComment(c.body);
      if (parsed && isLeaseLive(parsed, c.serverUpdatedAt, now)) {
        out.push({ claim: parsed, serverUpdatedAt: c.serverUpdatedAt });
      }
    }
    return out;
  }
  /** The DISTINCT runIds currently holding a LIVE lease on this item. */
  liveClaimRunIds(item: string, now: string): string[] {
    return [...new Set(this.liveClaimEntries(item, now).map((e) => e.claim.runId))];
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
