# Plan: Intelligence Pipeline — Phase 1: SEL + CML + Orchestrator Integration

**Date:** 2026-04-14
**Spec:** docs/changes/intelligence-pipeline/proposal.md
**Phase:** 1 of 4
**Estimated tasks:** 11
**Complexity:** high

## Goal

A guided-change issue gets enriched into an `EnrichedSpec` via LLM + graph-validated system discovery, scored by CML using graph blast radius and semantic analysis, and routed differently based on complexity-derived concern signals. The full SEL→CML→signals→`routeIssue()` pipeline runs end-to-end in the orchestrator's tick cycle, replacing the currently hardcoded empty concern signals at `state-machine.ts:98`.

## Observable Truths (Acceptance Criteria)

1. `packages/intelligence/` exists with `package.json`, `tsconfig.json`, and dependency chain `types → graph → core → intelligence` — no dependency on `packages/orchestrator/`.
2. `RawWorkItem` interface accepts input from `RoadmapTrackerAdapter`'s `Issue` type with no data loss — every `Issue` field maps to a `RawWorkItem` field.
3. `AnalysisProvider` interface supports single-shot structured JSON output with per-request model assignment and token usage reporting.
4. Anthropic `AnalysisProvider` implementation calls the Claude API with structured output (JSON mode) and returns typed `AnalysisResponse<T>`.
5. SEL produces a valid `EnrichedSpec` with non-null `intent`, non-empty `affectedSystems`, and explicit `unknowns` list for every input.
6. SEL `affectedSystems` are graph-validated — each has a `graphNodeId` when the system exists in the graph, or `null` with `confidence: 0` when not found.
7. CML produces a `ComplexityScore` with `overall` between 0–1, non-empty `reasoning` array, and `recommendedRoute` of `'local' | 'human' | 'simulation-required'`.
8. CML does NOT invoke `AnalysisProvider` for `autoExecute` or `alwaysHuman` tiers — only graph-based structural scoring for those paths.
9. `scoreToConcernSignals()` converts high `ComplexityScore` values into `ConcernSignal[]` compatible with existing `routeIssue()` — no modifications to `routeIssue()` or `ConcernSignal` type required.
10. `preprocessIssue()` is called in the orchestrator layer (not inside `applyEvent()`), with pre-computed signals passed into the tick event. `applyEvent()` remains pure and synchronous.
11. `WorkflowConfig` includes an `intelligence` section with `AnalysisProvider` settings, model assignments, and enable/disable toggle. When disabled, the pipeline is skipped and behavior is identical to current (empty signals).
12. All existing orchestrator tests pass after integration — zero regressions.

## File Map

```
CREATE  packages/intelligence/package.json
CREATE  packages/intelligence/tsconfig.json
CREATE  packages/intelligence/src/index.ts
CREATE  packages/intelligence/src/types.ts
CREATE  packages/intelligence/src/analysis-provider/interface.ts
CREATE  packages/intelligence/src/analysis-provider/anthropic.ts
CREATE  packages/intelligence/src/adapter.ts
CREATE  packages/intelligence/src/sel/enricher.ts
CREATE  packages/intelligence/src/sel/prompts.ts
CREATE  packages/intelligence/src/sel/graph-validator.ts
CREATE  packages/intelligence/src/cml/scorer.ts
CREATE  packages/intelligence/src/cml/structural.ts
CREATE  packages/intelligence/src/cml/semantic.ts
CREATE  packages/intelligence/src/cml/signals.ts
CREATE  packages/intelligence/src/pipeline.ts
CREATE  packages/intelligence/tests/adapter.test.ts
CREATE  packages/intelligence/tests/sel/enricher.test.ts
CREATE  packages/intelligence/tests/sel/graph-validator.test.ts
CREATE  packages/intelligence/tests/cml/scorer.test.ts
CREATE  packages/intelligence/tests/cml/signals.test.ts
CREATE  packages/intelligence/tests/pipeline.test.ts
MODIFY  packages/types/src/orchestrator.ts
MODIFY  packages/types/src/index.ts
MODIFY  packages/orchestrator/src/workflow/config.ts
MODIFY  packages/orchestrator/src/types/events.ts
MODIFY  packages/orchestrator/src/core/state-machine.ts
MODIFY  packages/orchestrator/src/orchestrator.ts
MODIFY  packages/orchestrator/package.json
```

## Tasks

### Task 1: Scaffold `packages/intelligence/`

**Depends on:** none
**Files:** `packages/intelligence/package.json`, `packages/intelligence/tsconfig.json`, `packages/intelligence/src/index.ts`

1. Create `packages/intelligence/package.json` with:
   - `name: "@harness-engineering/intelligence"`
   - Dependencies: `@harness-engineering/types`, `@harness-engineering/graph`, `@harness-engineering/core`
   - NO dependency on `@harness-engineering/orchestrator`
   - Match existing package conventions (exports, scripts, engine constraints) from sibling packages
2. Create `packages/intelligence/tsconfig.json` with project references to `types`, `graph`, `core`
3. Create empty barrel `packages/intelligence/src/index.ts`
4. Verify build: `npm run build` (or equivalent) in the new package
5. Commit: `feat(intelligence): scaffold packages/intelligence`

### Task 2: Define core types

**Depends on:** Task 1
**Files:** `packages/intelligence/src/types.ts`

1. Create `types.ts` with interfaces:
   - `RawWorkItem` — generic input from any adapter (`id`, `title`, `description`, `labels`, `metadata`, `linkedItems`, `comments`, `source`)
   - `EnrichedSpec` — SEL output (`id`, `title`, `intent`, `summary`, `affectedSystems`, `functionalRequirements`, `nonFunctionalRequirements`, `apiChanges`, `dbChanges`, `integrationPoints`, `assumptions`, `unknowns`, `ambiguities`, `riskSignals`, `initialComplexityHints`)
   - `AffectedSystem` — graph-validated system reference (`name`, `graphNodeId`, `confidence`, `transitiveDeps`, `testCoverage`, `owner`)
   - `ComplexityScore` — CML output (`overall`, `confidence`, `riskLevel`, `blastRadius`, `dimensions`, `reasoning`, `recommendedRoute`)
   - `SimulationResult` — PESL output (placeholder for Phase 2)
2. Export all types from `src/index.ts`
3. Commit: `feat(intelligence): define core pipeline types`

### Task 3: Implement AnalysisProvider interface

**Depends on:** Task 2
**Files:** `packages/intelligence/src/analysis-provider/interface.ts`, `packages/intelligence/src/analysis-provider/anthropic.ts`

1. Create `interface.ts` with:
   - `AnalysisRequest` — `prompt`, `systemPrompt?`, `responseSchema`, `model?`, `maxTokens?`
   - `AnalysisResponse<T>` — `result: T`, `tokenUsage`, `model`, `latencyMs`
   - `AnalysisProvider` interface — `analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>`
2. Create `anthropic.ts` with `AnthropicAnalysisProvider`:
   - Constructor accepts API key and default model
   - Uses Anthropic SDK with structured JSON output (tool_use or JSON mode)
   - Tracks token usage from response headers
   - Measures latency
   - Validates response against `responseSchema` before returning
3. Export from `src/index.ts`
4. Commit: `feat(intelligence): implement AnalysisProvider interface and Anthropic adapter`

### Task 4: Implement `toRawWorkItem()` adapter

**Depends on:** Task 2
**Files:** `packages/intelligence/src/adapter.ts`, `packages/intelligence/tests/adapter.test.ts`

1. Create `adapter.ts` with `toRawWorkItem(issue: Issue): RawWorkItem`:
   - Map `issue.id` → `id`, `issue.title` → `title`, `issue.description` → `description`
   - Map `issue.labels` → `labels`
   - Map remaining fields (`priority`, `state`, `branchName`, `url`, `createdAt`, `updatedAt`) → `metadata`
   - Map `issue.blockedBy` → `linkedItems` (as stringified IDs)
   - `comments: []` (roadmap adapter has no comments)
   - `source: 'roadmap'`
2. Write tests: round-trip fidelity, null description handling, empty labels, blockedBy mapping
3. Commit: `feat(intelligence): implement Issue → RawWorkItem adapter`

### Task 5: Add IntelligenceConfig to WorkflowConfig

**Depends on:** Task 3
**Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`, `packages/orchestrator/src/workflow/config.ts`

1. Add `IntelligenceConfig` interface to `packages/types/src/orchestrator.ts`:
   ```typescript
   interface IntelligenceConfig {
     enabled: boolean;
     provider: {
       kind: 'anthropic' | 'openai-compatible';
       apiKey?: string;
       baseUrl?: string;
     };
     models: {
       sel?: string;
       cml?: string;
       pesl?: string;
     };
   }
   ```
2. Add `intelligence?: IntelligenceConfig` to `WorkflowConfig`
3. Export from `packages/types/src/index.ts`
4. Update `getDefaultConfig()` in `packages/orchestrator/src/workflow/config.ts` with `intelligence: { enabled: false, provider: { kind: 'anthropic' }, models: {} }`
5. Update `validateWorkflowConfig()` — `intelligence` is optional, validate shape if present
6. Commit: `feat(types): add IntelligenceConfig to WorkflowConfig`

### Task 6: Implement SEL enricher

**Depends on:** Task 3, Task 4
**Files:** `packages/intelligence/src/sel/enricher.ts`, `packages/intelligence/src/sel/prompts.ts`, `packages/intelligence/tests/sel/enricher.test.ts`

1. Create `prompts.ts` with SEL system prompt and user prompt template:
   - System prompt: role as spec enrichment agent, instructions for structured output
   - User prompt: renders `RawWorkItem` fields into analysis prompt
   - Response schema: matches `EnrichedSpec` structure (minus `affectedSystems.graphNodeId` and graph-derived fields — those come from graph-validator)
2. Create `enricher.ts` with `enrich(item: RawWorkItem, provider: AnalysisProvider, graphValidator: GraphValidator): Promise<EnrichedSpec>`:
   - Call `provider.analyze()` with SEL prompt + response schema
   - Parse LLM response into partial `EnrichedSpec`
   - Call `graphValidator.validate(spec.affectedSystems)` to resolve graph node IDs and expand transitive deps
   - Return fully populated `EnrichedSpec`
3. Write tests with mock `AnalysisProvider`:
   - Valid input produces schema-compliant output
   - Null description is handled
   - LLM response with unknown systems gets `graphNodeId: null`
4. Commit: `feat(intelligence): implement SEL enricher with LLM prompts`

### Task 7: Implement SEL graph-validator

**Depends on:** Task 6
**Files:** `packages/intelligence/src/sel/graph-validator.ts`, `packages/intelligence/tests/sel/graph-validator.test.ts`

1. Create `graph-validator.ts` with `GraphValidator` class:
   - Constructor accepts `GraphStore` from `@harness-engineering/graph`
   - `validate(systems: AffectedSystem[]): AffectedSystem[]`:
     - For each system name, search graph for matching `module` or `file` nodes (fuzzy name match)
     - If found: set `graphNodeId`, use `CascadeSimulator` to find `transitiveDeps`, query test nodes for `testCoverage`, look up ownership metadata
     - If not found: set `graphNodeId: null`, `confidence: 0`
   - Uses `GraphStore.findNodes({ type: 'module' })` and name matching
2. Write tests with mock `GraphStore`:
   - Known module resolves to graph node with transitive deps
   - Unknown module returns `null` graphNodeId with `confidence: 0`
   - Multiple systems, some found, some not
3. Commit: `feat(intelligence): implement SEL graph-validator for affected system resolution`

### Task 8: Implement CML scorer

**Depends on:** Task 2
**Files:** `packages/intelligence/src/cml/scorer.ts`, `packages/intelligence/src/cml/structural.ts`, `packages/intelligence/src/cml/semantic.ts`, `packages/intelligence/tests/cml/scorer.test.ts`

1. Create `structural.ts` with `computeStructuralComplexity(spec: EnrichedSpec, store: GraphStore): { score: number; blastRadius: BlastRadius }`:
   - For each `affectedSystem` with a `graphNodeId`, run `CascadeSimulator.simulate()` to get blast radius
   - Sum affected nodes, weight by probability
   - Normalize to 0–1 using `GraphComplexityAdapter.computeComplexityHotspots()` percentile as ceiling
   - Return blast radius metadata: `{ services, modules, filesEstimated, testFilesAffected }`
2. Create `semantic.ts` with `computeSemanticComplexity(spec: EnrichedSpec): number`:
   - Score based on SEL enrichment fields: count of `unknowns`, `ambiguities`, `riskSignals`
   - Weight `unknowns` highest (0.4), `ambiguities` (0.35), `riskSignals` (0.25)
   - Normalize to 0–1
3. Create `scorer.ts` with `score(spec: EnrichedSpec, store: GraphStore): ComplexityScore`:
   - Call `computeStructuralComplexity()` and `computeSemanticComplexity()`
   - `dimensions.historical = 0` (Phase 3 placeholder)
   - Hardcoded weights: `overall = structural * 0.5 + semantic * 0.35 + historical * 0.15`
   - `riskLevel`: <0.3 → `'low'`, <0.6 → `'medium'`, <0.8 → `'high'`, ≥0.8 → `'critical'`
   - `recommendedRoute`: low → `'local'`, medium with low ambiguity → `'local'`, high/critical → `'human'`, medium with high semantic → `'simulation-required'`
   - `reasoning`: array of human-readable explanations for each dimension
4. Write tests:
   - Low-complexity spec (few systems, no unknowns) → overall < 0.3
   - High-complexity spec (many systems, high blast radius, ambiguities) → overall > 0.7
   - Scoring is deterministic (no LLM calls — pure graph + SEL field analysis)
5. Commit: `feat(intelligence): implement CML scorer with structural and semantic dimensions`

### Task 9: Implement `scoreToConcernSignals()`

**Depends on:** Task 8
**Files:** `packages/intelligence/src/cml/signals.ts`, `packages/intelligence/tests/cml/signals.test.ts`

1. Create `signals.ts` with `scoreToConcernSignals(score: ComplexityScore): ConcernSignal[]`:
   - `overall >= 0.7` → `{ name: 'highComplexity', reason: score.reasoning.join('; ') }`
   - `blastRadius.filesEstimated > 20` → `{ name: 'largeBlastRadius', reason: '${n} files affected' }`
   - `dimensions.semantic > 0.6` → `{ name: 'highAmbiguity', reason: 'Significant unknowns or ambiguities in spec' }`
   - Returns `ConcernSignal[]` — type already exists in `@harness-engineering/types`
2. Write tests:
   - Low score → empty signals
   - High overall → `highComplexity` signal
   - Large blast radius → `largeBlastRadius` signal
   - Multiple signals can fire simultaneously
3. Commit: `feat(intelligence): implement scoreToConcernSignals conversion`

### Task 10: Compose pipeline and export public API

**Depends on:** Task 6, Task 7, Task 8, Task 9
**Files:** `packages/intelligence/src/pipeline.ts`, `packages/intelligence/src/index.ts`, `packages/intelligence/tests/pipeline.test.ts`

1. Create `pipeline.ts` with `IntelligencePipeline` class:
   - Constructor accepts `AnalysisProvider` and `GraphStore`
   - `async enrich(item: RawWorkItem): Promise<EnrichedSpec>`
   - `score(spec: EnrichedSpec): ComplexityScore` (synchronous — no LLM)
   - `async preprocessIssue(issue: Issue, scopeTier: ScopeTier): Promise<{ spec: EnrichedSpec; score: ComplexityScore; signals: ConcernSignal[] }>`
   - `preprocessIssue()` composes: `toRawWorkItem()` → `enrich()` → `score()` → `scoreToConcernSignals()`
   - Skip SEL/CML for `autoExecute` tiers (return empty signals immediately)
   - Skip SEL/CML for `alwaysHuman` tiers (return empty signals — routing already decided)
2. Update `src/index.ts` to export `IntelligencePipeline`, all types, `AnalysisProvider`, `AnthropicAnalysisProvider`
3. Write integration test with mock `AnalysisProvider` and mock `GraphStore`:
   - End-to-end: Issue → `preprocessIssue()` → signals array with expected content
   - `autoExecute` tier → empty signals, no `AnalysisProvider` calls
4. Commit: `feat(intelligence): compose IntelligencePipeline with preprocessIssue()`

### Task 11: Wire into orchestrator dispatch

[checkpoint:human-verify]

**Depends on:** Task 5, Task 10
**Files:** `packages/orchestrator/package.json`, `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/src/types/events.ts`

1. Add `@harness-engineering/intelligence` to `packages/orchestrator/package.json` dependencies
2. In `packages/orchestrator/src/types/events.ts`, extend the `tick` event type:
   - Add `concernSignals?: Map<string, ConcernSignal[]>` field (issueId → signals)
3. In `packages/orchestrator/src/orchestrator.ts`:
   - If `config.intelligence?.enabled`, instantiate `IntelligencePipeline` with configured `AnalysisProvider` and `GraphStore`, store as `this.pipeline`
   - In `tick()` (around line 173-181), after fetching candidates and before calling `applyEvent()`:
     - For each candidate, call `detectScopeTier()`; if the tier is in `signalGated`, call `await this.pipeline.preprocessIssue(issue, scopeTier)` and collect signals into a `Map<string, ConcernSignal[]>`
     - Skip `preprocessIssue()` entirely for `autoExecute` and `alwaysHuman` tiers — no LLM cost for obvious routing decisions
     - Pass the map into the tick event as `concernSignals`
4. In `packages/orchestrator/src/core/state-machine.ts`, modify tick handler (line 98):
   - Replace `routeIssue(scopeTier, [], escalationConfig)` with `routeIssue(scopeTier, event.concernSignals?.get(issue.id) ?? [], escalationConfig)`
   - Apply same change at retry path (line 346)
   - `applyEvent()` stays pure and synchronous — no async changes needed
5. Run full existing test suite — assert zero regressions
6. Run `harness validate` if available
7. Commit: `feat(orchestrator): wire intelligence pipeline into dispatch path`

## Task Dependencies

```
Task 1 → Task 2 ─┬→ Task 3 ──→ Task 6 → Task 7 ─┐
                  ├→ Task 4                         ├→ Task 10 → Task 11 [checkpoint:human-verify]
                  ├→ Task 5 ───────────────────────→ Task 11
                  └→ Task 8 ──→ Task 9 ────────────┘
```

**Parallel opportunities:**

- Tasks 3, 4, 5, 8 can run in parallel after Task 2
- Tasks 6+7 (SEL) and 8+9 (CML) can run in parallel

## Risks and Mitigations

| Risk                                                             | Mitigation                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| LLM calls in SEL add latency to the tick cycle                   | Pipeline skips SEL/CML for `autoExecute` and `alwaysHuman` tiers. Only `signalGated` (guided-change) triggers LLM calls. Config toggle allows disabling entirely.                    |
| Graph may be empty or stale — SEL graph-validator finds no nodes | Graph-validator gracefully handles missing nodes (`graphNodeId: null`, `confidence: 0`). CML structural scoring returns 0 when no graph data, falling back to semantic-only scoring. |
| Anthropic API key not configured                                 | `intelligence.enabled` defaults to `false`. Pipeline is completely opt-in. Missing API key produces a clear error at pipeline construction time, not at runtime.                     |
| CML weights may not produce optimal routing thresholds           | Weights are hardcoded for Phase 1. Observable via `ComplexityScore.reasoning` array. Tune after observing real routing behavior in Phase 2+.                                         | Got it — hardcoded weights, Phase 1 only. Here's the final plan: |

---

# Plan: Intelligence Pipeline — Phase 1: SEL + CML + Orchestrator Integration

**Date:** 2026-04-14
**Spec:** docs/changes/intelligence-pipeline/proposal.md
**Phase:** 1 of 4
**Estimated tasks:** 11
**Complexity:** high

## Goal

A guided-change issue gets enriched into an `EnrichedSpec` via LLM + graph-validated system discovery, scored by CML using graph blast radius and semantic analysis, and routed differently based on complexity-derived concern signals. The full SEL→CML→signals→`routeIssue()` pipeline runs end-to-end in the orchestrator's tick cycle, replacing the currently hardcoded empty concern signals at `state-machine.ts:98`.

## Observable Truths (Acceptance Criteria)

1. `packages/intelligence/` exists with `package.json`, `tsconfig.json`, and dependency chain `types → graph → core → intelligence` — no dependency on `packages/orchestrator/`.
2. `RawWorkItem` interface accepts input from `RoadmapTrackerAdapter`'s `Issue` type with no data loss — every `Issue` field maps to a `RawWorkItem` field.
3. `AnalysisProvider` interface supports single-shot structured JSON output with per-request model assignment and token usage reporting.
4. Anthropic `AnalysisProvider` implementation calls the Claude API with structured output (JSON mode) and returns typed `AnalysisResponse<T>`.
5. SEL produces a valid `EnrichedSpec` with non-null `intent`, non-empty `affectedSystems`, and explicit `unknowns` list for every input.
6. SEL `affectedSystems` are graph-validated — each has a `graphNodeId` when the system exists in the graph, or `null` with `confidence: 0` when not found.
7. CML produces a `ComplexityScore` with `overall` between 0–1, non-empty `reasoning` array, and `recommendedRoute` of `'local' | 'human' | 'simulation-required'`.
8. CML does NOT invoke `AnalysisProvider` for `autoExecute` or `alwaysHuman` tiers — only graph-based structural scoring for those paths.
9. `scoreToConcernSignals()` converts high `ComplexityScore` values into `ConcernSignal[]` compatible with existing `routeIssue()` — no modifications to `routeIssue()` or `ConcernSignal` type required.
10. `preprocessIssue()` is called in the orchestrator layer (not inside `applyEvent()`), with pre-computed signals passed into the tick event. `applyEvent()` remains pure and synchronous.
11. `WorkflowConfig` includes an `intelligence` section with `AnalysisProvider` settings, model assignments, and enable/disable toggle. When disabled, the pipeline is skipped and behavior is identical to current (empty signals).
12. All existing orchestrator tests pass after integration — zero regressions.

## File Map

```
CREATE  packages/intelligence/package.json
CREATE  packages/intelligence/tsconfig.json
CREATE  packages/intelligence/src/index.ts
CREATE  packages/intelligence/src/types.ts
CREATE  packages/intelligence/src/analysis-provider/interface.ts
CREATE  packages/intelligence/src/analysis-provider/anthropic.ts
CREATE  packages/intelligence/src/adapter.ts
CREATE  packages/intelligence/src/sel/enricher.ts
CREATE  packages/intelligence/src/sel/prompts.ts
CREATE  packages/intelligence/src/sel/graph-validator.ts
CREATE  packages/intelligence/src/cml/scorer.ts
CREATE  packages/intelligence/src/cml/structural.ts
CREATE  packages/intelligence/src/cml/semantic.ts
CREATE  packages/intelligence/src/cml/signals.ts
CREATE  packages/intelligence/src/pipeline.ts
CREATE  packages/intelligence/tests/adapter.test.ts
CREATE  packages/intelligence/tests/sel/enricher.test.ts
CREATE  packages/intelligence/tests/sel/graph-validator.test.ts
CREATE  packages/intelligence/tests/cml/scorer.test.ts
CREATE  packages/intelligence/tests/cml/signals.test.ts
CREATE  packages/intelligence/tests/pipeline.test.ts
MODIFY  packages/types/src/orchestrator.ts
MODIFY  packages/types/src/index.ts
MODIFY  packages/orchestrator/src/workflow/config.ts
MODIFY  packages/orchestrator/src/types/events.ts
MODIFY  packages/orchestrator/src/core/state-machine.ts
MODIFY  packages/orchestrator/src/orchestrator.ts
MODIFY  packages/orchestrator/package.json
```

## Tasks

### Task 1: Scaffold `packages/intelligence/`

**Depends on:** none
**Files:** `packages/intelligence/package.json`, `packages/intelligence/tsconfig.json`, `packages/intelligence/src/index.ts`

1. Create `packages/intelligence/package.json` with:
   - `name: "@harness-engineering/intelligence"`
   - Dependencies: `@harness-engineering/types`, `@harness-engineering/graph`, `@harness-engineering/core`
   - NO dependency on `@harness-engineering/orchestrator`
   - Match existing package conventions (exports, scripts, engine constraints) from sibling packages
2. Create `packages/intelligence/tsconfig.json` with project references to `types`, `graph`, `core`
3. Create empty barrel `packages/intelligence/src/index.ts`
4. Verify build: `npm run build` (or equivalent) in the new package
5. Commit: `feat(intelligence): scaffold packages/intelligence`

### Task 2: Define core types

**Depends on:** Task 1
**Files:** `packages/intelligence/src/types.ts`

1. Create `types.ts` with interfaces:
   - `RawWorkItem` — generic input from any adapter (`id`, `title`, `description`, `labels`, `metadata`, `linkedItems`, `comments`, `source`)
   - `EnrichedSpec` — SEL output (`id`, `title`, `intent`, `summary`, `affectedSystems`, `functionalRequirements`, `nonFunctionalRequirements`, `apiChanges`, `dbChanges`, `integrationPoints`, `assumptions`, `unknowns`, `ambiguities`, `riskSignals`, `initialComplexityHints`)
   - `AffectedSystem` — graph-validated system reference (`name`, `graphNodeId`, `confidence`, `transitiveDeps`, `testCoverage`, `owner`)
   - `ComplexityScore` — CML output (`overall`, `confidence`, `riskLevel`, `blastRadius`, `dimensions`, `reasoning`, `recommendedRoute`)
   - `SimulationResult` — PESL output (placeholder for Phase 2)
2. Export all types from `src/index.ts`
3. Commit: `feat(intelligence): define core pipeline types`

### Task 3: Implement AnalysisProvider interface

**Depends on:** Task 2
**Files:** `packages/intelligence/src/analysis-provider/interface.ts`, `packages/intelligence/src/analysis-provider/anthropic.ts`

1. Create `interface.ts` with:
   - `AnalysisRequest` — `prompt`, `systemPrompt?`, `responseSchema`, `model?`, `maxTokens?`
   - `AnalysisResponse<T>` — `result: T`, `tokenUsage`, `model`, `latencyMs`
   - `AnalysisProvider` interface — `analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>`
2. Create `anthropic.ts` with `AnthropicAnalysisProvider`:
   - Constructor accepts API key and default model
   - Uses Anthropic SDK with structured JSON output (tool_use or JSON mode)
   - Tracks token usage from response headers
   - Measures latency
   - Validates response against `responseSchema` before returning
3. Export from `src/index.ts`
4. Commit: `feat(intelligence): implement AnalysisProvider interface and Anthropic adapter`

### Task 4: Implement `toRawWorkItem()` adapter

**Depends on:** Task 2
**Files:** `packages/intelligence/src/adapter.ts`, `packages/intelligence/tests/adapter.test.ts`

1. Create `adapter.ts` with `toRawWorkItem(issue: Issue): RawWorkItem`:
   - Map `issue.id` → `id`, `issue.title` → `title`, `issue.description` → `description`
   - Map `issue.labels` → `labels`
   - Map remaining fields (`priority`, `state`, `branchName`, `url`, `createdAt`, `updatedAt`) → `metadata`
   - Map `issue.blockedBy` → `linkedItems` (as stringified IDs)
   - `comments: []` (roadmap adapter has no comments)
   - `source: 'roadmap'`
2. Write tests: round-trip fidelity, null description handling, empty labels, blockedBy mapping
3. Commit: `feat(intelligence): implement Issue → RawWorkItem adapter`

### Task 5: Add IntelligenceConfig to WorkflowConfig

**Depends on:** Task 3
**Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`, `packages/orchestrator/src/workflow/config.ts`

1. Add `IntelligenceConfig` interface to `packages/types/src/orchestrator.ts`:
   ```typescript
   interface IntelligenceConfig {
     enabled: boolean;
     provider: {
       kind: 'anthropic' | 'openai-compatible';
       apiKey?: string;
       baseUrl?: string;
     };
     models: {
       sel?: string;
       cml?: string;
       pesl?: string;
     };
   }
   ```
2. Add `intelligence?: IntelligenceConfig` to `WorkflowConfig`
3. Export from `packages/types/src/index.ts`
4. Update `getDefaultConfig()` in `packages/orchestrator/src/workflow/config.ts` with `intelligence: { enabled: false, provider: { kind: 'anthropic' }, models: {} }`
5. Update `validateWorkflowConfig()` — `intelligence` is optional, validate shape if present
6. Commit: `feat(types): add IntelligenceConfig to WorkflowConfig`

### Task 6: Implement SEL enricher

**Depends on:** Task 3, Task 4
**Files:** `packages/intelligence/src/sel/enricher.ts`, `packages/intelligence/src/sel/prompts.ts`, `packages/intelligence/tests/sel/enricher.test.ts`

1. Create `prompts.ts` with SEL system prompt and user prompt template:
   - System prompt: role as spec enrichment agent, instructions for structured output
   - User prompt: renders `RawWorkItem` fields into analysis prompt
   - Response schema: matches `EnrichedSpec` structure (minus `affectedSystems.graphNodeId` and graph-derived fields — those come from graph-validator)
2. Create `enricher.ts` with `enrich(item: RawWorkItem, provider: AnalysisProvider, graphValidator: GraphValidator): Promise<EnrichedSpec>`:
   - Call `provider.analyze()` with SEL prompt + response schema
   - Parse LLM response into partial `EnrichedSpec`
   - Call `graphValidator.validate(spec.affectedSystems)` to resolve graph node IDs and expand transitive deps
   - Return fully populated `EnrichedSpec`
3. Write tests with mock `AnalysisProvider`:
   - Valid input produces schema-compliant output
   - Null description is handled
   - LLM response with unknown systems gets `graphNodeId: null`
4. Commit: `feat(intelligence): implement SEL enricher with LLM prompts`

### Task 7: Implement SEL graph-validator

**Depends on:** Task 6
**Files:** `packages/intelligence/src/sel/graph-validator.ts`, `packages/intelligence/tests/sel/graph-validator.test.ts`

1. Create `graph-validator.ts` with `GraphValidator` class:
   - Constructor accepts `GraphStore` from `@harness-engineering/graph`
   - `validate(systems: AffectedSystem[]): AffectedSystem[]`:
     - For each system name, search graph for matching `module` or `file` nodes (fuzzy name match)
     - If found: set `graphNodeId`, use `CascadeSimulator` to find `transitiveDeps`, query test nodes for `testCoverage`, look up ownership metadata
     - If not found: set `graphNodeId: null`, `confidence: 0`
   - Uses `GraphStore.findNodes({ type: 'module' })` and name matching
2. Write tests with mock `GraphStore`:
   - Known module resolves to graph node with transitive deps
   - Unknown module returns `null` graphNodeId with `confidence: 0`
   - Multiple systems, some found, some not
3. Commit: `feat(intelligence): implement SEL graph-validator for affected system resolution`

### Task 8: Implement CML scorer

**Depends on:** Task 2
**Files:** `packages/intelligence/src/cml/scorer.ts`, `packages/intelligence/src/cml/structural.ts`, `packages/intelligence/src/cml/semantic.ts`, `packages/intelligence/tests/cml/scorer.test.ts`

1. Create `structural.ts` with `computeStructuralComplexity(spec: EnrichedSpec, store: GraphStore): { score: number; blastRadius: BlastRadius }`:
   - For each `affectedSystem` with a `graphNodeId`, run `CascadeSimulator.simulate()` to get blast radius
   - Sum affected nodes, weight by probability
   - Normalize to 0–1 using `GraphComplexityAdapter.computeComplexityHotspots()` percentile as ceiling
   - Return blast radius metadata: `{ services, modules, filesEstimated, testFilesAffected }`
2. Create `semantic.ts` with `computeSemanticComplexity(spec: EnrichedSpec): number`:
   - Score based on SEL enrichment fields: count of `unknowns`, `ambiguities`, `riskSignals`
   - Weight `unknowns` highest (0.4), `ambiguities` (0.35), `riskSignals` (0.25)
   - Normalize to 0–1
3. Create `scorer.ts` with `score(spec: EnrichedSpec, store: GraphStore): ComplexityScore`:
   - Call `computeStructuralComplexity()` and `computeSemanticComplexity()`
   - `dimensions.historical = 0` (Phase 3 placeholder)
   - Hardcoded weights: `overall = structural * 0.5 + semantic * 0.35 + historical * 0.15`
   - `riskLevel`: <0.3 → `'low'`, <0.6 → `'medium'`, <0.8 → `'high'`, ≥0.8 → `'critical'`
   - `recommendedRoute`: low → `'local'`, medium with low ambiguity → `'local'`, high/critical → `'human'`, medium with high semantic → `'simulation-required'`
   - `reasoning`: array of human-readable explanations for each dimension
4. Write tests:
   - Low-complexity spec (few systems, no unknowns) → overall < 0.3
   - High-complexity spec (many systems, high blast radius, ambiguities) → overall > 0.7
   - Scoring is deterministic (no LLM calls — pure graph + SEL field analysis)
5. Commit: `feat(intelligence): implement CML scorer with structural and semantic dimensions`

### Task 9: Implement `scoreToConcernSignals()`

**Depends on:** Task 8
**Files:** `packages/intelligence/src/cml/signals.ts`, `packages/intelligence/tests/cml/signals.test.ts`

1. Create `signals.ts` with `scoreToConcernSignals(score: ComplexityScore): ConcernSignal[]`:
   - `overall >= 0.7` → `{ name: 'highComplexity', reason: score.reasoning.join('; ') }`
   - `blastRadius.filesEstimated > 20` → `{ name: 'largeBlastRadius', reason: '${n} files affected' }`
   - `dimensions.semantic > 0.6` → `{ name: 'highAmbiguity', reason: 'Significant unknowns or ambiguities in spec' }`
   - Returns `ConcernSignal[]` — type already exists in `@harness-engineering/types`
2. Write tests:
   - Low score → empty signals
   - High overall → `highComplexity` signal
   - Large blast radius → `largeBlastRadius` signal
   - Multiple signals can fire simultaneously
3. Commit: `feat(intelligence): implement scoreToConcernSignals conversion`

### Task 10: Compose pipeline and export public API

**Depends on:** Task 6, Task 7, Task 8, Task 9
**Files:** `packages/intelligence/src/pipeline.ts`, `packages/intelligence/src/index.ts`, `packages/intelligence/tests/pipeline.test.ts`

1. Create `pipeline.ts` with `IntelligencePipeline` class:
   - Constructor accepts `AnalysisProvider` and `GraphStore`
   - `async enrich(item: RawWorkItem): Promise<EnrichedSpec>`
   - `score(spec: EnrichedSpec): ComplexityScore` (synchronous — no LLM)
   - `async preprocessIssue(issue: Issue, scopeTier: ScopeTier): Promise<{ spec: EnrichedSpec; score: ComplexityScore; signals: ConcernSignal[] }>`
   - `preprocessIssue()` composes: `toRawWorkItem()` → `enrich()` → `score()` → `scoreToConcernSignals()`
   - Skip SEL/CML for `autoExecute` tiers (return empty signals immediately)
   - Skip SEL/CML for `alwaysHuman` tiers (return empty signals — routing already decided)
2. Update `src/index.ts` to export `IntelligencePipeline`, all types, `AnalysisProvider`, `AnthropicAnalysisProvider`
3. Write integration test with mock `AnalysisProvider` and mock `GraphStore`:
   - End-to-end: Issue → `preprocessIssue()` → signals array with expected content
   - `autoExecute` tier → empty signals, no `AnalysisProvider` calls
4. Commit: `feat(intelligence): compose IntelligencePipeline with preprocessIssue()`

### Task 11: Wire into orchestrator dispatch

[checkpoint:human-verify]

**Depends on:** Task 5, Task 10
**Files:** `packages/orchestrator/package.json`, `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/src/types/events.ts`

1. Add `@harness-engineering/intelligence` to `packages/orchestrator/package.json` dependencies
2. In `packages/orchestrator/src/types/events.ts`, extend the `tick` event type:
   - Add `concernSignals?: Map<string, ConcernSignal[]>` field (issueId → signals)
3. In `packages/orchestrator/src/orchestrator.ts`:
   - If `config.intelligence?.enabled`, instantiate `IntelligencePipeline` with configured `AnalysisProvider` and `GraphStore`, store as `this.pipeline`
   - In `tick()` (around line 173-181), after fetching candidates and before calling `applyEvent()`:
     - For each candidate, call `detectScopeTier()`; if the tier is in `signalGated`, call `await this.pipeline.preprocessIssue(issue, scopeTier)` and collect signals into a `Map<string, ConcernSignal[]>`
     - Skip `preprocessIssue()` entirely for `autoExecute` and `alwaysHuman` tiers — no LLM cost for obvious routing decisions
     - Pass the map into the tick event as `concernSignals`
4. In `packages/orchestrator/src/core/state-machine.ts`, modify tick handler (line 98):
   - Replace `routeIssue(scopeTier, [], escalationConfig)` with `routeIssue(scopeTier, event.concernSignals?.get(issue.id) ?? [], escalationConfig)`
   - Apply same change at retry path (line 346)
   - `applyEvent()` stays pure and synchronous — no async changes needed
5. Run full existing test suite — assert zero regressions
6. Run `harness validate` if available
7. Commit: `feat(orchestrator): wire intelligence pipeline into dispatch path`

## Task Dependencies

```
Task 1 → Task 2 ─┬→ Task 3 ──→ Task 6 → Task 7 ─┐
                  ├→ Task 4                         ├→ Task 10 → Task 11 [checkpoint:human-verify]
                  ├→ Task 5 ───────────────────────→ Task 11
                  └→ Task 8 ──→ Task 9 ────────────┘
```

**Parallel opportunities:**

- Tasks 3, 4, 5, 8 can run in parallel after Task 2
- Tasks 6+7 (SEL) and 8+9 (CML) can run in parallel

## Risks and Mitigations

| Risk                                                             | Mitigation                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM calls in SEL add latency to the tick cycle                   | Pipeline skips SEL/CML for `autoExecute` and `alwaysHuman` tiers. Only `signalGated` (guided-change) triggers LLM calls. Config toggle allows disabling entirely.                    |
| Graph may be empty or stale — SEL graph-validator finds no nodes | Graph-validator gracefully handles missing nodes (`graphNodeId: null`, `confidence: 0`). CML structural scoring returns 0 when no graph data, falling back to semantic-only scoring. |
| Anthropic API key not configured                                 | `intelligence.enabled` defaults to `false`. Pipeline is completely opt-in. Missing API key produces a clear error at pipeline construction time, not at runtime.                     |
| CML weights may not produce optimal routing thresholds           | Weights are hardcoded for Phase 1. Observable via `ComplexityScore.reasoning` array. Tune after observing real routing behavior in Phase 2+.                                         |
