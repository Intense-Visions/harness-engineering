import { describe, it, expect } from 'vitest';
import { isAllowedTransition, isTerminal } from '../../../src/state/event-sourcing/lane-machine';

describe('transition table', () => {
  it('allows the happy-path forward edges', () => {
    expect(isAllowedTransition('planned', 'claimed')).toBe(true);
    expect(isAllowedTransition('claimed', 'in_progress')).toBe(true);
    expect(isAllowedTransition('in_progress', 'in_review')).toBe(true);
    expect(isAllowedTransition('in_review', 'done')).toBe(true);
  });
  it('allows rework from in_review back to in_progress', () => {
    expect(isAllowedTransition('in_review', 'in_progress')).toBe(true);
  });
  it('allows any non-terminal lane to blocked and canceled', () => {
    for (const from of ['planned', 'claimed', 'in_progress', 'in_review'] as const) {
      expect(isAllowedTransition(from, 'blocked')).toBe(true);
      expect(isAllowedTransition(from, 'canceled')).toBe(true);
    }
  });
  it('allows blocked to return to any non-terminal lane (but not a terminal one without force)', () => {
    expect(isAllowedTransition('blocked', 'in_progress')).toBe(true);
    expect(isAllowedTransition('blocked', 'claimed')).toBe(true);
    expect(isAllowedTransition('blocked', 'in_review')).toBe(true);
    // canceled/done are terminal — unreachable from the table (force-only).
    expect(isAllowedTransition('blocked', 'canceled')).toBe(false);
    expect(isAllowedTransition('blocked', 'done')).toBe(false);
  });
  it('rejects an off-table transition (planned to done)', () => {
    expect(isAllowedTransition('planned', 'done')).toBe(false);
  });
  it('rejects any transition out of a terminal lane', () => {
    expect(isAllowedTransition('done', 'in_progress')).toBe(false);
    expect(isAllowedTransition('canceled', 'claimed')).toBe(false);
  });
});

describe('isTerminal', () => {
  it('treats done and canceled as terminal', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('canceled')).toBe(true);
  });
  it('treats in_review and others as non-terminal', () => {
    expect(isTerminal('in_review')).toBe(false);
    expect(isTerminal('planned')).toBe(false);
    expect(isTerminal('blocked')).toBe(false);
  });
});
