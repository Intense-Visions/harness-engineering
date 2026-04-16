import { describe, it, expect } from 'vitest';
import { detectScopeTier, routeIssue } from '../../src/core/model-router';
import type { Issue, EscalationConfig, ConcernSignal } from '@harness-engineering/types';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'TEST-1',
    title: 'Test issue',
    description: null,
    priority: null,
    state: 'Todo',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

const defaultConfig: EscalationConfig = {
  alwaysHuman: ['full-exploration'],
  autoExecute: ['quick-fix', 'diagnostic'],
  primaryExecute: [],
  signalGated: ['guided-change'],
  diagnosticRetryBudget: 1,
};

describe('detectScopeTier', () => {
  it('returns full-exploration when no spec and no plan exist', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: false, hasPlans: false });
    expect(tier).toBe('full-exploration');
  });

  it('returns guided-change when spec exists but no plan', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: true, hasPlans: false });
    expect(tier).toBe('guided-change');
  });

  it('returns guided-change when plan exists', () => {
    const tier = detectScopeTier(makeIssue(), { hasSpec: false, hasPlans: true });
    expect(tier).toBe('guided-change');
  });

  it('returns quick-fix when label override is present', () => {
    const issue = makeIssue({ labels: ['scope:quick-fix'] });
    const tier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
    expect(tier).toBe('quick-fix');
  });

  it('returns diagnostic when label override is present', () => {
    const issue = makeIssue({ labels: ['scope:diagnostic'] });
    const tier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
    expect(tier).toBe('diagnostic');
  });

  it('label override takes precedence over artifact detection', () => {
    const issue = makeIssue({ labels: ['scope:quick-fix'] });
    const tier = detectScopeTier(issue, { hasSpec: true, hasPlans: true });
    expect(tier).toBe('quick-fix');
  });

  it('returns full-exploration for explicit label override', () => {
    const issue = makeIssue({ labels: ['scope:full-exploration'] });
    const tier = detectScopeTier(issue, { hasSpec: true, hasPlans: true });
    expect(tier).toBe('full-exploration');
  });
});

describe('routeIssue', () => {
  it('returns needs-human for full-exploration (SC3)', () => {
    const result = routeIssue('full-exploration', [], defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toContain('full-exploration tier always requires human');
    }
  });

  it('returns dispatch-local for quick-fix (SC2)', () => {
    const result = routeIssue('quick-fix', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns dispatch-local for diagnostic with no signals (SC2)', () => {
    const result = routeIssue('diagnostic', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns dispatch-local for guided-change with no concern signals', () => {
    const result = routeIssue('guided-change', [], defaultConfig);
    expect(result.action).toBe('dispatch-local');
  });

  it('returns needs-human for guided-change with concern signals (SC4)', () => {
    const signals: ConcernSignal[] = [
      { name: 'highComplexity', reason: 'Issue touches 12 files across 4 packages' },
    ];
    const result = routeIssue('guided-change', signals, defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toContain('highComplexity: Issue touches 12 files across 4 packages');
    }
  });

  it('returns needs-human for guided-change with multiple concern signals', () => {
    const signals: ConcernSignal[] = [
      { name: 'highComplexity', reason: 'Many files' },
      { name: 'securitySensitive', reason: 'Auth changes' },
    ];
    const result = routeIssue('guided-change', signals, defaultConfig);
    expect(result.action).toBe('needs-human');
    if (result.action === 'needs-human') {
      expect(result.reasons).toHaveLength(2);
    }
  });

  it('respects custom alwaysHuman config', () => {
    const customConfig: EscalationConfig = {
      ...defaultConfig,
      alwaysHuman: ['full-exploration', 'diagnostic'],
      autoExecute: ['quick-fix'],
    };
    const result = routeIssue('diagnostic', [], customConfig);
    expect(result.action).toBe('needs-human');
  });

  it('returns dispatch-primary for guided-change when in primaryExecute', () => {
    const config: EscalationConfig = {
      ...defaultConfig,
      primaryExecute: ['guided-change'],
      signalGated: [],
    };
    const result = routeIssue('guided-change', [], config);
    expect(result.action).toBe('dispatch-primary');
  });

  it('primaryExecute takes precedence over autoExecute for same tier', () => {
    const config: EscalationConfig = {
      ...defaultConfig,
      primaryExecute: ['quick-fix'],
      autoExecute: ['quick-fix'],
    };
    const result = routeIssue('quick-fix', [], config);
    expect(result.action).toBe('dispatch-primary');
  });

  it('alwaysHuman takes precedence over primaryExecute', () => {
    const config: EscalationConfig = {
      ...defaultConfig,
      alwaysHuman: ['guided-change'],
      primaryExecute: ['guided-change'],
    };
    const result = routeIssue('guided-change', [], config);
    expect(result.action).toBe('needs-human');
  });

  it('returns dispatch-local for scope tier not in any config list', () => {
    const emptyConfig: EscalationConfig = {
      alwaysHuman: [],
      autoExecute: [],
      primaryExecute: [],
      signalGated: [],
      diagnosticRetryBudget: 1,
    };
    // When a tier is not in any list, default to dispatch-local
    const result = routeIssue('quick-fix', [], emptyConfig);
    expect(result.action).toBe('dispatch-local');
  });
});
