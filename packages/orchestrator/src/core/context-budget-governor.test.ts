import { describe, it, expect } from 'vitest';
import { ContextBudgetExceededError } from '@harness-engineering/core';
import type { Issue, WorkflowConfig } from '@harness-engineering/types';
import { getDefaultConfig } from '../workflow/config';
import {
  estimateIssueContextTokens,
  assertIssueWithinContextBudget,
} from './context-budget-governor';

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-1',
    identifier: '#1524',
    title: 'Enforce a context-replay budget per fleet leaf',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...over,
  };
}

function configWithBudget(maxTokens?: number): WorkflowConfig {
  const config = getDefaultConfig();
  if (maxTokens !== undefined) {
    config.agent.contextBudget = { maxTokens };
  }
  return config;
}

describe('estimateIssueContextTokens', () => {
  it('is a deterministic chars/4 floor over title + description', () => {
    const est = estimateIssueContextTokens(
      issue({ title: 'a'.repeat(40), description: 'b'.repeat(40) })
    );
    expect(est).toBe(20); // 80 chars / 4
  });

  it('handles a null description', () => {
    expect(estimateIssueContextTokens(issue({ title: 'x'.repeat(8), description: null }))).toBe(2);
  });
});

describe('assertIssueWithinContextBudget (live enforcement caller)', () => {
  it('is a no-op when no budget is configured (byte-identical default)', () => {
    const config = configWithBudget(undefined);
    expect(() =>
      assertIssueWithinContextBudget(config, issue({ description: 'x'.repeat(1_000_000) }))
    ).not.toThrow();
  });

  it('is a no-op when maxTokens is not positive', () => {
    const config = configWithBudget(0);
    expect(() =>
      assertIssueWithinContextBudget(config, issue({ description: 'x'.repeat(1_000_000) }))
    ).not.toThrow();
  });

  it('passes an under-budget leaf', () => {
    const config = configWithBudget(1_000);
    expect(() =>
      assertIssueWithinContextBudget(config, issue({ description: 'x'.repeat(40) }))
    ).not.toThrow();
  });

  it('FAILS LOUD (throws ContextBudgetExceededError) when the estimate exceeds the budget', () => {
    const config = configWithBudget(10);
    let caught: unknown;
    try {
      assertIssueWithinContextBudget(config, issue({ description: 'x'.repeat(1_000) }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ContextBudgetExceededError);
    const err = caught as ContextBudgetExceededError;
    expect(err.verdict.item).toBe('#1524');
    expect(err.verdict.budgetTokens).toBe(10);
    expect(err.message).toContain('rejected at dispatch');
  });
});
