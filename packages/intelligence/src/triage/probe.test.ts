// packages/intelligence/src/triage/probe.test.ts
//
// Roadmap Auto-Triage — Phase 1, Task 2 (TDD): the scoping-probe corroboration spec.
//
// SC1–SC6 against a stubbed AnalysisProvider, a stubbed GraphScope, and an ABSENT
// PrecedentLookup. These pin the corroboration gate + the fail-safe-to-human contract
// BEFORE probe.ts exists. The probe is pure and provider-injected: no live model, no
// GraphStore, no IO.

import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import type { AnalysisProvider, AnalysisResponse } from '../analysis-provider/interface.js';
import type { GraphScope, ProbeInput, ResolvedEntity } from './types.js';
import { runScopingProbe, type ProbeDeps } from './probe.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/**
 * A GraphScope stub that resolves a fixed allow-list of candidates and returns `null`
 * for everything else (the over-generated noise from extractEntities). Each resolved
 * candidate gets a caller-chosen blast radius.
 */
function stubGraph(
  resolutions: Record<string, { nodeId: string; blastRadius: number }>
): GraphScope {
  return {
    resolve(candidate: string): ResolvedEntity | null {
      const hit = resolutions[candidate];
      if (!hit) return null;
      return { candidate, nodeId: hit.nodeId, blastRadius: hit.blastRadius };
    },
  };
}

/** A GraphScope stub that always throws — to exercise the lever-degrade path (SC5). */
const throwingGraph: GraphScope = {
  resolve() {
    throw new Error('graph exploded');
  },
};

/**
 * An AnalysisProvider stub. The probe issues TWO kinds of analyze() calls — the
 * complexity tie-break (level/confidence) and the open-decisions self-assessment
 * ({ openDecisions: [...] }). We discriminate by whether the parsed schema accepts
 * an object with `openDecisions`, returning the caller-configured payload for each.
 */
function stubProvider(opts: {
  level?: 'trivial' | 'simple' | 'moderate' | 'complex';
  confidence?: 'high' | 'medium' | 'low';
  openDecisions?: { question: string }[];
  throwOnDecisions?: boolean;
}): AnalysisProvider {
  return {
    async analyze<T>(request: {
      prompt: string;
      responseSchema: z.ZodType;
    }): Promise<AnalysisResponse<T>> {
      const complexityPayload = {
        level: opts.level ?? 'simple',
        confidence: opts.confidence ?? 'medium',
      };
      const decisionsPayload = { openDecisions: opts.openDecisions ?? [] };

      // Try the complexity shape first; fall through to the open-decisions shape.
      const asComplexity = request.responseSchema.safeParse(complexityPayload);
      if (asComplexity.success) {
        return {
          result: asComplexity.data as T,
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          model: 'stub',
          latencyMs: 0,
        };
      }
      if (opts.throwOnDecisions) throw new Error('decisions call failed');
      const asDecisions = request.responseSchema.parse(decisionsPayload);
      return {
        result: asDecisions as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'stub',
        latencyMs: 0,
      };
    },
  };
}

function inputFor(overrides: Partial<ProbeInput> = {}): ProbeInput {
  return {
    externalId: 'ISS-1',
    taskText: {
      descriptionLength: 40,
      specExists: false,
      acceptanceMeasurable: false,
      prompt: 'Rename BackendRouter method',
    },
    entityCandidates: ['BackendRouter'],
    labels: ['refactor'],
    ...overrides,
  };
}

// A default deps bundle: a bounded, resolving graph + a trivial/medium provider,
// no precedent. This is the "everything corroborates" happy path.
function happyDeps(): ProbeDeps {
  return {
    provider: stubProvider({ level: 'trivial', confidence: 'medium', openDecisions: [] }),
    graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 3 } }),
    config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
  };
}

// ---------------------------------------------------------------------------
// SC1 — shape: N items → N verdicts, each with the full lever bundle.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC1 verdict shape', () => {
  it('emits a verdict carrying level, confidence, dispatchable, levers, rationale', async () => {
    const v = await runScopingProbe(inputFor(), happyDeps());
    expect(v.externalId).toBe('ISS-1');
    expect(v.verdict.level).toBeDefined();
    expect(v.verdict.confidence).toBeDefined();
    expect(typeof v.dispatchable).toBe('boolean');
    expect(v.levers.scope).toBeDefined();
    expect(v.levers.semanticRead).toBeDefined();
    expect(v.levers.openDecisions).toBeDefined();
    expect(v.levers.precedent).toBeDefined();
    expect(typeof v.rationale).toBe('string');
    expect(v.rationale.length).toBeGreaterThan(0);
  });

  it('dispatchable is TRUE when every lever corroborates (bounded scope, trivial/medium, no decision, no precedent block)', async () => {
    const v = await runScopingProbe(inputFor(), happyDeps());
    expect(v.dispatchable).toBe(true);
    expect(v.holdReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SC2 — scope lever: entities resolve → real estimate; none resolve → unresolved-scope.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC2 scope lever', () => {
  it('entities that RESOLVE produce a real blast-radius estimate in levers.scope', async () => {
    const v = await runScopingProbe(inputFor(), happyDeps());
    expect(v.levers.scope.value).not.toBe('unknown');
    const scope = v.levers.scope.value;
    if (scope === 'unknown') throw new Error('expected resolved scope');
    expect(scope.resolved.length).toBe(1);
    expect(scope.resolved[0]?.nodeId).toBe('class:BackendRouter');
    expect(scope.blastRadius).toBe(3);
  });

  it('over-generated candidates that do NOT resolve are excluded — a non-empty extraction is not "scope resolved"', async () => {
    // extractEntities emits noise like `e.g`; only BackendRouter resolves here.
    const input = inputFor({ entityCandidates: ['BackendRouter', 'e.g', 'i.e', 'foo.bar'] });
    const v = await runScopingProbe(input, happyDeps());
    const scope = v.levers.scope.value;
    if (scope === 'unknown') throw new Error('expected resolved scope');
    expect(scope.resolved.map((r) => r.candidate)).toEqual(['BackendRouter']);
  });

  it('when NO candidate resolves → dispatchable:false with holdReason unresolved-scope', async () => {
    const input = inputFor({ entityCandidates: ['e.g', 'i.e', 'somethingVague'] });
    // Graph resolves nothing.
    const deps: ProbeDeps = { ...happyDeps(), graph: stubGraph({}) };
    const v = await runScopingProbe(input, deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('unresolved-scope');
  });

  it('when the extractor emitted candidates but none resolve, that is still unresolved-scope (not scope-by-count)', async () => {
    const input = inputFor({ entityCandidates: ['e.g', 'i.e'] });
    const v = await runScopingProbe(input, { ...happyDeps(), graph: stubGraph({}) });
    expect(v.holdReason).toBe('unresolved-scope');
    const scope = v.levers.scope.value;
    if (scope === 'unknown') throw new Error('expected a (empty) resolved scope, not unknown');
    expect(scope.resolved.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SC3 — open-decisions lever: any open decision → not dispatchable, regardless of level.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC3 open-decisions lever', () => {
  it('an open decision forces dispatchable:false with holdReason open-decision, even at trivial', async () => {
    const deps: ProbeDeps = {
      provider: stubProvider({
        level: 'trivial',
        confidence: 'medium',
        openDecisions: [{ question: 'Which auth scheme — OAuth or SAML?' }],
      }),
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 2 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('open-decision');
    expect(v.levers.openDecisions.value).not.toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// SC4 — precedent lever: absent lookup → unknown; verdict still resolves.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC4 precedent cold-start', () => {
  it('with no PrecedentLookup, levers.precedent is unknown and the verdict still resolves (never blocks on emptiness)', async () => {
    const v = await runScopingProbe(inputFor(), happyDeps()); // no `precedent` in deps
    expect(v.levers.precedent.value).toBe('unknown');
    // Absent precedent must NOT block an otherwise-corroborated item.
    expect(v.dispatchable).toBe(true);
  });

  it('a precedent lookup returning a CONTRADICTING rate holds the item (precedent-contradicts)', async () => {
    const deps: ProbeDeps = {
      ...happyDeps(),
      precedent: {
        rateForShape: () => ({ kind: 'rate', matched: 0, total: 5, rate: 0 }),
      },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('precedent-contradicts');
  });
});

// ---------------------------------------------------------------------------
// SC5 — any lever error degrades that lever to unknown, captured in rationale; never throws.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC5 lever-degrade / never-throws', () => {
  it('a throwing GraphScope degrades the scope lever to unknown and is captured in rationale; probe does not throw', async () => {
    const deps: ProbeDeps = { ...happyDeps(), graph: throwingGraph };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.levers.scope.value).toBe('unknown');
    expect(v.levers.scope.reason).toBeDefined();
    expect(v.rationale.toLowerCase()).toContain('scope');
    // A degraded scope lever cannot be "bounded" ⇒ not dispatchable.
    expect(v.dispatchable).toBe(false);
  });

  it('a throwing open-decisions call degrades that lever to unknown; probe still resolves', async () => {
    const deps: ProbeDeps = {
      provider: stubProvider({ level: 'trivial', confidence: 'medium', throwOnDecisions: true }),
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 2 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.levers.openDecisions.value).toBe('unknown');
    // An unknown open-decisions lever cannot corroborate "no open decision" ⇒ not dispatchable.
    expect(v.dispatchable).toBe(false);
  });

  it('with NO provider at all (fully offline), the probe resolves without throwing and holds the item', async () => {
    const deps: ProbeDeps = {
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 2 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.levers.openDecisions.value).toBe('unknown');
    expect(v.dispatchable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SC6 — determinism: fixed inputs + fixed stubs ⇒ identical output.
// ---------------------------------------------------------------------------

describe('runScopingProbe — SC6 determinism', () => {
  it('produces byte-identical verdicts for identical inputs + stubs', async () => {
    const a = await runScopingProbe(inputFor(), happyDeps());
    const b = await runScopingProbe(inputFor(), happyDeps());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Gate corroboration — the eligible band + confidence bar (proposal §gate).
// ---------------------------------------------------------------------------

describe('runScopingProbe — gate corroboration', () => {
  it('a moderate/complex semantic read is out of band ⇒ not-in-band even with bounded scope', async () => {
    const deps: ProbeDeps = {
      provider: stubProvider({ level: 'moderate', confidence: 'high', openDecisions: [] }),
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 2 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('not-in-band');
  });

  it('a blast radius over boundedScopeMax is NOT bounded ⇒ unresolved-scope even with resolved entities', async () => {
    const deps: ProbeDeps = {
      provider: stubProvider({ level: 'trivial', confidence: 'medium', openDecisions: [] }),
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 500 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('unresolved-scope');
  });

  it('a low-confidence semantic read (below the dispatchConfidence bar) holds as not-in-band', async () => {
    const deps: ProbeDeps = {
      provider: stubProvider({ level: 'trivial', confidence: 'low', openDecisions: [] }),
      graph: stubGraph({ BackendRouter: { nodeId: 'class:BackendRouter', blastRadius: 2 } }),
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    };
    const v = await runScopingProbe(inputFor(), deps);
    expect(v.dispatchable).toBe(false);
    expect(v.holdReason).toBe('not-in-band');
  });
});
