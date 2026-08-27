import { describe, it, expect } from 'vitest';
import type { AgentBudgetConfig, Issue } from '@harness-engineering/types';
import {
  createBudgetState,
  recordBudgetSpend,
  canAffordDispatch,
  getBudgetStatus,
  fleetKeyForIssue,
  periodLengthMs,
  rollBudgetPeriod,
} from '../../src/core/budget-governor';

const T0 = 1_700_000_000_000; // fixed epoch anchor

function makeIssue(labels: string[]): Issue {
  return {
    id: 'i',
    identifier: 'I-1',
    title: 't',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels,
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
  };
}

const dayBudget: AgentBudgetConfig = { period: 'day', envelopeTokens: 1000 };

describe('budget-governor: global envelope', () => {
  it('affords dispatch while spend is below the envelope', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, dayBudget, null, 400, T0);
    expect(canAffordDispatch(s, dayBudget, null, T0)).toBe(true);
  });

  it('refuses a NEW dispatch once spend reaches the envelope', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, dayBudget, null, 1000, T0);
    expect(canAffordDispatch(s, dayBudget, null, T0)).toBe(false);
  });

  it('treats an exact overshoot as exhausted (>=, not >)', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, dayBudget, null, 999, T0);
    expect(canAffordDispatch(s, dayBudget, null, T0)).toBe(true);
    s = recordBudgetSpend(s, dayBudget, null, 1, T0);
    expect(canAffordDispatch(s, dayBudget, null, T0)).toBe(false);
  });

  it('ignores non-positive spend', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, dayBudget, null, 0, T0);
    s = recordBudgetSpend(s, dayBudget, null, -50, T0);
    expect(s.spentTokens).toBe(0);
  });

  it('does not mutate the input state (immutable record)', () => {
    const s = createBudgetState(T0);
    const next = recordBudgetSpend(s, dayBudget, null, 100, T0);
    expect(s.spentTokens).toBe(0);
    expect(next.spentTokens).toBe(100);
  });
});

describe('budget-governor: period roll', () => {
  it('resets spend when the window has fully elapsed', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, dayBudget, null, 1000, T0);
    expect(canAffordDispatch(s, dayBudget, null, T0)).toBe(false);

    const afterWindow = T0 + periodLengthMs('day');
    // Read path reports the elapsed window as fully remaining...
    expect(canAffordDispatch(s, dayBudget, null, afterWindow)).toBe(true);
    // ...and the next spend rolls into a fresh window.
    const rolled = recordBudgetSpend(s, dayBudget, null, 200, afterWindow);
    expect(rolled.spentTokens).toBe(200);
    expect(rolled.periodStartMs).toBe(afterWindow);
  });

  it('rollBudgetPeriod returns the same ref when the window has not elapsed', () => {
    const s = createBudgetState(T0);
    expect(rollBudgetPeriod(s, dayBudget, T0 + 1000)).toBe(s);
  });

  it('week period uses a 7-day window', () => {
    expect(periodLengthMs('week')).toBe(7 * periodLengthMs('day'));
  });
});

describe('budget-governor: per-fleet sub-allocation', () => {
  const perFleet: AgentBudgetConfig = {
    period: 'day',
    envelopeTokens: 10_000,
    perFleet: { roadmap: 600, bug: 400 },
  };

  it('refuses a fleet whose sub-allocation is spent even when the global envelope has room', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, perFleet, 'roadmap', 600, T0);
    // Global still has 9,400 left, but roadmap's 600 is spent.
    expect(canAffordDispatch(s, perFleet, 'roadmap', T0)).toBe(false);
    // A different fleet under the same global envelope still dispatches.
    expect(canAffordDispatch(s, perFleet, 'bug', T0)).toBe(true);
  });

  it('two fleets sharing an envelope respect their split under contention', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, perFleet, 'roadmap', 600, T0);
    s = recordBudgetSpend(s, perFleet, 'bug', 400, T0);
    expect(canAffordDispatch(s, perFleet, 'roadmap', T0)).toBe(false);
    expect(canAffordDispatch(s, perFleet, 'bug', T0)).toBe(false);
    // An unlabelled lane is still bounded only by the (unspent) global envelope.
    expect(canAffordDispatch(s, perFleet, null, T0)).toBe(true);
  });

  it('a fleet with no configured sub-allocation is bounded only by the global envelope', () => {
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, perFleet, 'unlisted', 5000, T0);
    expect(canAffordDispatch(s, perFleet, 'unlisted', T0)).toBe(true);
  });
});

describe('budget-governor: fleetKeyForIssue', () => {
  it('extracts the fleet key from the default fleet: label prefix', () => {
    expect(fleetKeyForIssue(makeIssue(['fleet:roadmap', 'p1']), dayBudget)).toBe('roadmap');
  });

  it('returns null when no fleet label is present', () => {
    expect(fleetKeyForIssue(makeIssue(['p1', 'bug']), dayBudget)).toBeNull();
  });

  it('honours a custom fleetLabelPrefix', () => {
    const cfg: AgentBudgetConfig = { ...dayBudget, fleetLabelPrefix: 'family/' };
    expect(fleetKeyForIssue(makeIssue(['family/security']), cfg)).toBe('security');
  });
});

describe('budget-governor: remaining-budget signal', () => {
  it('reports remaining, spent, and per-fleet slices', () => {
    const cfg: AgentBudgetConfig = {
      period: 'week',
      envelopeTokens: 10_000,
      perFleet: { roadmap: 600 },
    };
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, cfg, 'roadmap', 250, T0);

    const status = getBudgetStatus(s, cfg, T0);
    expect(status.period).toBe('week');
    expect(status.envelopeTokens).toBe(10_000);
    expect(status.spentTokens).toBe(250);
    expect(status.remainingTokens).toBe(9_750);
    expect(status.exhausted).toBe(false);
    expect(status.periodEndMs - status.periodStartMs).toBe(periodLengthMs('week'));

    const roadmap = status.perFleet.find((f) => f.fleet === 'roadmap');
    expect(roadmap).toMatchObject({
      allocatedTokens: 600,
      spentTokens: 250,
      remainingTokens: 350,
      exhausted: false,
    });
  });

  it('reports an elapsed window as a fresh, fully-remaining period', () => {
    const cfg: AgentBudgetConfig = { period: 'day', envelopeTokens: 1000 };
    let s = createBudgetState(T0);
    s = recordBudgetSpend(s, cfg, null, 1000, T0);
    const after = T0 + periodLengthMs('day') + 1;
    const status = getBudgetStatus(s, cfg, after);
    expect(status.spentTokens).toBe(0);
    expect(status.remainingTokens).toBe(1000);
    expect(status.exhausted).toBe(false);
  });
});
