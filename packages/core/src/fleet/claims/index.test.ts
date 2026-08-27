import { describe, it, expect } from 'vitest';
import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
import {
  buildClaimBody,
  parseClaimComment,
  isLeaseLive,
  resolveClaimWinner,
  CLAIM_LABEL,
  CLAIM_MARKER,
  DEFAULT_LEASE_SECONDS,
  HEARTBEAT_SECONDS,
} from './index';

const claim: FleetClaim = {
  v: FLEET_CLAIM_VERSION,
  owner: 'chadjw',
  runId: 'rf-1a2b3c',
  fleet: 'roadmap-fleet',
  item: '#1490',
  claimedAt: '2026-08-26T14:20:00Z',
  leaseSeconds: 720,
};

describe('fleet/claims constants', () => {
  it('exposes the documented constant values', () => {
    expect(CLAIM_LABEL).toBe('fleet:claimed');
    expect(DEFAULT_LEASE_SECONDS).toBe(720);
    expect(HEARTBEAT_SECONDS).toBe(240);
  });
});

describe('buildClaimBody', () => {
  it('renders the HTML marker then a fenced json block', () => {
    const body = buildClaimBody(claim);
    expect(body).toContain(CLAIM_MARKER);
    expect(body).toMatch(/```json\n[\s\S]*\n```/);
    expect(body.indexOf(CLAIM_MARKER)).toBeLessThan(body.indexOf('```json'));
  });

  it('embeds the exact claim payload as parseable json', () => {
    const body = buildClaimBody(claim);
    const json = /```json\n([\s\S]*?)\n```/.exec(body)![1]!;
    expect(JSON.parse(json)).toEqual(claim);
  });
});

describe('parseClaimComment — round-trip (SC6)', () => {
  it('deep-equals the original claim through build → parse', () => {
    expect(parseClaimComment(buildClaimBody(claim))).toEqual(claim);
  });

  it('parses a claim embedded in surrounding prose', () => {
    const body = `Heads up team, claiming this now.\n\n${buildClaimBody(claim)}\n\nCheers.`;
    expect(parseClaimComment(body)).toEqual(claim);
  });
});

describe('parseClaimComment — tolerance (SC6)', () => {
  it('returns null for a foreign comment (no marker)', () => {
    expect(parseClaimComment('just a normal PR comment')).toBeNull();
  });

  it('returns null for a marked comment with malformed json', () => {
    const body = `${CLAIM_MARKER}\n\n\`\`\`json\n{ not: valid json,,, }\n\`\`\`\n`;
    expect(parseClaimComment(body)).toBeNull();
  });

  it('returns null for a marked comment whose json fails the schema', () => {
    const body = `${CLAIM_MARKER}\n\n\`\`\`json\n${JSON.stringify({ owner: 'x' })}\n\`\`\`\n`;
    expect(parseClaimComment(body)).toBeNull();
  });

  it('never throws on empty or non-json bodies', () => {
    expect(parseClaimComment('')).toBeNull();
    expect(parseClaimComment(CLAIM_MARKER)).toBeNull();
  });
});

describe('isLeaseLive — TTL off server updated_at (SC2)', () => {
  const server = '2026-08-26T14:20:00Z'; // serverUpdatedAt
  it('is live while server + leaseSeconds > now', () => {
    // 720s lease; now = +600s → still live
    expect(isLeaseLive(claim, server, '2026-08-26T14:30:00Z')).toBe(true);
  });
  it('is dead once server + leaseSeconds < now', () => {
    // now = +800s (> 720s) → stale
    expect(isLeaseLive(claim, server, '2026-08-26T14:33:20Z')).toBe(false);
  });
  it('accepts Date instances as well as ISO strings', () => {
    expect(isLeaseLive(claim, new Date(server), new Date('2026-08-26T14:30:00Z'))).toBe(true);
  });
  it('returns false for an unparseable timestamp', () => {
    expect(isLeaseLive(claim, 'not-a-date', '2026-08-26T14:30:00Z')).toBe(false);
  });
});

describe('isLeaseLive — clock-skew safety (SC5)', () => {
  it('follows serverUpdatedAt and ignores a wildly skewed claimedAt', () => {
    // claimedAt is a YEAR in the future (skewed writer clock); the decision
    // must depend ONLY on serverUpdatedAt + now.
    const skewed = { ...claim, claimedAt: '2027-08-26T14:20:00Z' };
    // server just now, now = +10s → live regardless of the future claimedAt
    expect(isLeaseLive(skewed, '2026-08-26T14:20:00Z', '2026-08-26T14:20:10Z')).toBe(true);
    // server long ago, now well past lease → stale despite future claimedAt
    expect(isLeaseLive(skewed, '2026-08-26T14:20:00Z', '2026-08-26T15:20:00Z')).toBe(false);
  });
});

describe('resolveClaimWinner — reclaim-race tiebreak (SC1)', () => {
  const a: FleetClaim = { ...claim, runId: 'rf-A' };
  const b: FleetClaim = { ...claim, runId: 'rf-B' };

  it('returns null for no competing claims', () => {
    expect(resolveClaimWinner([])).toBeNull();
  });

  it('the EARLIEST server-stamped comment wins (not write order)', () => {
    // B is passed FIRST but A is stamped earlier → A wins.
    const winner = resolveClaimWinner([
      { claim: b, serverUpdatedAt: '2026-08-26T14:00:02Z' },
      { claim: a, serverUpdatedAt: '2026-08-26T14:00:01Z' },
    ]);
    expect(winner?.runId).toBe('rf-A');
  });

  it('is symmetric — whichever run is stamped earliest wins', () => {
    // Same racers, B now stamped earlier → B wins. Proves it is timestamp-
    // driven, not runId- or order-driven.
    const winner = resolveClaimWinner([
      { claim: a, serverUpdatedAt: '2026-08-26T14:00:05Z' },
      { claim: b, serverUpdatedAt: '2026-08-26T14:00:01Z' },
    ]);
    expect(winner?.runId).toBe('rf-B');
  });

  it('breaks an exact-stamp tie deterministically by lexicographic runId', () => {
    // Both runs agree on the SAME winner even at identical second-granularity
    // stamps — a total order so the race cannot deadlock or split-brain.
    const at = '2026-08-26T14:00:01Z';
    expect(
      resolveClaimWinner([
        { claim: b, serverUpdatedAt: at },
        { claim: a, serverUpdatedAt: at },
      ])?.runId
    ).toBe('rf-A');
    // order of inputs must not change the verdict
    expect(
      resolveClaimWinner([
        { claim: a, serverUpdatedAt: at },
        { claim: b, serverUpdatedAt: at },
      ])?.runId
    ).toBe('rf-A');
  });

  it('sorts an unparseable stamp last (a parseable competitor wins)', () => {
    const winner = resolveClaimWinner([
      { claim: a, serverUpdatedAt: 'not-a-date' },
      { claim: b, serverUpdatedAt: '2026-08-26T14:00:09Z' },
    ]);
    expect(winner?.runId).toBe('rf-B');
  });
});
