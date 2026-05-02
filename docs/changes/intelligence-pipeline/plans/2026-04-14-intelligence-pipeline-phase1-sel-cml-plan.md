# Plan: Intelligence Pipeline Phase 1 — SEL + CML + Orchestrator Integration

**Date:** 2026-04-14
**Spec:** docs/changes/intelligence-pipeline/proposal.md
**Estimated tasks:** 15
**Estimated time:** 90 minutes
**Scope:** Spec Phase 1 (Core Pipeline — Spec Enrichment Layer, Complexity Modeling Layer, Orchestrator Wiring)

## Goal

A guided-change issue entering the orchestrator tick cycle gets enriched into a structured `EnrichedSpec`, scored by the Complexity Modeling Layer using graph-based blast radius and semantic analysis, and routed differently based on complexity-derived concern signals fed into the existing `routeIssue()` function. The full SEL→CML→signals→routing pipeline runs end-to-end without breaking existing state machine behavior.

## Observable Truths (Acceptance Criteria)

1. When an `Issue` from `RoadmapTrackerAdapter` is converted via `toRawWorkItem()`, all fields map without data loss — `title`, `description`, `labels`, `id` preserved
2. When a `RawWorkItem` passes through SEL, the returned `EnrichedSpec` has a non-null `intent`, non-empty `affectedSystems`, and an explicit `unknowns` array
3. When SEL discovers affected systems, each `AffectedSystem` has a `graphNodeId` resolved from the graph or is explicitly `null` with `confidence: 0`
4. When an `EnrichedSpec` passes through CML, the returned `ComplexityScore` has `overall` between 0–1, non-empty `reasoning` array, and valid `riskLevel`
5. When CML scores a `signalGated` (guided-change) issue with high complexity (≥0.7), `scoreToConcernSignals()` produces at least one `ConcernSignal` that `routeIssue()` consumes — routing the issue to `needs-human`
6. When CML scores an `autoExecute` (quick-fix) tier issue, zero `AnalysisProvider.analyze()` calls are made — only graph-based structural scoring runs
7. When the `preprocessIssue()` pipeline runs for a guided-change issue, `routeIssue()` receives populated `ConcernSignal[]` instead of the current empty array
8. When the intelligence pipeline is disabled via config (`intelligence.enabled: false`), the orchestrator dispatch path behaves identically to today — empty signals, no LLM calls
9. When `AnalysisProvider` is configured with a model override, SEL and CML use the specified model for structured JSON output
10. `packages/intelligence/` has zero direct dependencies on `packages/orchestrator/` — dependency flows one way (orchestrator → intelligence)
11. All existing orchestrator state machine tests pass unchanged after integration
12. `harness validate` passes after all changes

## File Map

```
CREATE  packages/intelligence/package.json
CREATE  packages/intelligence/tsconfig.json
CREATE  packages/intelligence/src/index.ts
CREATE  packages/intelligence/src/types.ts
CREATE  packages/intelligence/src/analysis-provider/interface.ts
CREATE  packages/intelligence/src/analysis-provider/anthropic.ts
CREATE  packages/intelligence/src/sel/enricher.ts
CREATE  packages/intelligence/src/sel/prompts.ts
CREATE  packages/intelligence/src/sel/graph-validator.ts
CREATE  packages/intelligence/src/cml/scorer.ts
CREATE  packages/intelligence/src/cml/structural.ts
CREATE  packages/intelligence/src/cml/semantic.ts
CREATE  packages/intelligence/src/pipeline.ts
CREATE  packages/intelligence/tests/types.test.ts
CREATE  packages/intelligence/tests/sel/enricher.test.ts
CREATE  packages/intelligence/tests/sel/graph-validator.test.ts
CREATE  packages/intelligence/tests/cml/scorer.test.ts
CREATE  packages/intelligence/tests/cml/structural.test.ts
CREATE  packages/intelligence/tests/cml/semantic.test.ts
CREATE  packages/intelligence/tests/pipeline.test.ts
CREATE  packages/intelligence/tests/analysis-provider/anthropic.test.ts
MODIFY  packages/types/src/orchestrator.ts          (add IntelligenceConfig to WorkflowConfig)
MODIFY  packages/orchestrator/package.json           (add @harness-engineering/intelligence dep)
MODIFY  packages/orchestrator/tsconfig.json          (add intelligence project reference)
MODIFY  packages/orchestrator/src/core/state-machine.ts (wire preprocessIssue into tick)
CREATE  packages/orchestrator/src/intelligence/bridge.ts (thin adapter: Issue → pipeline → signals)
CREATE  packages/orchestrator/tests/intelligence/bridge.test.ts
MODIFY  tsconfig.base.json                           (add intelligence path alias if needed)
MODIFY  turbo.json                                   (add intelligence to pipeline if needed)
```

## Design Notes

### ConcernSignal alignment

The spec's `scoreToConcernSignals()` example uses `{type, detail}` fields, but the existing `ConcernSignal` interface (`packages/types/src/orchestrator.ts:348-353`) uses `{name, reason}`. The implementation MUST use `{name, reason}` to match the existing interface consumed by `routeIssue()`. No type changes needed.

### Pipeline placement

`preprocessIssue()` runs inside `handleTick()` in `state-machine.ts` between `detectScopeTier()` (line 96) and `routeIssue()` (line 98). The state machine is a pure function — it cannot make async LLM calls. Therefore:

- The intelligence bridge must be called from the effect executor layer (where I/O happens), not from the pure state machine
- Alternative: the tick event carries pre-computed signals alongside candidates, computed before `applyEvent()` is called
- **Chosen approach:** Add an optional `enrichments` map to `TickEvent` that the orchestrator loop populates before calling `applyEvent()`. The state machine reads signals from this map (pure), while the orchestrator loop handles the async LLM calls (impure).

### Graph dependency

The intelligence package depends on `@harness-engineering/graph` for `CascadeSimulator`, `GraphComplexityAdapter`, and `GraphStore`. These are passed as constructor dependencies — no global singletons.

## Tasks

### Task 1: Scaffold packages/intelligence/

**Depends on:** none
**Files:** packages/intelligence/package.json, packages/intelligence/tsconfig.json, packages/intelligence/src/index.ts

1. Create `packages/intelligence/package.json`:
   - name: `@harness-engineering/intelligence`
   - version: `0.0.1`
   - type: `module`
   - main: `dist/index.js`
   - types: `dist/index.d.ts`
   - dependencies: `@harness-engineering/types: "workspace:*"`, `@harness-engineering/graph: "workspace:*"`, `@harness-engineering/core: "workspace:*"`
   - devDependencies: `vitest`, `typescript`
   - scripts: `build`, `test`, `typecheck`

2. Create `packages/intelligence/tsconfig.json`:
   - extends `../../tsconfig.base.json`
   - references: `../types`, `../graph`, `../core`
   - outDir: `dist`, rootDir: `src`

3. Create `packages/intelligence/src/index.ts` as empty barrel export (populated in later tasks)

4. Update monorepo references if needed (turbo.json, root tsconfig)

5. Verify: `cd packages/intelligence && npx tsc --noEmit` succeeds

[checkpoint:verify] — Package scaffolding compiles cleanly

---

### Task 2: Define core types

**Depends on:** Task 1
**Files:** packages/intelligence/src/types.ts, packages/intelligence/tests/types.test.ts

1. Create test file first (`tests/types.test.ts`):
   - Test: `RawWorkItem` interface accepts all required fields
   - Test: `EnrichedSpec` interface enforces non-null `intent`
   - Test: `ComplexityScore.overall` constrained to 0–1 range (runtime validation function)
   - Test: `AffectedSystem.graphNodeId` accepts `string | null`
   - Test: `validateComplexityScore()` rejects out-of-range values

2. Create `packages/intelligence/src/types.ts`:
   - `RawWorkItem` interface: `id`, `title`, `description: string | null`, `labels: string[]`, `metadata: Record<string, unknown>`, `linkedItems: string[]`, `comments: string[]`, `source: string`
   - `EnrichedSpec` interface: full schema per spec (intent, summary, affectedSystems, requirements, changes, unknowns, ambiguities, riskSignals, initialComplexityHints)
   - `AffectedSystem` interface: `name`, `graphNodeId: string | null`, `confidence: number`, `transitiveDeps: string[]`, `testCoverage: string[]`, `owner: string | null`
   - `ComplexityScore` interface: `overall: number`, `confidence: number`, `riskLevel`, `blastRadius`, `dimensions`, `reasoning: string[]`, `recommendedRoute`
   - `validateComplexityScore()` runtime validator
   - Export `toRawWorkItem(issue: Issue): RawWorkItem` conversion function

3. Export types from `index.ts`

4. Run tests: `npx vitest run packages/intelligence/tests/types.test.ts`

---

### Task 3: Define AnalysisProvider interface

**Depends on:** Task 1
**Files:** packages/intelligence/src/analysis-provider/interface.ts

1. Create `packages/intelligence/src/analysis-provider/interface.ts`:
   - `AnalysisRequest` interface: `prompt: string`, `systemPrompt?: string`, `responseSchema: Record<string, unknown>`, `model?: string`, `maxTokens?: number`
   - `AnalysisResponse<T>` interface: `result: T`, `tokenUsage: { input: number; output: number }`, `model: string`, `latencyMs: number`
   - `AnalysisProvider` interface: `analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>`

2. Export from `index.ts`

---

### Task 4: Implement Anthropic AnalysisProvider

**Depends on:** Task 3
**Files:** packages/intelligence/src/analysis-provider/anthropic.ts, packages/intelligence/tests/analysis-provider/anthropic.test.ts

1. Create test file first:
   - Test: constructor accepts API key and optional model default
   - Test: `analyze()` sends structured JSON output request with response schema
   - Test: `analyze()` returns parsed result with token usage and latency
   - Test: `analyze()` respects per-request model override
   - Test: `analyze()` propagates API errors cleanly
   - Mock the Anthropic SDK (`@anthropic-ai/sdk`) — do NOT make real API calls

2. Implement `AnthropicAnalysisProvider`:
   - Constructor: `(config: { apiKey: string; defaultModel?: string })`
   - Uses Anthropic SDK's `messages.create()` with `response_format: { type: 'json_schema', json_schema: request.responseSchema }`
   - Measures latency via `performance.now()`
   - Extracts token usage from response

3. Export from `index.ts`

4. Run tests

---

### Task 5: Implement SEL prompt templates

**Depends on:** Task 2
**Files:** packages/intelligence/src/sel/prompts.ts

1. Create `packages/intelligence/src/sel/prompts.ts`:
   - `SEL_SYSTEM_PROMPT`: instructs the LLM to analyze a work item and produce a structured `EnrichedSpec`
   - `buildEnrichmentPrompt(item: RawWorkItem, graphContext?: string): string`: constructs the user prompt with the work item details and optional graph context about known systems
   - `SEL_RESPONSE_SCHEMA`: JSON schema matching the `EnrichedSpec` interface for structured output

2. The system prompt should instruct the LLM to:
   - Extract intent from title + description
   - Identify affected systems from natural language
   - Enumerate functional and non-functional requirements
   - Flag unknowns, ambiguities, and assumptions explicitly
   - Provide initial complexity hints (textual and structural estimates)

---

### Task 6: Implement SEL graph validator

**Depends on:** Task 2
**Files:** packages/intelligence/src/sel/graph-validator.ts, packages/intelligence/tests/sel/graph-validator.test.ts

1. Create test file first:
   - Test: given an LLM-proposed system name that exists in the graph, resolves `graphNodeId` and sets `confidence > 0`
   - Test: given an LLM-proposed system name NOT in the graph, sets `graphNodeId: null` and `confidence: 0`
   - Test: given a resolved system, populates `transitiveDeps` from graph traversal
   - Test: given a resolved system, populates `testCoverage` from graph test file nodes
   - Test: deduplicates systems with overlapping graph nodes
   - Mock `GraphStore` and `FusionLayer`

2. Implement `GraphValidator`:
   - Constructor: `(graphStore: GraphStore, fusionLayer?: FusionLayer)`
   - `validateSystems(proposed: Array<{ name: string; confidence: number }>): Promise<AffectedSystem[]>`
   - For each proposed system:
     - Use `FusionLayer.search()` or `GraphStore` node query to find matching code entities
     - If found: set `graphNodeId`, walk `depends_on` edges for `transitiveDeps`, find linked test files for `testCoverage`
     - If not found: set `graphNodeId: null`, `confidence: 0`

3. Export from `index.ts`

4. Run tests

---

### Task 7: Implement SEL enricher

**Depends on:** Tasks 3, 5, 6
**Files:** packages/intelligence/src/sel/enricher.ts, packages/intelligence/tests/sel/enricher.test.ts

1. Create test file first:
   - Test: `enrich()` calls `AnalysisProvider.analyze()` with SEL prompt and response schema
   - Test: `enrich()` passes LLM-proposed systems through `GraphValidator`
   - Test: returned `EnrichedSpec` has non-null `intent` and explicit `unknowns` array
   - Test: when LLM proposes 3 systems but graph validates only 2, result has 2 validated + 1 unresolved
   - Test: `enrich()` includes graph context in prompt when graph has known systems
   - Mock `AnalysisProvider` and `GraphValidator`

2. Implement `SpecEnricher`:
   - Constructor: `(provider: AnalysisProvider, graphValidator: GraphValidator)`
   - `enrich(item: RawWorkItem): Promise<EnrichedSpec>`
   - Flow:
     1. Build prompt via `buildEnrichmentPrompt(item)`
     2. Call `provider.analyze<LlmEnrichmentResult>(request)` with SEL schema
     3. Extract proposed affected systems from LLM result
     4. Validate via `graphValidator.validateSystems(proposed)`
     5. Assemble final `EnrichedSpec` with validated systems

3. Export from `index.ts`

4. Run tests

---

### Task 8: Implement CML structural scoring

**Depends on:** Task 2
**Files:** packages/intelligence/src/cml/structural.ts, packages/intelligence/tests/cml/structural.test.ts

1. Create test file first:
   - Test: given an `EnrichedSpec` with 2 resolved `affectedSystems`, computes blast radius via `CascadeSimulator`
   - Test: blast radius aggregates across all affected systems (union of cascade results)
   - Test: structural score normalizes blast radius to 0–1 range
   - Test: when no systems have `graphNodeId`, structural score defaults to 0.5 (unknown)
   - Test: `blastRadius` object has correct `services`, `modules`, `filesEstimated`, `testFilesAffected` counts
   - Mock `CascadeSimulator` and `GraphComplexityAdapter`

2. Implement `StructuralScorer`:
   - Constructor: `(cascadeSimulator: CascadeSimulator, complexityAdapter: GraphComplexityAdapter)`
   - `score(spec: EnrichedSpec): StructuralResult`
   - For each `affectedSystem` with a `graphNodeId`:
     - Run `cascadeSimulator.simulate(graphNodeId)` to get blast radius
     - Check if any hotspots from `complexityAdapter.computeComplexityHotspots()` overlap
   - Aggregate: union of cascade nodes → `filesEstimated`, count module/service boundaries → `services`/`modules`
   - Normalize to 0–1: `min(1, totalAffectedFiles / 100)` (capped)

3. Export from `index.ts`

4. Run tests

---

### Task 9: Implement CML semantic scoring

**Depends on:** Task 2
**Files:** packages/intelligence/src/cml/semantic.ts, packages/intelligence/tests/cml/semantic.test.ts

1. Create test file first:
   - Test: high ambiguity count (≥3) produces semantic score >0.6
   - Test: many unknowns (≥3) increases semantic score
   - Test: zero ambiguities and zero unknowns produces semantic score <0.2
   - Test: empty `affectedSystems` increases score (vague scope)
   - Test: `initialComplexityHints.textualComplexity` factors into score

2. Implement `SemanticScorer`:
   - `score(spec: EnrichedSpec): number` (returns 0–1)
   - Factors:
     - `spec.ambiguities.length` — weighted 0.3
     - `spec.unknowns.length` — weighted 0.25
     - `spec.riskSignals.length` — weighted 0.2
     - `spec.affectedSystems.filter(s => s.graphNodeId === null).length` — weighted 0.15 (unresolved systems)
     - `spec.initialComplexityHints.textualComplexity` — weighted 0.1
   - Each factor normalized individually, then weighted sum capped at 1.0

3. Export from `index.ts`

4. Run tests

---

### Task 10: Implement CML scorer (composer)

**Depends on:** Tasks 8, 9
**Files:** packages/intelligence/src/cml/scorer.ts, packages/intelligence/tests/cml/scorer.test.ts

1. Create test file first:
   - Test: `score()` combines structural and semantic dimensions into `ComplexityScore`
   - Test: `overall` is weighted average of structural (0.5) and semantic (0.3) and historical (0.2, defaults to 0 for Phase 1)
   - Test: `riskLevel` maps: <0.3 → 'low', <0.5 → 'medium', <0.7 → 'high', ≥0.7 ��� 'critical'
   - Test: `reasoning` array includes entries from both scorers
   - Test: `recommendedRoute` maps: <0.3 → 'local', <0.7 → 'simulation-required', ≥0.7 → 'human'
   - Test: `confidence` decreases when many systems are unresolved
   - Mock `StructuralScorer` and `SemanticScorer`

2. Implement `ComplexityScorer`:
   - Constructor: `(structuralScorer: StructuralScorer, semanticScorer: SemanticScorer)`
   - `score(spec: EnrichedSpec): ComplexityScore`
   - Flow:
     1. Get structural result (includes blastRadius + score)
     2. Get semantic score
     3. Combine: `overall = structural * 0.5 + semantic * 0.3 + historical * 0.2` (historical = 0 in Phase 1)
     4. Compute confidence: based on graph coverage of affected systems
     5. Map to `riskLevel` and `recommendedRoute`
     6. Collect reasoning strings from both scorers

3. Export from `index.ts`

4. Run tests

[checkpoint:verify] — All CML tests pass, scorer produces valid ComplexityScore

---

### Task 11: Implement scoreToConcernSignals()

**Depends on:** Task 10
**Files:** packages/intelligence/src/pipeline.ts, packages/intelligence/tests/pipeline.test.ts

1. Create test file first:
   - Test: score with `overall < 0.7` and `blastRadius.filesEstimated < 20` and `semantic < 0.6` produces empty signals
   - Test: score with `overall >= 0.7` produces `ConcernSignal` with `name: 'highComplexity'`
   - Test: score with `blastRadius.filesEstimated > 20` produces `ConcernSignal` with `name: 'largeBlastRadius'`
   - Test: score with `dimensions.semantic > 0.6` produces `ConcernSignal` with `name: 'highAmbiguity'`
   - Test: multiple thresholds exceeded produces multiple signals
   - Test: returned signals match `ConcernSignal` interface (`name` and `reason` fields, NOT `type`/`detail`)

2. Implement `scoreToConcernSignals(score: ComplexityScore): ConcernSignal[]`:
   - Uses `{name, reason}` fields to match existing `ConcernSignal` interface
   - Thresholds:
     - `overall >= 0.7` → `{ name: 'highComplexity', reason: score.reasoning.join('; ') }`
     - `blastRadius.filesEstimated > 20` → `{ name: 'largeBlastRadius', reason: '${n} files affected' }`
     - `dimensions.semantic > 0.6` → `{ name: 'highAmbiguity', reason: 'Significant unknowns or ambiguities in spec' }`

3. Export from `index.ts`

4. Run tests

---

### Task 12: Implement IntelligencePipeline facade

**Depends on:** Tasks 7, 10, 11
**Files:** packages/intelligence/src/pipeline.ts (extend), packages/intelligence/tests/pipeline.test.ts (extend)

1. Add tests:
   - Test: `preprocessIssue()` calls SEL → CML → scoreToConcernSignals in sequence
   - Test: for `autoExecute` tier, skips LLM enrichment — uses lightweight graph-only scoring
   - Test: for `signalGated` tier, runs full SEL + CML pipeline
   - Test: for `alwaysHuman` tier, skips pipeline entirely (returns empty signals)
   - Test: returned `PreprocessResult` includes `spec`, `score`, and `signals`
   - Mock all layer dependencies

2. Implement `IntelligencePipeline`:
   - Constructor: `(enricher: SpecEnricher, scorer: ComplexityScorer, config: IntelligenceConfig)`
   - `preprocessIssue(issue: Issue, scopeTier: ScopeTier): Promise<PreprocessResult>`
   - Flow:
     1. If `alwaysHuman` tier → return empty (no cost for obvious escalations)
     2. Convert `issue` → `RawWorkItem` via `toRawWorkItem()`
     3. If `autoExecute` tier → skip SEL LLM call, use graph-only structural scoring
     4. If `signalGated` tier → full SEL enrichment → CML scoring
     5. Convert score → concern signals
     6. Return `{ spec, score, signals }`

3. Implement `createIntelligencePipeline(deps: PipelineDependencies): IntelligencePipeline` factory

4. Update `index.ts` barrel exports

5. Run tests

---

### Task 13: Add IntelligenceConfig to WorkflowConfig

**Depends on:** Task 3
**Files:** packages/types/src/orchestrator.ts

1. Add `IntelligenceConfig` interface:

   ```typescript
   interface IntelligenceConfig {
     enabled: boolean;
     provider: {
       kind: 'anthropic' | 'openai-compatible';
       apiKey?: string;
       model?: string;
       maxTokens?: number;
     };
     sel?: { model?: string };
     cml?: { model?: string };
   }
   ```

2. Add optional `intelligence?: IntelligenceConfig` field to `WorkflowConfig`

3. No test needed — type-only change verified by typecheck

---

### Task 14: Create orchestrator intelligence bridge

**Depends on:** Tasks 12, 13
**Files:** packages/orchestrator/src/intelligence/bridge.ts, packages/orchestrator/tests/intelligence/bridge.test.ts, packages/orchestrator/package.json, packages/orchestrator/tsconfig.json

1. Add `@harness-engineering/intelligence` dependency to orchestrator's `package.json`

2. Add project reference in orchestrator's `tsconfig.json`

3. Create test file first:
   - Test: `enrichTickCandidates()` preprocesses each candidate and returns enrichment map
   - Test: when `intelligence.enabled` is false, returns empty enrichments map
   - Test: when `intelligence` config is undefined, returns empty enrichments map
   - Test: when pipeline fails for one issue, logs warning and returns empty signals for that issue (graceful degradation)
   - Test: enrichment map keyed by issue ID, value is `ConcernSignal[]`
   - Mock `IntelligencePipeline`

4. Implement `IntelligenceBridge`:
   - Constructor: `(pipeline: IntelligencePipeline | null)`
   - `enrichTickCandidates(candidates: Issue[], config: WorkflowConfig): Promise<Map<string, ConcernSignal[]>>`
   - For each candidate:
     - Detect scope tier (reuse `detectScopeTier`)
     - Call `pipeline.preprocessIssue(issue, scopeTier)`
     - Collect signals into map
   - Wraps each call in try/catch — failed enrichment falls back to empty signals (never blocks dispatch)

5. Implement `createIntelligenceBridge(config: WorkflowConfig, graphStore: GraphStore): IntelligenceBridge | null` factory
   - Returns `null` if `config.intelligence?.enabled` is falsy

6. Run tests

---

### Task 15: Wire intelligence into orchestrator tick cycle

**Depends on:** Task 14
**Files:** packages/orchestrator/src/core/state-machine.ts, packages/orchestrator/src/types/events.ts, packages/orchestrator/tests/intelligence/bridge.test.ts (extend)

1. Extend `TickEvent` in `events.ts`:
   - Add optional `enrichments?: Map<string, ConcernSignal[]>` field
   - This carries pre-computed signals from the async orchestrator loop into the pure state machine

2. Modify `handleTick()` in `state-machine.ts` (lines 94-98):
   - Replace hardcoded `{ hasSpec: false, hasPlans: false }` with artifact presence from enrichments (future: Phase 2 will detect artifacts)
   - Replace empty `[]` in `routeIssue(scopeTier, [], escalationConfig)` with:
     ```typescript
     const signals = event.enrichments?.get(issue.id) ?? [];
     const decision = routeIssue(scopeTier, signals, escalationConfig);
     ```

3. The orchestrator loop (the caller of `applyEvent`) must:
   - Call `intelligenceBridge.enrichTickCandidates(candidates, config)` before constructing the `TickEvent`
   - Pass the enrichments map into the `TickEvent`
   - This keeps the state machine pure (no async) while enabling intelligence signals

4. Add integration test:
   - Test: when enrichments map contains signals for an issue, `routeIssue()` receives those signals
   - Test: when enrichments map is empty/undefined, behavior is identical to current (backward compatible)

5. Run full existing test suite: `npx vitest run packages/orchestrator/tests/` — all must pass

6. Run `harness validate`

[checkpoint:human-verify] — Full pipeline runs end-to-end. Review the dispatch path changes in state-machine.ts before proceeding to Phase 2.

## Dependencies

```
Task 1 ─────────┬──── Task 2 ────── Task 5 ──┐
                 │                              ├── Task 7 ──┐
                 ├──── Task 3 ────── Task 4     │            │
                 │         │                    │            │
                 │         ├──── Task 5         │            │
                 │         │                    │            │
                 │         └──── Task 13        │            │
                 │                              │            │
                 ├──── Task 6 ─────────────────┘            │
                 │                                           │
                 ├──── Task 8 ──┐                           │
                 │               ├── Task 10 ── Task 11 ──── Task 12 ── Task 14 ── Task 15
                 └──── Task 9 ──┘
```

**Parallelizable groups:**

- Group A (no deps): Task 1
- Group B (after Task 1): Tasks 2, 3, 6 in parallel
- Group C (after Group B): Tasks 4, 5, 8, 9, 13 in parallel
- Group D (after Group C): Tasks 7, 10 in parallel
- Group E (after Group D): Task 11
- Group F (after Task 11): Task 12
- Group G (after Task 12): Task 14
- Group H (after Task 14): Task 15

## Risk Mitigations

| Risk                                                                                     | Mitigation                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| State machine is pure — can't make async LLM calls                                       | Enrichments pre-computed in orchestrator loop, passed via `TickEvent.enrichments` map                                                         |
| ConcernSignal field mismatch (spec says `type`/`detail`, interface says `name`/`reason`) | Implementation uses `{name, reason}` to match existing interface — no type changes needed                                                     |
| LLM latency adds to tick cycle                                                           | Pipeline runs before `applyEvent()` call, outside the hot path. Graceful degradation on timeout                                               |
| Intelligence failure blocks dispatch                                                     | Bridge wraps each call in try/catch — falls back to empty signals (identical to current behavior)                                             |
| New package introduces circular dependency                                               | `intelligence` depends on `types` + `graph` + `core` only. Orchestrator depends on intelligence. One-way flow enforced by tsconfig references |
