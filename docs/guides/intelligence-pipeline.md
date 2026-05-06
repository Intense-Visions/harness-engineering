# Intelligence Pipeline Guide

The intelligence pipeline augments the hybrid orchestrator with LLM-powered analysis and graph-backed complexity scoring. It runs automatically during each orchestrator tick cycle when enabled, enriching work items, scoring complexity, and simulating execution before dispatch.

## How It Fits Together

```
  Roadmap / JIRA / GitHub / Linear / Manual text
                    │
                    ▼
         ┌───────────────────┐
         │    Adapters        │  Convert external data → RawWorkItem
         └────────┬──────────┘
                  ▼
         ┌───────────────────┐
         │  Intelligence      │  packages/intelligence/
         │  Pipeline          │
         │                    │
         │  SEL → CML → PESL │  Enrich → Score → Simulate
         └────────┬──────────┘
                  ▼
         ┌───────────────────┐
         │  Orchestrator      │  packages/orchestrator/
         │                    │
         │  routeIssue()      │  Uses concern signals from CML
         │  dispatch / abort  │  Uses abort flag from PESL
         └────────┬──────────┘
                  ▼
         ┌───────────────────┐
         │  Dashboard         │  packages/dashboard/
         │                    │
         │  Attention page    │  Shows escalations with enriched context
         │  Overview page     │  Shows pipeline activity
         └───────────────────┘
```

## Enabling the Pipeline

The intelligence pipeline uses the same LLM connection as your orchestrator's agent backend. If your orchestrator is already configured, just enable it:

```yaml
intelligence:
  enabled: true
```

That's it. The pipeline automatically uses whatever backend your orchestrator is configured with:

When `agent.routing.intelligence.sel` or `agent.routing.intelligence.pesl` is set, those routing keys override the inferred resolution order in the table below. See [Multi-Backend Routing](./multi-backend-routing.md) for routing semantics.

| Agent Backend                                           | Intelligence Provider       | How It Connects                                               |
| ------------------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| Local (`agent.localBackend: pi` or `openai-compatible`) | OpenAI-compatible endpoint  | Uses `agent.localEndpoint` (e.g., `http://localhost:1234/v1`) |
| `anthropic` or `claude` (with API key)                  | Anthropic Messages API      | Uses `agent.apiKey` or `ANTHROPIC_API_KEY` env var            |
| `claude` (without API key)                              | Claude CLI                  | Spawns `claude --print` — uses the CLI's own auth             |
| `openai`                                                | OpenAI Chat Completions API | Uses `agent.apiKey` or `OPENAI_API_KEY` env var               |

The resolution order is: local backend → API key → Claude CLI fallback. This means the pipeline works without any API key if you have a local model server running.

### Using a local LLM (Ollama, LM Studio, etc.)

If you have a local backend configured for agent dispatch, the intelligence pipeline uses it automatically:

```yaml
agent:
  localBackend: pi
  localEndpoint: http://localhost:1234/v1
  localModel: gemma-4-e4b

intelligence:
  enabled: true
```

The pipeline will call your local LLM for SEL enrichment and PESL simulation — no cloud API key needed.

### Using the Claude CLI (no API key)

If no local backend is configured and no API key is available, the pipeline falls back to the Claude CLI. This uses whatever authentication the `claude` CLI has (from `claude login`):

```yaml
intelligence:
  enabled: true
  provider:
    kind: claude-cli
```

### Override models per layer

Use different models for different pipeline layers:

```yaml
intelligence:
  enabled: true
  models:
    sel: llama3.2 # cheaper/faster model for spec enrichment
    pesl: deepseek-r1 # reasoning model for simulation
```

### Separate provider (different billing, different endpoint)

```yaml
intelligence:
  enabled: true
  provider:
    kind: openai-compatible
    apiKey: ${CUSTOM_KEY}
    baseUrl: https://my-proxy.example.com/v1
  models:
    sel: gpt-4o-mini
```

When `enabled: false` (the default), the pipeline is completely inactive. The orchestrator behaves identically to its pre-intelligence behavior — routing uses empty concern signals and no LLM calls are made.

## What Happens During a Tick

When the orchestrator polls for candidate issues, the intelligence pipeline inserts three analysis steps:

### Step 1: Pre-Routing (SEL + CML)

For each candidate issue, the pipeline determines its scope tier:

| Scope Tier                                 | Pipeline Behavior                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **quick-fix / diagnostic** (`autoExecute`) | Skip entirely. No LLM cost.                                                                                                        |
| **guided-change** (`signalGated`)          | Full pipeline: SEL enrichment → CML scoring → concern signals. Signals feed into `routeIssue()` to decide dispatch vs. escalation. |
| **full-exploration** (`alwaysHuman`)       | SEL enrichment only (for human context). Routing stays `needs-human`. The enriched spec is attached to the escalation.             |

**SEL** calls the configured LLM to analyze the work item and produce an `EnrichedSpec` with:

- Intent and summary
- Affected systems (validated against the knowledge graph)
- Functional and non-functional requirements
- Unknowns, ambiguities, and risk signals

**CML** scores complexity across three dimensions:

- **Structural** (50% weight) — Graph blast radius via `CascadeSimulator`
- **Semantic** (35% weight) — Count of unknowns, ambiguities, risk signals
- **Historical** (15% weight) — Smoothed failure rate from past execution outcomes

If the overall score crosses thresholds, concern signals fire:

- `highComplexity` — overall score >= 0.7
- `largeBlastRadius` — > 20 estimated affected files
- `highAmbiguity` — semantic dimension > 0.6

Any concern signals cause `routeIssue()` to escalate the issue to `needs-human` instead of dispatching locally.

### Step 2: Post-Routing (PESL)

For issues that pass routing and are about to be dispatched locally, PESL runs a pre-execution simulation:

- **Graph-only** (quick-fix, diagnostic) — Fast (<2s), no LLM. Uses `CascadeSimulator` to check blast radius and test gaps.
- **Full simulation** (guided-change) — LLM-assisted plan expansion, failure injection, and test projection. Merged with graph baseline.

If the simulation's `executionConfidence` drops below 0.3, the issue is **not dispatched**. Instead, it is escalated with the simulation's predicted failures and test gaps included in the escalation reasons.

### Step 3: Post-Execution (Outcome Recording)

After an agent finishes (success or failure), the orchestrator records the execution outcome into the knowledge graph. This creates:

- An `execution_outcome` node with result, retry count, failure reasons, and duration
- `outcome_of` edges linking the outcome to the affected system nodes

Future CML scoring queries these outcomes. Systems with high historical failure rates get higher complexity scores, making the pipeline more cautious about dispatching similar work in the future.

## Dashboard Integration

### Attention Page

When the intelligence pipeline is enabled, escalations shown on the Attention page include enriched context from the pipeline:

- **Enriched spec** — Intent, summary, affected systems, unknowns, ambiguities, risk signals
- **Concern signals** — Which thresholds triggered the escalation
- **PESL abort context** — Predicted failures and test gaps (when simulation triggered the escalation)

This context helps reviewers understand _why_ the orchestrator escalated and make faster decisions.

### Overview Page

The Overview page shows pipeline activity as part of the orchestrator state. When an issue is being preprocessed, its status reflects the current pipeline stage.

## Adapters

The pipeline accepts work from multiple sources via pure adapter functions:

```ts
import {
  toRawWorkItem, // Roadmap Issue (built-in)
  jiraToRawWorkItem, // JIRA REST API response
  githubToRawWorkItem, // GitHub API response
  linearToRawWorkItem, // Linear GraphQL response
  manualToRawWorkItem, // Free-text input
} from '@harness-engineering/intelligence';
```

Each adapter is a pure function that maps a pre-fetched data object to `RawWorkItem`. No API clients are included — you fetch the data from the external system and pass it to the adapter.

The roadmap adapter (`toRawWorkItem`) is used automatically by the orchestrator. Other adapters are available for custom integrations (CLI tools, webhooks, manual analysis).

## Standalone Usage

The pipeline can be used independently of the orchestrator for analysis or tooling:

```ts
import {
  IntelligencePipeline,
  AnthropicAnalysisProvider,
  manualToRawWorkItem,
} from '@harness-engineering/intelligence';
import { GraphStore } from '@harness-engineering/graph';

// Setup
const provider = new AnthropicAnalysisProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
const store = new GraphStore();
await store.load('.harness/graph');

const pipeline = new IntelligencePipeline(provider, store);

// Analyze a work item manually
const workItem = manualToRawWorkItem({
  title: 'Migrate auth to OAuth2',
  description: 'Replace custom token auth with OAuth2 + PKCE flow',
});

const spec = await pipeline.enrich(workItem);
console.log('Intent:', spec.intent);
console.log(
  'Affected systems:',
  spec.affectedSystems.map((s) => s.name)
);
console.log('Unknowns:', spec.unknowns);

const score = pipeline.score(spec);
console.log('Risk level:', score.riskLevel);
console.log('Recommended route:', score.recommendedRoute);

const sim = await pipeline.simulate(spec, score, 'guided-change');
console.log('Confidence:', sim.executionConfidence);
console.log('Predicted failures:', sim.predictedFailures);
```

## Configuration Reference

| Field                            | Type                                 | Default                                    | Description                                                                                      |
| -------------------------------- | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `intelligence.enabled`           | `boolean`                            | `false`                                    | Enable/disable the pipeline                                                                      |
| `intelligence.provider`          | `object`                             | (derived from agent config)                | Explicit LLM provider override                                                                   |
| `intelligence.provider.kind`     | `'anthropic' \| 'openai-compatible'` | (from `agent.backend`)                     | LLM provider type                                                                                |
| `intelligence.provider.apiKey`   | `string`                             | (from `agent.apiKey`)                      | API key override                                                                                 |
| `intelligence.provider.baseUrl`  | `string`                             | (provider default)                         | Custom API endpoint                                                                              |
| `intelligence.models`            | `object`                             | (from `agent.model` or `agent.localModel`) | Per-layer model overrides                                                                        |
| `intelligence.models.sel`        | `string`                             | (from agent config)                        | Model for spec enrichment                                                                        |
| `intelligence.models.cml`        | `string`                             | (unused)                                   | Reserved for future CML LLM use                                                                  |
| `intelligence.models.pesl`       | `string`                             | (from agent config)                        | Model for pre-execution simulation                                                               |
| `intelligence.requestTimeoutMs`  | `number`                             | `90000`                                    | Request timeout for LLM calls (ms)                                                               |
| `intelligence.promptSuffix`      | `string`                             | (none)                                     | Appended to prompts for structured output — see [Thinking Models](#thinking-models)              |
| `intelligence.failureCacheTtlMs` | `number`                             | `300000`                                   | How long to cache analysis failures before retrying (ms)                                         |
| `intelligence.jsonMode`          | `boolean`                            | `true`                                     | Send `response_format: json_object` — disable for models that hang with JSON grammar constraints |
| `agent.localTimeoutMs`           | `number`                             | `90000`                                    | Request timeout for local agent backend calls (ms)                                               |

**Provider resolution order** (when `intelligence.provider` is omitted):

1. Local backend (`agent.localBackend: openai-compatible` or `pi`) — uses `localEndpoint`, `localApiKey`, `localModel`
2. Primary backend (`agent.backend: anthropic/claude`) — uses `agent.apiKey`, `agent.model`
3. Primary backend (`agent.backend: openai`) — uses `agent.apiKey`, `agent.model`

`agent.localModel` accepts either a string or an array of candidate model IDs. When given an array, the orchestrator probes `/v1/models` periodically and picks the first configured candidate that is loaded. See [hybrid-orchestrator-quickstart.md § Multiple Model Fallback](./hybrid-orchestrator-quickstart.md#multiple-model-fallback) for details.

## Known Limitations

**Intelligence pipeline does not auto-rebuild on local availability change.**

When `agent.localBackend` is configured but no candidate from `agent.localModel` is loaded at orchestrator start, the intelligence pipeline does not initialize — `createAnalysisProvider()` returns null and a warn-level log records the disabled state. The agent backend self-heals on the next probe (subsequent `LocalBackend.startSession()` calls succeed once `available` flips to true), but the intelligence pipeline remains disabled until the orchestrator is restarted.

To re-enable the intelligence pipeline after loading a model, restart the orchestrator. This is a deliberate trade-off — listening for resolver status changes inside `IntelligencePipeline` and re-constructing the analysis provider on flip would add lifecycle complexity disproportionate to the value at this iteration. Tracked as success criterion SC23 in `docs/changes/local-model-fallback/proposal.md`.

## Thinking Models

Some local models enable "thinking" or "reasoning" mode by default (e.g., Qwen3, DeepSeek-R1). These models generate internal reasoning tokens (`<think>...</think>`) before the actual response. This conflicts with the pipeline's `response_format: { type: 'json_object' }` constraint — Ollama's JSON grammar prevents the model from emitting thinking tokens, causing it to hang until the server timeout kills the request.

Use `intelligence.promptSuffix` to disable thinking for structured-output requests:

| Model       | Suffix              | Notes                                  |
| ----------- | ------------------- | -------------------------------------- |
| Qwen3       | `/no_think`         | Built-in toggle recognized by Qwen3    |
| DeepSeek-R1 | `<think>\n</think>` | Empty think block signals no reasoning |

```yaml
# Example: Qwen3 on Ollama
agent:
  localBackend: openai-compatible
  localEndpoint: http://localhost:11434/v1
  localModel: qwen3:8b

intelligence:
  enabled: true
  promptSuffix: '/no_think'
  jsonMode: false # Qwen3 hangs with Ollama's JSON grammar constraint
```

Setting `jsonMode: false` disables `response_format: { type: 'json_object' }` at the API level. The system prompt still instructs the model to produce valid JSON, which works reliably for most models. The `promptSuffix` is only appended to the intelligence pipeline's structured-output prompts — it does not affect the agent backend's regular chat completions.

If your model does not have a thinking mode (Llama, Mistral, Phi, etc.), leave `promptSuffix` unset. If your model works with Ollama's JSON mode, leave `jsonMode` at the default (`true`).

## SEL Deep Dive — Spec Enrichment Layer

SEL is the first stage of the intelligence pipeline. It takes a `RawWorkItem` (title, description, labels, comments, metadata) and produces an `EnrichedSpec` — a structured representation of the engineering intent behind the work item. SEL makes exactly one LLM call per work item.

### How It Works

1. **Prompt construction.** The `buildUserPrompt()` function assembles a markdown document from the `RawWorkItem` fields — title, ID, source, description, labels, linked items, comments, and metadata. Missing fields are noted explicitly so the LLM can flag them as unknowns.

2. **LLM analysis.** The assembled prompt is sent to the configured `AnalysisProvider` along with a system prompt that instructs the LLM to act as a spec enrichment agent. The response is constrained by a Zod schema (`selResponseSchema`) that enforces the exact output structure.

3. **Graph validation.** The LLM returns a list of affected system names (free-text strings like "auth module" or "user-service"). The `GraphValidator` resolves each name against the knowledge graph using fuzzy matching against module and file nodes. For each match, it enriches the system entry with:
   - `graphNodeId` — the resolved graph node ID (or `null` if no match above 0.4 confidence)
   - `transitiveDeps` — dependency chain from `CascadeSimulator` (max depth 3, probability floor 0.1)
   - `testCoverage` — count of `tested_by` and `verified_by` edges from the node
   - `owner` — owner string from node metadata, if present

### Signals Extracted

The `EnrichedSpec` contains the following fields, all populated by the LLM:

| Field                       | Type       | Description                                                    |
| --------------------------- | ---------- | -------------------------------------------------------------- |
| `intent`                    | `string`   | Single sentence capturing the core engineering goal            |
| `summary`                   | `string`   | Concise paragraph of what needs to be done                     |
| `affectedSystems`           | `array`    | Systems/modules that will be touched (graph-validated)         |
| `functionalRequirements`    | `string[]` | Concrete functional requirements implied by the work item      |
| `nonFunctionalRequirements` | `string[]` | Performance, scalability, security, or reliability concerns    |
| `apiChanges`                | `string[]` | API surface changes (new endpoints, changed contracts)         |
| `dbChanges`                 | `string[]` | Database schema or migration changes                           |
| `integrationPoints`         | `string[]` | External systems or services this work integrates with         |
| `assumptions`               | `string[]` | Assumptions about scope or context                             |
| `unknowns`                  | `string[]` | Things that are unclear and may need clarification             |
| `ambiguities`               | `string[]` | Parts of the spec that could be interpreted multiple ways      |
| `riskSignals`               | `string[]` | Potential risks (technical debt, breaking changes, security)   |
| `initialComplexityHints`    | `object`   | Two 0-1 scores: `textualComplexity` and `structuralComplexity` |

### Graph Validator Fuzzy Matching

The `GraphValidator` uses a simple scoring algorithm to match LLM-produced system names against graph nodes:

| Match Type                  | Score |
| --------------------------- | ----- |
| Exact match (normalized)    | 1.0   |
| Candidate contains query    | 0.8   |
| Query contains candidate    | 0.7   |
| Substring character overlap | 0-0.6 |

Matches below 0.4 confidence are treated as unresolved — the affected system entry will have `graphNodeId: null` and `confidence: 0`. Unresolved systems still appear in the enriched spec but do not contribute to CML structural scoring.

### Configuration

SEL uses whatever model is configured via `intelligence.models.sel`, falling back to the default agent model. The system prompt is not configurable — it is defined in `packages/intelligence/src/sel/prompts.ts`. The Zod schema enforces strict output structure; invalid LLM responses throw a `ZodError`.

---

## CML Deep Dive — Complexity Modeling Layer

CML scores task complexity as a single 0-1 value by combining three independent dimensions. It is entirely synchronous — no LLM calls. All computation uses the knowledge graph and the SEL-produced `EnrichedSpec`.

### The Three Dimensions

#### Structural Complexity (50% weight)

Measures the graph blast radius — how many nodes are transitively affected by the change.

For each affected system with a resolved `graphNodeId`, CML runs `CascadeSimulator` from the graph package. The simulator walks the dependency graph and produces a flat summary of affected nodes, each with a cumulative probability.

The structural score is the sum of all cumulative probabilities across all affected systems, normalized against a ceiling of 100 affected nodes:

```
structuralScore = min(1, sumOfCumulativeProbabilities / 100)
```

The blast radius metadata (services, modules, files estimated, test files affected) is collected from the cascade results and reported alongside the score.

When no affected systems have graph node IDs (empty graph or all unresolved), the structural score is 0.

#### Semantic Complexity (35% weight)

Measures the density of unknowns, ambiguities, and risk signals from the SEL enrichment.

Each sub-dimension uses a diminishing-returns curve so the first few items have the biggest impact:

```
dimensionScore = 1 - exp(-count * 0.3)
```

The three sub-dimensions are weighted:

| Sub-dimension | Weight | Source field       |
| ------------- | ------ | ------------------ |
| Unknowns      | 40%    | `spec.unknowns`    |
| Ambiguities   | 35%    | `spec.ambiguities` |
| Risk signals  | 25%    | `spec.riskSignals` |

The diminishing-returns curve means: 1 unknown scores ~0.26, 3 unknowns score ~0.59, 5 unknowns score ~0.78. Adding a 6th unknown barely moves the score.

#### Historical Complexity (15% weight)

Measures past failure rates for the affected systems by querying `execution_outcome` nodes in the graph.

For each affected system with a graph node ID, CML traverses inbound `outcome_of` edges to find linked outcome nodes. It computes a Laplace-smoothed failure rate per system:

```
failureRate = failures / (failures + successes + 2)
```

The smoothing constant of 2 prevents extreme scores from small samples — a single failure yields ~0.33 instead of 1.0. The historical score is the maximum failure rate across all affected systems.

Returns 0 when no execution outcomes exist in the graph (cold start).

### Overall Score and Risk Classification

The overall score is the weighted sum:

```
overall = structural * 0.50 + semantic * 0.35 + historical * 0.15
```

Risk levels:

| Overall Score | Risk Level | Recommended Route                |
| ------------- | ---------- | -------------------------------- |
| >= 0.8        | `critical` | `human`                          |
| >= 0.6        | `high`     | `human`                          |
| >= 0.3        | `medium`   | `local` or `simulation-required` |
| < 0.3         | `low`      | `local`                          |

For `medium` risk, the route is `local` if semantic < 0.5, otherwise `simulation-required`.

### Confidence Score

CML also reports a confidence value based on how many data sources contributed:

| Active Data Sources | Confidence |
| ------------------- | ---------- |
| 2-3 dimensions > 0  | 0.8        |
| 1 dimension > 0     | 0.5        |
| 0 dimensions > 0    | 0.3        |

### Concern Signals

The `scoreToConcernSignals()` function converts a `ComplexityScore` into `ConcernSignal[]` objects that the orchestrator's `routeIssue()` understands:

| Signal Name        | Threshold                         | Effect                    |
| ------------------ | --------------------------------- | ------------------------- |
| `highComplexity`   | `overall >= 0.7`                  | Escalate to `needs-human` |
| `largeBlastRadius` | `blastRadius.filesEstimated > 20` | Escalate to `needs-human` |
| `highAmbiguity`    | `dimensions.semantic > 0.6`       | Escalate to `needs-human` |

Any signal firing causes escalation. Multiple signals can fire simultaneously — all are included in the escalation reason.

---

## PESL Deep Dive — Pre-Execution Simulation Layer

PESL runs after routing for issues about to be dispatched locally. It simulates what would happen if an agent attempted the implementation, producing a confidence score and an abort recommendation.

### Graph-Only Mode

Used for `quick-fix` and `diagnostic` tier issues. Deterministic, fast (<2s), no LLM cost.

**How it works:**

1. Runs `CascadeSimulator` for each resolved affected system
2. Collects amplification points (high fan-out nodes) as risk hotspots
3. Flags cascade paths with > 5 high-probability nodes (cumulative probability >= 0.5) as predicted failures
4. Detects test gaps: systems with zero test coverage, and blast radius covering files with no test files affected
5. Groups affected nodes by impact type (code vs. tests) to find untested cascade paths

**Confidence calculation:**

```
confidence = 0.85                              (base)
           - riskHotspots.length * 0.05        (hotspot penalty)
           - testGaps.length * 0.08            (test gap penalty)
           - predictedFailures.length * 0.10   (failure penalty)
           - cmlOverallScore * 0.20            (complexity penalty)
```

Clamped to [0, 1]. Abort if confidence < 0.3.

### Full Simulation Mode

Used for `guided-change` tier issues and any issue where CML recommends `simulation-required`. Makes one LLM call on top of graph-only checks.

**How it works:**

1. Runs graph-only checks first to establish a baseline
2. Sends the enriched spec and complexity assessment to the LLM with the PESL system prompt
3. The LLM produces: a simulated plan (ordered implementation steps), predicted failures, risk hotspots, missing steps, test gaps, and recommended changes
4. Merges graph results and LLM results, deduplicating case-insensitively

**Confidence calculation (full simulation):**

```
confidence = 0.75                              (base — lower than graph-only)
           - predictedFailures.length * 0.06   (failure penalty)
           - testGaps.length * 0.05            (test gap penalty)
           - missingSteps.length * 0.04        (missing step penalty)
           - cmlOverallScore * 0.15            (complexity penalty)
```

The base confidence for full simulation (0.75) is lower than graph-only (0.85) because full simulation implies the task is already known to be more complex.

### When Each Mode Runs

| Scope Tier      | CML Recommended Route | PESL Mode       |
| --------------- | --------------------- | --------------- |
| `quick-fix`     | any                   | Graph-only      |
| `diagnostic`    | any                   | Graph-only      |
| `guided-change` | `local`               | Full simulation |
| `guided-change` | `simulation-required` | Full simulation |
| any             | `simulation-required` | Full simulation |

### Abort Behavior

When `executionConfidence < 0.3`, the `SimulationResult` sets `abort: true`. The orchestrator converts the dispatch into an escalation, attaching:

- `predictedFailures` — what the simulation thinks will go wrong
- `testGaps` — what test coverage is missing
- `riskHotspots` — which files/modules are fragile change points
- `recommendedChanges` — adjustments that could improve success likelihood

---

## Tuning Parameters

All configurable thresholds and their effects on pipeline behavior.

### CML Dimension Weights

| Parameter      | Default | Location                                  | Effect                                  |
| -------------- | ------- | ----------------------------------------- | --------------------------------------- |
| `W_STRUCTURAL` | 0.50    | `packages/intelligence/src/cml/scorer.ts` | Weight of blast radius in overall score |
| `W_SEMANTIC`   | 0.35    | `packages/intelligence/src/cml/scorer.ts` | Weight of unknowns/ambiguities          |
| `W_HISTORICAL` | 0.15    | `packages/intelligence/src/cml/scorer.ts` | Weight of past failure rates            |

These are compile-time constants. To adjust, edit the source and rebuild. Increasing `W_STRUCTURAL` makes the pipeline more sensitive to large blast radii; increasing `W_SEMANTIC` makes it more sensitive to vague specs.

### CML Concern Signal Thresholds

| Signal             | Threshold        | Location                                   | Effect              |
| ------------------ | ---------------- | ------------------------------------------ | ------------------- |
| `highComplexity`   | `overall >= 0.7` | `packages/intelligence/src/cml/signals.ts` | Triggers escalation |
| `largeBlastRadius` | `files > 20`     | `packages/intelligence/src/cml/signals.ts` | Triggers escalation |
| `highAmbiguity`    | `semantic > 0.6` | `packages/intelligence/src/cml/signals.ts` | Triggers escalation |

### CML Semantic Sub-Weights

| Sub-dimension | Weight | Decay Constant |
| ------------- | ------ | -------------- |
| Unknowns      | 0.40   | 0.3            |
| Ambiguities   | 0.35   | 0.3            |
| Risk signals  | 0.25   | 0.3            |

The decay constant (0.3) controls how quickly the diminishing-returns curve flattens. Higher values mean faster saturation.

### CML Structural Normalization

| Parameter               | Default | Effect                                  |
| ----------------------- | ------- | --------------------------------------- |
| `NORMALIZATION_CEILING` | 100     | Max affected-node count for score = 1.0 |

### CML Historical Smoothing

| Parameter   | Default | Effect                                                |
| ----------- | ------- | ----------------------------------------------------- |
| `SMOOTHING` | 2       | Laplace constant — higher values dampen small samples |

### PESL Confidence Parameters

**Graph-only mode:**

| Parameter          | Default | Effect                                     |
| ------------------ | ------- | ------------------------------------------ |
| `BASE_CONFIDENCE`  | 0.85    | Starting confidence before penalties       |
| `HOTSPOT_PENALTY`  | 0.05    | Per-hotspot confidence reduction           |
| `TEST_GAP_PENALTY` | 0.08    | Per-test-gap confidence reduction          |
| `FAILURE_PENALTY`  | 0.10    | Per-predicted-failure confidence reduction |
| CML penalty factor | 0.20    | Multiplied by CML overall score            |

**Full simulation mode:**

| Parameter              | Default | Effect                                      |
| ---------------------- | ------- | ------------------------------------------- |
| `BASE_CONFIDENCE`      | 0.75    | Starting confidence (lower than graph-only) |
| `FAILURE_PENALTY`      | 0.06    | Per-predicted-failure confidence reduction  |
| `TEST_GAP_PENALTY`     | 0.05    | Per-test-gap confidence reduction           |
| `MISSING_STEP_PENALTY` | 0.04    | Per-missing-step confidence reduction       |
| CML penalty factor     | 0.15    | Multiplied by CML overall score             |

### PESL Abort Threshold

| Parameter       | Default | Effect                                          |
| --------------- | ------- | ----------------------------------------------- |
| Abort threshold | 0.3     | Issues below this confidence are not dispatched |

### Graph Validator

| Parameter           | Default | Effect                                       |
| ------------------- | ------- | -------------------------------------------- |
| Fuzzy match floor   | 0.4     | Matches below this are treated as unresolved |
| Cascade max depth   | 3       | How deep transitive deps are traced          |
| Cascade prob. floor | 0.1     | Minimum probability to include in cascade    |

### Runtime Configuration (YAML)

| Field                            | Default  | Effect                                                             |
| -------------------------------- | -------- | ------------------------------------------------------------------ |
| `intelligence.requestTimeoutMs`  | `90000`  | LLM request timeout (ms)                                           |
| `intelligence.failureCacheTtlMs` | `300000` | How long failed analyses are cached before retry (ms)              |
| `intelligence.jsonMode`          | `true`   | Whether to send `response_format` with schema to the LLM           |
| `intelligence.promptSuffix`      | (none)   | Appended to structured-output prompts (for thinking model control) |

---

## Effectiveness Tracking

The effectiveness module analyzes persona-attributed `execution_outcome` nodes in the knowledge graph to compute per-persona accuracy, detect blind spots, and recommend optimal routing.

### How Outcomes Are Attributed

When the orchestrator records an execution outcome (via `ExecutionOutcomeConnector`), it includes:

- `agentPersona` — the persona or agent identifier (e.g., `"backend-dev"`, `"fullstack"`)
- `taskType` — optional categorization (`"feature"`, `"bugfix"`, `"refactor"`, `"docs"`, `"test"`, `"chore"`)
- `outcome_of` edges linking the outcome node to each affected system node

The effectiveness module traverses all `execution_outcome` nodes in the graph and buckets them by `(persona, systemNodeId)`.

### Success Rate Calculation

Uses Laplace smoothing with alpha = 1:

```
successRate = (successes + 1) / (successes + failures + 2)
```

This prevents a single outcome from claiming 0% or 100% certainty. With 0 observations, the rate defaults to 0.5 (neutral prior). With 10 successes and 0 failures, the rate is 11/12 = 0.917 rather than 1.0.

### Blind Spot Detection

A blind spot is a `(persona, system)` pair where the persona consistently fails. Detection uses raw (unsmoothed) failure rates for intuitive thresholds:

- Default minimum failures: 2
- Default minimum failure rate: 50%

Both conditions must be met. A persona that failed once on a system is not flagged — it needs at least 2 failures AND a >= 50% failure rate.

### Persona Recommendation

Given a set of affected system node IDs for a new issue, `recommendPersona()` computes the mean Laplace-smoothed success rate for each candidate persona across those systems:

- Systems with history for the persona: contribute the smoothed success rate
- Systems with no history: contribute the neutral prior (0.5)

This prevents over-confidence when a persona has strong results on only some of the affected systems but no data on others.

Results are sorted by score descending, with ties broken by total sample count.

### Usage Example

```ts
import {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from '@harness-engineering/intelligence';

// Which persona is best at the auth module?
const scores = computePersonaEffectiveness(store, { systemNodeId: 'module-auth' });

// Where does "backend-dev" consistently fail?
const spots = detectBlindSpots(store, { persona: 'backend-dev' });

// Who should handle this issue touching auth and db?
const recs = recommendPersona(store, {
  systemNodeIds: ['module-auth', 'module-db'],
  minSamples: 3,
});
```

---

## Agent Specialization

The specialization module extends effectiveness tracking with temporal decay, task-type categorization, consistency scoring, expertise level classification, and persistent profile storage.

### Temporal Decay

Recent outcomes are weighted more heavily than old ones using exponential decay:

```
weight = e^(-ln(2) / halfLifeDays * ageDays)
```

With the default half-life of 30 days:

- An outcome from today has weight 1.0
- An outcome from 30 days ago has weight 0.5
- An outcome from 60 days ago has weight 0.25
- An outcome from 90 days ago has weight 0.125

The temporally-weighted success rate uses Laplace smoothing with decay-weighted pseudo-counts. When no outcomes exist, it returns 0.5 (neutral prior).

### Composite Score

Specialization entries are computed per `(persona, system, taskType)` tuple. Each entry has a composite score built from three components:

| Component             | Weight | Description                                                |
| --------------------- | ------ | ---------------------------------------------------------- |
| Temporal success rate | 60%    | Decay-weighted success rate (recent outcomes count more)   |
| Consistency score     | 25%    | 1 - normalized stddev of rolling 5-outcome success windows |
| Volume bonus          | 15%    | Log-scaled sample count: `min(1.0, log2(n+1) / log2(31))`  |

The consistency score measures whether a persona's performance is stable over time. A persona that alternates success-failure-success-failure has low consistency. A persona with a steady stream of successes has high consistency.

The volume bonus rewards experience. It uses a log scale capped at 1.0, with the expert threshold at 30 outcomes. The log scale means early outcomes contribute more — going from 1 to 5 outcomes matters more than going from 25 to 30.

### Expertise Levels

Expertise is classified from sample size and raw success rate:

| Level        | Requirements                                                    |
| ------------ | --------------------------------------------------------------- |
| `novice`     | < 5 samples, or < 15 samples with rate < 0.6                    |
| `competent`  | 5-14 samples with rate >= 0.6, or 15-29 samples with rate < 0.7 |
| `proficient` | 15-29 samples with rate >= 0.7, or 30+ samples with rate < 0.75 |
| `expert`     | 30+ samples with rate >= 0.75                                   |

### Specialization Profiles

A full profile for a persona aggregates all `(system, taskType)` entries:

- **Strengths** — top 3 entries by composite score (excluding weaknesses)
- **Weaknesses** — entries with temporal success rate < 0.5, sorted by lowest rate, max 3
- **Overall level** — median expertise level across all entries

### Weighted Recommendations

`weightedRecommendPersona()` wraps the base `recommendPersona()` and applies specialization multipliers:

```
weightedScore = baseScore * specializationMultiplier
```

The multiplier is computed as `0.5 + meanComposite`, where `meanComposite` is the average composite score across the persona's specialization entries for the requested systems. This means:

- No specialization data: multiplier = 1.0 (neutral)
- Perfect composite (1.0): multiplier = 1.5 (50% boost)
- Low composite (0.2): multiplier = 0.7 (30% penalty)

### Profile Persistence

Profiles are stored at `.harness/specialization-profiles.json` and survive across sessions. The persistence layer provides:

```ts
// Load existing profiles (returns empty store if file doesn't exist)
const profiles = loadProfiles('/path/to/project');

// Save after manual computation
saveProfiles('/path/to/project', profiles);

// Recompute all profiles from graph and save in one step
refreshProfiles('/path/to/project', store);
```

`refreshProfiles()` discovers all persona names from `execution_outcome` nodes in the graph, builds a profile for each, and writes the result to disk. Call this periodically (e.g., after each orchestrator run) to keep profiles current.

### Configuration

| Parameter            | Default | Effect                                             |
| -------------------- | ------- | -------------------------------------------------- |
| `halfLifeDays`       | 30      | Exponential decay half-life for temporal weighting |
| `referenceTime`      | `now`   | Anchor point for age calculation                   |
| `minSamples`         | 1       | Minimum outcomes to include a bucket in results    |
| `W_TEMPORAL`         | 0.60    | Weight of temporal success rate in composite       |
| `W_CONSISTENCY`      | 0.25    | Weight of consistency score in composite           |
| `W_VOLUME`           | 0.15    | Weight of volume bonus in composite                |
| `EXPERT_THRESHOLD`   | 30      | Sample count where volume bonus reaches 1.0        |
| `CONSISTENCY_WINDOW` | 5       | Rolling window size for consistency computation    |

---

## Configuration Reference — Analysis Providers

The intelligence pipeline supports three analysis provider backends. Each implements the `AnalysisProvider` interface with a single `analyze<T>(request)` method that returns structured, Zod-validated responses.

### Anthropic Provider

Uses the Anthropic Messages API with the `tool_use` pattern for structured output.

| Option         | Default                    | Description                      |
| -------------- | -------------------------- | -------------------------------- |
| `apiKey`       | (required)                 | Anthropic API key                |
| `defaultModel` | `claude-sonnet-4-20250514` | Default model for analysis calls |

The provider sends a `structured_output` tool definition with a JSON schema derived from the caller's Zod schema. The `tool_choice` is forced to `structured_output`, ensuring the LLM always returns structured JSON. Default max tokens: 4096.

```yaml
# Anthropic configuration
agent:
  backend: anthropic
  apiKey: ${ANTHROPIC_API_KEY}
  model: claude-sonnet-4-20250514

intelligence:
  enabled: true
```

### OpenAI-Compatible Provider

Works with OpenAI, Ollama, LM Studio, vLLM, and any server implementing the OpenAI Chat Completions API.

| Option         | Default             | Description                                                      |
| -------------- | ------------------- | ---------------------------------------------------------------- |
| `apiKey`       | (required)          | API key (some servers accept any string, e.g., `"ollama"`)       |
| `baseUrl`      | (required)          | Base URL (e.g., `http://localhost:11434/v1`)                     |
| `defaultModel` | `deepseek-coder-v2` | Default model name                                               |
| `timeoutMs`    | `90000`             | Request timeout in milliseconds                                  |
| `promptSuffix` | (none)              | Appended to user prompts for thinking model control              |
| `jsonMode`     | `true`              | Send `response_format: { type: 'json_schema' }` with full schema |

When `jsonMode` is `true`, the full JSON schema is sent via `response_format` for grammar-constrained decoding. When `false`, the schema is included in the system prompt text instead, and the model relies on instruction following alone to produce valid JSON. Default max tokens: 8192.

```yaml
# Local LLM configuration
agent:
  localBackend: openai-compatible
  localEndpoint: http://localhost:11434/v1
  localModel: qwen3:8b

intelligence:
  enabled: true
  jsonMode: false
  promptSuffix: '/no_think'
```

### Claude CLI Provider

Uses the `claude` CLI binary for analysis — no API key required. Authentication is handled by the CLI's own `claude login`.

| Option         | Default  | Description                           |
| -------------- | -------- | ------------------------------------- |
| `command`      | `claude` | Path to the claude binary             |
| `defaultModel` | (none)   | Model override (CLI decides if unset) |
| `timeoutMs`    | `180000` | Request timeout in milliseconds       |

The CLI provider uses `--print`, `--output-format json`, and `--json-schema` flags for structured output. Timeout is higher than API providers (3 minutes vs 90 seconds) to account for CLI startup overhead.

```yaml
# Claude CLI configuration (no API key needed)
intelligence:
  enabled: true
  provider:
    kind: claude-cli
```

### Model Overrides Per Layer

Any provider supports per-layer model overrides. The model specified in `intelligence.models.sel` or `intelligence.models.pesl` is passed to the provider's `analyze()` call, overriding the default model for that specific layer:

```yaml
intelligence:
  enabled: true
  models:
    sel: llama3.2 # Fast/cheap model for spec enrichment
    pesl: deepseek-r1 # Reasoning model for simulation
```

CML does not make LLM calls, so `intelligence.models.cml` is reserved for future use and currently ignored.

---

## Cost Considerations

The pipeline makes LLM calls only when necessary:

| Scenario               | LLM Calls                 | Cloud API Cost | Local LLM Cost      |
| ---------------------- | ------------------------- | -------------- | ------------------- |
| Quick-fix issue        | 0                         | Free           | Free                |
| Diagnostic issue       | 0                         | Free           | Free                |
| Guided-change issue    | 1-2 (SEL + optional PESL) | ~$0.01-0.05    | Free (compute only) |
| Full-exploration issue | 1 (SEL for context)       | ~$0.005-0.02   | Free (compute only) |

Graph-based operations (CML structural scoring, PESL graph-only checks, historical lookups) are in-memory and free.

With a local LLM backend, the pipeline has zero API costs — all LLM calls go to your local endpoint.

## Troubleshooting

**Pipeline not running?**

- Check `intelligence.enabled: true` in workflow config
- Verify your agent backend has an API key (`agent.apiKey` or `ANTHROPIC_API_KEY` env var)
- The pipeline uses the same credentials as your agent backend — no separate key needed
- Check orchestrator logs for "Intelligence pipeline failed" errors

**LLM requests timing out (Ollama returning 500 after 10 minutes)?**

- If using a thinking model (Qwen3, DeepSeek-R1), set `intelligence.promptSuffix` to disable thinking — see [Thinking Models](#thinking-models)
- Increase `intelligence.requestTimeoutMs` if your model is slow but eventually succeeds (e.g., large model on CPU)
- Check `ollama ps` to verify the model is loaded and has enough memory
- The failure cache (`failureCacheTtlMs`, default 5 min) prevents the pipeline from re-requesting every tick while an issue's analysis is failing

**All issues getting escalated?**

- CML thresholds may be too aggressive. Check `ComplexityScore.reasoning` in escalation context
- Empty graph → structural dimension is 0, semantic-only scoring
- Load the graph: ensure `.harness/graph/` exists and has been populated via code ingestion

**PESL aborting everything?**

- Abort threshold is `confidence < 0.3`. Check `SimulationResult.executionConfidence`
- With an empty graph, graph-only checks produce high base confidence (~0.85)
- Full simulation confidence depends on LLM predictions — review `predictedFailures`

**Historical dimension not improving?**

- Outcomes must be recorded (requires orchestrator `worker_exit` events)
- Graph must persist between runs (`store.save()` / `store.load()`)
- Historical scoring uses smoothed failure rate — needs multiple outcomes to shift significantly
