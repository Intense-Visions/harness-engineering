import { describe, it, expect } from 'vitest';
import { EscalationState } from './escalation-state.js';

describe('EscalationState.floorFor (D10)', () => {
  it('returns "fast" for an unknown coherence unit', () => {
    const s = new EscalationState();
    expect(s.floorFor('unit-a')).toBe('fast');
    expect(s.floorFor(undefined)).toBe('fast');
  });
});

describe('EscalationState.recordOutcome climb (SC16)', () => {
  it('raises floor one step after threshold consecutive quality failures', () => {
    const s = new EscalationState(2);
    s.recordOutcome('u', 'fast', false);
    expect(s.floorFor('u')).toBe('fast'); // below threshold
    s.recordOutcome('u', 'fast', false);
    expect(s.floorFor('u')).toBe('standard'); // bumped, count reset
  });
  it('caps at strong and reports exhaustion', () => {
    const s = new EscalationState(1);
    s.recordOutcome('u', 'fast', false);
    expect(s.floorFor('u')).toBe('standard');
    s.recordOutcome('u', 'standard', false);
    expect(s.floorFor('u')).toBe('strong');
    expect(s.recordOutcome('u', 'strong', false)).toBe('exhausted');
    expect(s.floorFor('u')).toBe('strong'); // never above strong
  });
});
