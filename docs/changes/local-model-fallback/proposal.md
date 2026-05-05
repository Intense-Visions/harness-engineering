# Local Model Array Fallback with Resolver Consolidation

**Keywords:** orchestrator, local-model, fallback, ollama, lm-studio, openai-compatible, resolver, dashboard, intelligence-pipeline, hybrid-orchestrator

## Overview

The orchestrator's `agent.localModel` config is currently a single string. If that model isn't loaded on the local server, dispatches fail at request time with an opaque 404, and there's no way to express a preference order or detect availability up front.

This spec widens `localModel` to accept an array of candidate model IDs evaluated in order, introduces a `LocalModelResolver` that owns the probe lifecycle and consolidates duplicated config reads, and surfaces a clear warning to the dashboard when no candidate is available. Existing configs work unchanged.

### Goals

1. Allow `localModel` to be either a string or a non-empty array, evaluated in order against `/v1/models`. First match wins.
2. Centralize all local-config consumption behind a single `LocalModelResolver` so both the agent backend and the intelligence pipeline analysis provider read the same resolved value.
3. Periodic re-probe (independent timer aligned with orchestrator lifecycle) so the warning self-clears when the user loads a model after the orchestrator started.
4. When no candidate matches: gracefully disable local-only paths with a clear logged warning and a structured warning surfaced on the dashboard. Cloud paths and `ClaudeBackend` (subscription) remain untouched.
5. Zero breaking changes — `localModel: 'gemma-4-e4b'` keeps working byte-for-byte.

### Non-goals

- Per-use-case backend routing — **shipped in [Spec 2: Multi-Backend Routing](../multi-backend-routing/proposal.md)**. The deferral is resolved.
- Promoting `LocalBackend` / `PiBackend` to primary backends via `agent.backend: 'local' | 'pi'` — **shipped in [Spec 2: Multi-Backend Routing](../multi-backend-routing/proposal.md)** as the named-map schema. The deferral is resolved.
- Changes to `ClaudeBackend`, cloud backends (`anthropic`, `openai`, `gemini`), or `intelligence.provider` explicit config.
- Auto-loading models on the local server (LM Studio's hot-load is fine; we don't trigger loads).
- Backend-native loaded-state checks (LM Studio `/api/v0/models`, Ollama `/api/ps`) — `/v1/models` listing is sufficient.

### Assumptions

- **Runtime:** Node.js ≥ 22.x (matches the project minimum per AGENTS.md).
- **`/v1/models` response shape:** OpenAI-standard `{ data: [{ id: string }, ...] }`. Each supported local server (LM Studio, Ollama, vLLM) conforms to this shape. Other fields are tolerated and ignored.
- **Single orchestrator per local server:** Probe traffic is one GET per `localProbeIntervalMs` per orchestrator instance; concurrent orchestrators are not coordinated.
- **Endpoint reachability:** The orchestrator host can reach `agent.localEndpoint`. Network reachability is the operator's responsibility; the resolver's only response to unreachability is to mark `available: false` and continue probing.
- **Probe cadence is human-timescale:** Default 30s; minimum 1s enforced. Sub-second probes are out of scope.
- **Dashboard WebSocket channel availability:** When `available` flips, the dashboard receives the update through the existing WebSocket infrastructure used for `maintenance:*` events. Reconnect on transient drop is handled by existing client code.

### Success in plain terms

After this spec lands, the user can write `localModel: [gemma-4-e4b, qwen3:8b, deepseek-coder-v2]`, restart the orchestrator with no model loaded, see a clear dashboard warning, load any one of the three models, and watch the warning clear within a probe interval — all without restarting the orchestrator and without changing any other config.

## Decisions

| #   | Decision                                                                                                                                                                                                          | Rationale                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Detect via `/v1/models` listing.** Probe the OpenAI-compatible `/v1/models` endpoint and pick the first array entry whose `id` matches a returned model.                                                        | Standard endpoint that works across LM Studio / Ollama / vLLM. Already used by `LocalBackend.healthCheck()` (`packages/orchestrator/src/agent/backends/local.ts:147-156`).          |
| D2  | **Graceful disable with visible warning.** When no candidate is loaded, mark local paths as disabled, log a warning, and surface a structured warning to the dashboard.                                           | Avoids both silent cloud-fallback (which can quietly cost money) and hard-failing the whole orchestrator (which blocks unrelated cloud work).                                       |
| D3  | **Periodic re-probe via independent timer aligned with orchestrator lifecycle.** Default 30s; configurable via `agent.localProbeIntervalMs`.                                                                      | Long-running daemon needs self-healing. Per-dispatch probe adds latency. Startup-only forces orchestrator restart after loading a model.                                            |
| D4  | **Single `LocalModelResolver` consumed by both call sites.** Both `createLocalBackend()` and `createAnalysisProvider()` read the resolved model name from one resolver instance.                                  | Removes duplicated reads of `agent.local*` (originally in three places per evidence; two are LLM-consuming paths). De-risks Spec 2 — new consumers of the same resolver.            |
| D5  | **`ClaudeBackend` and cloud backends untouched.** No change to `claude.ts`, `anthropic.ts`, `openai.ts`, `gemini.ts`, or `mock.ts`. `agent.backend: claude` (subscription via `claude` CLI) preserved.            | User requirement: preserve subscription-based execution unchanged. Local-model concerns are orthogonal to primary backend selection in this spec.                                   |
| D6  | **Scope split.** This spec covers array fallback, resolver consolidation, dashboard warning, periodic probe. Spec 2 (`multi-backend-routing`) covers `agent.backends` map, `agent.routing` map, primary-as-local. | Bundling primary-as-local would create a one-release-window oddity where two schema mechanisms express "primary is local." Sequencing lets Spec 2 introduce the new schema cleanly. |
| D7  | **Zero breaking changes.** `localModel?: string \| string[]`. String form is normalized internally to a 1-element array. No deprecation, no migration warning.                                                    | Existing configs (e.g., `harness.orchestrator.md:23`) keep working. Array vs. string is a trivial type widening.                                                                    |

## Technical Design

### Type changes

**File:** `packages/types/src/orchestrator.ts`

```typescript
export interface AgentConfig {
  // ...existing fields unchanged...

  /** Model name for local backend. String or non-empty array of candidates evaluated in order. */
  localModel?: string | string[]; // WIDENED

  /** Probe interval in ms for local model availability (default: 30_000). */
  localProbeIntervalMs?: number; // NEW
}

/**
 * Snapshot of local-model availability, exposed to the dashboard and consumers.
 */
export interface LocalModelStatus {
  // NEW
  /** True when at least one configured candidate is loaded on the server. */
  available: boolean;
  /** The currently selected model ID, or null when none matched. */
  resolved: string | null;
  /** Configured candidate list, normalized to array. */
  configured: string[];
  /** Model IDs returned by the last successful probe. */
  detected: string[];
  /** ISO timestamp of the last successful probe, null if never succeeded. */
  lastProbeAt: string | null;
  /** Last probe error message, null when healthy. */
  lastError: string | null;
  /** Human-readable warnings (empty when healthy). */
  warnings: string[];
}
```

### New module: `LocalModelResolver`

**File:** `packages/orchestrator/src/agent/local-model-resolver.ts` (NEW)

```typescript
export interface LocalModelResolverOptions {
  endpoint: string;
  apiKey?: string;
  /** Normalized candidate list (already turned from string|string[] into string[]). */
  configured: string[];
  /** Probe cadence in ms; default 30_000. */
  probeIntervalMs?: number;
  /** Injectable for tests. Default: GET {endpoint}/models with bearer apiKey. */
  fetchModels?: (endpoint: string, apiKey?: string) => Promise<string[]>;
  logger?: Pick<Logger, 'info' | 'warn'>;
}

export class LocalModelResolver {
  constructor(opts: LocalModelResolverOptions);

  /** Begin the probe loop. Idempotent. Performs an immediate probe before scheduling. */
  start(): Promise<void>;

  /** Stop the probe loop. Idempotent. */
  stop(): void;

  /** Currently resolved model, or null when no candidate is loaded. */
  resolveModel(): string | null;

  /** Read-only status snapshot. */
  getStatus(): LocalModelStatus;

  /** Subscribe to status changes; fires only when the snapshot meaningfully changes. */
  onStatusChange(handler: (status: LocalModelStatus) => void): () => void;

  /** Force an immediate probe (returns updated status). */
  probe(): Promise<LocalModelStatus>;
}
```

**Probe behavior**

- GET `${endpoint}/models` with `Authorization: Bearer ${apiKey ?? 'lm-studio'}`
- Parse `{ data: [{ id: string }] }` (OpenAI-standard)
- Walk `configured` in order; first ID present in detected wins → `resolved`
- **Error handling (failure modes):**
  - **Network error / timeout / non-2xx response:** `available=false`, `resolved=null`, `lastError` populated with the error message, `detected` retains the prior successful probe's value.
  - **Malformed response body** (non-JSON, missing `data` array, entries without `id`): treat as a probe failure — same handling as network error, `lastError` is `"malformed /v1/models response"`.
  - **Empty `data` array** (server reachable, no models loaded): `available=false`, `resolved=null`, `detected=[]`, `lastError=null` (server responded; this is a normal "no models loaded" state, not an error).
- On status delta (any field except `lastProbeAt`): fire `onStatusChange` listeners

**Cadence:** independent `setInterval` owned by the resolver. Lifecycle bound to `Orchestrator.start()`/`stop()`. Default 30s, configurable via `agent.localProbeIntervalMs` (minimum 1000ms enforced by config validation).

### Backend constructor changes

**Files:** `packages/orchestrator/src/agent/backends/local.ts`, `packages/orchestrator/src/agent/backends/pi.ts`

Both backends gain an optional `getModel` callback that takes precedence over the static `model` field:

```typescript
export interface LocalBackendConfig {
  endpoint?: string;
  /** Static model name. Ignored if `getModel` is provided. */
  model?: string;
  /** Lazy resolver. Called at each session start; null disables this backend. */
  getModel?: () => string | null; // NEW
  apiKey?: string;
  timeoutMs?: number;
}
```

When `getModel()` returns `null` at session start, the backend returns `Err({ category: 'agent_not_found', message: 'No local model available; check dashboard for details.' })` from `startSession()`. Same shape for `PiBackend.startSession()`.

This keeps backends "dumb" — they gain an optional callback, no orchestrator coupling.

### Orchestrator wiring

**File:** `packages/orchestrator/src/orchestrator.ts`

```typescript
private localModelResolver: LocalModelResolver | null = null;

constructor(config: WorkflowConfig, ...) {
  // ...existing...
  if (this.config.agent.localBackend) {
    this.localModelResolver = new LocalModelResolver({
      endpoint: this.config.agent.localEndpoint ?? 'http://localhost:11434/v1',
      apiKey: this.config.agent.localApiKey,
      configured: normalizeLocalModel(this.config.agent.localModel),  // string|string[]|undefined → string[]
      probeIntervalMs: this.config.agent.localProbeIntervalMs,
      logger: this.logger,
    });
  }
}

async start() {
  // ...existing...
  await this.localModelResolver?.start();
  this.localModelResolver?.onStatusChange((status) => {
    this.server?.broadcastLocalModelStatus(status);
  });
}

async stop() {
  this.localModelResolver?.stop();
  // ...existing...
}

private createLocalBackend(): AgentBackend | null {
  if (!this.localModelResolver) return null;
  const getModel = () => this.localModelResolver!.resolveModel();
  if (this.config.agent.localBackend === 'openai-compatible') {
    return new LocalBackend({
      endpoint: this.config.agent.localEndpoint,
      apiKey: this.config.agent.localApiKey,
      timeoutMs: this.config.agent.localTimeoutMs,
      getModel,
    });
  }
  if (this.config.agent.localBackend === 'pi') {
    return new PiBackend({
      endpoint: this.config.agent.localEndpoint,
      apiKey: this.config.agent.localApiKey,
      getModel,
    });
  }
  return null;
}

private createAnalysisProvider(): AnalysisProvider | null {
  // ...explicit intelligence.provider path (step 1) unchanged...

  // Step 2 — local
  if (this.config.agent.localBackend && this.localModelResolver) {
    const status = this.localModelResolver.getStatus();
    if (!status.available) {
      this.logger.warn(
        `Intelligence pipeline disabled: no configured localModel loaded ` +
        `at ${this.config.agent.localEndpoint}. Configured: [${status.configured.join(', ')}].`
      );
      return null;       // disabled, not silently escalated
    }
    return new OpenAICompatibleAnalysisProvider({
      apiKey: this.config.agent.localApiKey ?? 'ollama',
      baseUrl: this.config.agent.localEndpoint!,
      defaultModel: status.resolved!,
      // ...other intel options unchanged...
    });
  }

  // Step 3 — primary backend (cloud) unchanged
}
```

**Disable semantics:**

- **Agent dispatch.** When escalation routes a task to local and the resolver returns `null` at session start, the backend fails with typed `agent_not_found`. The existing retry/escalation policy (`EscalationConfig`) handles the error — same code path as if the pi SDK weren't installed.
- **Intelligence pipeline.** When local is configured but unavailable at orchestrator start, `createAnalysisProvider()` returns `null`, and the pipeline does not initialize. Re-enable on later status change is **deferred** — operator must restart the orchestrator after loading a model. Logged as a known limitation in §Documentation; Spec 2 will revisit.

### Dashboard surface

**Server side** (`packages/orchestrator/src/server/`)

- New endpoint: `GET /api/v1/local-model/status` returns `LocalModelStatus`
- New WebSocket event topic: `local-model:status` — broadcast on every meaningful status change

**Client side** (`packages/dashboard/src/`)

- New shared type `LocalModelStatus` re-exported from `@harness-engineering/types`
- New `useLocalModelStatus()` hook (WebSocket subscription with HTTP fallback for initial load)
- Warning banner on the existing **Orchestrator** page (`packages/dashboard/src/client/pages/Orchestrator.tsx`). Renders when `available === false`. Banner content: configured list, detected list, endpoint, last error, last probe time.

### File layout summary

| Path                                                             | Change                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/types/src/orchestrator.ts`                             | Widen `localModel`; add `localProbeIntervalMs`; add `LocalModelStatus` |
| `packages/orchestrator/src/agent/local-model-resolver.ts`        | **NEW** — resolver class + probe loop                                  |
| `packages/orchestrator/src/agent/backends/local.ts`              | Add optional `getModel` callback to config; thread into `runTurn`      |
| `packages/orchestrator/src/agent/backends/pi.ts`                 | Same                                                                   |
| `packages/orchestrator/src/orchestrator.ts`                      | Construct/start/stop resolver; wire into the two consumer methods      |
| `packages/orchestrator/src/server/routes.ts` (or equivalent)     | Add `/api/v1/local-model/status` route + WebSocket topic               |
| `packages/dashboard/src/client/hooks/useLocalModelStatus.ts`     | **NEW** — WebSocket-backed React hook                                  |
| `packages/dashboard/src/client/pages/Orchestrator.tsx`           | Add warning banner                                                     |
| `packages/orchestrator/tests/agent/local-model-resolver.test.ts` | **NEW** — unit tests for probe, status transitions, periodic loop      |

### Validation rules (config schema)

- `localModel` accepts `string | string[]`. Array must be non-empty when present.
- `localProbeIntervalMs` if set must be ≥ 1000.
- No new required fields. All existing configs validate unchanged.

## Integration Points

### Entry Points

- **HTTP route:** `GET /api/v1/local-model/status` on the orchestrator HTTP server. Returns `LocalModelStatus` JSON.
- **WebSocket topic:** `local-model:status` on the existing orchestrator WebSocket channel. Payload is `LocalModelStatus`.
- **React hook:** `useLocalModelStatus()` at `packages/dashboard/src/client/hooks/useLocalModelStatus.ts`.
- **Module:** `LocalModelResolver` exported from `packages/orchestrator/src/agent/local-model-resolver.ts`. Internal to the orchestrator package — not part of the public API.
- **Type:** `LocalModelStatus` re-exported through `@harness-engineering/types` for dashboard consumption.

### Registrations Required

- **Type barrel:** `packages/types/src/index.ts` re-exports `LocalModelStatus`. Existing barrel-generation script (`pnpm run generate:barrels`) handles the regeneration.
- **Server route:** add `/api/v1/local-model/status` to the orchestrator HTTP route table. The dashboard's existing reverse proxy (`packages/dashboard/src/server/orchestrator-proxy.ts:18-32`) already forwards `/api/v1/*` — no proxy change needed.
- **WebSocket topic enrollment:** register `local-model:status` in the orchestrator's broadcast manager alongside existing topics (`maintenance:*`, etc.).
- **Dashboard route:** none — banner lives on the existing Orchestrator page.

### Documentation Updates

- `docs/guides/hybrid-orchestrator-quickstart.md` — Update "Local model configuration" to show array form. Add a "Multiple model fallback" subsection with the new behavior.
- `docs/guides/intelligence-pipeline.md` — Note the array form on `agent.localModel`; add a "Known limitations" entry covering the disable-no-self-restore behavior for the intelligence pipeline.
- `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md` — Add a comment showing the array form alongside the existing `localModel: gemma-4-e4b` example.
- `docs/changes/hybrid-orchestrator/proposal.md` — Brief addendum noting the post-Phase 1 widening.
- `AGENTS.md` — No change required.

### Architectural Decisions

Two ADRs warranted (medium tier):

- **ADR — Local model resolution strategy.** Records D1 (`/v1/models` listing over backend-native loaded checks) and D3 (periodic-probe via independent timer). Rationale: standard endpoint works across all supported local servers; periodic probe enables self-healing without per-dispatch latency.
- **ADR — Local availability disables rather than escalates.** Records D2 (graceful-disable + warn over silent cloud-fallback or hard-fail). Rationale: silent escalation can quietly cost money; hard-fail blocks cloud-only work; disable + warn keeps the operator informed and in control.

Filenames assigned at write time as `docs/knowledge/decisions/<NNNN>-local-model-resolution.md` and `<NNNN>-local-availability-disables-not-escalates.md`.

### Knowledge Impact

- **Concept:** `Local Model Resolution` — domain `orchestrator`. Captures the candidate list → probe → resolve flow. Path: `docs/knowledge/orchestrator/local-model-resolution.md` (NEW).
- **Process update:** if `docs/knowledge/orchestrator/tick-loop.md` exists, add a sibling reference noting the resolver as an independent reconciler. (Verify file existence at write time.)
- **Relationships:** `Local Model Resolution` → `is consumed by` → `Agent Dispatch Lifecycle`, `Intelligence Analysis Pipeline`. Created as graph edges via the existing knowledge ingestion pipeline.
- **ADRs above** ingest as `decision` nodes through the standard pipeline.

## Success Criteria

### Backwards compatibility

- **SC1** — Given an existing config with `localModel: 'gemma-4-e4b'` (string), the resolver constructs with `getStatus().configured.length === 1` and `configured[0] === 'gemma-4-e4b'`. The agent backend and analysis provider receive the same model name they would have received before this spec.
- **SC2** — When `agent.backend` is `claude`, `anthropic`, `openai`, `gemini`, or `mock` and `agent.localBackend` is unset, the orchestrator constructs the primary backend without ever instantiating `LocalModelResolver`.
- **SC3** — All existing tests in `packages/orchestrator/tests/core/state-machine.test.ts` (which reference `localModel: 'deepseek-coder-v2'`) pass unchanged.

### Resolver consolidation

- **SC-CON1** — `agent.localModel`, `agent.localEndpoint`, `agent.localApiKey`, and `agent.localTimeoutMs` are read **only once** in `Orchestrator` — at the construction site of `LocalModelResolver`. A grep over `packages/orchestrator/src/orchestrator.ts` for `agent.localModel` returns exactly one occurrence (the resolver constructor call) post-implementation.
- **SC-CON2** — Both `createLocalBackend()` and `createAnalysisProvider()` resolve the local model name **only** through `this.localModelResolver`. Neither method dereferences `agent.localModel` directly.

### Array fallback behavior

- **SC4** — Given `localModel: [a, b, c]` and `/v1/models` returns `[b, c, x]`, the resolver selects `b`.
- **SC5** — Given `localModel: [a, b, c]` and `/v1/models` returns `[a, b, c]`, the resolver selects `a` (priority order honored).
- **SC6** — Given `localModel: [a, b, c]` and `/v1/models` returns `[x, y, z]`, the resolver reports `available: false`, `resolved: null`, and `warnings` includes a message naming the configured list and the detected list.
- **SC7** — Given `localModel: []` (empty array), config validation rejects the value with a clear error message.

### Probe lifecycle

- **SC8** — When the orchestrator starts, the resolver completes one probe before `start()` resolves; the first call to `resolveModel()` returns the resolved value (not null) when a candidate is available.
- **SC9** — When the configured probe interval elapses, the resolver re-probes `/v1/models`. Verified using fake timers asserting `fetchModels` is called N+1 times after N intervals.
- **SC10** — When the resolved model changes between probes, `onStatusChange` fires with the new status.
- **SC11** — When `/v1/models` is unreachable, the resolver records `lastError`, sets `available: false`, and continues probing on subsequent intervals.
- **SC12** — When `Orchestrator.stop()` is called, the resolver's `setInterval` is cleared (no leaked timers).

### Disable-with-warning behavior

- **SC13** — If `agent.localBackend` is configured and no candidate model is loaded, the orchestrator logs a `warn`-level message identifying the endpoint, configured list, and detected list.
- **SC14** — If the intelligence pipeline is configured with a local provider and the resolver reports `available: false` at startup, `createIntelligencePipeline()` returns `null` and the pipeline does not run.
- **SC15** — If a session is dispatched to the local agent backend while `resolveModel()` returns `null`, `startSession()` returns `Err({ category: 'agent_not_found', ... })`.
- **SC16** — When local availability is unhealthy, cloud-routed paths (`agent.backend: claude`, explicit `intelligence.provider`) continue to function normally.

### Dashboard surface

- **SC17** — `GET /api/v1/local-model/status` returns a `LocalModelStatus` JSON shape matching the type.
- **SC18** — When the resolver's status changes, an WebSocket event with topic `local-model:status` is broadcast carrying the new status.
- **SC19** — When `available: false` and the user navigates to the Orchestrator page in the dashboard, a warning banner is visible showing the endpoint, configured list, detected list, and last error.
- **SC20** — When the user loads a configured model on the local server and the next probe completes, the dashboard banner disappears within `localProbeIntervalMs + 1s`.

### Self-healing

- **SC21** — When the orchestrator starts with no model loaded and the user loads a configured model after orchestrator start, the resolver reflects `available: true` on the next probe and `resolveModel()` returns the loaded model name.
- **SC22** — Once `available` flips to `true`, subsequent calls to `LocalBackend.startSession()` and `PiBackend.startSession()` return `Ok(...)` without orchestrator restart. Verified via integration test that flips the mock probe response and asserts a successful `startSession()` on the next call.
- **SC23** — Documented limitation: when the intelligence pipeline was disabled at startup due to local unavailability, it remains disabled until orchestrator restart even after local becomes available. Captured in `docs/guides/intelligence-pipeline.md` under "Known limitations." A regression test asserts the pipeline stays null in this scenario.

### Mechanical gates

- **SC24** — `pnpm typecheck` passes with strict mode on all changed files.
- **SC25** — `pnpm lint` passes; no new ESLint suppressions introduced.
- **SC26** — `pnpm test` passes the full test suite, including the new resolver tests.
- **SC27** — `harness validate` passes after the spec is written and the implementation lands.

### Out-of-scope assertions

These are explicitly NOT success criteria for this spec:

- Backend-native loaded checks (LM Studio `/api/v0/models`, Ollama `/api/ps`).
- `agent.backend: 'local'` or `agent.backend: 'pi'` as primary backend (Spec 2).
- Per-use-case backend routing via `agent.routing` map (Spec 2).
- Intelligence pipeline live-reload on local availability change (deferred; SC23 documents the limitation).

## Implementation Order

### Phase 1: Foundation (resolver in isolation)

<!-- complexity: medium -->

- Widen `localModel` type and add `localProbeIntervalMs`, `LocalModelStatus` to `packages/types`
- Implement `LocalModelResolver` class with probe loop, status snapshot, change subscription
- Unit tests covering SC4–SC12
- `pnpm typecheck` + `pnpm lint` clean

**Exit criteria:** SC4–SC12 green. Resolver is reusable in isolation.

### Phase 2: Backend integration (callback wiring)

<!-- complexity: low -->

- Add optional `getModel: () => string | null` to both `LocalBackend` and `PiBackend` configs
- Thread the callback through `startSession`; on null, return typed `agent_not_found` error
- Unit tests for SC15; regression tests confirming static-`model` path still works
- Adjust `packages/orchestrator/tests/core/state-machine.test.ts` only if a fixture needs updating (SC3)

**Exit criteria:** SC3, SC15 green. Existing tests still pass.

### Phase 3: Orchestrator wiring (resolver lifecycle)

<!-- complexity: medium -->

- Construct `LocalModelResolver` in `Orchestrator` constructor when `agent.localBackend` is set
- Wire `start()` / `stop()` lifecycle alongside existing schedulers
- Refactor `createLocalBackend()` to pass `getModel` callback (replaces direct `localModel` read)
- Refactor `createAnalysisProvider()` step 2 to read `resolver.getStatus()` and return `null` on unavailable (with logged warning, SC13)
- Integration tests for SC1, SC2, SC8, SC13, SC14, SC16, SC21, SC22

**Exit criteria:** SC1, SC2, SC8, SC13, SC14, SC16, SC21, SC22 green. Cloud paths verified untouched.

### Phase 4: Dashboard surface (server + client)

<!-- complexity: medium -->

- Add `GET /api/v1/local-model/status` route on the orchestrator HTTP server
- Add `local-model:status` WebSocket topic; broadcast on `onStatusChange`
- Add `useLocalModelStatus()` hook with WebSocket subscription + HTTP fallback
- Add warning banner to `Orchestrator.tsx`; renders on `available === false`
- Component test for the banner (SC19); server route test (SC17), WebSocket test (SC18); manual or scripted check for SC20

**Exit criteria:** SC17–SC20 green. Banner visible end-to-end with a misconfigured `localModel` array.

### Phase 5: Documentation, ADRs, knowledge

<!-- complexity: low -->

- Update `docs/guides/hybrid-orchestrator-quickstart.md` (array form, fallback section)
- Update `docs/guides/intelligence-pipeline.md` (array form note, SC23 known-limitation entry)
- Update `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md`
- Append addendum to `docs/changes/hybrid-orchestrator/proposal.md`
- Write two ADRs in `docs/knowledge/decisions/`
- Write `docs/knowledge/orchestrator/local-model-resolution.md`
- Update `docs/knowledge/orchestrator/tick-loop.md` if it exists

**Exit criteria:** SC23 documentation presence; `harness validate` and `harness check-docs` pass.

### Phase 6: Validation gate

<!-- complexity: low -->

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`
- `harness validate`
- `harness check-docs`
- Manual smoke: start orchestrator with `localModel: [bogus, gemma-4-e4b]`, no model loaded → banner appears; load `gemma-4-e4b` → banner clears within probe interval

**Exit criteria:** SC24–SC27 green. Smoke test passes.

### Sequencing notes

- Phases 1 → 2 → 3 are strictly serial.
- Phase 4 can start once Phase 3 exposes `onStatusChange`; mostly orthogonal to backend wiring.
- Phase 5 is mostly mechanical; can run alongside Phase 4 once Phase 3 lands.
- Phase 6 is a strict gate at the end.

Estimated rough effort: 1 ~half day, 2 ~quarter day, 3 ~half day, 4 ~half day, 5 ~quarter day, 6 ~quarter day. **Total: roughly 1.5–2 working days for one focused agent.**
