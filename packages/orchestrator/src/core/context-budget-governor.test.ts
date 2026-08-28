import { describe, it, expect } from 'vitest';
import {
  ContextBudgetExceededError,
  renderServedUnit,
  computeSourceHash,
  type ComprehensionUnit,
  type ComprehensionSourceFile,
} from '@harness-engineering/core';
import type { Issue, LeafContextSource, WorkflowConfig } from '@harness-engineering/types';
import { getDefaultConfig } from '../workflow/config';
import {
  estimateIssueContextTokens,
  assertIssueWithinContextBudget,
  buildLeafContextEstimate,
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

// --- SF5.1: served-comprehension token attribution (#1524) -------------------

function src(label: string, tokens: number): LeafContextSource {
  return { label, tokens };
}

describe('buildLeafContextEstimate — SF5.1 served-unit attribution (#1524)', () => {
  it('names the served units in sources and attributes their tokens', () => {
    const est = buildLeafContextEstimate(issue({ title: 'x'.repeat(40) }), [
      src('packages/core/src', 100),
      src('packages/cli/src', 50),
    ]);
    expect(est.item).toBe('#1524');
    expect(est.sources.map((s) => s.label)).toEqual(['packages/core/src', 'packages/cli/src']);
    // floor (40 chars / 4 = 10) + served (150) = 160
    expect(est.estimatedTokens).toBe(160);
  });

  it('a served (compact) estimate is LOWER than the raw-source equivalent — token counts DERIVED from a real unit + its raw source', () => {
    // FIX B (de-tautologize): instead of comparing two hand-picked constants
    // through the same adder (which only proves monotonic addition), derive the
    // served count from an ACTUAL `renderServedUnit` output and the raw count from
    // the ACTUAL raw source the unit summarizes. This asserts the REAL compaction
    // property that underpins SC1: a served unit is cheaper than its raw source.
    const module = 'packages/core/src';
    // A verbose raw source: several files with long bodies (what a leaf would load
    // WITHOUT comprehension).
    const rawSource: ComprehensionSourceFile[] = [
      {
        path: 'a.ts',
        content:
          'export function alpha(input: string): string {\n' +
          '  // '.repeat(1) +
          'x'.repeat(1200) +
          '\n  return input;\n}\n',
      },
      {
        path: 'b.ts',
        content: 'export class Beta {\n' + '  method() {\n    ' + 'y'.repeat(1200) + '\n  }\n}\n',
      },
    ];
    // The compiled unit: a compact interface contract + dependency slice (what the
    // leaf loads WITH comprehension) — no verbose bodies.
    const unit: ComprehensionUnit = {
      provenance: {
        schemaVersion: 1,
        module,
        sourceHash: computeSourceHash(rawSource),
        compiledAt: '2026-08-27T00:00:00.000Z',
        compiler: { static: '1.0.0', semantic: '1.0.0' },
        model: null,
        semantic: 'absent',
        members: rawSource.map((f) => f.path),
      },
      summary: '',
      invariants: [],
      interfaceContract: 'export function alpha(input: string): string;\nexport class Beta;',
      dependencySlice: 'a.ts, b.ts',
    };

    const CHARS_PER_TOKEN = 4;
    const servedTokens = Math.ceil(renderServedUnit(unit).length / CHARS_PER_TOKEN);
    const rawTokens = Math.ceil(
      rawSource.reduce((n, f) => n + f.content.length, 0) / CHARS_PER_TOKEN
    );

    // The load-bearing real property: the served unit is genuinely smaller than
    // the raw source it stands in for (not two arbitrary constants).
    expect(servedTokens).toBeLessThan(rawTokens);

    const leaf = issue({ title: 'x'.repeat(40) });
    const served = buildLeafContextEstimate(leaf, [src(module, servedTokens)]);
    const raw = buildLeafContextEstimate(leaf, [src(module, rawTokens)]);
    expect(served.estimatedTokens).toBeLessThan(raw.estimatedTokens);
  });

  it('with NO served units is byte-identical to the title+description floor', () => {
    const leaf = issue({ title: 'a'.repeat(40), description: 'b'.repeat(40) });
    const est = buildLeafContextEstimate(leaf, []);
    expect(est.estimatedTokens).toBe(estimateIssueContextTokens(leaf));
    expect(est.sources).toEqual([]);
  });
});

// --- SF5.2: the dispatch consult uses the comprehension-lowered estimate ------

describe('assertIssueWithinContextBudget — SF5.2 threads the enriched estimate', () => {
  it('a leaf OVER budget on raw source is WITHIN budget once served units are attributed', () => {
    const config = configWithBudget(200); // floor(10) + served(120) = 130 <= 200
    const leaf = issue({ title: 'x'.repeat(40) });
    // Raw-source load for the same module would blow the budget…
    const rawSources = [src('packages/core/src', 4000)];
    expect(() => assertIssueWithinContextBudget(config, leaf, { sources: rawSources })).toThrow(
      ContextBudgetExceededError
    );
    // …but the served (compact) attribution keeps it within budget (no throw).
    const servedSources = [src('packages/core/src', 120)];
    expect(() =>
      assertIssueWithinContextBudget(config, leaf, { sources: servedSources })
    ).not.toThrow();
  });

  it('names the served units in topSources on an overage', () => {
    const config = configWithBudget(50);
    const leaf = issue({ title: 'x'.repeat(40) });
    let caught: ContextBudgetExceededError | undefined;
    try {
      assertIssueWithinContextBudget(config, leaf, {
        sources: [src('packages/core/src', 500), src('packages/cli/src', 10)],
      });
    } catch (e) {
      caught = e as ContextBudgetExceededError;
    }
    expect(caught).toBeInstanceOf(ContextBudgetExceededError);
    expect(caught!.verdict.topSources.map((s) => s.label)).toContain('packages/core/src');
  });

  it('is byte-identical to the floor-only behavior when no prewarm is supplied', () => {
    const config = configWithBudget(5); // floor for 40-char title = 10 > 5 ⇒ throws
    const leaf = issue({ title: 'x'.repeat(40) });
    expect(() => assertIssueWithinContextBudget(config, leaf)).toThrow(ContextBudgetExceededError);
  });

  it('is still a no-op when no budget is configured, even with served sources', () => {
    const config = configWithBudget(undefined);
    const leaf = issue({ title: 'x'.repeat(40) });
    expect(() =>
      assertIssueWithinContextBudget(config, leaf, { sources: [src('m', 1_000_000)] })
    ).not.toThrow();
  });
});
