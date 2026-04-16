# Intelligence Pipeline: Spec Enrichment, Complexity Modeling, and Pre-Execution Simulation

## Overview

The orchestrator gains three composable analysis layers — collectively the **intelligence pipeline** — that transform raw work items into structured specs, score their complexity against the knowledge graph, and simulate execution before code is written. These layers live in a new `packages/intelligence/` package and integrate into the orchestrator's existing dispatch pipeline, augmenting the hybrid orchestrator's routing logic without replacing it.

The pipeline operates on a generic `RawWorkItem` interface, making it adapter-agnostic. V1 targets roadmap items via the existing `RoadmapTrackerAdapter`; future adapters (JIRA, GitHub Issues, Linear, manual text) plug in without pipeline changes.

### Goals

1. Convert unstructured work items into structured, machine-readable `EnrichedSpec` objects via LLM + graph-validated discovery
2. Score task complexity using graph-based blast radius, structural metrics, and semantic analysis — feeding the score as concern signals into the existing `routeIssue()` for `signalGated` tier decisions
3. Simulate execution pre-flight for guided-change issues using LLM-assisted dry-runs, reducing failed executions by ≥50%
4. Store execution outcomes as graph nodes, enabling historical pattern matching for future scoring
5. Maintain ≥80% autonomous local execution rate for safe tasks while improving routing accuracy for ambiguous work

### Non-Goals

- Replacing the existing state machine, routing tiers, or verification loop
- Running CML on `autoExecute` (quick-fix) or `alwaysHuman` (full-exploration) tiers — scope tiers remain the fast path
- Training or fine-tuning models
- Full embedding-based similarity search (V2 — structured outcome log + graph queries first)
- Guaranteeing perfect runtime prediction

## Decisions

| #   | Decision                                                                                                                                                                                               | Rationale                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Roadmap-first, adapter-agnostic.** V1 consumes existing `Issue` objects from `RoadmapTrackerAdapter` via a generic `RawWorkItem` interface. JIRA/GitHub/Linear/manual adapters plug in later.        | Proves the pipeline on existing data without external API dependencies. Generic interface ensures no adapter-specific coupling.                                                     |
| D2  | **New `AnalysisProvider` interface for LLM calls.** Single-shot structured JSON output, independent from multi-turn `AgentBackend` sessions. Supports per-layer model assignment.                      | SEL/PESL need prompt-in/JSON-out, not multi-turn sessions. Separate interface enables independent token budgets and cheaper models for enrichment.                                  |
| D3  | **CML augments `routeIssue()`, doesn't replace it.** Scope tiers remain the fast path. CML runs only for `signalGated` tier, producing concern signals that feed the existing routing function.        | Quick-fix → local and full-exploration → human are already correct. CML adds intelligence only where the decision is ambiguous. No LLM cost for obvious cases.                      |
| D4  | **Execution outcomes stored as graph nodes.** New `ExecutionOutcomeConnector` ingests results into the knowledge graph. CML queries outcomes via existing `FusionLayer` and graph traversal.           | Graph already has `test_result`/`failure` node types, `CascadeSimulator` for blast radius, and `FusionLayer` for similarity search. No separate outcome log or vector store needed. |
| D5  | **Tiered PESL.** Quick-fix/diagnostic get graph-only checks (CascadeSimulator + get_impact). Guided-change gets full LLM simulation (plan expansion, failure injection, test projection).              | Cost-proportional to risk. Graph checks are fast and free. LLM simulation reserved for issues where stakes justify the cost.                                                        |
| D6  | **New `packages/intelligence/` package.** SEL, CML, PESL exported as composable functions. Dependency chain: `types → graph → core → intelligence → orchestrator`.                                     | Cohesive pipeline, independently testable, reusable from CLI/dashboard/MCP. Packages are cheap to create and easier to isolate.                                                     |
| D7  | **Hybrid system discovery.** LLM proposes affected systems from issue text, graph validates proposals against actual code entities and expands with transitive dependencies, test coverage, ownership. | LLM handles natural language understanding of vague descriptions. Graph grounds proposals in reality and enriches with relationships the LLM can't see.                             |
| D8  | **Extends hybrid orchestrator, not parallel to it.** SEL sits before routing as enrichment. CML feeds into existing `routeIssue()`. PESL sits between routing and dispatch.                            | The hybrid orchestrator already handles the dispatch lifecycle. This spec adds pre-dispatch intelligence layers, not an alternative pipeline.                                       |

## Technical Design

### Architecture Layers

```
JIRA / GitHub / Linear / Roadmap / Manual Text
                    ↓
           RawWorkItem interface
                    ↓
+-----------------------------------------------------------+
|              packages/intelligence/                         |
|                                                            |
|  [1] Spec Enrichment Layer (SEL)                           |
|      LLM enrichment → graph validation → EnrichedSpec      |
|                    ↓                                        |
|  [2] Complexity Modeling Layer (CML)                        |
|      Graph blast radius + structural + semantic scoring     |
|                    ↓                                        |
|  [3] Pre-Execution Simulation Layer (PESL)                  |
|      Graph-only (quick-fix) or full LLM sim (guided-change) |
+-----------------------------------------------------------+
                    ↓
         ConcernSignal[] → routeIssue()
                    ↓
         Existing dispatch pipeline
```

### Package Structure

```
packages/intelligence/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── types.ts                    # RawWorkItem, EnrichedSpec, ComplexityScore, SimulationResult
│   ├── analysis-provider/
│   │   ├── interface.ts            # AnalysisProvider interface
│   │   ├── anthropic.ts            # Anthropic implementation
│   │   └── openai-compatible.ts    # OpenAI/local model implementation
│   ├── sel/
│   │   ├── enricher.ts             # enrich(item: RawWorkItem): EnrichedSpec
│   │   ├── prompts.ts              # SEL prompt templates
│   │   └── graph-validator.ts      # Validate + expand affected_systems via graph
│   ├── cml/
│   │   ├── scorer.ts               # score(spec: EnrichedSpec): ComplexityScore
│   │   ├── structural.ts           # Graph blast radius + coupling metrics
│   │   ├── semantic.ts             # Ambiguity/vagueness scoring from SEL fields
│   │   └── historical.ts           # Past outcome pattern matching (Phase 3)
│   └── pesl/
│       ├── simulator.ts            # simulate(spec, score, plan): SimulationResult
│       ├── graph-checks.ts         # Deterministic: CascadeSimulator + impact
│       ├── llm-simulation.ts       # LLM failure injection + test projection
│       └── prompts.ts              # PESL prompt templates
├── tests/
│   ├── sel/
│   ├── cml/
│   └── pesl/
├── package.json
└── tsconfig.json
```

### Core Types

```typescript
// types.ts

/** Generic input — any adapter produces this */
interface RawWorkItem {
  id: string;
  title: string;
  description: string | null;
  labels: string[];
  metadata: Record<string, unknown>;
  linkedItems: string[];
  comments: string[];
  source: string; // 'roadmap' | 'jira' | 'github' | 'linear' | 'manual'
}

/** SEL output — structured enrichment of a work item */
interface EnrichedSpec {
  id: string;
  title: string;
  intent: string;
  summary: string;
  affectedSystems: AffectedSystem[];
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  apiChanges: string[];
  dbChanges: string[];
  integrationPoints: string[];
  assumptions: string[];
  unknowns: string[];
  ambiguities: string[];
  riskSignals: string[];
  initialComplexityHints: {
    textualComplexity: number; // 0-1
    structuralComplexity: number; // 0-1
  };
}

interface AffectedSystem {
  name: string;
  graphNodeId: string | null; // null if not found in graph
  confidence: number; // 0-1
  transitiveDeps: string[];
  testCoverage: string[];
  owner: string | null;
}

/** CML output — multi-dimensional complexity score */
interface ComplexityScore {
  overall: number; // 0-1
  confidence: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  blastRadius: {
    services: number;
    modules: number;
    filesEstimated: number;
    testFilesAffected: number;
  };
  dimensions: {
    structural: number; // From graph
    semantic: number; // From SEL
    historical: number; // From past outcomes
  };
  reasoning: string[];
  recommendedRoute: 'local' | 'human' | 'simulation-required';
}

/** PESL output — simulation results */
interface SimulationResult {
  simulatedPlan: string[];
  predictedFailures: string[];
  riskHotspots: string[];
  missingSteps: string[];
  testGaps: string[];
  executionConfidence: number; // 0-1
  recommendedChanges: string[];
  abort: boolean;
  tier: 'graph-only' | 'full-simulation';
}
```

### AnalysisProvider Interface

```typescript
// analysis-provider/interface.ts

interface AnalysisRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: Record<string, unknown>;
  model?: string;
  maxTokens?: number;
}

interface AnalysisResponse<T> {
  result: T;
  tokenUsage: { input: number; output: number };
  model: string;
  latencyMs: number;
}

interface AnalysisProvider {
  analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>>;
}
```

### Pipeline Composition

```typescript
// How the orchestrator calls the pipeline

async function preprocessIssue(
  issue: Issue,
  pipeline: IntelligencePipeline,
  scopeTier: ScopeTier
): Promise<{
  spec: EnrichedSpec;
  score: ComplexityScore;
  simulation?: SimulationResult;
}> {
  // 1. Convert Issue → RawWorkItem
  const workItem = toRawWorkItem(issue);

  // 2. SEL: Enrich
  const spec = await pipeline.enrich(workItem);

  // 3. CML: Score
  const score = await pipeline.score(spec);

  // 4. PESL: Simulate (tiered)
  let simulation: SimulationResult | undefined;
  if (scopeTier === 'guided-change' || score.recommendedRoute === 'simulation-required') {
    simulation = await pipeline.simulate(spec, score);
  }

  return { spec, score, simulation };
}
```

### Integration with routeIssue()

```typescript
// CML score → ConcernSignal[] conversion

function scoreToConcernSignals(score: ComplexityScore): ConcernSignal[] {
  const signals: ConcernSignal[] = [];

  if (score.overall >= 0.7) {
    signals.push({
      type: 'highComplexity',
      detail: score.reasoning.join('; '),
    });
  }
  if (score.blastRadius.filesEstimated > 20) {
    signals.push({
      type: 'largeBlastRadius',
      detail: `${score.blastRadius.filesEstimated} files affected`,
    });
  }
  if (score.dimensions.semantic > 0.6) {
    signals.push({
      type: 'highAmbiguity',
      detail: 'Significant unknowns or ambiguities in spec',
    });
  }

  return signals;
}

// Existing routeIssue() consumes these signals unchanged
```

### Data Flow

```
Tick
 |
 +- Fetch candidates from roadmap
 |
 +- For each eligible issue:
 |   +- Detect scope tier (existing logic)
 |   +- preprocessIssue(issue, pipeline, tier)
 |   |   +- SEL: enrich → EnrichedSpec
 |   |   +- CML: score → ComplexityScore
 |   |   +- PESL: simulate (if guided-change or simulation-required)
 |   |
 |   +- Convert score → ConcernSignal[]
 |   +- routeIssue(issue, tier, signals, config)  ← existing function
 |   |
 |   +- dispatch-local:
 |   |   +- If PESL abort → EscalateEffect
 |   |   +- Else → DispatchEffect
 |   |
 |   +- needs-human:
 |       +- EscalateEffect (with enriched context from SEL)
 |
 +- Process side effects (existing flow)
```

## Success Criteria

| #    | Criterion                                                                                                                | Verification                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| SC1  | `RawWorkItem` interface accepts input from `RoadmapTrackerAdapter` with no data loss                                     | Unit test: convert every field from `Issue` → `RawWorkItem` and back, assert round-trip fidelity                           |
| SC2  | SEL produces a valid `EnrichedSpec` with non-null `intent` and explicit `unknowns` list for every input                  | Unit test: feed 10+ diverse roadmap items through SEL, validate schema compliance and non-null invariants                  |
| SC3  | SEL `affectedSystems` are graph-validated — each has a `graphNodeId` or is explicitly marked `null` with `confidence: 0` | Integration test: enrich items referencing known and unknown modules, verify graph resolution behavior                     |
| SC4  | CML produces a `ComplexityScore` with `overall` between 0–1 and non-empty `reasoning` array                              | Unit test: score 10+ enriched specs, validate range constraints and reasoning presence                                     |
| SC5  | CML scores for `signalGated` tier produce `ConcernSignal[]` that `routeIssue()` consumes without modification            | Integration test: score a high-complexity guided-change issue, verify signals trigger `needs-human` routing                |
| SC6  | CML does NOT run LLM calls for `autoExecute` or `alwaysHuman` tiers — only graph-based structural scoring                | Unit test: score a quick-fix issue, verify zero `AnalysisProvider.analyze()` calls                                         |
| SC7  | PESL graph-only checks run in <2 seconds for quick-fix/diagnostic issues                                                 | Performance test: simulate 20 quick-fix issues, assert p95 latency <2s                                                     |
| SC8  | PESL full simulation for guided-change produces `predictedFailures` and `testGaps` with ≥1 entry for non-trivial issues  | Integration test: simulate a multi-module guided-change issue, verify non-empty predictions                                |
| SC9  | PESL `abort: true` recommendation prevents dispatch and produces an `EscalateEffect`                                     | Integration test: simulate an issue where confidence <0.3, verify `EscalateEffect` instead of `DispatchEffect`             |
| SC10 | `ExecutionOutcomeConnector` ingests execution results as graph nodes with edges linking to source code                   | Integration test: ingest a failed result, query graph for outcome node, verify edges exist                                 |
| SC11 | CML historical scoring queries past outcomes — issues touching previously-failed systems score higher                    | Integration test: ingest 3 failed outcomes for a module, score a new issue touching it, verify `dimensions.historical > 0` |
| SC12 | `AnalysisProvider` supports per-layer model configuration — SEL and PESL can use different models                        | Unit test: configure SEL with one model and PESL with another, verify each layer calls the correct model                   |
| SC13 | Pipeline adds <5 seconds total latency to the dispatch path for graph-only issues (quick-fix)                            | Performance test: measure end-to-end `preprocessIssue()` for quick-fix tier, assert p95 <5s                                |
| SC14 | Pipeline integrates into orchestrator tick cycle without breaking existing state machine tests                           | Regression test: run full existing test suite after integration, zero failures                                             |
| SC15 | `packages/intelligence/` has zero direct dependencies on `packages/orchestrator/` — dependency flows one way             | Build test: verify tsconfig references and package.json dependencies, assert no circular dependency                        |

## Implementation Order

### Phase 1: SEL + CML + Orchestrator Integration (Core Pipeline)

**Goal:** A guided-change issue gets enriched into an `EnrichedSpec`, scored by CML, and routed differently based on complexity signals. The full pipeline runs end-to-end in the orchestrator's tick cycle.

1. Scaffold `packages/intelligence/` — package.json, tsconfig, layer dependencies (`types`, `graph`, `core`)
2. Define core types — `RawWorkItem`, `EnrichedSpec`, `ComplexityScore`, `SimulationResult`, `AffectedSystem`
3. Implement `AnalysisProvider` interface + Anthropic implementation (single-shot structured JSON)
4. Implement `toRawWorkItem()` adapter — converts existing `Issue` → `RawWorkItem`
5. Implement SEL enricher — LLM prompt for full `EnrichedSpec` schema, graph-validator for `affectedSystems`
6. Implement CML scorer — graph blast radius (via `CascadeSimulator`), structural complexity (via `GraphComplexityAdapter`), semantic complexity (from SEL ambiguity/unknown counts)
7. Implement `scoreToConcernSignals()` — converts `ComplexityScore` → `ConcernSignal[]`
8. Wire `preprocessIssue()` into orchestrator dispatch path — SEL→CML→signals→`routeIssue()`
9. Add intelligence config to `WorkflowConfig` — `AnalysisProvider` settings, model assignments, enable/disable toggle

**Validates:** SC1, SC2, SC3, SC4, SC5, SC6, SC12, SC14, SC15

### Phase 2: PESL (Pre-Execution Simulation)

**Goal:** Locally-routed issues pass through simulation before dispatch. Quick-fix gets graph checks, guided-change gets full LLM simulation. Simulation can abort and escalate.

1. Implement graph-only checks — `CascadeSimulator` blast radius + `get_impact` test projection, packaged as `SimulationResult`
2. Implement LLM simulation — plan expansion, dependency simulation, failure injection, test projection prompts
3. Implement execution confidence scoring — aggregate graph + LLM signals into final confidence
4. Implement abort logic — confidence below threshold produces `abort: true`
5. Wire PESL into dispatch path — runs after routing decision, before `DispatchEffect`
6. Handle abort — `abort: true` produces `EscalateEffect` instead of `DispatchEffect`

**Validates:** SC7, SC8, SC9, SC13

### Phase 3: Feedback Loop (Historical Learning)

**Goal:** Execution outcomes feed back into the graph. CML uses historical data to improve scoring over time.

1. Define execution outcome schema — result, retry count, failure reasons, duration, linked spec fields
2. Implement `ExecutionOutcomeConnector` — ingests outcomes as graph nodes with edges to source code and enriched specs
3. Wire outcome recording into orchestrator — after `WorkerExitEvent`, ingest outcome
4. Implement CML historical dimension — query graph for past outcomes matching current `affectedSystems`
5. Dashboard analytics — surface outcome trends, failure patterns, scoring accuracy

**Validates:** SC10, SC11

### Phase 4: Multi-Adapter Intake

**Goal:** The pipeline accepts work from external sources beyond roadmap.md.

1. JIRA adapter — API client, `RawWorkItem` conversion, comment/link extraction
2. GitHub Issues adapter — GraphQL client, `RawWorkItem` conversion
3. Linear adapter — API client, `RawWorkItem` conversion
4. Manual text adapter — accepts raw text input from dashboard or CLI, wraps as `RawWorkItem`
5. Adapter configuration in `WorkflowConfig` — select active adapter, credentials

**Validates:** SC1 (across all adapters)

### Phase Boundaries

Each phase is independently shippable and valuable:

- **Phase 1 alone:** Guided-change issues get enriched and scored. Routing improves for ambiguous work. Full value of SEL + CML.
- **Phase 2 alone:** Failed execution rate drops. Quick-fix issues get free graph safety checks. Guided-change gets simulation gate.
- **Phase 3 alone:** System gets smarter over time. Dashboard shows execution trends.
- **Phase 4 alone:** Pipeline accepts work from any source. Unlocks JIRA/GitHub/Linear workflows.
