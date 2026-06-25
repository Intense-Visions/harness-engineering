# Live Work-in-Flight Kanban

**Status:** proposed
**Slug:** `work-in-flight-kanban`
**Keywords:** orchestrator, autopilot, sessions, dashboard, SSE, run-normalization, kanban, observability, live-runs, needs-human

## Overview & Goals

### Problem

When agents run autonomously — many concurrently in the orchestrator daemon, plus
manual autopilot/skill sessions — there is no single live view of what is executing
_right now_, what phase each run is in, and what is stuck waiting on a human. Today the
orchestrator exposes a terminal-only view (`packages/orchestrator/src/tui/app.tsx:14`)
and the web dashboard shows roadmap/health but not live runs. The fleet cannot be
watched from one place.

### Goal

A live, always-on Kanban board in the web dashboard that shows every in-flight run —
orchestrator-dispatched **and** manual — as a card, bucketed into five lifecycle lanes,
with each running card showing its native phase plus live signal (tokens, turn count,
retry attempt). Read-only, with two actions: jump to a run that needs a human, and stop
a run.

### Strategy grounding

`STRATEGY.md#key-metrics` — observability in service of the **Agent Autonomy** bet: you
grant agents more autonomy only when you can watch the fleet and intervene at the
needs-human boundary. This is deliberately a _convenience_ feature that de-risks the
autonomy metric, **not** a strategically central track. Flagged so we do not over-invest.

### Non-goals (YAGNI)

- No full control plane (pause/resume/retry/reassign) — only jump-to-needs-human + stop.
- No coordinator-wave (in-session sub-agent) visualization — ephemeral, no persistence.
- No historical analytics / run replay — live board only (history is a future consideration).
- No phase-flow lanes — lanes stay coarse; native phase lives on the card.

### Key assumption

The orchestrator is reachable via a **configured base URL** (default
`http://localhost:<port>`, but remote-capable). No same-host assumption is baked in.

## Decisions made

| #   | Decision                                                                                                        | Rationale                                                                                                                      | Evidence                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| D1  | Unify **orchestrator runs + manual runs** in one board                                                          | The fleet spans both worlds; a single-source view misses half the work                                                         | `packages/orchestrator/src/types/internal.ts:91`; `harness-autopilot/SKILL.md:38`  |
| D2  | Render in the **web dashboard**, not a new TUI                                                                  | Dashboard already has SSE transport + React component lib; a board is web-shaped; orchestrator TUI already covers the terminal | `packages/dashboard/src/server/sse.ts`; `packages/orchestrator/src/tui/app.tsx:14` |
| D3  | **Coarse lifecycle lanes** (`Queued·Running·Needs-human·Done·Failed`) with native-phase chip on the card        | Only lane set both sources map onto without a lossy phase union; preserves granularity without it leaking into layout          | `internal.ts:7` (`RunAttemptPhase`) vs `autopilot-state.json.currentState`         |
| D4  | **Read-only + 2 actions** (jump-to-needs-human, stop)                                                           | 90% of control value, minimal write surface; needs-human path already exists                                                   | `POST /api/interactions/{id}/resolve`                                              |
| D5  | **Dashboard-aggregator** architecture (`gatherRuns()` merges `/api/state` + local files → one `runs` SSE event) | Read path already on the wire; keeps the browser dumb; reuses SSE infra                                                        | `packages/orchestrator/src/server/http.ts:612`; `orchestrator.ts:1970`             |
| D6  | **New orchestrator cancel endpoint** for stop (admin scope)                                                     | No per-run cancel exists today; only full-server stop / reconciliation cancel                                                  | `dispatch-actions.ts:42` (only `/api/dispatch/adhoc`)                              |
| D7  | Orchestrator reached via **configured base URL** (default localhost, remote-capable)                            | Safer default; no same-host assumption baked in                                                                                | —                                                                                  |
| D8  | **Graceful degradation** when orchestrator unreachable                                                          | A down daemon must not blank the board                                                                                         | new requirement                                                                    |

## Technical design

### Normalized model

New shared types in `packages/dashboard/src/shared/types.ts`:

```ts
type RunSource = 'orchestrator' | 'manual';
type RunLane = 'queued' | 'running' | 'needs-human' | 'done' | 'failed';

interface RunCard {
  id: string; // orchestrator issueId, or manual session slug
  source: RunSource;
  title: string; // issue identifier/title, or spec H1 / slug
  lane: RunLane;
  phase: string | null; // native chip: 'StreamingTurn' | 'EXECUTE (3/7)' | 'stale' | null
  startedAt: string;
  tokens?: number; // orchestrator LiveSession.totalTokens
  turnCount?: number; // orchestrator LiveSession.turnCount
  attempt?: number | null; // orchestrator retry attempt
  interactionId?: string; // present iff lane === 'needs-human'
  detailHref?: string; // deep-link (session dir / interaction)
}

interface RunsData {
  cards: RunCard[];
  orchestratorReachable: boolean;
  lastRun: string;
}
```

### Lane mapping (pure functions, unit-tested)

**Orchestrator** `RunAttemptPhase` → lane:

- `PreparingWorkspace | BuildingPrompt | LaunchingAgent | InitializingSession | StreamingTurn | Finishing | RateLimitSleeping | Stalled` → `running` (chip carries the native phase)
- `Succeeded` → `done`
- `Failed | TimedOut | CanceledByReconciliation` → `failed`
- claimed-but-not-running / retry-queue entries → `queued`
- an open interaction for the run → `needs-human` (overrides `running`)

**Manual** `autopilot-state.json.currentState`:

- `INIT | ASSESS | PLAN | EXECUTE | VERIFY | INTEGRATE | REVIEW | PHASE_COMPLETE | FINAL_REVIEW` → `running` (chip = `currentState`; `EXECUTE (n/m)` derived from `phases[]`)
- `APPROVE_PLAN` or any `[checkpoint:*]` → `needs-human`
- `DONE` → `done`
- file mtime older than the staleness threshold **and** state ≠ `DONE` → `failed` (chip `stale`) — a crashed/abandoned run stays visible, never silently dropped

### Server (dashboard) — `gatherRuns(ctx)`

Added to `packages/dashboard/src/server/sse.ts` `_tick` (cheap per-tick group, alongside `overview` — **not** the cached `checks` group):

- Reads manual runs from `.harness/sessions/*/autopilot-state.json` + `state.json` (local FS, same pattern as existing gatherers).
- Fetches orchestrator `GET {orchestratorBaseUrl}/api/state` with `Authorization: Bearer {readStatusToken}`. On error/timeout → `orchestratorReachable: false`, omit orchestrator cards.
- **Projects only the fields needed for `RunCard`** from the snapshot — the raw `/api/state` payload (full `OrchestratorState`) is never forwarded to the browser.
- Merges + maps → `RunsData`; broadcasts a new `SSEEvent` `type: 'runs'`.

### Client — `<KanbanBoard>` page

`packages/dashboard/src/client/`:

- Subscribes to existing SSE; on `runs` events renders five lane columns of `<RunCard>` (reusing `KpiCard` / `Sparkline` idioms).
- Needs-human card → **Resolve** button deep-linking to the interaction (existing resolve flow).
- Running card → **Stop** button → dashboard proxy → orchestrator cancel.
- Orchestrator-disconnected banner when `orchestratorReachable === false`.

### Orchestrator — new cancel endpoint

`POST /api/dispatch/{id}/cancel` (new handler near `routes/dispatch-actions.ts`):

- **admin** scope (registered in `requiredScopeForRoute`), audited via the existing audit logger.
- Looks up `state.running.get(id)`, signals the worker to terminate, transitions the entry to a terminal cancelled state.
- **Idempotent**: if the run is already terminal (finished between render and click), returns **409 Conflict** — surfaced client-side as a toast, not an error.

### Token / privilege model

- The **admin** token for cancel lives **server-side only** in the dashboard proxy; the browser authenticates to the dashboard, never to the orchestrator.
- The read path uses the lower-privilege **read-status** token.
- Dashboard exposes a thin authenticated proxy route for cancel (mirrors `chat-proxy.ts`).

### Config

`orchestratorBaseUrl` + tokens wired into the dashboard `SSEContext` / context; default `http://localhost:<port>`.

## Integration Points

### Entry Points

- New dashboard client route/page `<KanbanBoard>`.
- New SSE event type `runs`.
- New server gatherer `gatherRuns`.
- New dashboard proxy route for stop.
- New orchestrator route `POST /api/dispatch/{id}/cancel`.

### Registrations Required

- Register `gatherRuns` in `sse.ts` `_tick`.
- Add `'runs'` to the `SSEEvent` union in `packages/dashboard/src/shared/types.ts`.
- Register the cancel route in the orchestrator `apiRoutes` set and in `requiredScopeForRoute` (→ `admin`).
- Add a nav entry for the Kanban page.

### Documentation Updates

- Dashboard README — new page + `orchestratorBaseUrl` config.
- Orchestrator API docs — new cancel endpoint + scope.
- AGENTS.md dashboard section, if it enumerates pages.

### Architectural Decisions

- **D5** (dashboard-aggregator vs client-multiplex vs file-registry) warrants an ADR — it is a cross-package coupling decision (dashboard → orchestrator API) future contributors will want the rationale for.
- **D6** (per-run control endpoint) warrants an ADR — it opens the first write path that _mutates live agent execution_ from outside the orchestrator, a security boundary.
- D1–D4, D7–D8 are local and do not need standalone ADRs.

### Knowledge Impact

- "Run normalization" — mapping two phase vocabularies onto a shared lane model.
- "Orchestrator control boundary" — admin-scoped mutation of live runs from outside the daemon.

## Success Criteria

1. With the orchestrator running ≥1 agent **and** ≥1 manual session active, the board shows a card for each, in the correct lane, within one poll interval.
2. A running orchestrator card displays its native `RunAttemptPhase`; a manual card displays its `currentState` (with `EXECUTE (n/m)` when in EXECUTE). _(EARS: When a run's phase changes, the board shall reflect the new phase within one poll interval.)_
3. A run with an open interaction appears in **Needs-human**; its Resolve link reaches the existing interaction resolve flow.
4. Stop on a running orchestrator card transitions it to **Failed/Canceled** and terminates the agent process; the endpoint rejects non-admin tokens (401/403). _(EARS: If a stop is requested without an admin token, then the system shall not cancel the run.)_
5. **When the orchestrator API is unreachable, the board shall still render manual runs and show a disconnected banner** (no blank board, no crash).
6. A stop on a run that has already finished returns **409** and surfaces a toast, leaving board state consistent.
7. `gatherRuns` lane-mapping has unit tests covering every `RunAttemptPhase` and every `currentState`.
8. `harness validate` passes; no new layer/dependency violations (the dashboard → orchestrator coupling stays behind the configured-URL/HTTP boundary, not a package import).

## Implementation Order

1. **Model + mapping (pure):** `RunCard` / `RunsData` types + lane-mapping functions + unit tests. No I/O.
2. **Server gatherer:** `gatherRuns` (local files first, then orchestrator `/api/state` fetch + degradation + field projection), wire into `_tick`, add `runs` SSE event.
3. **Client board:** `<KanbanBoard>` page, lane columns, cards, phase chips, disconnected banner, nav entry. Read-only end-to-end.
4. **Actions:** wire needs-human Resolve deep-link; add orchestrator cancel endpoint (admin scope, audited, idempotent/409) + dashboard proxy + Stop button.
5. **Docs + ADRs (D5, D6) + knowledge nodes; final `harness validate`.**
