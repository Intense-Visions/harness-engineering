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

| Agent Backend                                   | Intelligence Provider       | How It Connects                                                |
| ----------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `anthropic` or `claude`                         | Anthropic Messages API      | Uses `agent.apiKey` or `ANTHROPIC_API_KEY` env var             |
| `openai`                                        | OpenAI Chat Completions API | Uses `agent.apiKey` or `OPENAI_API_KEY` env var                |
| Local (`agent.localBackend: openai-compatible`) | OpenAI-compatible endpoint  | Uses `agent.localEndpoint` (e.g., `http://localhost:11434/v1`) |

### Using a local LLM (Ollama, LM Studio, etc.)

If you have a local backend configured for agent dispatch, the intelligence pipeline uses it automatically:

```yaml
agent:
  localBackend: openai-compatible
  localEndpoint: http://localhost:11434/v1
  localModel: deepseek-coder-v2

intelligence:
  enabled: true
```

The pipeline will call your local LLM for SEL enrichment and PESL simulation — no cloud API key needed.

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

| Field                           | Type                                 | Default                                    | Description                        |
| ------------------------------- | ------------------------------------ | ------------------------------------------ | ---------------------------------- |
| `intelligence.enabled`          | `boolean`                            | `false`                                    | Enable/disable the pipeline        |
| `intelligence.provider`         | `object`                             | (derived from agent config)                | Explicit LLM provider override     |
| `intelligence.provider.kind`    | `'anthropic' \| 'openai-compatible'` | (from `agent.backend`)                     | LLM provider type                  |
| `intelligence.provider.apiKey`  | `string`                             | (from `agent.apiKey`)                      | API key override                   |
| `intelligence.provider.baseUrl` | `string`                             | (provider default)                         | Custom API endpoint                |
| `intelligence.models`           | `object`                             | (from `agent.model` or `agent.localModel`) | Per-layer model overrides          |
| `intelligence.models.sel`       | `string`                             | (from agent config)                        | Model for spec enrichment          |
| `intelligence.models.cml`       | `string`                             | (unused)                                   | Reserved for future CML LLM use    |
| `intelligence.models.pesl`      | `string`                             | (from agent config)                        | Model for pre-execution simulation |

**Provider resolution order** (when `intelligence.provider` is omitted):

1. Local backend (`agent.localBackend: openai-compatible`) — uses `localEndpoint`, `localApiKey`, `localModel`
2. Primary backend (`agent.backend: anthropic/claude`) — uses `agent.apiKey`, `agent.model`
3. Primary backend (`agent.backend: openai`) — uses `agent.apiKey`, `agent.model`

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
