import { describe, it, expect } from 'vitest';
import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
import {
  buildClaimBody,
  parseClaimComment,
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
    const json = /```json\n([\s\S]*?)\n```/.exec(body)![1];
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
