import { describe, it, expect, vi } from 'vitest';
import {
  buildAttributionReport,
  heuristicTokenCounter,
  CLASS_TO_BUDGET_CATEGORY,
  type ContextSurfaceEntry,
  type TokenCounter,
} from '../../src/context/attribution';
import * as budgetModule from '../../src/context/budget';
import { estimateTokens } from '../../src/compaction/envelope';

function entry(
  id: string,
  contextClass: ContextSurfaceEntry['contextClass'],
  text: string
): ContextSurfaceEntry {
  return { id, label: id, contextClass, text };
}

describe('buildAttributionReport — classification', () => {
  it('aggregates tokens per class and ranks contributors', async () => {
    const entries: ContextSurfaceEntry[] = [
      entry('a', 'always-loaded', 'x'.repeat(400)), // 100 tok heuristic
      entry('b', 'always-loaded', 'x'.repeat(40)), // 10 tok
      entry('c', 'path-scoped', 'x'.repeat(200)), // 50 tok
      entry('d', 'invoked-only', 'x'.repeat(80)), // 20 tok
    ];

    const report = await buildAttributionReport(entries, { windowTokens: 100_000 });

    // Ranked descending by tokens.
    expect(report.contributors.map((c) => c.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(report.topContributors[0].id).toBe('a');

    const always = report.byClass.find((c) => c.contextClass === 'always-loaded')!;
    expect(always.count).toBe(2);
    expect(always.tokens).toBe(estimateTokens('x'.repeat(400)) + estimateTokens('x'.repeat(40)));

    const pathScoped = report.byClass.find((c) => c.contextClass === 'path-scoped')!;
    expect(pathScoped.tokens).toBe(estimateTokens('x'.repeat(200)));

    expect(report.totalTokens).toBe(report.byClass.reduce((sum, c) => sum + c.tokens, 0));
    expect(report.counterMode).toBe('heuristic');
  });

  it('reports all three classes even when some are empty', async () => {
    const report = await buildAttributionReport([entry('a', 'always-loaded', 'hello')], {
      windowTokens: 100_000,
    });
    expect(report.byClass.map((c) => c.contextClass)).toEqual([
      'always-loaded',
      'path-scoped',
      'invoked-only',
    ]);
  });
});

describe('buildAttributionReport — contextBudget() is the allocator', () => {
  it('invokes contextBudget() and derives over-budget flags from it', async () => {
    const spy = vi.spyOn(budgetModule, 'contextBudget');

    // 1000-token window → systemPrompt allocation is 15% = 150 tokens.
    // An always-loaded surface bigger than that must flag over-budget.
    const bigAlwaysLoaded = 'x'.repeat(4000); // 1000 tok heuristic >> 150
    const report = await buildAttributionReport([entry('big', 'always-loaded', bigAlwaysLoaded)], {
      windowTokens: 1000,
    });

    expect(spy).toHaveBeenCalledWith(1000, undefined, undefined);

    const always = report.byClass.find((c) => c.contextClass === 'always-loaded')!;
    expect(always.budgetTokens).toBe(report.budget[CLASS_TO_BUDGET_CATEGORY['always-loaded']]);
    expect(always.budgetTokens).toBe(150);
    expect(always.overBudget).toBe(true);

    spy.mockRestore();
  });

  it('does not flag a class that fits its contextBudget allocation', async () => {
    const report = await buildAttributionReport(
      [entry('tiny', 'always-loaded', 'x'.repeat(40))], // 10 tok
      { windowTokens: 100_000 } // systemPrompt = 15000
    );
    const always = report.byClass.find((c) => c.contextClass === 'always-loaded')!;
    expect(always.overBudget).toBe(false);
  });

  it('forwards budget overrides to contextBudget()', async () => {
    const spy = vi.spyOn(budgetModule, 'contextBudget');
    await buildAttributionReport([entry('a', 'always-loaded', 'hi')], {
      windowTokens: 1000,
      budgetOverrides: { systemPrompt: 0.5 },
    });
    expect(spy).toHaveBeenCalledWith(1000, { systemPrompt: 0.5 }, undefined);
    spy.mockRestore();
  });
});

describe('buildAttributionReport — graceful fallback path', () => {
  it('falls back to the heuristic when the exact counter throws, marking the entry degraded', async () => {
    const throwingCounter: TokenCounter = () => {
      throw new Error('offline / 401');
    };

    const report = await buildAttributionReport([entry('a', 'always-loaded', 'hello world')], {
      windowTokens: 100_000,
      counter: throwingCounter,
      exact: true,
    });

    expect(report.degraded).toBe(true);
    expect(report.counterMode).toBe('mixed');
    expect(report.contributors[0].degraded).toBe(true);
    expect(report.contributors[0].tokens).toBe(estimateTokens('hello world'));
  });

  it('reports exact mode when no entry degrades', async () => {
    const exactCounter: TokenCounter = () => 42;
    const report = await buildAttributionReport([entry('a', 'always-loaded', 'anything')], {
      windowTokens: 100_000,
      counter: exactCounter,
      exact: true,
    });
    expect(report.degraded).toBe(false);
    expect(report.counterMode).toBe('exact');
    expect(report.contributors[0].tokens).toBe(42);
  });

  it('falls back when the counter returns a non-finite / negative count', async () => {
    const badCounter: TokenCounter = () => Number.NaN;
    const report = await buildAttributionReport([entry('a', 'always-loaded', 'hello')], {
      windowTokens: 100_000,
      counter: badCounter,
      exact: true,
    });
    expect(report.contributors[0].degraded).toBe(true);
    expect(report.contributors[0].tokens).toBe(estimateTokens('hello'));
  });

  it('awaits async counters', async () => {
    const asyncCounter: TokenCounter = async (text) => text.length;
    const report = await buildAttributionReport([entry('a', 'always-loaded', 'abcde')], {
      windowTokens: 100_000,
      counter: asyncCounter,
      exact: true,
    });
    expect(report.contributors[0].tokens).toBe(5);
  });
});

describe('heuristicTokenCounter', () => {
  it('wraps estimateTokens (chars/4)', () => {
    expect(heuristicTokenCounter('x'.repeat(400))).toBe(estimateTokens('x'.repeat(400)));
  });
});
