// packages/orchestrator/src/agent/triage-wiring.test.ts
//
// Roadmap Auto-Triage — Phase 1, Task 5: the orchestrator-wiring spec.
//
// Exercises buildProbeInput / makeGraphScope / triageIssue against an INJECTED provider and
// an in-memory GraphStore — no live Orchestrator, no live model, no MCP server. Confirms the
// wiring adapts an Issue into the pure probe and that the GraphScope seam resolves real nodes
// (and returns null for the over-generated noise, per S3).

import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { GraphStore } from '@harness-engineering/graph';
import type { GraphNode } from '@harness-engineering/graph';
import type { Issue } from '@harness-engineering/types';
import type { AnalysisProvider, AnalysisResponse } from '@harness-engineering/intelligence';
import { buildProbeInput, makeGraphScope, triageIssue } from './triage-wiring.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'gh-1',
    identifier: 'CORE-1',
    title: 'Rename BackendRouter.resolve',
    description: 'Rename the `BackendRouter` method to something clearer.',
    priority: null,
    state: 'open',
    branchName: null,
    url: null,
    labels: ['refactor'],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: 'github:acme/repo#1',
    ...overrides,
  };
}

function node(partial: Partial<GraphNode> & Pick<GraphNode, 'id' | 'name'>): GraphNode {
  return {
    type: 'class',
    metadata: {},
    ...partial,
  } as GraphNode;
}

/** A provider stub that returns a fixed complexity + open-decisions payload. */
function stubProvider(opts: {
  level?: 'trivial' | 'simple' | 'moderate' | 'complex';
  confidence?: 'high' | 'medium' | 'low';
  openDecisions?: { question: string }[];
}): AnalysisProvider {
  return {
    async analyze<T>(request: { responseSchema: z.ZodType }): Promise<AnalysisResponse<T>> {
      const complexity = {
        level: opts.level ?? 'trivial',
        confidence: opts.confidence ?? 'medium',
      };
      const decisions = { openDecisions: opts.openDecisions ?? [] };
      const asComplexity = request.responseSchema.safeParse(complexity);
      const result = asComplexity.success
        ? asComplexity.data
        : request.responseSchema.parse(decisions);
      return {
        result: result as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: 'stub',
        latencyMs: 0,
      };
    },
  };
}

describe('buildProbeInput', () => {
  it('derives externalId, text signals, entity candidates and labels from an Issue', () => {
    const input = buildProbeInput(makeIssue());
    expect(input.externalId).toBe('github:acme/repo#1');
    expect(input.labels).toEqual(['refactor']);
    expect(input.taskText.prompt.length).toBeGreaterThan(0);
    // extractEntities finds the backticked/CamelCase mention.
    expect(input.entityCandidates).toContain('BackendRouter');
  });

  it('falls back to identifier then id when externalId is absent', () => {
    expect(buildProbeInput(makeIssue({ externalId: null })).externalId).toBe('CORE-1');
  });
});

describe('makeGraphScope', () => {
  it('resolves a candidate that matches a node name and returns a blast radius', async () => {
    const store = new GraphStore();
    store.addNode(node({ id: 'class:BackendRouter', name: 'BackendRouter' }));
    const scope = makeGraphScope(store);
    const resolved = await scope.resolve('BackendRouter');
    expect(resolved).not.toBeNull();
    expect(resolved?.nodeId).toBe('class:BackendRouter');
    expect(typeof resolved?.blastRadius).toBe('number');
  });

  it('returns null for an over-generated candidate that resolves to nothing (S3)', async () => {
    const store = new GraphStore();
    store.addNode(node({ id: 'class:BackendRouter', name: 'BackendRouter' }));
    const scope = makeGraphScope(store);
    expect(await scope.resolve('e.g')).toBeNull();
    expect(await scope.resolve('i.e')).toBeNull();
  });
});

describe('triageIssue', () => {
  it('runs the pure probe over an Issue with an injected provider + graph store', async () => {
    const store = new GraphStore();
    store.addNode(node({ id: 'class:BackendRouter', name: 'BackendRouter' }));
    const verdict = await triageIssue(makeIssue(), {
      provider: stubProvider({ level: 'trivial', confidence: 'medium', openDecisions: [] }),
      graphStore: store,
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    });
    expect(verdict.externalId).toBe('github:acme/repo#1');
    expect(verdict.levers.scope.value).not.toBe('unknown');
    // Resolved, bounded, trivial/medium, no decisions, no precedent block ⇒ dispatchable.
    expect(verdict.dispatchable).toBe(true);
  });

  it('holds an item whose entities do not resolve as unresolved-scope', async () => {
    const store = new GraphStore(); // empty graph ⇒ nothing resolves
    const verdict = await triageIssue(
      makeIssue({ title: 'Improve things', description: 'make it better' }),
      {
        provider: stubProvider({ level: 'trivial', confidence: 'medium' }),
        graphStore: store,
      }
    );
    expect(verdict.dispatchable).toBe(false);
    expect(verdict.holdReason).toBe('unresolved-scope');
  });

  it('degrades gracefully with NO provider and NO graph (fully offline → holds)', async () => {
    const verdict = await triageIssue(makeIssue(), {});
    expect(verdict.dispatchable).toBe(false);
    // No graph ⇒ scope unknown ⇒ unresolved-scope.
    expect(verdict.holdReason).toBe('unresolved-scope');
  });

  it('an open decision from the provider holds the item (open-decision), even when scope resolves', async () => {
    const store = new GraphStore();
    store.addNode(node({ id: 'class:BackendRouter', name: 'BackendRouter' }));
    const verdict = await triageIssue(makeIssue(), {
      provider: stubProvider({
        level: 'trivial',
        confidence: 'medium',
        openDecisions: [{ question: 'Rename to what — resolveBackend or pick?' }],
      }),
      graphStore: store,
      config: { boundedScopeMax: 40, dispatchConfidence: 'medium' },
    });
    expect(verdict.dispatchable).toBe(false);
    expect(verdict.holdReason).toBe('open-decision');
  });
});
