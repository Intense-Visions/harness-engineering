import { describe, it, expect, vi } from 'vitest';
import { fanOutReview } from '../../src/review/fan-out';

// Dispatch-order probe: each domain agent is wrapped (behaviour unchanged) to
// record when it is invoked into a shared log. See the parallel-dispatch test.
const dispatchLog = vi.hoisted(() => [] as string[]);
vi.mock('../../src/review/agents/compliance-agent', async (orig) => {
  const m = await orig<typeof import('../../src/review/agents/compliance-agent')>();
  return {
    ...m,
    runComplianceAgent: (b: never) => (dispatchLog.push('compliance'), m.runComplianceAgent(b)),
  };
});
vi.mock('../../src/review/agents/bug-agent', async (orig) => {
  const m = await orig<typeof import('../../src/review/agents/bug-agent')>();
  return {
    ...m,
    runBugDetectionAgent: (b: never) => (dispatchLog.push('bug'), m.runBugDetectionAgent(b)),
  };
});
vi.mock('../../src/review/agents/security-agent', async (orig) => {
  const m = await orig<typeof import('../../src/review/agents/security-agent')>();
  return {
    ...m,
    runSecurityAgent: (b: never) => (dispatchLog.push('security'), m.runSecurityAgent(b)),
  };
});
vi.mock('../../src/review/agents/architecture-agent', async (orig) => {
  const m = await orig<typeof import('../../src/review/agents/architecture-agent')>();
  return {
    ...m,
    runArchitectureAgent: (b: never) => (
      dispatchLog.push('architecture'),
      m.runArchitectureAgent(b)
    ),
  };
});
import type { ContextBundle } from '../../src/review/types';

function makeBundles(): ContextBundle[] {
  const base = {
    changeType: 'feature' as const,
    changedFiles: [
      {
        path: 'src/service.ts',
        content: 'export function doWork() { return 42; }',
        reason: 'changed' as const,
        lines: 1,
      },
    ],
    contextFiles: [],
    commitHistory: [],
    diffLines: 10,
    contextLines: 0,
  };

  return [
    { ...base, domain: 'compliance' as const },
    { ...base, domain: 'bug' as const },
    { ...base, domain: 'security' as const },
    { ...base, domain: 'architecture' as const },
  ];
}

describe('fanOutReview()', () => {
  it('returns results for all 4 domains', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    const domains = results.map((r) => r.domain);
    expect(domains).toContain('compliance');
    expect(domains).toContain('bug');
    expect(domains).toContain('security');
    expect(domains).toContain('architecture');
  });

  it('returns AgentReviewResult[] with findings and durationMs', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      expect(Array.isArray(r.findings)).toBe(true);
      expect(typeof r.durationMs).toBe('number');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('all findings across results have correct domain', async () => {
    const results = await fanOutReview({ bundles: makeBundles() });
    for (const r of results) {
      for (const f of r.findings) {
        expect(f.domain).toBe(r.domain);
      }
    }
  });

  it('handles bundle with security-relevant code producing findings', async () => {
    const bundles = makeBundles();
    const secBundle = bundles.find((b) => b.domain === 'security')!;
    secBundle.changedFiles = [
      {
        path: 'src/danger.ts',
        content: 'const result = eval(input);',
        reason: 'changed',
        lines: 1,
      },
    ];
    const results = await fanOutReview({ bundles });
    const secResult = results.find((r) => r.domain === 'security')!;
    expect(secResult.findings.length).toBeGreaterThan(0);
    expect(secResult.findings[0]!.severity).toBe('critical');
  });

  // "Parallel" here means fan-out dispatches EVERY agent before awaiting ANY of
  // them (Promise.all over eagerly-started runs), so agents overlap once they do
  // async work. This used to be asserted as a wall-clock budget (elapsed < 500ms),
  // which says nothing about overlap and fails on a loaded runner (#2046).
  // Assert the dispatch order instead: a microtask queued before fan-out can only
  // run once fan-out first yields. If all four agents were started eagerly, all
  // four are logged before the tick; a sequential `for … await` loop would yield
  // after the first agent, interleaving the tick between dispatches.
  it('dispatches all agents before awaiting any (parallel, not sequential)', async () => {
    dispatchLog.length = 0;
    queueMicrotask(() => dispatchLog.push('tick'));
    const pending = fanOutReview({ bundles: makeBundles() });
    // Nothing is awaited yet: every agent must already have been dispatched.
    expect(dispatchLog).toEqual(['compliance', 'bug', 'security', 'architecture']);
    await pending;
    expect(dispatchLog).toEqual(['compliance', 'bug', 'security', 'architecture', 'tick']);
  });

  it('handles empty bundles array gracefully', async () => {
    const results = await fanOutReview({ bundles: [] });
    expect(results).toEqual([]);
  });

  it('handles partial bundles (not all 4 domains)', async () => {
    const bundles = makeBundles().slice(0, 2); // only compliance and bug
    const results = await fanOutReview({ bundles });
    expect(results.length).toBe(2);
  });
});
