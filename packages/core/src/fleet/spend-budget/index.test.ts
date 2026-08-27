import type { SpendEnvelope } from '@harness-engineering/types';
import { describe, expect, it } from 'vitest';

import {
  evaluateSpendEnvelope,
  isFleetAllocationExhausted,
  isGlobalEnvelopeExhausted,
} from './index';

describe('isGlobalEnvelopeExhausted', () => {
  it('is false under the envelope', () => {
    expect(isGlobalEnvelopeExhausted(999, 1000)).toBe(false);
  });

  it('is true at the boundary (>= semantics, matching #1525)', () => {
    expect(isGlobalEnvelopeExhausted(1000, 1000)).toBe(true);
  });

  it('is true over the envelope', () => {
    expect(isGlobalEnvelopeExhausted(1001, 1000)).toBe(true);
  });
});

describe('isFleetAllocationExhausted', () => {
  it('never exhausts an unallocated fleet', () => {
    expect(isFleetAllocationExhausted(1e9, undefined)).toBe(false);
  });

  it('exhausts at/over the sub-allocation', () => {
    expect(isFleetAllocationExhausted(500, 500)).toBe(true);
    expect(isFleetAllocationExhausted(499, 500)).toBe(false);
  });
});

describe('evaluateSpendEnvelope', () => {
  const envelope: SpendEnvelope = {
    envelopeTokens: 1000,
    perFleet: { 'roadmap-fleet': 400 },
  };

  it('is a no-op (unconfigured) when no envelope is supplied', () => {
    const v = evaluateSpendEnvelope({ global: 999_999 }, undefined, 'roadmap-fleet');
    expect(v.status).toBe('unconfigured');
  });

  it('reports within under the global envelope', () => {
    const v = evaluateSpendEnvelope({ global: 600 }, envelope);
    expect(v.status).toBe('within');
    if (v.status === 'within') {
      expect(v.remainingTokens).toBe(400);
    }
  });

  it('reports exhausted (global) at/over the global envelope', () => {
    const v = evaluateSpendEnvelope({ global: 1000 }, envelope);
    expect(v.status).toBe('exhausted');
    if (v.status === 'exhausted') {
      expect(v.scope).toBe('global');
      expect(v.fleet).toBeNull();
      expect(v.reason).toMatch(/envelope exhausted/i);
    }
  });

  it('reports exhausted (fleet) when a sub-allocation is spent while global has room', () => {
    const v = evaluateSpendEnvelope(
      { global: 500, perFleet: { 'roadmap-fleet': 400 } },
      envelope,
      'roadmap-fleet'
    );
    expect(v.status).toBe('exhausted');
    if (v.status === 'exhausted') {
      expect(v.scope).toBe('fleet');
      expect(v.fleet).toBe('roadmap-fleet');
    }
  });

  it('fleet within its split but global exhausted → global stop wins', () => {
    const v = evaluateSpendEnvelope(
      { global: 1000, perFleet: { 'roadmap-fleet': 100 } },
      envelope,
      'roadmap-fleet'
    );
    expect(v.status).toBe('exhausted');
    if (v.status === 'exhausted') {
      expect(v.scope).toBe('global');
    }
  });
});
