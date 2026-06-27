import { describe, it, expect } from 'vitest';
import {
  isAllowedTransition,
  isTerminal,
  dependencyGuard,
  evidenceGuard,
} from '../../../src/state/event-sourcing/lane-machine';
import type { Lane } from '../../../src/state/event-sourcing/lane-machine';

const laneFrom =
  (lanes: Record<string, Lane>) =>
  (id: string): Lane | undefined =>
    lanes[id];

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

describe('dependencyGuard', () => {
  it('rejects entering in_progress while a dependency is not done', () => {
    const r = dependencyGuard('in_progress', ['a', 'b'], laneFrom({ a: 'done', b: 'in_review' }));
    expect(r.ok).toBe(false);
  });
  it('allows entering in_progress when all dependencies are done', () => {
    const r = dependencyGuard('in_progress', ['a', 'b'], laneFrom({ a: 'done', b: 'done' }));
    expect(r.ok).toBe(true);
  });
  it('allows entering in_progress with no dependencies', () => {
    const r = dependencyGuard('in_progress', [], laneFrom({}));
    expect(r.ok).toBe(true);
  });
  it('only applies to in_progress (claimed with unmet deps is allowed)', () => {
    const r = dependencyGuard('claimed', ['a'], laneFrom({ a: 'planned' }));
    expect(r.ok).toBe(true);
  });
});

describe('evidenceGuard', () => {
  it('rejects entering done without evidence', () => {
    expect(evidenceGuard('done', undefined).ok).toBe(false);
    expect(evidenceGuard('done', []).ok).toBe(false);
  });
  it('allows entering done with non-empty evidence', () => {
    expect(evidenceGuard('done', ['pr#1']).ok).toBe(true);
  });
  it('only requires evidence for done (in_review passes without it)', () => {
    expect(evidenceGuard('in_review', undefined).ok).toBe(true);
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
