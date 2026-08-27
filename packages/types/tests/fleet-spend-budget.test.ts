import { describe, expect, it } from 'vitest';

import {
  FLEET_SPEND_BUDGET_VERSION,
  SpendEnvelopeSchema,
  validateSpendEnvelope,
} from '../src/fleet-spend-budget';

describe('fleet-spend-budget shapes', () => {
  it('exposes a stable version', () => {
    expect(FLEET_SPEND_BUDGET_VERSION).toBe(1);
  });

  it('validateSpendEnvelope parses a well-formed envelope', () => {
    const env = validateSpendEnvelope({
      envelopeTokens: 1000,
      perFleet: { 'roadmap-fleet': 400 },
    });
    expect(env.envelopeTokens).toBe(1000);
    expect(env.perFleet?.['roadmap-fleet']).toBe(400);
  });

  it('validateSpendEnvelope accepts a bare global envelope (no perFleet)', () => {
    expect(validateSpendEnvelope({ envelopeTokens: 250 }).perFleet).toBeUndefined();
  });

  it('rejects a negative envelope', () => {
    expect(() => validateSpendEnvelope({ envelopeTokens: -1 })).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => validateSpendEnvelope({ envelopeTokens: 1, bogus: true })).toThrow();
  });

  it('SpendEnvelopeSchema is exported and usable directly', () => {
    expect(SpendEnvelopeSchema.safeParse({ envelopeTokens: 0 }).success).toBe(true);
  });
});
