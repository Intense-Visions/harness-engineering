import { describe, it, expect } from 'vitest';
import { EscalationState } from './escalation-state.js';

describe('EscalationState.floorFor (D10)', () => {
  it('returns "fast" for an unknown coherence unit', () => {
    const s = new EscalationState();
    expect(s.floorFor('unit-a')).toBe('fast');
    expect(s.floorFor(undefined)).toBe('fast');
  });
});
