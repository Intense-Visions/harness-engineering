# Hybrid Orchestrator: Local Model Routing with Web Dashboard

## Overview

The orchestrator gains the ability to run two classes of work autonomously using local LLMs while surfacing complex work to humans through a web dashboard. Humans reason with Claude (or similar) directly in the dashboard to produce plans that the orchestrator then executes locally.

### Goals

1. 80%+ of roadmap issues handled autonomously by local models with zero human involvement
2. Complex work surfaces in a web dashboard with full context (issue, concern signals, related files)
3. Humans brainstorm and plan with Claude inside the dashboard, producing specs/plans the orchestrator consumes
4. Single interface — the web dashboard replaces the TUI as the primary monitoring and interaction surface
5. OpenAI-compatible local backend — works with Ollama, vLLM, LM Studio, or any compatible server
6. Existing orchestrator behavior (state machine, rate limiting, retry logic, verification) unchanged

### Non-goals

- Automatic Claude escalation (Claude is a human tool, not an orchestrator backend)
- Replacing the skill system (brainstorming, planning, execution skills stay as-is)
- Multi-user auth or team features (single-operator dashboard for now)
- Training or fine-tuning local models

## Decisions

| #   | Decision                                                                                                                                                                             | Rationale                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Claude is a human tool, not an orchestrator backend.** The orchestrator never calls Claude directly. Humans use Claude in the dashboard to reason through complex work.            | Cost control — Claude usage is human-directed, not automated. Matches the operator's mental model of "I sit down and work through the hard stuff." |
| D2  | **Escalation is signal-gated, not failure-based.** The orchestrator decides local vs needs-human BEFORE dispatching, using existing scope tiers + autopilot concern signals.         | Zero wasted compute on tasks the local model can't handle. Clean handoff — no half-applied broken code.                                            |
| D3  | **Local backend uses OpenAI-compatible API, not a specific server.** Endpoint is configurable. Default: Ollama.                                                                      | Maximum flexibility. Reuses existing OpenAI backend as template. Operator runs whatever inference server they prefer.                              |
| D4  | **Diagnostics default to local-auto with 1-retry budget.** If the first fix doesn't pass verification, escalate immediately.                                                         | Most bugs are mechanical. But a local model that can't fix a bug on the first try probably doesn't understand it.                                  |
| D5  | **Web dashboard is the primary interface from day one.** TUI becomes a headless/SSH fallback. The orchestrator HTTP server (port 8080) serves the dashboard.                         | Designing for the endpoint avoids a TUI-to-web migration later. Browser handles scroll, copy-paste, multiple panes natively.                       |
| D6  | **`emit_interaction` is the contract between orchestrator and dashboard.** All escalations, questions, confirmations, and transitions flow through the existing interaction types.   | Already designed for multi-surface rendering. Web dashboard is a new surface adapter — no new interaction primitives needed.                       |
| D7  | **Scope tier determines the routing default.** `quick-fix` and `diagnostic` → local-auto. `guided-change` → local if concern signals clear. `full-exploration` → always needs-human. | Maps directly to the existing router classification. No new classification logic.                                                                  |
| D8  | **The dashboard embeds a Claude chat pane for human reasoning.** Not a separate tool — the human brainstorms and plans inside the same interface where they see escalated work.      | "Sit and wait" experience. One screen, no context-switching. Matches ThePopeBot's proven pattern.                                                  |
| D9  | **Plans produced in the dashboard write to `docs/` like any other plan.** The orchestrator picks them up on the next tick as `guided-change` issues.                                 | No new artifact format. Existing planning skill output is already the contract. The dashboard is just a new way to produce it.                     |

## Technical Design

### Architecture Layers

```
+-----------------------------------------------------------+
|                   Web Dashboard (React)                     |
|  +-----------+  +--------------+  +--------------------+  |
|  |  Agent     |  |  Needs       |  |  Claude Chat       |  |
|  |  Monitor   |  |  Attention   |  |  Pane              |  |
|  |  Panel     |  |  Panel       |  |  (brainstorm/plan) |  |
|  +-----------+  +--------------+  +--------------------+  |
+------------------------+----------------------------------+
                         | WebSocket + REST
+------------------------+----------------------------------+
|              Orchestrator Server (port 8080)                |
|  +------------+  +-------------+  +--------------------+  |
|  |  State      |  |  Interaction |  |  Chat Proxy       |  |
|  |  Broadcast  |  |  Queue       |  |  (Anthropic SDK)  |  |
|  +------------+  +-------------+  +--------------------+  |
+------------------------+----------------------------------+
                         |
+------------------------+----------------------------------+
|                    Orchestrator Core                        |
|  +------------+  +-------------+  +--------------------+  |
|  |  State      |  |  Model       |  |  Agent Runner     |  |
|  |  Machine    |  |  Router      |  |  (multi-backend)  |  |
|  +------------+  +-------------+  +--------------------+  |
|                                                            |
|  +------------+  +-------------+  (+ existing backends)   |
|  |  Local      |  |  Claude      |                        |
|  |  Backend    |  |  Backend     |                        |
|  +------------+  +-------------+                          |
+-----------------------------------------------------------+
```

### Component 1: Local Backend

New file: `packages/orchestrator/src/agent/backends/local.ts`

Implements the `AgentBackend` interface (`packages/types/src/orchestrator.ts:168`). Thin wrapper around the existing OpenAI backend with a configurable endpoint URL.

```typescript
interface LocalBackendConfig {
  endpoint: string; // e.g. http://localhost:11434/v1
  model: string; // e.g. deepseek-coder-v2
  apiKey?: string; // optional, some servers require a dummy key
}
```

Session management is identical to the OpenAI backend. The local model runs multi-turn sessions via AgentRunner. No special handling required.

### Component 2: Model Router

New file: `packages/orchestrator/src/core/model-router.ts`

Pure function called during the dispatch decision in the state machine. Takes an issue and orchestrator state, returns a routing decision.

```typescript
type ScopeTier = 'quick-fix' | 'guided-change' | 'full-exploration' | 'diagnostic';

type RoutingDecision = { action: 'dispatch-local' } | { action: 'needs-human'; reasons: string[] };

function routeIssue(
  issue: Issue,
  scopeTier: ScopeTier,
  concernSignals: ConcernSignal[],
  config: EscalationConfig
): RoutingDecision;
```

**Routing logic:**

1. Classify scope tier from issue labels/metadata
2. If `scopeTier` in `config.alwaysHuman` → `needs-human` (default: `['full-exploration']`)
3. If `scopeTier` in `config.autoExecute` → `dispatch-local` (default: `['quick-fix', 'diagnostic']`)
4. If `scopeTier` in `config.signalGated` → evaluate concern signals; any signal fires → `needs-human`, none → `dispatch-local`

**Scope tier detection** uses plan-presence as the primary signal, labels as override:

| Artifacts Present      | Inferred Tier      |
| ---------------------- | ------------------ |
| No spec, no plan       | `full-exploration` |
| Spec exists, no plan   | `guided-change`    |
| Plan exists            | `guided-change`    |
| Label override present | Use label          |

### Component 3: State Machine Changes

File: `packages/orchestrator/src/core/state-machine.ts`

Extend `DispatchEffect` with a backend target:

```typescript
interface DispatchEffect {
  kind: 'dispatch';
  issueId: string;
  backend: 'local' | 'primary'; // NEW
}
```

New effect type for escalation:

```typescript
interface EscalateEffect {
  kind: 'escalate';
  issueId: string;
  reasons: string[];
}
```

The `EscalateEffect` causes the orchestrator to:

1. Mark the issue as `needs-human` in the roadmap
2. Push an interaction to the interaction queue
3. Emit a `state_change` event (picked up by dashboard via WebSocket)

### Component 4: Interaction Queue

New file: `packages/orchestrator/src/core/interaction-queue.ts`

Persistent queue of pending human interactions. Backed by a JSON file in `.harness/interactions/`.

```typescript
interface PendingInteraction {
  id: string;
  issueId: string;
  type: 'needs-human';
  reasons: string[];
  context: {
    issueTitle: string;
    issueDescription: string | null;
    specPath: string | null;
    planPath: string | null;
    relatedFiles: string[];
  };
  createdAt: string;
  status: 'pending' | 'claimed' | 'resolved';
}
```

The orchestrator writes interactions. The dashboard reads and updates them. Resolution occurs when:

- A plan file appears in `docs/` for the issue (file watcher detects it)
- Human explicitly dismisses the interaction in the dashboard
- Human manually changes the issue status in the roadmap

### Component 5: Orchestrator Server Extensions

File: `packages/orchestrator/src/server.ts` (existing)

Three additions to the existing HTTP server:

**WebSocket endpoint (`/ws`):**

- Broadcasts `state_change` events (replaces TUI's `orchestrator.on('state_change')`)
- Broadcasts new interactions from the queue
- Broadcasts agent events (tool calls, thoughts, output) for the monitor panel

**REST endpoints:**

- `GET /api/interactions` — list pending interactions
- `PATCH /api/interactions/:id` — claim or resolve an interaction
- `GET /api/state` — current orchestrator state snapshot
- `POST /api/chat` — spawns Claude Code CLI subprocess, streams responses as SSE (no API key required)
- `POST /api/plans` — write plan file to `docs/plans/`

**Static file serving:**

- Serve the built dashboard from `packages/dashboard/dist/` at root path

### Component 6: Web Dashboard

New package: `packages/dashboard/`

React SPA with three panels:

**Agent Monitor Panel** (replaces TUI):

- Running agents: PID, issue, turn count, tokens, last event
- Rate limit visualization
- Token usage totals
- Retry queue

**Needs Attention Panel:**

- List of pending interactions from the queue
- Each item shows: issue title, escalation reasons, available context (spec/plan links)
- "Claim" button marks interaction as claimed and opens Claude Chat Pane with pre-loaded context
- "Dismiss" button resolves without action

**Claude Chat Pane:**

- Chat interface powered by `POST /api/chat` proxy
- Pre-loaded with issue context when opened from Needs Attention
- System prompt includes: issue description, spec (if exists), related files, concern signals
- "Save Plan" action writes to `docs/plans/` via `POST /api/plans`
- Saving a plan auto-resolves the interaction; orchestrator picks it up on next tick

### Component 7: Configuration

Extends `WorkflowConfig.agent` in `packages/types/src/orchestrator.ts`:

```typescript
interface AgentConfig {
  // ... existing fields ...

  // Local model configuration
  localBackend?: 'openai-compatible';
  localModel?: string;
  localEndpoint?: string;
  localApiKey?: string;

  // Escalation routing
  escalation?: {
    alwaysHuman?: string[];
    autoExecute?: string[];
    signalGated?: string[];
    diagnosticRetryBudget?: number; // default: 1
  };
}
```

WORKFLOW.md example:

```yaml
agent:
  backend: claude
  localBackend: openai-compatible
  localModel: deepseek-coder-v2
  localEndpoint: http://localhost:11434/v1
  escalation:
    alwaysHuman:
      - full-exploration
    autoExecute:
      - quick-fix
      - diagnostic
    signalGated:
      - guided-change
    diagnosticRetryBudget: 1
```

### Data Flow

```
Tick
 |
 +- Fetch candidates from roadmap
 |
 +- For each eligible issue:
 |   +- Detect scope tier (plan-presence + label override)
 |   +- Route: routeIssue(issue, tier, signals, config)
 |   |
 |   +- dispatch-local:
 |   |   +- DispatchEffect { backend: 'local' }
 |   |   +- AgentRunner uses local backend
 |   |   +- On success: mark done
 |   |   +- On failure (diagnostic, retry exhausted): EscalateEffect
 |   |   +- On failure (other): ScheduleRetryEffect (existing)
 |   |
 |   +- needs-human:
 |       +- EscalateEffect { reasons }
 |       +- Write to interaction queue
 |       +- Mark issue as 'needs-human' in roadmap
 |       +- Broadcast via WebSocket to dashboard
 |
 +- Process side effects (existing flow)
```

## Success Criteria

| #    | Criterion                                                                                                                    | Verification                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SC1  | Local backend connects to an OpenAI-compatible server and completes a multi-turn agent session                               | Integration test: start Ollama, dispatch a trivial issue, verify agent produces a commit                                                               |
| SC2  | Orchestrator routes `quick-fix` and `diagnostic` issues to local backend without human involvement                           | Run orchestrator with mixed roadmap; verify local backend handles simple issues end-to-end while `full-exploration` issues appear in interaction queue |
| SC3  | `full-exploration` issues (no spec, no plan) always escalate to needs-human                                                  | Unit test: `routeIssue()` with no spec/plan artifact returns `needs-human`                                                                             |
| SC4  | `guided-change` issues escalate when concern signals fire, dispatch locally when they don't                                  | Unit test: issue with plan + `highComplexity` signal returns `needs-human`; same issue without signal returns `dispatch-local`                         |
| SC5  | Diagnostic issues escalate after 1 failed retry (not 2)                                                                      | Unit test on state machine: diagnostic issue with 1 failed attempt produces `EscalateEffect`                                                           |
| SC6  | Escalated issues appear in the web dashboard Needs Attention panel within 5 seconds                                          | Manual test: escalate an issue, verify WebSocket broadcasts and dashboard renders it                                                                   |
| SC7  | Human can open Claude Chat Pane from an escalated issue with pre-loaded context                                              | Manual test: claim an interaction, verify chat pane opens with issue description + spec + concern signals in system prompt                             |
| SC8  | Plan saved from Claude Chat Pane writes to `docs/plans/`, resolves the interaction, and orchestrator dispatches on next tick | End-to-end test: save plan from dashboard, verify file exists, interaction resolved, orchestrator dispatches to local backend                          |
| SC9  | Web dashboard shows equivalent information to the existing TUI (agents, tokens, rate limits)                                 | Visual comparison: run both side-by-side, verify dashboard shows all TUI data                                                                          |
| SC10 | Orchestrator functions normally when local backend is unavailable (falls back to primary backend only)                       | Integration test: start orchestrator with no Ollama running; verify all issues route to primary backend or needs-human with no crashes                 |

## Implementation Order

### Phase 1: Local Backend + Model Router (Foundation)

Goal: Orchestrator routes issues to a local model and escalates the rest. Escalation visible in roadmap status and CLI logs.

1. Implement `LocalBackend` — OpenAI-compatible `AgentBackend` implementation
2. Add scope tier detection — plan-presence check + label override
3. Implement `routeIssue()` pure function — scope tier + concern signals to routing decision
4. Extend state machine — `DispatchEffect.backend` field + `EscalateEffect` type
5. Wire routing into orchestrator dispatch — call `routeIssue()` before dispatching
6. Add escalation config to `WorkflowConfig`
7. Implement interaction queue — JSON file persistence in `.harness/interactions/`
8. Update roadmap tracker — support `needs-human` status

Validates: SC1, SC2, SC3, SC4, SC5, SC10

### Phase 2: Orchestrator Server + WebSocket (Transport)

Goal: The server broadcasts state and interactions in real-time. Dashboard has a data source.

1. Add WebSocket support to existing server — broadcast `state_change`, `interaction_new`, agent events
2. Add REST endpoints — interactions CRUD, state snapshot
3. Add chat proxy endpoint — `POST /api/chat` proxies to Anthropic API
4. Add plan write endpoint — `POST /api/plans` writes plan files to `docs/plans/`
5. Add static file serving — serve `packages/dashboard/dist/` at root path
6. File watcher — detect plan creation, auto-resolve matching interactions

Validates: SC6 (with test client), SC8 (server-side)

### Phase 3: Web Dashboard (Interface)

Goal: Human monitors and interacts through the browser.

1. Scaffold `packages/dashboard/` — React SPA with build pipeline
2. Agent Monitor Panel — WebSocket connection, running agents, tokens, rate limits
3. Needs Attention Panel — fetch interactions, display with context, claim/dismiss actions
4. Claude Chat Pane — chat interface, pre-loaded context, save plan action
5. Browser notifications on new escalations
6. TUI deprecation path — keep TUI working but mark as fallback for headless environments

Validates: SC6, SC7, SC8, SC9

### Phase Boundaries

Each phase is independently shippable and valuable:

- **Phase 1 alone:** Local models work, escalation visible in roadmap and logs. Delivers the 80%+ autonomous goal.
- **Phase 2 alone:** API exists for any client (scripts, mobile, custom UI). Enables programmatic integration.
- **Phase 3 alone:** Full "sit and wait" experience in browser. Delivers the dashboard vision.
