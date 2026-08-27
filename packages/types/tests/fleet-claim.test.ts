import { describe, it, expect } from 'vitest';
import { FleetClaimSchema, FLEET_CLAIM_VERSION, type FleetClaim } from '../src/fleet-claim';

const wellFormed: FleetClaim = {
  v: FLEET_CLAIM_VERSION,
  owner: 'chadjw',
  runId: 'rf-1a2b3c',
  fleet: 'roadmap-fleet',
  item: '#1490',
  claimedAt: '2026-08-26T14:20:00Z',
  leaseSeconds: 720,
};

describe('FleetClaimSchema', () => {
  it('accepts a well-formed claim', () => {
    const parsed = FleetClaimSchema.parse(wellFormed);
    expect(parsed).toEqual(wellFormed);
  });

  it('rejects a claim missing required fields', () => {
    const bad = { owner: 'chadjw' };
    expect(FleetClaimSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-positive leaseSeconds', () => {
    expect(FleetClaimSchema.safeParse({ ...wellFormed, leaseSeconds: 0 }).success).toBe(false);
  });

  it('treats v as optional', () => {
    const { v: _v, ...noVersion } = wellFormed;
    expect(FleetClaimSchema.safeParse(noVersion).success).toBe(true);
  });
});
