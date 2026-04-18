# @harness-engineering/intelligence

Intelligence pipeline for spec enrichment, complexity modeling, and pre-execution simulation. Augments the hybrid orchestrator's routing with graph-backed analysis and tiered simulation.

## Architecture

```
                         ┌─────────────────────┐
                         │    Work Item Input   │
                         │  Roadmap · JIRA ·    │
                         │  GitHub · Linear ·   │
                         │  Manual text         │
                         └──────────┬──────────┘
                                    ▼
                         ┌─────────────────────┐
                         │      Adapters        │
                         │  toRawWorkItem()     │
                         │  jiraToRawWorkItem() │
                         │  githubToRawWorkItem │
                         │  linearToRawWorkItem │
                         │  manualToRawWorkItem │
                         └──────────┬──────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│                    IntelligencePipeline                        │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SEL — Spec Enrichment Layer                             │  │
│  │  LLM analysis + graph-validated system discovery         │  │
│  │  → EnrichedSpec (intent, affected systems, unknowns)     │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CML — Complexity Modeling Layer                         │  │
│  │  Structural (graph blast radius) + Semantic (ambiguity)  │  │
│  │  + Historical (past outcome failure rate)                │  │
│  │  → ComplexityScore → ConcernSignal[]                     │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PESL — Pre-Execution Simulation Layer                   │  │
│  │  Graph-only checks (quick-fix) or full LLM simulation    │  │
│  │  (guided-change) with abort on low confidence            │  │
│  │  → SimulationResult (confidence, abort flag)             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Outcome Recording                                       │  │
│  │  ExecutionOutcomeConnector → graph nodes + edges         │  │
│  │  Feeds back into CML historical dimension                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Quick Start

```ts
import {
  IntelligencePipeline,
  AnthropicAnalysisProvider,
  toRawWorkItem,
} from '@harness-engineering/intelligence';
import { GraphStore } from '@harness-engineering/graph';

// 1. Create the pipeline
const provider = new AnthropicAnalysisProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
const store = new GraphStore();
await store.load('.harness/graph');

const pipeline = new IntelligencePipeline(provider, store);

// 2. Preprocess an issue (SEL → CML → signals)
const result = await pipeline.preprocessIssue(issue, scopeTier, escalationConfig);
// result.spec    — EnrichedSpec with intent, affected systems, unknowns
// result.score   — ComplexityScore with overall 0-1, risk level, reasoning
// result.signals — ConcernSignal[] for routeIssue()

// 3. Simulate before dispatch (PESL)
if (result.spec && result.score) {
  const simulation = await pipeline.simulate(result.spec, result.score, scopeTier);
  // simulation.abort — true if confidence too low
  // simulation.predictedFailures — what might go wrong
  // simulation.testGaps — missing test coverage
}

// 4. Record execution outcomes (feedback loop)
await pipeline.recordOutcome({
  issueId: 'CORE-42',
  result: 'success',
  retryCount: 0,
  failureReasons: [],
  durationMs: 45000,
  affectedSystemNodeIds: ['node-abc'],
});
```

## Tier-Based Behavior

The pipeline adapts its behavior based on the orchestrator's scope tier:

| Scope Tier                            | SEL  | CML  | PESL                | Routing                                 |
| ------------------------------------- | ---- | ---- | ------------------- | --------------------------------------- |
| `autoExecute` (quick-fix, diagnostic) | Skip | Skip | Graph-only          | Always dispatch locally                 |
| `signalGated` (guided-change)         | Run  | Run  | Full LLM simulation | Dispatch if no concern signals          |
| `alwaysHuman` (full-exploration)      | Run  | Skip | Skip                | Always escalate (enrichment as context) |

## Layers

### SEL — Spec Enrichment Layer

Converts raw work items into structured `EnrichedSpec` objects via LLM analysis and graph validation.

```ts
import { enrich, GraphValidator } from '@harness-engineering/intelligence';

const validator = new GraphValidator(store);
const spec = await enrich(rawWorkItem, provider, validator);
// spec.intent — what the task is trying to accomplish
// spec.affectedSystems — graph-validated system references
// spec.unknowns — explicitly identified knowledge gaps
// spec.ambiguities — areas needing clarification
```

### CML — Complexity Modeling Layer

Scores task complexity across three dimensions:

- **Structural** — Graph blast radius via `CascadeSimulator`, normalized to 0-1
- **Semantic** — Unknowns, ambiguities, and risk signals from SEL enrichment
- **Historical** — Smoothed failure rate from past execution outcomes on the same affected systems

```ts
import { scoreCML, scoreToConcernSignals } from '@harness-engineering/intelligence';

const score = scoreCML(enrichedSpec, store);
// score.overall — 0-1 weighted composite
// score.riskLevel — 'low' | 'medium' | 'high' | 'critical'
// score.recommendedRoute — 'local' | 'human' | 'simulation-required'

const signals = scoreToConcernSignals(score);
// signals fed into existing routeIssue() for signalGated tiers
```

### PESL — Pre-Execution Simulation Layer

Simulates execution before code is written. Tiered by cost:

- **Graph-only** (quick-fix/diagnostic) — `CascadeSimulator` blast radius + test gap detection. Fast (<2s), no LLM cost.
- **Full simulation** (guided-change) — LLM-assisted plan expansion, failure injection, test projection. Merged with graph baseline.

```ts
import { PeslSimulator } from '@harness-engineering/intelligence';

const simulator = new PeslSimulator(provider, store);
const result = await simulator.simulate(spec, score, scopeTier);

if (result.abort) {
  // Confidence too low — escalate to human instead of dispatching
  console.log('Predicted failures:', result.predictedFailures);
  console.log('Test gaps:', result.testGaps);
}
```

### Adapters

Pure mapping functions for converting external data into `RawWorkItem`:

```ts
import {
  toRawWorkItem, // Roadmap Issue → RawWorkItem
  jiraToRawWorkItem, // JIRA issue → RawWorkItem
  githubToRawWorkItem, // GitHub issue/PR → RawWorkItem
  linearToRawWorkItem, // Linear issue → RawWorkItem
  manualToRawWorkItem, // Free text → RawWorkItem
} from '@harness-engineering/intelligence';
```

Each adapter accepts a pre-fetched data object and produces a `RawWorkItem`. No API clients are included — adapters are pure functions.

### Effectiveness — Agent Performance Introspection

Analyzes persona-attributed `execution_outcome` nodes in the graph to score per-persona accuracy, detect blind spots, and recommend which persona to route new issues to.

```ts
import {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from '@harness-engineering/intelligence';

// Per-(persona, system) success rates with Laplace smoothing
const scores = computePersonaEffectiveness(store, { persona: 'backend-dev' });
// scores[0].successRate — smoothed success rate in [0, 1]
// scores[0].sampleSize  — total observations

// Blind spots: (persona, system) pairs with high failure rates
const spots = detectBlindSpots(store, { minFailures: 2, minFailureRate: 0.5 });
// spots[0].failureRate — raw failure rate
// spots[0].failures    — absolute failure count

// Recommend personas for an issue given its affected systems
const recs = recommendPersona(store, {
  systemNodeIds: ['module-auth', 'module-db'],
  candidatePersonas: ['backend-dev', 'fullstack'],
  minSamples: 3,
});
// recs[0].persona — best candidate
// recs[0].score   — mean smoothed success rate across requested systems
```

### Specialization — Persistent Agent Expertise Tracking

Extends effectiveness with temporal decay, task-type categorization, consistency scoring, expertise levels, and persistent profile storage. Recent outcomes are weighted more heavily than old ones via exponential decay.

```ts
import {
  computeSpecialization,
  computeExpertiseLevel,
  buildSpecializationProfile,
  weightedRecommendPersona,
  decayWeight,
  temporalSuccessRate,
  loadProfiles,
  saveProfiles,
  refreshProfiles,
} from '@harness-engineering/intelligence';

// Compute specialization entries for (persona, system, taskType) tuples
const entries = computeSpecialization(store, {
  persona: 'backend-dev',
  taskType: 'bug-fix',
  temporal: { halfLifeDays: 30 },
});
// entries[0].score.composite         — weighted combination of temporal, consistency, volume
// entries[0].expertiseLevel          — 'novice' | 'competent' | 'proficient' | 'expert'

// Classify expertise from raw numbers
const level = computeExpertiseLevel(25, 0.8); // → 'proficient'

// Build a full profile for a persona (strengths, weaknesses, overall level)
const profile = buildSpecializationProfile(store, 'backend-dev', {
  temporal: { halfLifeDays: 30 },
});
// profile.strengths   — top 3 entries by composite score
// profile.weaknesses  — entries with temporal success rate < 0.5
// profile.overallLevel — median expertise across all entries

// Weighted recommendation incorporating specialization multipliers
const weighted = weightedRecommendPersona(store, {
  systemNodeIds: ['module-auth'],
  taskType: 'bug-fix',
});
// weighted[0].weightedScore — baseScore * specializationMultiplier

// Temporal decay helpers
const weight = decayWeight(15, 30); // weight at 15 days with 30-day half-life
const rate = temporalSuccessRate([{ result: 'success', timestamp: '2026-04-01T00:00:00Z' }], {
  halfLifeDays: 30,
});

// Persist profiles to .harness/specialization-profiles.json
const profiles = loadProfiles('/path/to/project');
saveProfiles('/path/to/project', profiles);

// Recompute and persist profiles for all personas with outcomes
const refreshed = refreshProfiles('/path/to/project', store);
```

### Outcome Recording

Execution results feed back into the graph for future CML scoring:

```ts
import { ExecutionOutcomeConnector } from '@harness-engineering/intelligence';

const connector = new ExecutionOutcomeConnector(store);
await connector.ingest({
  issueId: 'CORE-42',
  result: 'failure',
  retryCount: 2,
  failureReasons: ['Migration script failed'],
  durationMs: 120000,
  affectedSystemNodeIds: ['module-auth'],
});
// Creates execution_outcome node with outcome_of edges to affected systems
// Future CML scoring queries these outcomes for historical failure rates
```

## Orchestrator Integration

The intelligence pipeline integrates into the orchestrator's tick cycle at two points:

1. **Pre-routing** (in `asyncTick`) — `preprocessIssue()` runs SEL + CML, producing concern signals that feed into `routeIssue()`. For `alwaysHuman` tiers, the enriched spec is attached to the `EscalateEffect` as context for the human reviewer.

2. **Post-routing** (in `asyncTick`) — `simulate()` runs PESL for locally-routed issues. If simulation recommends abort (`confidence < 0.3`), the dispatch is converted to an `EscalateEffect` instead.

3. **Post-execution** (in `emitWorkerExit`) — `recordOutcome()` ingests the execution result into the graph, feeding the CML historical dimension for future scoring.

### Dashboard

The dashboard's **Attention** page displays escalated interactions. When the intelligence pipeline is enabled, escalations include enriched context:

- **Enriched spec summary** — Intent, affected systems, unknowns
- **Concern signals** — What triggered the escalation (high complexity, large blast radius, high ambiguity)
- **PESL abort reasons** — Predicted failures and test gaps (when simulation recommends abort)

This context helps human reviewers make faster, more informed decisions about escalated work items.

## Configuration

The pipeline uses the same LLM connection as the orchestrator's agent backend — Anthropic API, OpenAI API, or a local LLM (Ollama, LM Studio, etc.):

```yaml
intelligence:
  enabled: true
```

No separate API key needed. The pipeline derives its provider from the existing agent config:

| Agent Backend                     | Intelligence Uses                 |
| --------------------------------- | --------------------------------- |
| `anthropic` / `claude`            | Anthropic Messages API (same key) |
| `openai`                          | OpenAI Chat API (same key)        |
| `localBackend: openai-compatible` | Local endpoint (same URL)         |

Override models per-layer:

```yaml
intelligence:
  enabled: true
  models:
    sel: llama3.2 # fast model for enrichment
    pesl: deepseek-r1 # reasoning model for simulation
```

For thinking models (Qwen3, DeepSeek-R1), disable reasoning for structured output:

```yaml
intelligence:
  enabled: true
  promptSuffix: '/no_think' # Qwen3 — disable thinking for structured output
  jsonMode: false # Qwen3 hangs with Ollama's JSON grammar constraint
  requestTimeoutMs: 90000 # fail fast instead of waiting 10 min
  failureCacheTtlMs: 300000 # don't retry failed analyses for 5 min
```

When `enabled: false` (default), the pipeline is completely skipped. See the [Intelligence Pipeline Guide](../../docs/guides/intelligence-pipeline.md) for full configuration reference.

## Dependencies

```
@harness-engineering/types  → shared type definitions
@harness-engineering/graph  → GraphStore, CascadeSimulator, node/edge types
@anthropic-ai/sdk           → LLM calls via AnalysisProvider
openai                      → OpenAI-compatible analysis provider
zod                         → response schema validation
```

The intelligence package has **no dependency** on `@harness-engineering/orchestrator`. The dependency flows one way: `orchestrator → intelligence → graph → types`.

## API Reference

### Pipeline

| Export                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `IntelligencePipeline` | Main pipeline class composing SEL, CML, PESL |
| `PreprocessResult`     | Return type of `preprocessIssue()`           |

### Adapters

| Export                | Description                     |
| --------------------- | ------------------------------- |
| `toRawWorkItem`       | Roadmap `Issue` → `RawWorkItem` |
| `jiraToRawWorkItem`   | JIRA issue → `RawWorkItem`      |
| `githubToRawWorkItem` | GitHub issue/PR → `RawWorkItem` |
| `linearToRawWorkItem` | Linear issue → `RawWorkItem`    |
| `manualToRawWorkItem` | Free text → `RawWorkItem`       |

### Types

| Export             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `RawWorkItem`      | Generic work item input                              |
| `EnrichedSpec`     | SEL output with intent, affected systems, unknowns   |
| `ComplexityScore`  | CML output with overall score, risk level, reasoning |
| `SimulationResult` | PESL output with confidence, abort flag, predictions |
| `ExecutionOutcome` | Outcome data for graph ingestion                     |

### Effectiveness

| Export                        | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `computePersonaEffectiveness` | Per-(persona, system) Laplace-smoothed success rates           |
| `detectBlindSpots`            | Find (persona, system) pairs with high failure rates           |
| `recommendPersona`            | Recommend personas for an issue given affected system node IDs |
| `PersonaEffectivenessScore`   | Type: smoothed success rate for a (persona, system) pair       |
| `BlindSpot`                   | Type: (persona, system) pair with consistent failures          |
| `PersonaRecommendation`       | Type: persona recommendation with score and coverage stats     |

### Specialization

| Export                       | Description                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `computeSpecialization`      | Compute specialization entries for (persona, system, taskType) tuples           |
| `computeExpertiseLevel`      | Classify expertise level from sample size and success rate                      |
| `buildSpecializationProfile` | Build a full profile for a persona (strengths, weaknesses, overall level)       |
| `weightedRecommendPersona`   | Persona recommendation with specialization multipliers                          |
| `decayWeight`                | Exponential decay weight for an outcome at a given age                          |
| `temporalSuccessRate`        | Temporally-weighted success rate from timestamped outcomes                      |
| `loadProfiles`               | Load persisted specialization profiles from disk                                |
| `saveProfiles`               | Save specialization profiles to `.harness/specialization-profiles.json`         |
| `refreshProfiles`            | Recompute and persist profiles for all personas with outcomes                   |
| `SpecializationScore`        | Type: composite score (temporal, consistency, volume, composite)                |
| `SpecializationEntry`        | Type: single entry for a (persona, system, taskType) bucket                     |
| `SpecializationProfile`      | Type: full persona profile with strengths, weaknesses, overall level            |
| `WeightedRecommendation`     | Type: recommendation with base score, specialization multiplier, weighted score |
| `ExpertiseLevel`             | Type: `'novice' \| 'competent' \| 'proficient' \| 'expert'`                     |
| `TaskType`                   | Type: task type categorization                                                  |
| `TemporalConfig`             | Type: temporal decay configuration (half-life, reference time)                  |
| `ProfileStore`               | Type: persisted store of specialization profiles                                |

### Analysis

| Export                             | Description                                |
| ---------------------------------- | ------------------------------------------ |
| `AnthropicAnalysisProvider`        | Anthropic-backed `AnalysisProvider`        |
| `OpenAICompatibleAnalysisProvider` | OpenAI/local LLM-backed `AnalysisProvider` |
| `enrich`                           | SEL enrichment function                    |
| `GraphValidator`                   | Graph-based affected system resolver       |
| `scoreCML`                         | CML scoring function                       |
| `scoreToConcernSignals`            | Score → `ConcernSignal[]` conversion       |
| `PeslSimulator`                    | Tiered simulation facade                   |
| `ExecutionOutcomeConnector`        | Outcome graph ingestion                    |
| `computeHistoricalComplexity`      | CML historical dimension                   |

## License

MIT
