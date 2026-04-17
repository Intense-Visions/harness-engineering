# @harness-engineering/orchestrator

Orchestrator daemon for dispatching coding agents to issues. Polls an issue tracker for candidate tasks, manages ephemeral workspaces, runs agents to resolve issues, and updates the tracker with progress.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Issue Tracker                     │
│  RoadmapTrackerAdapter · Linear Extension        │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│           Intelligence Pipeline (optional)        │
│  SEL (spec enrichment) → CML (complexity) →      │
│  ConcernSignals → PESL (simulation + abort)      │
│  (@harness-engineering/intelligence)             │
└──────────────────┬───────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────┐
│              Core State Machine                   │
│  Candidate Selection · Concurrency Control       │
│  Model Routing (routeIssue + concern signals)    │
│  Reconciliation · Retry Logic                    │
│  Event Sourcing (applyEvent → side effects)      │
└──────────────────┬───────────────────────────────┘
                   ▼
┌────────────────┐  ┌─────────────────┐
│  Agent Runner  │  │   Workspaces    │
│  Claude Backend│  │  WorkspaceManager│
│  Mock Backend  │  │  WorkspaceHooks │
└───────┬────────┘  └────────┬────────┘
        └────────┬───────────┘
                 ▼
┌──────────────────────────────────────────────────┐
│            Prompt Rendering (LiquidJS)           │
└──────────────────────────────────────────────────┘
```

## Quick Start

```ts
import {
  Orchestrator,
  loadWorkflowConfig,
  WorkspaceManager,
  WorkspaceHooks,
  ClaudeBackend,
  PromptRenderer,
  RoadmapTrackerAdapter,
} from '@harness-engineering/orchestrator';

// Load workflow configuration
const config = loadWorkflowConfig('./workflow.yaml');

// Create and start the orchestrator
const orchestrator = new Orchestrator(config);
await orchestrator.start();
```

## Core Concepts

### Event-Sourced State Machine

The orchestrator uses an event-sourced architecture. All state transitions are modeled as events (`OrchestratorEvent`) that produce side effects (`SideEffect`):

```ts
import { applyEvent, createEmptyState } from '@harness-engineering/orchestrator';

const state = createEmptyState();
const { state: next, effects } = applyEvent(state, event);
// effects: DispatchEffect, StopEffect, ScheduleRetryEffect, etc.
```

### Candidate Selection

Issues are ranked and filtered before dispatch:

```ts
import { sortCandidates, selectCandidates, isEligible } from '@harness-engineering/orchestrator';

const ranked = sortCandidates(issues);
const selected = selectCandidates(ranked, availableSlots);
```

### Intelligence Pipeline Integration

When `config.intelligence.enabled` is `true`, the orchestrator runs the intelligence pipeline during each tick:

1. **Pre-routing** — For each candidate issue, `preprocessIssue()` runs SEL (spec enrichment) and CML (complexity scoring), producing `ConcernSignal[]` that feed into `routeIssue()`. For `alwaysHuman` tiers, the enriched spec is attached to the escalation for human context.
2. **Post-routing** — For locally-routed issues, PESL simulation runs. If `abort: true` (confidence < 0.3), the dispatch converts to an escalation.
3. **Post-execution** — On `worker_exit`, execution outcomes are recorded into the graph for future CML historical scoring.

When disabled (default), the pipeline is skipped entirely and routing uses empty concern signals.

See [`@harness-engineering/intelligence` README](../intelligence/README.md) for full pipeline documentation.

### Agent Backends

Two backends are available:

- **`ClaudeBackend`** — Production backend using the Claude API
- **`MockBackend`** — Test backend for deterministic behavior in tests

### Workspace Management

Each agent run gets an ephemeral workspace with lifecycle hooks:

```ts
import { WorkspaceManager, WorkspaceHooks } from '@harness-engineering/orchestrator';

const manager = new WorkspaceManager(config);
const hooks = new WorkspaceHooks(config);
```

## API

### Orchestrator

The main class that ties everything together:

- `start()` — Begin polling and dispatching
- `stop()` — Gracefully shut down
- Events: `state_change`, `agent_event`

### Core Functions

| Export                | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `applyEvent`          | Apply an event to state, returning new state + side effects |
| `createEmptyState`    | Create an initial empty orchestrator state                  |
| `sortCandidates`      | Rank issues by priority and eligibility                     |
| `selectCandidates`    | Select top candidates within concurrency limits             |
| `isEligible`          | Check if an issue is eligible for dispatch                  |
| `getAvailableSlots`   | Get number of available agent slots                         |
| `canDispatch`         | Check if dispatch is possible given current state           |
| `reconcile`           | Reconcile expected state against actual state               |
| `calculateRetryDelay` | Compute exponential backoff delay                           |

### Tracker Adapters

| Export                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `RoadmapTrackerAdapter`  | Reads issues from `docs/roadmap.md`                  |
| `LinearTrackerExtension` | Extends tracking with Linear integration _(planned)_ |

### Prompt Rendering

| Export           | Description                                  |
| ---------------- | -------------------------------------------- |
| `PromptRenderer` | Renders LiquidJS templates for agent prompts |

## License

MIT
