import { describe, it, expect } from 'vitest';
import { contextBudget } from '../../src/context/budget';

describe('contextBudget', () => {
  it('returns default budget allocation for 100k tokens', () => {
    const budget = contextBudget(100000);

    expect(budget.total).toBe(100000);
    expect(budget.systemPrompt).toBe(15000);
    expect(budget.projectManifest).toBe(5000);
    expect(budget.taskSpec).toBe(20000);
    expect(budget.activeCode).toBe(40000);
    expect(budget.interfaces).toBe(10000);
    expect(budget.reserve).toBe(10000);
  });

  it('all categories sum to approximately total', () => {
    const budget = contextBudget(100000);
    const sum =
      budget.systemPrompt +
      budget.projectManifest +
      budget.taskSpec +
      budget.activeCode +
      budget.interfaces +
      budget.reserve;
    // Floor rounding may lose a few tokens
    expect(sum).toBeLessThanOrEqual(budget.total);
    expect(sum).toBeGreaterThan(budget.total - 10);
  });

  it('accepts overrides and redistributes remaining budget', () => {
    const budget = contextBudget(100000, { activeCode: 0.6 });

    expect(budget.activeCode).toBe(60000);
    // Other categories should be proportionally reduced
    expect(budget.total).toBe(100000);
    // Remaining 40% distributed among 5 categories
    const nonActive =
      budget.systemPrompt +
      budget.projectManifest +
      budget.taskSpec +
      budget.interfaces +
      budget.reserve;
    expect(nonActive).toBeLessThanOrEqual(40000);
    expect(nonActive).toBeGreaterThan(39990);
  });

  it('handles small token counts', () => {
    const budget = contextBudget(1000);
    expect(budget.total).toBe(1000);
    expect(budget.activeCode).toBe(400);
  });

  it('handles zero tokens', () => {
    const budget = contextBudget(0);
    expect(budget.total).toBe(0);
    expect(budget.activeCode).toBe(0);
  });
});
