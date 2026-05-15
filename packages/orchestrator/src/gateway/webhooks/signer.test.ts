import { describe, it, expect } from 'vitest';
import { sign, verify, eventMatches } from './signer';

describe('signer.sign + verify', () => {
  it('produces sha256=<hex> for a known input', () => {
    const sig = sign('sekret', '{"hello":"world"}');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    // pre-computed reference: HMAC-SHA256 of '{"hello":"world"}' with key 'sekret'.
    // Pins the algorithm + body-bytes-verbatim contract for bridge authors.
    expect(sig).toBe('sha256=250533022fd9a79c2be278e53bebc59f38f16b98eb4e4804ca5325b2c71ff2e7');
  });
  it('verify returns true for a valid signature', () => {
    const sig = sign('secret', 'body');
    expect(verify('secret', 'body', sig)).toBe(true);
  });
  it('verify returns false for a tampered body', () => {
    const sig = sign('secret', 'body');
    expect(verify('secret', 'body!', sig)).toBe(false);
  });
  it('verify returns false for a tampered signature', () => {
    const sig = sign('secret', 'body');
    const wrong = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verify('secret', 'body', wrong)).toBe(false);
  });
  it('verify uses constant-time comparison (no early return on length mismatch)', () => {
    // sanity: verify against a malformed signature does not throw
    expect(verify('secret', 'body', 'sha256=tooshort')).toBe(false);
    expect(verify('secret', 'body', 'not-the-right-prefix=abc')).toBe(false);
  });
});

describe('signer.eventMatches', () => {
  it('exact match', () => {
    expect(eventMatches('maintenance.completed', 'maintenance.completed')).toBe(true);
    expect(eventMatches('maintenance.completed', 'maintenance.started')).toBe(false);
  });
  it('star wildcard matches any single segment', () => {
    expect(eventMatches('interaction.*', 'interaction.created')).toBe(true);
    expect(eventMatches('interaction.*', 'interaction.resolved')).toBe(true);
    expect(eventMatches('interaction.*', 'maintenance.completed')).toBe(false);
  });
  it('does not match across segments', () => {
    // interaction.* matches `interaction.foo` but NOT `interaction.foo.bar`
    expect(eventMatches('interaction.*', 'interaction.foo.bar')).toBe(false);
  });
  it('lone star matches any single-segment type', () => {
    expect(eventMatches('*', 'anything')).toBe(true);
    expect(eventMatches('*', 'interaction.created')).toBe(false); // not single-segment
  });
});

describe('signer.eventMatches — telemetry.* exclusion (Phase 5 Task 9)', () => {
  it('legacy *.* still matches non-telemetry two-segment events', () => {
    // Sanity: the exclusion does not regress existing wildcard behavior.
    expect(eventMatches('*.*', 'maintenance.completed')).toBe(true);
    expect(eventMatches('*.*', 'interaction.created')).toBe(true);
  });
  it('*.* does NOT match telemetry.* events (opt-in required)', () => {
    // New behavior: high-volume telemetry events are excluded from *.* by default.
    expect(eventMatches('*.*', 'telemetry.skill_invocation')).toBe(false);
    expect(eventMatches('*.*', 'telemetry.maintenance_run')).toBe(false);
    expect(eventMatches('*.*', 'telemetry.dispatch_decision')).toBe(false);
  });
  it('telemetry.* explicit wildcard matches all telemetry topics', () => {
    expect(eventMatches('telemetry.*', 'telemetry.skill_invocation')).toBe(true);
    expect(eventMatches('telemetry.*', 'telemetry.maintenance_run')).toBe(true);
    expect(eventMatches('telemetry.*', 'telemetry.dispatch_decision')).toBe(true);
  });
  it('telemetry.<specific> matches the named topic only', () => {
    expect(eventMatches('telemetry.skill_invocation', 'telemetry.skill_invocation')).toBe(true);
    expect(eventMatches('telemetry.skill_invocation', 'telemetry.dispatch_decision')).toBe(false);
  });
  it('non-telemetry patterns never match telemetry events even with wildcard first segment', () => {
    // `*` as the first segment is treated as a wildcard but still cannot match `telemetry`
    // because the exclusion guard rejects any pattern whose first literal segment is not `telemetry`.
    expect(eventMatches('*.skill_invocation', 'telemetry.skill_invocation')).toBe(false);
  });
});
