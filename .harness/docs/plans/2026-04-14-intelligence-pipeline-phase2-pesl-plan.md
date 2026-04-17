# Plan: Intelligence Pipeline -- Phase 2: PESL (Pre-Execution Simulation Layer)

**Date:** 2026-04-14
**Spec:** docs/changes/intelligence-pipeline/proposal.md (Phase 2)
**Phase:** 2 of 4
**Tasks:** 9
**Time:** ~38 minutes

## Goal

Locally-routed issues pass through pre-execution simulation before dispatch. Quick-fix/diagnostic issues get graph-only checks (CascadeSimulator blast radius + impact test projection). Guided-change issues get full LLM simulation (plan expansion, dependency simulation, failure injection, test projection). Simulation can abort and produce an EscalateEffect when confidence falls below threshold.

## Observable Truths (Acceptance Criteria)

1. **[EARS: Event-driven]** When a quick-fix or diagnostic issue is routed to `dispatch-local`, the system shall run graph-only PESL checks (CascadeSimulator blast radius + impact grouping) and produce a `SimulationResult` with `tier: 'graph-only'`, `executionConfidence` in [0,1], and complete blast radius metadata -- in under 2 seconds. (SC7)
2. **[EARS: Event-driven]** When a guided-change issue is routed to `dispatch-local` (or `score.recommendedRoute === 'simulation-required'`), the system shall run full LLM simulation producing a `SimulationResult` with `tier: 'full-simulation'`, non-empty `predictedFailures`, and non-empty `testGaps` for non-trivial issues. (SC8)
3. **[EARS: Event-driven]** When PESL simulation returns `abort: true` (executionConfidence < 0.3), the system shall not produce a `DispatchEffect` -- instead it shall produce an `EscalateEffect` with PESL context in the reasons. (SC9)
4. **[EARS: Ubiquitous]** The full pipeline (SEL + CML + PESL) for graph-only issues shall complete in under 5 seconds total latency. (SC13)
5. **[EARS: Ubiquitous]** The `IntelligencePipeline` class shall expose a `simulate(spec, score)` method that delegates to graph-only or full-simulation based on the score's `recommendedRoute` and issue tier.
6. **[EARS: Optional]** Where `IntelligenceConfig.models.pesl` is set, the PESL LLM simulation shall use the specified model instead of the provider default.
7. **[EARS: Unwanted]** If PESL integration is wired, then the system shall not break any existing orchestrator or intelligence pipeline tests -- zero regressions. (SC14)

## File Map

```
CREATE  packages/intelligence/src/pesl/graph-checks.ts
CREATE  packages/intelligence/src/pesl/prompts.ts
CREATE  packages/intelligence/src/pesl/llm-simulation.ts
CREATE  packages/intelligence/src/pesl/simulator.ts
CREATE  packages/intelligence/tests/pesl/graph-checks.test.ts
CREATE  packages/intelligence/tests/pesl/llm-simulation.test.ts
CREATE  packages/intelligence/tests/pesl/simulator.test.ts
MODIFY  packages/intelligence/src/pipeline.ts
MODIFY  packages/intelligence/src/index.ts
MODIFY  packages/intelligence/tests/pipeline.test.ts
MODIFY  packages/orchestrator/src/orchestrator.ts
MODIFY  packages/orchestrator/src/core/state-machine.ts
MODIFY  packages/orchestrator/src/types/events.ts
```

## Skeleton

1. Graph-only checks module (~2 tasks, ~8 min)
2. PESL prompts and LLM simulation module (~2 tasks, ~10 min)
3. Simulator facade with confidence scoring and abort logic (~2 tasks, ~8 min)
4. Pipeline integration (~1 task, ~4 min)
5. Orchestrator wiring (~2 tasks, ~8 min)

**Estimated total:** 9 tasks, ~38 minutes

## Tasks

### Task 1: Implement PESL graph-only checks (test)

**Depends on:** none
**Files:** `packages/intelligence/tests/pesl/graph-checks.test.ts`

1. Create directory `packages/intelligence/tests/pesl/`
2. Create `packages/intelligence/tests/pesl/graph-checks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { runGraphOnlyChecks } from '../../src/pesl/graph-checks.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Fix button alignment',
    intent: 'Correct CSS alignment issue in header component',
    summary: 'The header button is misaligned on mobile viewports',
    affectedSystems: [
      {
        name: 'header-component',
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      },
    ],
    functionalRequirements: ['Button aligns on mobile'],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0.1, structuralComplexity: 0.1 },
    ...overrides,
  };
}

function makeScore(overrides: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    overall: 0.15,
    confidence: 0.5,
    riskLevel: 'low',
    blastRadius: { services: 0, modules: 1, filesEstimated: 2, testFilesAffected: 1 },
    dimensions: { structural: 0.1, semantic: 0.1, historical: 0 },
    reasoning: ['Low complexity'],
    recommendedRoute: 'local',
    ...overrides,
  };
}

describe('runGraphOnlyChecks', () => {
  it('returns graph-only SimulationResult with empty graph', () => {
    const store = new GraphStore();
    const result = runGraphOnlyChecks(makeSpec(), makeScore(), store);

    expect(result.tier).toBe('graph-only');
    expect(result.executionConfidence).toBeGreaterThanOrEqual(0);
    expect(result.executionConfidence).toBeLessThanOrEqual(1);
    expect(result.abort).toBe(false);
    expect(result.simulatedPlan).toEqual([]);
    expect(Array.isArray(result.predictedFailures)).toBe(true);
    expect(Array.isArray(result.testGaps)).toBe(true);
    expect(Array.isArray(result.riskHotspots)).toBe(true);
  });

  it('produces riskHotspots from amplification points when graph has data', () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-a', name: 'module-a', type: 'module' });
    store.addNode({ id: 'mod-b', name: 'module-b', type: 'module' });
    store.addNode({ id: 'mod-c', name: 'module-c', type: 'module' });
    store.addNode({ id: 'test-1', name: 'test-a', type: 'test_result' });
    store.addEdge({ from: 'mod-a', to: 'mod-b', type: 'imports' });
    store.addEdge({ from: 'mod-a', to: 'mod-c', type: 'imports' });
    store.addEdge({ from: 'mod-a', to: 'test-1', type: 'tested_by' });

    const spec = makeSpec({
      affectedSystems: [
        {
          name: 'module-a',
          graphNodeId: 'mod-a',
          confidence: 0.9,
          transitiveDeps: ['mod-b', 'mod-c'],
          testCoverage: 1,
          owner: null,
        },
      ],
    });

    const result = runGraphOnlyChecks(spec, makeScore(), store);

    expect(result.tier).toBe('graph-only');
    expect(result.executionConfidence).toBeGreaterThan(0);
  });

  it('detects testGaps when affected systems have zero test coverage', () => {
    const store = new GraphStore();
    const spec = makeSpec({
      affectedSystems: [
        {
          name: 'untested-module',
          graphNodeId: 'mod-x',
          confidence: 0.8,
          transitiveDeps: [],
          testCoverage: 0,
          owner: null,
        },
      ],
    });

    const result = runGraphOnlyChecks(spec, makeScore(), store);

    expect(result.testGaps.length).toBeGreaterThanOrEqual(1);
    expect(result.testGaps[0]).toContain('untested-module');
  });

  it('returns high confidence for trivial specs with no graph issues', () => {
    const store = new GraphStore();
    const result = runGraphOnlyChecks(makeSpec(), makeScore(), store);

    expect(result.executionConfidence).toBeGreaterThanOrEqual(0.7);
  });
});
```

3. Run test -- observe failure: `cd packages/intelligence && npx vitest run tests/pesl/graph-checks.test.ts`
4. Run: `harness validate`
5. Commit: `test(intelligence): add PESL graph-only checks tests`

---

### Task 2: Implement PESL graph-only checks (implementation)

**Depends on:** Task 1
**Files:** `packages/intelligence/src/pesl/graph-checks.ts`

1. Create `packages/intelligence/src/pesl/graph-checks.ts`:

```typescript
import type { GraphStore } from '@harness-engineering/graph';
import { CascadeSimulator, groupNodesByImpact } from '@harness-engineering/graph';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';

/**
 * Confidence floor for graph-only checks.
 * When blast radius is zero and no test gaps exist, confidence starts here.
 */
const BASE_CONFIDENCE = 0.85;

/** Per-risk-hotspot confidence penalty. */
const HOTSPOT_PENALTY = 0.05;

/** Per-test-gap confidence penalty. */
const TEST_GAP_PENALTY = 0.08;

/** Per-predicted-failure confidence penalty. */
const FAILURE_PENALTY = 0.1;

/**
 * Run graph-only pre-execution simulation checks.
 *
 * Uses CascadeSimulator blast radius and impact grouping to produce a
 * SimulationResult without any LLM calls. Intended for quick-fix and
 * diagnostic tier issues where speed matters.
 *
 * Deterministic and fast (<2s for typical graphs).
 */
export function runGraphOnlyChecks(
  spec: EnrichedSpec,
  score: ComplexityScore,
  store: GraphStore
): SimulationResult {
  const riskHotspots: string[] = [];
  const predictedFailures: string[] = [];
  const testGaps: string[] = [];
  const recommendedChanges: string[] = [];

  const systemsWithGraph = spec.affectedSystems.filter((s) => s.graphNodeId !== null);

  // Run cascade simulation for each resolved system
  const simulator = new CascadeSimulator(store);

  for (const system of systemsWithGraph) {
    let cascadeResult;
    try {
      cascadeResult = simulator.simulate(system.graphNodeId!);
    } catch {
      // Node not found in graph -- skip
      continue;
    }

    // Collect amplification points as risk hotspots
    for (const nodeId of cascadeResult.summary.amplificationPoints) {
      const node = store.getNode(nodeId);
      riskHotspots.push(node ? `${node.name} (high fan-out)` : `${nodeId} (high fan-out)`);
    }

    // High-risk cascade nodes indicate potential fragility
    const highRiskNodes = cascadeResult.flatSummary.filter((n) => n.cumulativeProbability >= 0.5);
    if (highRiskNodes.length > 5) {
      predictedFailures.push(
        `${system.name}: cascade affects ${highRiskNodes.length} high-probability nodes`
      );
    }

    // Group impact to find test coverage gaps in cascade path
    const affectedNodes = cascadeResult.flatSummary
      .map((n) => store.getNode(n.nodeId))
      .filter((n): n is NonNullable<typeof n> => n !== undefined);

    const groups = groupNodesByImpact(affectedNodes);
    if (groups.code.length > 0 && groups.tests.length === 0) {
      recommendedChanges.push(`${system.name}: affected code has no test coverage in cascade path`);
    }
  }

  // Detect test gaps from affected systems metadata
  for (const system of spec.affectedSystems) {
    if (system.testCoverage === 0) {
      testGaps.push(`${system.name}: no test coverage detected`);
    }
  }

  // If blast radius is large but no tests are affected, flag it
  if (score.blastRadius.filesEstimated > 10 && score.blastRadius.testFilesAffected === 0) {
    testGaps.push(
      `Blast radius covers ${score.blastRadius.filesEstimated} files but no test files are affected`
    );
  }

  // Compute execution confidence
  let confidence = BASE_CONFIDENCE;
  confidence -= riskHotspots.length * HOTSPOT_PENALTY;
  confidence -= testGaps.length * TEST_GAP_PENALTY;
  confidence -= predictedFailures.length * FAILURE_PENALTY;

  // Factor in the CML overall score -- higher complexity = lower confidence
  confidence -= score.overall * 0.2;

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    simulatedPlan: [], // Graph-only checks do not produce a plan
    predictedFailures,
    riskHotspots,
    missingSteps: [], // Graph-only checks do not produce missing steps
    testGaps,
    executionConfidence: confidence,
    recommendedChanges,
    abort: confidence < 0.3,
    tier: 'graph-only',
  };
}
```

2. Run test -- observe pass: `cd packages/intelligence && npx vitest run tests/pesl/graph-checks.test.ts`
3. Run: `harness validate`
4. Commit: `feat(intelligence): implement PESL graph-only checks using CascadeSimulator`

---

### Task 3: Create PESL prompt templates

**Depends on:** none (can run in parallel with Tasks 1-2)
**Files:** `packages/intelligence/src/pesl/prompts.ts`

1. Create `packages/intelligence/src/pesl/prompts.ts`:

```typescript
import { z } from 'zod';
import type { EnrichedSpec, ComplexityScore } from '../types.js';

/**
 * System prompt for PESL full simulation.
 */
export const PESL_SYSTEM_PROMPT = `You are a pre-execution simulation agent. Your job is to analyze an enriched specification and its complexity assessment, then simulate what would happen if an autonomous coding agent attempted to implement this change.

Your simulation should:
1. **Plan expansion** -- Break the spec into concrete implementation steps a coding agent would take.
2. **Dependency simulation** -- For each step, identify what files, modules, or services would be touched and what dependencies exist between steps.
3. **Failure injection** -- Predict likely failure modes: type errors, missing imports, test regressions, breaking API changes, race conditions, etc.
4. **Test projection** -- Identify what tests should exist but don't, and what existing tests are likely to break.

Be realistic and specific. Reference actual system names from the spec. Err on the side of flagging potential issues -- it is better to over-predict failures than to miss them.

Return your analysis using the structured_output tool.`;

/**
 * Zod schema for the LLM simulation response.
 */
export const peslResponseSchema = z.object({
  simulatedPlan: z.array(z.string()).describe('Ordered implementation steps the agent would take'),
  predictedFailures: z.array(z.string()).describe('Likely failure modes during implementation'),
  riskHotspots: z.array(z.string()).describe('Files or modules that are high-risk change points'),
  missingSteps: z.array(z.string()).describe('Steps the agent might miss or overlook'),
  testGaps: z.array(z.string()).describe('Tests that should exist but likely do not'),
  recommendedChanges: z.array(z.string()).describe('Adjustments to improve success likelihood'),
});

export type PESLResponse = z.infer<typeof peslResponseSchema>;

/**
 * Build the user prompt for PESL full simulation from an EnrichedSpec and ComplexityScore.
 */
export function buildPeslPrompt(spec: EnrichedSpec, score: ComplexityScore): string {
  const parts: string[] = [];

  parts.push(`## Enriched Specification: ${spec.title}`);
  parts.push(`**Intent:** ${spec.intent}`);
  parts.push(`**Summary:** ${spec.summary}`);

  parts.push(`\n### Affected Systems`);
  for (const system of spec.affectedSystems) {
    const graphStatus = system.graphNodeId
      ? `(graph-resolved: ${system.graphNodeId})`
      : '(not in graph)';
    parts.push(
      `- **${system.name}** ${graphStatus} -- confidence: ${system.confidence}, deps: ${system.transitiveDeps.length}, test coverage: ${system.testCoverage}`
    );
  }

  if (spec.functionalRequirements.length > 0) {
    parts.push(`\n### Functional Requirements`);
    for (const req of spec.functionalRequirements) {
      parts.push(`- ${req}`);
    }
  }

  if (spec.apiChanges.length > 0) {
    parts.push(`\n### API Changes`);
    for (const change of spec.apiChanges) {
      parts.push(`- ${change}`);
    }
  }

  if (spec.dbChanges.length > 0) {
    parts.push(`\n### Database Changes`);
    for (const change of spec.dbChanges) {
      parts.push(`- ${change}`);
    }
  }

  if (spec.integrationPoints.length > 0) {
    parts.push(`\n### Integration Points`);
    for (const point of spec.integrationPoints) {
      parts.push(`- ${point}`);
    }
  }

  if (spec.unknowns.length > 0) {
    parts.push(`\n### Unknowns`);
    for (const unknown of spec.unknowns) {
      parts.push(`- ${unknown}`);
    }
  }

  if (spec.ambiguities.length > 0) {
    parts.push(`\n### Ambiguities`);
    for (const ambiguity of spec.ambiguities) {
      parts.push(`- ${ambiguity}`);
    }
  }

  if (spec.riskSignals.length > 0) {
    parts.push(`\n### Risk Signals`);
    for (const risk of spec.riskSignals) {
      parts.push(`- ${risk}`);
    }
  }

  parts.push(`\n### Complexity Assessment`);
  parts.push(`- **Overall:** ${score.overall.toFixed(2)} (risk: ${score.riskLevel})`);
  parts.push(
    `- **Blast radius:** ${score.blastRadius.filesEstimated} files, ${score.blastRadius.modules} modules, ${score.blastRadius.services} services`
  );
  parts.push(`- **Structural:** ${score.dimensions.structural.toFixed(2)}`);
  parts.push(`- **Semantic:** ${score.dimensions.semantic.toFixed(2)}`);
  for (const reason of score.reasoning) {
    parts.push(`- ${reason}`);
  }

  parts.push(`\n### Instructions`);
  parts.push(
    `Simulate implementation of this spec by an autonomous coding agent. Produce a step-by-step plan, predict failures, identify risk hotspots, flag missing steps, and project test gaps.`
  );

  return parts.join('\n');
}
```

2. Run: `harness validate`
3. Commit: `feat(intelligence): add PESL prompt templates for LLM simulation`

---

### Task 4: Implement PESL LLM simulation (test)

**Depends on:** Task 3
**Files:** `packages/intelligence/tests/pesl/llm-simulation.test.ts`

1. Create `packages/intelligence/tests/pesl/llm-simulation.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { runLlmSimulation } from '../../src/pesl/llm-simulation.js';
import type { EnrichedSpec, ComplexityScore } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-2',
    title: 'Add notification service',
    intent: 'Implement email + in-app notifications on account changes',
    summary: 'Users receive notifications when their account is modified',
    affectedSystems: [
      {
        name: 'user-service',
        graphNodeId: 'mod-users',
        confidence: 0.9,
        transitiveDeps: ['mod-auth', 'mod-db'],
        testCoverage: 5,
        owner: null,
      },
      {
        name: 'email-service',
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      },
    ],
    functionalRequirements: ['Send email on account modification', 'Store in-app notification'],
    nonFunctionalRequirements: ['Notifications sent within 30 seconds'],
    apiChanges: ['POST /api/notifications'],
    dbChanges: ['Add notifications table'],
    integrationPoints: ['Email provider API'],
    assumptions: ['SMTP credentials configured'],
    unknowns: ['Email provider rate limits'],
    ambiguities: ['Which account changes trigger notifications'],
    riskSignals: ['New external dependency on email provider'],
    initialComplexityHints: { textualComplexity: 0.5, structuralComplexity: 0.6 },
    ...overrides,
  };
}

function makeScore(overrides: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    overall: 0.55,
    confidence: 0.7,
    riskLevel: 'medium',
    blastRadius: { services: 2, modules: 3, filesEstimated: 15, testFilesAffected: 3 },
    dimensions: { structural: 0.4, semantic: 0.5, historical: 0 },
    reasoning: ['Medium complexity -- multi-service change'],
    recommendedRoute: 'simulation-required',
    ...overrides,
  };
}

function makeMockProvider(
  response?: Partial<{
    simulatedPlan: string[];
    predictedFailures: string[];
    riskHotspots: string[];
    missingSteps: string[];
    testGaps: string[];
    recommendedChanges: string[];
  }>
): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: {
        simulatedPlan: [
          'Create notification types',
          'Add notifications table migration',
          'Implement NotificationService',
          'Wire into user update endpoint',
        ],
        predictedFailures: [
          'Missing email provider mock in tests',
          'Race condition on concurrent account updates',
        ],
        riskHotspots: ['user-service/handlers/update.ts', 'email-service/client.ts'],
        missingSteps: ['Add retry logic for email send failures'],
        testGaps: [
          'No integration test for notification-on-update flow',
          'No test for email provider failure handling',
        ],
        recommendedChanges: ['Add circuit breaker for email provider'],
        ...response,
      },
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      model: 'claude-sonnet-4-20250514',
      latencyMs: 1500,
    }),
  };
}

describe('runLlmSimulation', () => {
  it('produces a full-simulation SimulationResult with LLM-derived content', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const spec = makeSpec();
    const score = makeScore();

    const result = await runLlmSimulation(spec, score, store, provider);

    expect(result.tier).toBe('full-simulation');
    expect(result.simulatedPlan.length).toBeGreaterThan(0);
    expect(result.predictedFailures.length).toBeGreaterThan(0);
    expect(result.testGaps.length).toBeGreaterThan(0);
    expect(result.riskHotspots.length).toBeGreaterThan(0);
    expect(result.missingSteps.length).toBeGreaterThan(0);
    expect(result.executionConfidence).toBeGreaterThanOrEqual(0);
    expect(result.executionConfidence).toBeLessThanOrEqual(1);
    expect(result.abort).toBe(false);
  });

  it('calls AnalysisProvider with PESL prompts', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();

    await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(provider.analyze).toHaveBeenCalledOnce();
    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain('Add notification service');
    expect(call.systemPrompt).toContain('pre-execution simulation');
  });

  it('passes model override when provided', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();

    await runLlmSimulation(makeSpec(), makeScore(), store, provider, 'claude-opus-4-20250514');

    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-20250514');
  });

  it('merges graph check results with LLM results', async () => {
    const store = new GraphStore();
    store.addNode({ id: 'mod-users', name: 'user-service', type: 'module' });
    store.addNode({ id: 'mod-auth', name: 'auth-module', type: 'module' });
    store.addNode({ id: 'mod-db', name: 'db-module', type: 'module' });
    store.addEdge({ from: 'mod-users', to: 'mod-auth', type: 'imports' });
    store.addEdge({ from: 'mod-users', to: 'mod-db', type: 'imports' });

    const provider = makeMockProvider();
    const result = await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(result.simulatedPlan.length).toBeGreaterThan(0);
    expect(result.tier).toBe('full-simulation');
  });

  it('computes confidence from combined graph + LLM signals', async () => {
    const provider = makeMockProvider({
      predictedFailures: ['fail1', 'fail2', 'fail3', 'fail4', 'fail5'],
      testGaps: ['gap1', 'gap2', 'gap3', 'gap4'],
    });
    const store = new GraphStore();

    const result = await runLlmSimulation(makeSpec(), makeScore(), store, provider);

    expect(result.executionConfidence).toBeLessThan(0.7);
  });
});
```

2. Run test -- observe failure: `cd packages/intelligence && npx vitest run tests/pesl/llm-simulation.test.ts`
3. Run: `harness validate`
4. Commit: `test(intelligence): add PESL LLM simulation tests`

---

### Task 5: Implement PESL LLM simulation (implementation)

**Depends on:** Task 2, Task 3, Task 4
**Files:** `packages/intelligence/src/pesl/llm-simulation.ts`

1. Create `packages/intelligence/src/pesl/llm-simulation.ts`:

```typescript
import type { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';
import { runGraphOnlyChecks } from './graph-checks.js';
import { PESL_SYSTEM_PROMPT, buildPeslPrompt, peslResponseSchema } from './prompts.js';
import type { PESLResponse } from './prompts.js';

/**
 * Base confidence for full simulation before penalties.
 * Lower than graph-only because full simulation implies higher complexity.
 */
const BASE_CONFIDENCE = 0.75;

/** Per-predicted-failure confidence penalty. */
const FAILURE_PENALTY = 0.06;

/** Per-test-gap confidence penalty. */
const TEST_GAP_PENALTY = 0.05;

/** Per-missing-step confidence penalty. */
const MISSING_STEP_PENALTY = 0.04;

/** Penalty factor for CML overall score. */
const COMPLEXITY_PENALTY_FACTOR = 0.15;

/**
 * Run full LLM pre-execution simulation.
 *
 * Combines graph-only checks with LLM-driven plan expansion, failure
 * injection, and test projection. Intended for guided-change and
 * simulation-required tier issues.
 */
export async function runLlmSimulation(
  spec: EnrichedSpec,
  score: ComplexityScore,
  store: GraphStore,
  provider: AnalysisProvider,
  model?: string
): Promise<SimulationResult> {
  // Run graph checks first for baseline signals
  const graphResult = runGraphOnlyChecks(spec, score, store);

  // Run LLM simulation
  const response = await provider.analyze<PESLResponse>({
    prompt: buildPeslPrompt(spec, score),
    systemPrompt: PESL_SYSTEM_PROMPT,
    responseSchema: peslResponseSchema,
    ...(model !== undefined && { model }),
  });

  const llm = response.result;

  // Merge graph and LLM results, deduplicating
  const riskHotspots = dedup([...graphResult.riskHotspots, ...llm.riskHotspots]);
  const predictedFailures = dedup([...graphResult.predictedFailures, ...llm.predictedFailures]);
  const testGaps = dedup([...graphResult.testGaps, ...llm.testGaps]);
  const recommendedChanges = dedup([...graphResult.recommendedChanges, ...llm.recommendedChanges]);

  // Compute execution confidence from combined signals
  let confidence = BASE_CONFIDENCE;
  confidence -= predictedFailures.length * FAILURE_PENALTY;
  confidence -= testGaps.length * TEST_GAP_PENALTY;
  confidence -= llm.missingSteps.length * MISSING_STEP_PENALTY;
  confidence -= score.overall * COMPLEXITY_PENALTY_FACTOR;

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    simulatedPlan: llm.simulatedPlan,
    predictedFailures,
    riskHotspots,
    missingSteps: llm.missingSteps,
    testGaps,
    executionConfidence: confidence,
    recommendedChanges,
    abort: confidence < 0.3,
    tier: 'full-simulation',
  };
}

/** Deduplicate string arrays (case-insensitive). */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}
```

2. Run test -- observe pass: `cd packages/intelligence && npx vitest run tests/pesl/llm-simulation.test.ts`
3. Run: `harness validate`
4. Commit: `feat(intelligence): implement PESL LLM simulation with graph+LLM merge`

---

### Task 6: Implement PESL simulator facade (test)

**Depends on:** none (can run in parallel with Tasks 1-5)
**Files:** `packages/intelligence/tests/pesl/simulator.test.ts`

1. Create `packages/intelligence/tests/pesl/simulator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import type { AnalysisProvider } from '../../src/analysis-provider/interface.js';
import { PeslSimulator } from '../../src/pesl/simulator.js';
import type { EnrichedSpec, ComplexityScore } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Test spec',
    intent: 'Test intent',
    summary: 'Test summary',
    affectedSystems: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0.1, structuralComplexity: 0.1 },
    ...overrides,
  };
}

function makeLowScore(): ComplexityScore {
  return {
    overall: 0.15,
    confidence: 0.5,
    riskLevel: 'low',
    blastRadius: { services: 0, modules: 1, filesEstimated: 2, testFilesAffected: 1 },
    dimensions: { structural: 0.1, semantic: 0.1, historical: 0 },
    reasoning: ['Low complexity'],
    recommendedRoute: 'local',
  };
}

function makeMediumScore(): ComplexityScore {
  return {
    overall: 0.55,
    confidence: 0.7,
    riskLevel: 'medium',
    blastRadius: { services: 2, modules: 3, filesEstimated: 15, testFilesAffected: 3 },
    dimensions: { structural: 0.4, semantic: 0.5, historical: 0 },
    reasoning: ['Medium complexity'],
    recommendedRoute: 'simulation-required',
  };
}

function makeMockProvider(): AnalysisProvider {
  return {
    analyze: vi.fn().mockResolvedValue({
      result: {
        simulatedPlan: ['Step 1', 'Step 2'],
        predictedFailures: ['Possible type error'],
        riskHotspots: ['module-a/index.ts'],
        missingSteps: ['Add migration rollback'],
        testGaps: ['No test for error path'],
        recommendedChanges: ['Add retry logic'],
      },
      tokenUsage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
      model: 'claude-sonnet-4-20250514',
      latencyMs: 1200,
    }),
  };
}

describe('PeslSimulator', () => {
  it('runs graph-only checks for quick-fix tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeLowScore(), 'quick-fix');

    expect(result.tier).toBe('graph-only');
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('runs graph-only checks for diagnostic tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeLowScore(), 'diagnostic');

    expect(result.tier).toBe('graph-only');
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('runs full simulation for guided-change tier', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const result = await simulator.simulate(makeSpec(), makeMediumScore(), 'guided-change');

    expect(result.tier).toBe('full-simulation');
    expect(provider.analyze).toHaveBeenCalledOnce();
    expect(result.simulatedPlan.length).toBeGreaterThan(0);
  });

  it('runs full simulation when recommendedRoute is simulation-required', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const score = makeLowScore();
    score.recommendedRoute = 'simulation-required';

    const result = await simulator.simulate(makeSpec(), score, 'quick-fix');

    expect(result.tier).toBe('full-simulation');
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('returns abort: true when confidence is below threshold', async () => {
    const provider: AnalysisProvider = {
      analyze: vi.fn().mockResolvedValue({
        result: {
          simulatedPlan: ['Step 1'],
          predictedFailures: [
            'fail1',
            'fail2',
            'fail3',
            'fail4',
            'fail5',
            'fail6',
            'fail7',
            'fail8',
          ],
          riskHotspots: ['hot1', 'hot2', 'hot3'],
          missingSteps: ['miss1', 'miss2', 'miss3', 'miss4'],
          testGaps: ['gap1', 'gap2', 'gap3', 'gap4', 'gap5'],
          recommendedChanges: ['change1'],
        },
        tokenUsage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
        model: 'claude-sonnet-4-20250514',
        latencyMs: 1200,
      }),
    };
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store);

    const score = makeMediumScore();
    score.overall = 0.8;
    score.riskLevel = 'critical';

    const result = await simulator.simulate(makeSpec(), score, 'guided-change');

    expect(result.abort).toBe(true);
    expect(result.executionConfidence).toBeLessThan(0.3);
  });

  it('passes model override to LLM simulation', async () => {
    const provider = makeMockProvider();
    const store = new GraphStore();
    const simulator = new PeslSimulator(provider, store, { model: 'claude-opus-4-20250514' });

    await simulator.simulate(makeSpec(), makeMediumScore(), 'guided-change');

    const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe('claude-opus-4-20250514');
  });
});
```

2. Run test -- observe failure: `cd packages/intelligence && npx vitest run tests/pesl/simulator.test.ts`
3. Run: `harness validate`
4. Commit: `test(intelligence): add PESL simulator facade tests`

---

### Task 7: Implement PESL simulator facade (implementation)

**Depends on:** Task 2, Task 5, Task 6
**Files:** `packages/intelligence/src/pesl/simulator.ts`

1. Create `packages/intelligence/src/pesl/simulator.ts`:

```typescript
import type { GraphStore } from '@harness-engineering/graph';
import type { ScopeTier } from '@harness-engineering/types';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import type { EnrichedSpec, ComplexityScore, SimulationResult } from '../types.js';
import { runGraphOnlyChecks } from './graph-checks.js';
import { runLlmSimulation } from './llm-simulation.js';

/** Tiers that get graph-only checks by default (no LLM cost). */
const GRAPH_ONLY_TIERS: ReadonlySet<ScopeTier> = new Set(['quick-fix', 'diagnostic']);

export interface PeslSimulatorOptions {
  /** Override model for PESL LLM calls. */
  model?: string;
}

/**
 * Top-level PESL simulator that routes to graph-only or full LLM simulation
 * based on scope tier and CML recommended route.
 *
 * Tiered behavior (per D5 in spec):
 * - quick-fix / diagnostic: graph-only checks (CascadeSimulator + impact)
 * - guided-change: full LLM simulation (plan expansion, failure injection, test projection)
 * - simulation-required override: full LLM simulation regardless of tier
 */
export class PeslSimulator {
  private readonly provider: AnalysisProvider;
  private readonly store: GraphStore;
  private readonly options: PeslSimulatorOptions;

  constructor(provider: AnalysisProvider, store: GraphStore, options: PeslSimulatorOptions = {}) {
    this.provider = provider;
    this.store = store;
    this.options = options;
  }

  /**
   * Run pre-execution simulation for a spec.
   *
   * @param spec - Enriched spec from SEL
   * @param score - Complexity score from CML
   * @param tier - Scope tier of the issue
   * @returns SimulationResult with tier, confidence, and abort recommendation
   */
  async simulate(
    spec: EnrichedSpec,
    score: ComplexityScore,
    tier: ScopeTier
  ): Promise<SimulationResult> {
    const needsFullSimulation =
      score.recommendedRoute === 'simulation-required' || !GRAPH_ONLY_TIERS.has(tier);

    if (needsFullSimulation) {
      return runLlmSimulation(spec, score, this.store, this.provider, this.options.model);
    }

    return runGraphOnlyChecks(spec, score, this.store);
  }
}
```

2. Run test -- observe pass: `cd packages/intelligence && npx vitest run tests/pesl/simulator.test.ts`
3. Run all existing intelligence tests: `cd packages/intelligence && npx vitest run`
4. Run: `harness validate`
5. Commit: `feat(intelligence): implement PESL simulator facade with tiered routing`

---

### Task 8: Integrate PESL into IntelligencePipeline and update exports

**Depends on:** Task 7
**Files:** `packages/intelligence/src/pipeline.ts`, `packages/intelligence/src/index.ts`, `packages/intelligence/tests/pipeline.test.ts`

1. Modify `packages/intelligence/src/pipeline.ts`:

   **Add imports** (at top, after existing imports):

   ```typescript
   import type { SimulationResult } from './types.js';
   import type { ScopeTier } from '@harness-engineering/types';
   import { PeslSimulator } from './pesl/simulator.js';
   ```

   **Update `PreprocessResult` interface** -- add `simulation` field:

   ```typescript
   export interface PreprocessResult {
     spec: EnrichedSpec | null;
     score: ComplexityScore | null;
     signals: ConcernSignal[];
     simulation: SimulationResult | null;
   }
   ```

   **Add `simulator` field to class** and update constructor:

   ```typescript
   private readonly simulator: PeslSimulator;

   constructor(provider: AnalysisProvider, store: GraphStore, options?: { peslModel?: string }) {
     this.provider = provider;
     this.store = store;
     this.graphValidator = new GraphValidator(store);
     this.simulator = new PeslSimulator(provider, store, { model: options?.peslModel });
   }
   ```

   **Add `simulate()` method**:

   ```typescript
   async simulate(
     spec: EnrichedSpec,
     score: ComplexityScore,
     tier: ScopeTier = 'guided-change'
   ): Promise<SimulationResult> {
     return this.simulator.simulate(spec, score, tier);
   }
   ```

   **Update all `return` statements in `preprocessIssue()`** to include `simulation: null`:
   - `autoExecute` return: `{ spec: null, score: null, signals: [], simulation: null }`
   - `alwaysHuman` return: `{ spec, score: null, signals: [], simulation: null }`
   - `signalGated` return: `{ spec, score: complexityScore, signals, simulation: null }`

2. Modify `packages/intelligence/src/index.ts` -- add PESL exports after the `// Signals` section:

   ```typescript
   // PESL -- Pre-Execution Simulation Layer
   export { runGraphOnlyChecks } from './pesl/graph-checks.js';
   export { runLlmSimulation } from './pesl/llm-simulation.js';
   export { PeslSimulator } from './pesl/simulator.js';
   ```

3. Modify `packages/intelligence/tests/pipeline.test.ts`:

   **Update existing test assertions** -- add `.simulation` checks to all four existing tests:
   - In `'runs full pipeline for signalGated tier'`: add `expect(result.simulation).toBeNull();`
   - In `'skips everything for autoExecute tier (quick-fix)'`: add `expect(result.simulation).toBeNull();`
   - In `'skips everything for autoExecute tier (diagnostic)'`: add `expect(result.simulation).toBeNull();`
   - In `'runs SEL but skips CML for alwaysHuman tier'`: add `expect(result.simulation).toBeNull();`
   - In `'preserves issue identity through the pipeline'`: no change needed (doesn't assert on shape)

   **Add new test**:

   ```typescript
   it('simulate() delegates to PeslSimulator for graph-only tier', async () => {
     const provider = makeMockProvider();
     const store = new GraphStore();
     const pipeline = new IntelligencePipeline(provider, store);

     const result = await pipeline.preprocessIssue(
       makeIssue(),
       'guided-change',
       defaultEscalationConfig
     );

     const simResult = await pipeline.simulate(result.spec!, result.score!, 'quick-fix');
     expect(simResult.tier).toBe('graph-only');
     expect(simResult.abort).toBe(false);
     // Only SEL call from preprocessing -- no additional LLM call for graph-only sim
     expect(provider.analyze).toHaveBeenCalledOnce();
   });
   ```

4. Run all intelligence tests: `cd packages/intelligence && npx vitest run`
5. Run: `harness validate`
6. Commit: `feat(intelligence): integrate PESL into IntelligencePipeline with simulate() method`

---

### Task 9: Wire PESL into orchestrator dispatch path with abort handling

[checkpoint:human-verify]

**Depends on:** Task 8
**Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/src/types/events.ts`

1. Modify `packages/orchestrator/src/types/events.ts`:

   **Update import** (line 2):

   ```typescript
   import type { EnrichedSpec, SimulationResult } from '@harness-engineering/intelligence';
   ```

   **Add to `TickEvent` interface** (after `enrichedSpecs?`):

   ```typescript
   /** Pre-computed PESL simulation results from intelligence pipeline (issueId -> result) */
   simulationResults?: Map<string, SimulationResult>;
   ```

2. Modify `packages/orchestrator/src/orchestrator.ts`:

   **Update import** (line 13):

   ```typescript
   import type {
     EnrichedSpec,
     SimulationResult,
     ComplexityScore,
   } from '@harness-engineering/intelligence';
   ```

   **In `asyncTick()`**, refactor the intelligence pipeline section to also store scores and run simulation. Replace the existing pipeline block (lines 230-260) with:

   ```typescript
   // 3. Pre-process candidates through intelligence pipeline (if enabled)
   let concernSignals: Map<string, ConcernSignal[]> | undefined;
   let enrichedSpecs: Map<string, EnrichedSpec> | undefined;
   let simulationResults: Map<string, SimulationResult> | undefined;

   if (this.pipeline) {
     concernSignals = new Map();
     enrichedSpecs = new Map();
     const complexityScores = new Map<string, ComplexityScore>();
     const escalationConfig = resolveEscalationConfig(this.config);

     for (const issue of candidatesResult.value) {
       const scopeTier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });

       // Skip autoExecute tiers entirely -- no LLM cost
       if (escalationConfig.autoExecute.includes(scopeTier)) continue;

       try {
         const result = await this.pipeline.preprocessIssue(issue, scopeTier, escalationConfig);
         if (result.signals.length > 0) {
           concernSignals.set(issue.id, result.signals);
         }
         if (result.spec) {
           enrichedSpecs.set(issue.id, result.spec);
         }
         if (result.score) {
           complexityScores.set(issue.id, result.score);
         }
       } catch (err) {
         this.logger.error(`Intelligence pipeline failed for ${issue.identifier}`, {
           issueId: issue.id,
           error: String(err),
         });
       }
     }

     // Run PESL simulation for candidates with enriched specs and scores
     simulationResults = new Map();
     for (const issue of candidatesResult.value) {
       const spec = enrichedSpecs.get(issue.id);
       const score = complexityScores.get(issue.id);
       if (!spec || !score) continue;

       const scopeTier = detectScopeTier(issue, { hasSpec: false, hasPlans: false });
       try {
         const simResult = await this.pipeline.simulate(spec, score, scopeTier);
         simulationResults.set(issue.id, simResult);
       } catch (err) {
         this.logger.error(`PESL simulation failed for ${issue.identifier}`, {
           issueId: issue.id,
           error: String(err),
         });
         // Simulation failure is non-fatal -- issue proceeds without simulation
       }
     }
   }
   ```

   **Update tick event construction** (add `simulationResults`):

   ```typescript
   const tickEvent: OrchestratorEvent = {
     type: 'tick' as const,
     candidates: candidatesResult.value,
     runningStates: runningStatesResult.value,
     nowMs,
     ...(concernSignals !== undefined && { concernSignals }),
     ...(enrichedSpecs !== undefined && { enrichedSpecs }),
     ...(simulationResults !== undefined && { simulationResults }),
   };
   ```

   **Update `createIntelligencePipeline()`** to pass PESL model:

   ```typescript
   return new IntelligencePipeline(provider, store, {
     peslModel: intel.models.pesl,
   });
   ```

3. Modify `packages/orchestrator/src/core/state-machine.ts`:

   **In `handleTick()`**, inside the `for (const issue of eligible)` loop, after the existing escalation check and before the dispatch effect, add PESL abort check:

   ```typescript
   // After: if (escalation) { next.claimed.add(issue.id); effects.push(escalation); continue; }

   // Check PESL simulation result for abort recommendation
   const simulation = event.simulationResults?.get(issue.id);
   if (simulation?.abort) {
     const enrichedSpec = event.enrichedSpecs?.get(issue.id);
     next.claimed.add(issue.id);
     effects.push({
       type: 'escalate',
       issueId: issue.id,
       identifier: issue.identifier,
       reasons: [
         `PESL simulation recommends abort (confidence: ${simulation.executionConfidence.toFixed(2)})`,
         ...simulation.predictedFailures.slice(0, 3).map((f) => `Predicted failure: ${f}`),
         ...simulation.testGaps.slice(0, 2).map((g) => `Test gap: ${g}`),
       ],
       issueTitle: issue.title,
       issueDescription: issue.description,
       ...(enrichedSpec !== undefined && { enrichedSpec }),
     });
     continue;
   }
   ```

   **Also add `SimulationResult` to the import** (line 2):

   ```typescript
   import type { EnrichedSpec, SimulationResult } from '@harness-engineering/intelligence';
   ```

   **Note:** The `TickEvent` type (from events.ts) already carries `simulationResults`, so `handleTick` can read `event.simulationResults`.

4. Run all orchestrator tests: `cd packages/orchestrator && npx vitest run`
5. Run all intelligence tests: `cd packages/intelligence && npx vitest run`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): wire PESL simulation into dispatch path with abort-to-escalate handling`

## Task Dependencies

```
Task 1 --> Task 2 -----\
Task 3 --> Task 4 ------+--> Task 5 --\
                         |             +--> Task 7 --> Task 8 --> Task 9 [checkpoint:human-verify]
Task 6 -----------------/             |
                                      /
```

**Parallel opportunities:**

- Tasks 1, 3, 6 can start in parallel (no shared dependencies)
- Tasks 1-2 (graph-only) and Tasks 3-4 (prompts + LLM test) can run in parallel
- Task 5 (LLM implementation) depends on Tasks 2, 3, 4
- Task 7 (simulator facade impl) depends on Tasks 2, 5, 6

## Observable Truth Traceability

| Observable Truth                               | Delivering Tasks |
| ---------------------------------------------- | ---------------- |
| OT1 (graph-only < 2s, SC7)                     | Tasks 1, 2, 7    |
| OT2 (full-sim predictedFailures/testGaps, SC8) | Tasks 3, 4, 5, 7 |
| OT3 (abort -> EscalateEffect, SC9)             | Tasks 6, 7, 9    |
| OT4 (< 5s total pipeline, SC13)                | Tasks 1, 2, 8    |
| OT5 (simulate() on IntelligencePipeline)       | Task 8           |
| OT6 (PESL model config)                        | Tasks 7, 8, 9    |
| OT7 (zero regressions, SC14)                   | Task 9           |

## Risks and Mitigations

| Risk                                                                                          | Mitigation                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph-only checks may exceed 2s on very large graphs                                          | CascadeSimulator has a MAX_QUEUE_SIZE=10000 safety cap and truncation flag. Graph-only checks are purely synchronous with no LLM calls.                             |
| LLM simulation latency may push total pipeline past 5s for guided-change                      | The 5s target (SC13) only applies to graph-only issues. Full simulation is expected to take longer but only runs for guided-change tier.                            |
| Abort threshold (0.3) may be too aggressive or too lenient                                    | Threshold is a constant in the code. Observable via `SimulationResult.executionConfidence`. Tune after observing real behavior in Phase 3.                          |
| PESL adds a second AnalysisProvider call for guided-change issues (one for SEL, one for PESL) | These calls are sequential, not parallel. The per-layer model config (IntelligenceConfig.models.pesl) allows using a cheaper/faster model for simulation if needed. |
| Merging graph + LLM results may produce duplicate entries                                     | Dedup function in llm-simulation.ts uses case-insensitive matching to prevent exact duplicates.                                                                     |
