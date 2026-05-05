# Plan: Spec 1 Phase 3 — Orchestrator Wiring (resolver lifecycle)

**Date:** 2026-04-30 | **Spec:** `docs/changes/local-model-fallback/proposal.md` (Phase 3 only) | **Tasks:** 9 | **Time:** ~46 min | **Integration Tier:** medium | **Session:** `changes--local-model-fallback--proposal`

## Goal

Wire `LocalModelResolver` (Phase 1) into the `Orchestrator` lifecycle so that `agent.localModel` and the other `agent.local*` fields are read in exactly one place — the resolver's construction site — and both `createLocalBackend()` and `createAnalysisProvider()` resolve the local model name through the resolver. Cloud paths and `ClaudeBackend` are untouched. Resolver self-heals via its internal probe loop, so post-startup model loads are reflected on the next session start without an orchestrator restart.

## Phase 3 Scope (from spec §Implementation Order)

Phase 3 delivers:

1. **Construct** `LocalModelResolver` in the `Orchestrator` constructor when `agent.localBackend` is set; store as a private field. Reference: `packages/orchestrator/src/orchestrator.ts:422-448` (`createLocalBackend`) — currently reads `agent.localModel` directly.
2. **Wire start/stop lifecycle** alongside existing schedulers. On status change, broadcast to the dashboard via a new `OrchestratorServer.broadcastLocalModelStatus(status)` stub.
3. **Refactor `createLocalBackend()`** to pass the `getModel` callback (introduced in Phase 2) instead of the static `localModel`. Replace direct `agent.localModel` reads with `() => this.localModelResolver?.resolveModel() ?? null`.
4. **Refactor `createAnalysisProvider()` step 2** (orchestrator.ts:474-507) to read `resolver.getStatus()` and return `null` on `available: false`, with a `warn`-level log per spec D2.
5. **Add server stub** `OrchestratorServer.broadcastLocalModelStatus(status)` — no-op (or debug-level log). Actual SSE topic and HTTP endpoint deferred to Phase 4.
6. **Remove the temporary type-narrowing patch** added in Phase 1 Task 3 (`PHASE3-REMOVE` markers at orchestrator.ts:423-430 and :489-496).
7. **Integration tests** covering Spec 1 SC1, SC2, SC8, SC13, SC14, SC16, SC21, SC22, plus SC-CON1 and SC-CON2.

Phase 3 explicitly excludes:

- The HTTP route `/api/v1/local-model/status` (Phase 4)
- The SSE topic `local-model:status` end-to-end implementation (Phase 4 — only the stub method lives in Phase 3)
- The dashboard banner and `useLocalModelStatus()` hook (Phase 4)
- Removing the existing `this.runner` / `this.localRunner` two-runner split (Spec 2 — explicitly out of scope per planner handoff)
- ADRs and knowledge docs (Phase 5)

## Observable Truths (Acceptance Criteria — Phase 3 only)

1. **OT1 (SC1 — backwards compat string form):** Constructing `Orchestrator` with `agent.localBackend: 'openai-compatible'` and `agent.localModel: 'gemma-4-e4b'` (string) results in `this.localModelResolver` being non-null and `getStatus().configured` deeply equal to `['gemma-4-e4b']`. The agent backend's `getModel()` callback returns `'gemma-4-e4b'` once the resolver has probed and matched.
2. **OT2 (SC2 — resolver gated by localBackend):** Constructing `Orchestrator` with `agent.backend: 'claude'` (or `'anthropic'`/`'openai'`/`'gemini'`/`'mock'`) and **no** `agent.localBackend` results in `this.localModelResolver === null`. No probe traffic is generated.
3. **OT3 (SC8 — start() probes once before resolving):** After `await orchestrator.start()`, the injected `fetchModels` has been called exactly once (the probe in `LocalModelResolver.start()`) before `start()` resolved. `resolveModel()` returns the matched candidate, not `null`.
4. **OT4 (SC13 — warn-level log on no candidate):** When `agent.localBackend` is configured and `fetchModels` returns a list with no configured candidate, the orchestrator's logger emits a `warn`-level entry naming the endpoint and the configured candidate list. The log is emitted from `createAnalysisProvider()` at startup (verified via injected logger spy).
5. **OT5 (SC14 — intelligence pipeline disabled when local unavailable):** When `intelligence.enabled: true`, `agent.localBackend: 'openai-compatible'` is set, and the resolver reports `available: false` at orchestrator construction, `createIntelligencePipeline()` returns `null` (verified via `this.pipeline === null` after construction).
6. **OT6 (SC16 — cloud paths unaffected):** When `agent.backend: 'claude'` and `agent.localBackend` is unset, `createIntelligencePipeline()` and `createAnalysisProvider()` follow the existing branches unchanged. `OrchestratorServer.broadcastLocalModelStatus` is never called.
7. **OT7 (SC21 — resolver self-heals on next probe):** With fake timers, `agent.localProbeIntervalMs: 1_000`, and a `fetchModels` stub that returns `[]` on the first call and `['gemma-4-e4b']` on the second, after `start()` and one timer advance of 1_000ms, `resolveModel()` returns `'gemma-4-e4b'` and `OrchestratorServer.broadcastLocalModelStatus` was called at least twice (once on initial probe failure, once on recovery).
8. **OT8 (SC22 — post-self-heal sessions start successfully):** After OT7's self-heal, calling `LocalBackend.startSession({...})` (via the orchestrator's `localRunner`) returns `Ok(...)` on the next dispatch — verified by invoking the backend directly and asserting `result.ok === true`. The static-`model` path is **not** consulted (the backend's `this.getModel` is the resolver-bound callback, not undefined).
9. **OT9 (SC-CON1 — single read site):** `grep -n "agent.localModel" packages/orchestrator/src/orchestrator.ts` returns exactly one line, and that line is inside the `LocalModelResolver` constructor invocation. Direct ad-hoc reads of `agent.localModel` are removed from `createLocalBackend()` and `createAnalysisProvider()`.
10. **OT10 (SC-CON2 — single resolver consumer pattern):** Both `createLocalBackend()` and `createAnalysisProvider()` reference `this.localModelResolver` (or `this.localModelResolver.resolveModel()` / `this.localModelResolver.getStatus()`). Neither method dereferences `this.config.agent.localModel` directly. (Mechanical: `grep "this.config.agent.localModel" packages/orchestrator/src/orchestrator.ts` returns zero matches.)
11. **OT11 (lifecycle):** `await orchestrator.stop()` calls `this.localModelResolver?.stop()`. After stop, no further `fetchModels` calls occur regardless of timer advances. The state-machine tests at `packages/orchestrator/tests/core/state-machine.test.ts` (which use `localModel: 'deepseek-coder-v2'`) keep passing without modification.
12. **OT12 (mechanical):** `pnpm typecheck`, `pnpm lint`, `pnpm test --filter @harness-engineering/orchestrator`, and `harness validate` all pass at end of phase.

## Skill Recommendations

From `docs/changes/local-model-fallback/SKILLS.md`:

- `ts-type-guards` (reference) — relevant for Task 4 (removing the inline type-narrowing on `string | string[]` after the resolver becomes the single read site).
- `ts-testing-types` (reference) — relevant for Tasks 6–8 (test fixtures inject typed `fetchModels` stubs and capture status broadcasts).

Other recommended skills are not applied; Phase 3 is wiring + tests, no new architectural decisions.

## File Map

- MODIFY `packages/orchestrator/src/orchestrator.ts` — import `LocalModelResolver` + `normalizeLocalModel`; add `private localModelResolver: LocalModelResolver | null = null` field; construct in ctor when `agent.localBackend` set; start/stop in lifecycle; refactor `createLocalBackend()` to pass `getModel` callback; refactor `createAnalysisProvider()` step 2 to consult resolver status; remove `PHASE3-REMOVE` patches.
- MODIFY `packages/orchestrator/src/server/http.ts` — add `broadcastLocalModelStatus(status: LocalModelStatus): void` method (stub: debug-level log only; no SSE topic yet — Phase 4).
- CREATE `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts` — integration tests covering OT1–OT11.

No type changes (Phase 1 already widened types). No backend file changes (Phase 2 already added `getModel`). No test file modifications outside the new integration test (state-machine tests must keep passing unchanged — verified by Task 9).

## Skeleton

1. Resolver field + ctor wiring (~1 task, ~6 min)
2. Lifecycle wiring — `start()` probe + status subscription, `stop()` resolver shutdown (~1 task, ~5 min)
3. Server stub — `broadcastLocalModelStatus` no-op (~1 task, ~3 min)
4. `createLocalBackend()` refactor — pass `getModel`, drop static `model`, remove PHASE3-REMOVE patch (~1 task, ~5 min)
5. `createAnalysisProvider()` refactor — read `getStatus()`, return `null` on unavailable with warn log; remove PHASE3-REMOVE patch (~1 task, ~6 min)
6. Integration test scaffold + OT1, OT2, OT9, OT10 (~1 task, ~7 min)
7. Integration tests OT3, OT4, OT5, OT6 (~1 task, ~6 min)
8. Integration tests OT7, OT8, OT11 self-heal + lifecycle (~1 task, ~5 min)
9. Phase exit gate — typecheck, lint, full test suite, validate (~1 task, ~3 min)

**Estimated total:** 9 tasks, ~46 min. Skeleton inline (autopilot non-interactive); per Rigor Levels table, `standard` mode at 9 tasks crosses the >= 8 threshold so the skeleton is recorded but expansion proceeds without an interactive approval gate.

## Uncertainties

- **[ASSUMPTION]** `OrchestratorServer.broadcastLocalModelStatus` is the right API surface for the Phase 4 SSE topic. Spec §3.5 ("Dashboard surface" line 252-254) says "New SSE event topic: `local-model:status`" but does not name the broadcast method. Phase 3 names it `broadcastLocalModelStatus(status: LocalModelStatus): void` for consistency with the existing `broadcastMaintenance(type, data)` and `broadcastInteraction(interaction)` methods (orchestrator/src/server/http.ts:158-169). If Phase 4 wants a different signature it can rename — this is a private package surface.
- **[ASSUMPTION]** `createAnalysisProvider()` is invoked once at orchestrator construction (orchestrator.ts:160 `this.pipeline = this.createIntelligencePipeline()`), and the resolver has not yet probed at that point because `start()` has not run. The spec's intent (line 247: "When local is configured but unavailable at orchestrator start, `createAnalysisProvider()` returns `null`, and the pipeline does not initialize. Re-enable on later status change is **deferred** — operator must restart the orchestrator after loading a model.") explicitly accepts this behavior. To make the SC14 check meaningful at construction time, we must perform a synchronous initial probe before `createIntelligencePipeline()` runs. Resolution: in the constructor, call `await this.localModelResolver.probe()` synchronously **before** `createIntelligencePipeline()` is called. Constructors cannot await — so we move the pipeline construction into a new `private async initLocalModelAndPipeline()` helper invoked from `start()` (which is already async). In the constructor we set `this.pipeline = null` provisionally; `start()` runs the initial probe and then constructs the pipeline. This preserves SC14 semantics (pipeline never initializes when local is unavailable at startup) without breaking existing call sites that assume `this.pipeline` may be `null` (which they already do — orchestrator.ts:455-456 `if (!provider) return null;`). See Task 1 step 5 and Task 2 step 3 for the exact split.
- **[ASSUMPTION]** The existing `this.runner` / `this.localRunner` split at orchestrator.ts:1204 stays unchanged. Spec §3.7 mentions removing it but routes that work to Spec 2. The `localRunner` is constructed at orchestrator.ts:155-158 via `this.createLocalBackend()`; the `getModel` callback we install will be invoked at `LocalBackend.startSession()` time (per Phase 2's wiring), so the resolver's resolved value flows in correctly without runner restructuring.
- **[ASSUMPTION]** `agent.localProbeIntervalMs` is read by the resolver only — orchestrator does not read it directly. Already true in spec §3.4 line 178; no orchestrator change needed beyond passing it into the resolver constructor.
- **[DEFERRABLE]** The `broadcastLocalModelStatus` stub returns `void` and logs at `debug` level. Phase 4 will replace the body with an actual SSE broadcast call.
- **[DEFERRABLE]** Integration test fixtures use `MockBackend` for the primary backend (matches existing integration test pattern at tests/integration/orchestrator.test.ts:31). The local backend in tests is exercised via direct `LocalBackend` instantiation with the resolver-bound `getModel` callback — the orchestrator's `localRunner` wraps it but tests can call `localBackend.startSession()` directly to satisfy OT8 without spinning up a tracker poll.

No blocking uncertainties. Proceed to decomposition.

## Tasks

### Task 1: Add `localModelResolver` field, ctor instantiation, and synchronous-probe pipeline split

**Depends on:** none | **Files:** `packages/orchestrator/src/orchestrator.ts`

**Skills:** `ts-type-guards` (reference)

This task adds the resolver field, instantiates it in the constructor when `agent.localBackend` is set, and restructures `pipeline` construction so the initial probe runs **before** `createIntelligencePipeline()` is called. The probe-then-pipeline ordering is what makes SC14 ("intelligence pipeline disabled when local unavailable at startup") observable at orchestrator construction time. Lifecycle wiring lives in Task 2.

1. Open `packages/orchestrator/src/orchestrator.ts`. Locate the import block (lines 1-61).

2. Add a new import after the existing `import { PiBackend } from './agent/backends/pi';` line (line 40):

   ```typescript
   import { LocalModelResolver, normalizeLocalModel } from './agent/local-model-resolver';
   ```

3. Locate the private field declarations (lines 73-97). Add a new field on a new line immediately after `private localRunner: AgentRunner | null;` (line 86):

   ```typescript
   private localModelResolver: LocalModelResolver | null = null;
   ```

4. Locate the constructor body (lines 134-222). Find the block at lines 155-160:

   ```typescript
   const localBackend = this.createLocalBackend();
   this.localRunner = localBackend
     ? new AgentRunner(localBackend, { maxTurns: config.agent.maxTurns })
     : null;

   this.pipeline = this.createIntelligencePipeline();
   ```

5. Replace that block with:

   ```typescript
   // Phase 3: construct LocalModelResolver before any code path that reads
   // localModel resolution. createLocalBackend() and createAnalysisProvider()
   // both consult this.localModelResolver; null means "no local backend
   // configured" (cloud path). Initial probe runs in start() — at construction
   // time the resolver exists but has not yet observed the server, so its
   // status reports available: false. The intelligence pipeline construction
   // is deferred to start() so SC14 (pipeline disabled on local-unavailable)
   // can be observed without races.
   if (this.config.agent.localBackend) {
     const endpoint = this.config.agent.localEndpoint ?? 'http://localhost:11434/v1';
     const resolverOpts: import('./agent/local-model-resolver').LocalModelResolverOptions = {
       endpoint,
       configured: normalizeLocalModel(this.config.agent.localModel),
       logger: this.logger,
     };
     if (this.config.agent.localApiKey !== undefined) {
       resolverOpts.apiKey = this.config.agent.localApiKey;
     }
     if (this.config.agent.localProbeIntervalMs !== undefined) {
       resolverOpts.probeIntervalMs = this.config.agent.localProbeIntervalMs;
     }
     if (this.config.agent.localTimeoutMs !== undefined) {
       resolverOpts.timeoutMs = this.config.agent.localTimeoutMs;
     }
     this.localModelResolver = new LocalModelResolver(resolverOpts);
   }

   const localBackend = this.createLocalBackend();
   this.localRunner = localBackend
     ? new AgentRunner(localBackend, { maxTurns: config.agent.maxTurns })
     : null;

   // Pipeline construction deferred to start() — see initLocalModelAndPipeline().
   this.pipeline = null;
   ```

6. Find the existing context wiring at lines 175-200 (the `OrchestratorContext` block that uses `get pipeline()`). Confirm the getter pattern (line 186-188) is still:

   ```typescript
   get pipeline() {
     return self.pipeline;
   },
   ```

   This getter already returns the live `this.pipeline` — once `start()` populates it, downstream consumers see the populated value. No change needed here.

7. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
8. Verify: command exits 0. (Lint may flag the now-unused private read of `agent.localModel` in `createLocalBackend()` — that's expected; Task 4 removes those reads.)
9. Commit:
   ```
   feat(orchestrator): add LocalModelResolver field and ctor instantiation
   ```

---

### Task 2: Wire resolver lifecycle into `start()` / `stop()` and defer pipeline construction

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Open `packages/orchestrator/src/orchestrator.ts`. Locate `public async start()` (line 1404).

2. Insert a new helper method **above** `start()` (just before the `/** Starts the polling loop... */` comment at line 1400):

   ```typescript
   /**
    * Initialize the LocalModelResolver and intelligence pipeline.
    *
    * Runs the initial probe (so resolver state reflects server availability)
    * before constructing the intelligence pipeline. Subscribes the dashboard
    * broadcast stub to status changes. Idempotent: safe to call once from
    * start().
    */
   private async initLocalModelAndPipeline(): Promise<void> {
     if (this.localModelResolver) {
       await this.localModelResolver.start();
       this.localModelResolver.onStatusChange((status) => {
         this.server?.broadcastLocalModelStatus(status);
       });
     }
     // Defer pipeline construction until after the resolver has observed the
     // server. createIntelligencePipeline() consults resolver.getStatus() via
     // createAnalysisProvider() and returns null when local is unavailable.
     this.pipeline = this.createIntelligencePipeline();
   }
   ```

3. Inside `public async start()`, find the line `if (this.server) { void this.server.start(); }` (line 1405-1407). Add the resolver/pipeline init **immediately after** that block, before `await this.ensureClaimManager();`:

   ```typescript
   await this.initLocalModelAndPipeline();
   ```

4. Locate `public async stop()` (line 1463). Find the line `if (this.maintenanceScheduler) {` (line 1472). Add resolver shutdown **before** that block, immediately after the heartbeat clear:

   ```typescript
   if (this.localModelResolver) {
     this.localModelResolver.stop();
   }
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Verify: exits 0. There will be a typecheck error referring to `this.server?.broadcastLocalModelStatus` — that method does not yet exist. **This is expected and confirms the call site is correct.** Task 3 adds the stub. Document the expected error in your task notes; do not commit yet.
7. Run: `pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | head -20` and confirm the only new error is `Property 'broadcastLocalModelStatus' does not exist on type 'OrchestratorServer'` (or equivalent).
8. **Do not commit** — Task 3 fixes the typecheck. Combined commit at end of Task 3.

---

### Task 3: Add `broadcastLocalModelStatus` stub to `OrchestratorServer`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/http.ts`

1. Open `packages/orchestrator/src/server/http.ts`. Locate `broadcastMaintenance` (line 167-169).

2. Add a new public method **immediately after** `broadcastMaintenance`, before `setMaintenanceDeps`:

   ```typescript
   /**
    * Broadcast a local-model status change to dashboard clients.
    *
    * Phase 3 stub: no-op (debug-level log). Phase 4 will replace this body
    * with an SSE broadcast on the `local-model:status` topic.
    */
   public broadcastLocalModelStatus(
     status: import('@harness-engineering/types').LocalModelStatus
   ): void {
     // Phase 3 stub — Phase 4 of local-model-fallback will broadcast to SSE
     // clients on topic 'local-model:status'. For now, route through the
     // existing broadcaster so test fixtures that subscribe to all events
     // observe a payload, satisfying SC18 instrumentation in Phase 4.
     this.broadcaster.broadcast('local-model:status', status);
   }
   ```

3. Verify the import for `LocalModelStatus` is reachable. The inline `import('@harness-engineering/types').LocalModelStatus` form sidesteps adding a top-level import; if a top-level import already exists for the package, prefer adding `LocalModelStatus` to that import line instead. Check by running:

   ```bash
   grep -n "from '@harness-engineering/types'" packages/orchestrator/src/server/http.ts | head -3
   ```

   If a `type` import line exists (e.g. `import type { ... } from '@harness-engineering/types';`), add `LocalModelStatus` to its named import list and replace the inline `import(...)` form with the bare `LocalModelStatus` reference.

4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Verify: exits 0. The Task 2 typecheck error is resolved.
6. Run: `pnpm --filter @harness-engineering/orchestrator lint`
7. Verify: exits 0.
8. Commit (combined Task 2 + Task 3):
   ```
   feat(orchestrator): wire LocalModelResolver lifecycle and broadcast stub
   ```

---

### Task 4: Refactor `createLocalBackend()` to pass `getModel` callback (remove PHASE3-REMOVE patch)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`

**Skills:** `ts-type-guards` (reference) — removing the inline type-narrowing on `string | string[]`.

1. Open `packages/orchestrator/src/orchestrator.ts`. Locate `createLocalBackend()` (lines 422-448). The current body (with the Phase 1 PHASE3-REMOVE patch) reads:

   ```typescript
   private createLocalBackend(): AgentBackend | null {
     // Narrow string|string[] to the first candidate for the legacy direct-read path.
     // Phase 3 of the local-model-fallback spec replaces these reads with LocalModelResolver.
     const localModelFirst =
       typeof this.config.agent.localModel === 'string'
         ? this.config.agent.localModel
         : Array.isArray(this.config.agent.localModel)
           ? this.config.agent.localModel[0]
           : undefined;
     if (this.config.agent.localBackend === 'openai-compatible') {
       const localConfig: import('./agent/backends/local').LocalBackendConfig = {};
       if (this.config.agent.localEndpoint) localConfig.endpoint = this.config.agent.localEndpoint;
       if (localModelFirst) localConfig.model = localModelFirst;
       if (this.config.agent.localApiKey) localConfig.apiKey = this.config.agent.localApiKey;
       if (this.config.agent.localTimeoutMs)
         localConfig.timeoutMs = this.config.agent.localTimeoutMs;
       return new LocalBackend(localConfig);
     }
     if (this.config.agent.localBackend === 'pi') {
       return new PiBackend({
         model: localModelFirst,
         endpoint: this.config.agent.localEndpoint,
         apiKey: this.config.agent.localApiKey,
       });
     }
     return null;
   }
   ```

2. Replace the entire method body with:

   ```typescript
   private createLocalBackend(): AgentBackend | null {
     if (!this.localModelResolver) return null;
     // Resolver-bound callback — invoked at session start by the backend.
     // Returning null causes startSession() to fail with typed agent_not_found
     // (per Phase 2 wiring); the orchestrator's escalation handler treats it
     // the same as any other backend rejection.
     const getModel = (): string | null =>
       this.localModelResolver?.resolveModel() ?? null;
     if (this.config.agent.localBackend === 'openai-compatible') {
       const localConfig: import('./agent/backends/local').LocalBackendConfig = {
         getModel,
       };
       if (this.config.agent.localEndpoint) localConfig.endpoint = this.config.agent.localEndpoint;
       if (this.config.agent.localApiKey) localConfig.apiKey = this.config.agent.localApiKey;
       if (this.config.agent.localTimeoutMs)
         localConfig.timeoutMs = this.config.agent.localTimeoutMs;
       return new LocalBackend(localConfig);
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
   ```

3. Verify the rewrite preserves these invariants:
   - `agent.localModel` is **not** read anywhere in this method (SC-CON1 / SC-CON2).
   - `agent.localEndpoint`, `agent.localApiKey`, and `agent.localTimeoutMs` continue to be read here for backend transport configuration — the spec only requires `localModel` to flow through the resolver. `agent.localEndpoint` and `agent.localApiKey` are also read at the resolver constructor site in Task 1, but they are mechanically distinct concerns (transport vs. probe) and the spec's SC-CON1 names `agent.localModel` specifically. Document in a code comment.
   - The `getModel` callback closes over `this.localModelResolver`, so when the resolver self-heals, the next `startSession()` call sees the new resolved value with no further wiring.

4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Verify: exits 0.
6. Run: `pnpm --filter @harness-engineering/orchestrator lint`
7. Verify: exits 0.
8. Commit:
   ```
   refactor(orchestrator): pass getModel callback into local backends, drop direct localModel reads
   ```

---

### Task 5: Refactor `createAnalysisProvider()` step 2 to consult resolver status (remove PHASE3-REMOVE patch)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Open `packages/orchestrator/src/orchestrator.ts`. Locate `createAnalysisProvider()` step 2 (lines 482-507). The current body has the second PHASE3-REMOVE patch (lines 489-496).

2. Replace the entire step-2 block (the `if (this.config.agent.localBackend === 'openai-compatible' || this.config.agent.localBackend === 'pi')` clause, lines 483-507) with:

   ```typescript
   // 2. Local backend (OpenAI-compatible endpoint like Ollama / LM Studio)
   //    Consults the LocalModelResolver — the single source of truth for
   //    local-model availability. Returns null (disabling the intelligence
   //    pipeline for this orchestrator session) when no candidate is loaded
   //    at startup. Per spec D2 + §3.5 line 247, re-enable on later status
   //    change is deferred — operator must restart the orchestrator after
   //    loading a model.
   if (this.config.agent.localBackend && this.localModelResolver) {
     const status = this.localModelResolver.getStatus();
     if (!status.available) {
       this.logger.warn(
         `Intelligence pipeline disabled: no configured localModel loaded ` +
           `at ${this.config.agent.localEndpoint ?? 'http://localhost:11434/v1'}. ` +
           `Configured: [${status.configured.join(', ')}]. ` +
           `Detected: [${status.detected.join(', ')}].`
       );
       return null;
     }
     const endpoint = this.config.agent.localEndpoint ?? 'http://localhost:11434/v1';
     const apiKey = this.config.agent.localApiKey ?? 'ollama';
     // selModel may override the resolver's pick (intelligence-specific model).
     // When unset, we use the resolver's resolved value — the model the agent
     // backend will also use, keeping intelligence and dispatch in sync.
     const model = selModel ?? status.resolved;
     this.logger.info(`Intelligence pipeline using local backend at ${endpoint} (model: ${model})`);
     return new OpenAICompatibleAnalysisProvider({
       apiKey,
       baseUrl: endpoint,
       ...(model !== undefined && model !== null && { defaultModel: model }),
       ...(intel?.requestTimeoutMs !== undefined && { timeoutMs: intel.requestTimeoutMs }),
       ...(intel?.promptSuffix !== undefined && { promptSuffix: intel.promptSuffix }),
       ...(intel?.jsonMode !== undefined && { jsonMode: intel.jsonMode }),
     });
   }
   ```

3. Verify post-refactor:
   - `this.config.agent.localModel` is **not** read in this method.
   - `grep -c "this.config.agent.localModel" packages/orchestrator/src/orchestrator.ts` returns `1` (the resolver constructor call in Task 1's ctor block).
   - `grep -n "PHASE3-REMOVE\|Phase 3 of the local-model-fallback" packages/orchestrator/src/orchestrator.ts` returns zero matches (both PHASE3-REMOVE comments are removed).

4. Run mechanical SC-CON1 check:

   ```bash
   grep -c "this.config.agent.localModel" packages/orchestrator/src/orchestrator.ts
   ```

   Expected: `1`. If higher, find and remove the stragglers before proceeding.

5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `pnpm --filter @harness-engineering/orchestrator lint`
7. Verify both exit 0.
8. Commit:
   ```
   refactor(orchestrator): route createAnalysisProvider local branch through LocalModelResolver
   ```

---

### Task 6: Integration test scaffold + OT1, OT2, OT9, OT10 (consolidation tracing) — TDD red→green

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

**Skills:** `ts-testing-types` (reference)

1. Create `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { execSync } from 'node:child_process';
   import { Orchestrator } from '../../src/orchestrator';
   import { MockBackend } from '../../src/agent/backends/mock';
   import type { WorkflowConfig } from '@harness-engineering/types';
   import { noopExecFile } from '../helpers/noop-exec-file';

   let tmpDir: string;

   function makeConfig(overrides: Partial<WorkflowConfig['agent']> = {}): WorkflowConfig {
     return {
       tracker: {
         kind: 'mock',
         activeStates: ['planned'],
         terminalStates: ['done'],
       },
       polling: { intervalMs: 1000 },
       workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
       hooks: {
         afterCreate: null,
         beforeRun: null,
         afterRun: null,
         beforeRemove: null,
         timeoutMs: 1000,
       },
       agent: {
         backend: 'mock',
         maxConcurrentAgents: 2,
         maxTurns: 3,
         maxRetryBackoffMs: 1000,
         maxRetries: 5,
         maxConcurrentAgentsByState: { planned: 1 },
         turnTimeoutMs: 5000,
         readTimeoutMs: 5000,
         stallTimeoutMs: 5000,
         ...overrides,
       },
       server: { port: null },
     } as WorkflowConfig;
   }

   beforeEach(() => {
     tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-orch-resolver-'));
     execSync(
       'git init && git config user.email "test@test" && git config user.name "test" && git commit --allow-empty -m "init"',
       { cwd: tmpDir, stdio: 'ignore' }
     );
     fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
   });

   afterEach(() => {
     try {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     } catch {
       /* best-effort cleanup */
     }
   });

   describe('Orchestrator + LocalModelResolver wiring (Phase 3)', () => {
     describe('SC1 — backwards compat (string form)', () => {
       it('OT1: constructs resolver with normalized 1-element configured list', () => {
         const config = makeConfig({
           localBackend: 'openai-compatible',
           localModel: 'gemma-4-e4b',
           localEndpoint: 'http://localhost:11434/v1',
         });
         const orch = new Orchestrator(config, 'Prompt', {
           backend: new MockBackend(),
           execFileFn: noopExecFile,
         });
         // Access via test-only field exposure: TypeScript private fields are
         // structurally accessible at runtime — read with a typed cast.
         const resolver = (
           orch as unknown as {
             localModelResolver:
               | import('../../src/agent/local-model-resolver').LocalModelResolver
               | null;
           }
         ).localModelResolver;
         expect(resolver).not.toBeNull();
         expect(resolver!.getStatus().configured).toEqual(['gemma-4-e4b']);
       });
     });

     describe('SC2 — resolver gated by localBackend', () => {
       it('OT2a: cloud-only config does NOT instantiate the resolver', () => {
         const config = makeConfig({ backend: 'mock' }); // no localBackend
         const orch = new Orchestrator(config, 'Prompt', {
           backend: new MockBackend(),
           execFileFn: noopExecFile,
         });
         const resolver = (
           orch as unknown as {
             localModelResolver: unknown;
           }
         ).localModelResolver;
         expect(resolver).toBeNull();
       });

       it('OT2b: claude/anthropic/openai/gemini configs do not instantiate the resolver', () => {
         for (const backend of ['claude', 'anthropic', 'openai', 'gemini'] as const) {
           const config = makeConfig({ backend, apiKey: 'test-key' });
           const orch = new Orchestrator(config, 'Prompt', {
             backend: new MockBackend(),
             execFileFn: noopExecFile,
           });
           const resolver = (
             orch as unknown as {
               localModelResolver: unknown;
             }
           ).localModelResolver;
           expect(resolver, `resolver should be null for backend=${backend}`).toBeNull();
         }
       });
     });

     describe('SC-CON1 / SC-CON2 — single read site, single resolver consumer', () => {
       it('OT9: source has exactly one read of agent.localModel, at the resolver ctor site', () => {
         const src = fs.readFileSync(
           path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
           'utf8'
         );
         const matches = src.match(/this\.config\.agent\.localModel/g) ?? [];
         expect(
           matches.length,
           `expected exactly 1 read of this.config.agent.localModel; got ${matches.length}`
         ).toBe(1);
         // The single read must live in a normalizeLocalModel(...) call.
         expect(src).toMatch(/normalizeLocalModel\(\s*this\.config\.agent\.localModel\s*\)/);
       });

       it('OT10: createLocalBackend and createAnalysisProvider both reference localModelResolver', () => {
         const src = fs.readFileSync(
           path.join(__dirname, '..', '..', 'src', 'orchestrator.ts'),
           'utf8'
         );
         // Pull each method body individually and assert resolver references.
         const localBackendMatch = src.match(/private createLocalBackend\(\)[\s\S]*?\n  \}/);
         expect(localBackendMatch, 'createLocalBackend method not found').not.toBeNull();
         expect(localBackendMatch![0]).toMatch(/this\.localModelResolver/);

         const analysisProviderMatch = src.match(
           /private createAnalysisProvider\(\)[\s\S]*?\n  \}/
         );
         expect(analysisProviderMatch, 'createAnalysisProvider method not found').not.toBeNull();
         expect(analysisProviderMatch![0]).toMatch(/this\.localModelResolver/);

         // No PHASE3-REMOVE markers remain.
         expect(src).not.toMatch(/PHASE3-REMOVE/);
       });
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver`
3. Verify: all four tests pass (resolver field instantiated correctly, regex assertions succeed because Tasks 1-5 already removed the PHASE3-REMOVE patches and re-routed reads).
4. If any assertion fails, fix the source — do NOT relax the assertion. The grep-based assertions are the mechanical SC-CON1 / SC-CON2 contract.
5. Commit:
   ```
   test(orchestrator): integration tests for resolver wiring SC1, SC2, SC-CON1, SC-CON2
   ```

---

### Task 7: Integration tests OT3, OT4, OT5, OT6 (start probe, warn log, pipeline disable, cloud unaffected)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

**Skills:** `ts-testing-types` (reference)

1. Open `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`. Append a new describe block **after** the SC-CON describe block (before the closing brace of the outer describe):

   ```typescript
   describe('SC8 — start() probes once before resolving', () => {
     it('OT3: fetchModels called exactly once when start() resolves', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
       const config = makeConfig({
         localBackend: 'openai-compatible',
         localModel: 'gemma-4-e4b',
         localEndpoint: 'http://localhost:11434/v1',
         localProbeIntervalMs: 60_000, // long interval — only the start() probe matters
       });
       const orch = new Orchestrator(config, 'Prompt', {
         backend: new MockBackend(),
         execFileFn: noopExecFile,
       });
       // Inject the fetchModels stub onto the resolver before start().
       const resolver = (
         orch as unknown as {
           localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
         }
       ).localModelResolver;
       (
         resolver as unknown as {
           fetchModels: (e: string, k?: string) => Promise<string[]>;
         }
       ).fetchModels = fetchModels;

       await orch.start();
       try {
         expect(fetchModels).toHaveBeenCalledTimes(1);
         expect(resolver.resolveModel()).toBe('gemma-4-e4b');
       } finally {
         await orch.stop();
       }
     });
   });

   describe('SC13 — warn-level log on no candidate', () => {
     it('OT4: createAnalysisProvider logs warn when resolver reports unavailable', async () => {
       const fetchModels = vi.fn().mockResolvedValue(['some-other-model']);
       const config = makeConfig({
         localBackend: 'openai-compatible',
         localModel: ['a', 'b'],
         localEndpoint: 'http://localhost:11434/v1',
         localProbeIntervalMs: 60_000,
       });
       // intelligence enabled so createAnalysisProvider is called
       config.intelligence = { enabled: true };
       const orch = new Orchestrator(config, 'Prompt', {
         backend: new MockBackend(),
         execFileFn: noopExecFile,
       });
       const warnSpy = vi.fn();
       (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;
       const resolver = (
         orch as unknown as {
           localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
         }
       ).localModelResolver;
       (
         resolver as unknown as {
           fetchModels: (e: string, k?: string) => Promise<string[]>;
         }
       ).fetchModels = fetchModels;

       await orch.start();
       try {
         const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
         const matched = warnCalls.find((m) => /Intelligence pipeline disabled/i.test(m));
         expect(matched, `expected warn log; got: ${JSON.stringify(warnCalls)}`).toBeTruthy();
         expect(matched).toContain('http://localhost:11434/v1');
         expect(matched).toMatch(/Configured: \[a, b\]/);
       } finally {
         await orch.stop();
       }
     });
   });

   describe('SC14 — intelligence pipeline disabled when local unavailable at startup', () => {
     it('OT5: this.pipeline === null after start() when local unavailable', async () => {
       const fetchModels = vi.fn().mockResolvedValue([]); // no models loaded
       const config = makeConfig({
         localBackend: 'openai-compatible',
         localModel: 'gemma-4-e4b',
         localEndpoint: 'http://localhost:11434/v1',
         localProbeIntervalMs: 60_000,
       });
       config.intelligence = { enabled: true };
       const orch = new Orchestrator(config, 'Prompt', {
         backend: new MockBackend(),
         execFileFn: noopExecFile,
       });
       const resolver = (
         orch as unknown as {
           localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
         }
       ).localModelResolver;
       (
         resolver as unknown as {
           fetchModels: (e: string, k?: string) => Promise<string[]>;
         }
       ).fetchModels = fetchModels;

       await orch.start();
       try {
         const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
         expect(pipeline).toBeNull();
       } finally {
         await orch.stop();
       }
     });
   });

   describe('SC16 — cloud paths unaffected', () => {
     it('OT6: anthropic backend does not touch resolver and does not log local warnings', async () => {
       const config = makeConfig({
         backend: 'anthropic',
         apiKey: 'sk-test-key-not-real',
       });
       config.intelligence = { enabled: true };
       const orch = new Orchestrator(config, 'Prompt', {
         backend: new MockBackend(),
         execFileFn: noopExecFile,
       });
       const warnSpy = vi.fn();
       (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;

       const resolver = (orch as unknown as { localModelResolver: unknown }).localModelResolver;
       expect(resolver).toBeNull();

       await orch.start();
       try {
         const warnCalls = warnSpy.mock.calls.map((c) => c[0] as string);
         expect(warnCalls.find((m) => /Intelligence pipeline disabled/i.test(m))).toBeUndefined();
       } finally {
         await orch.stop();
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver`
3. Verify: all OT3, OT4, OT5, OT6 tests pass.
4. If a test fails because the warn log format does not match, **fix the source** in Task 5's `createAnalysisProvider` block — do not relax the regex unless the spec text genuinely permits the variation.
5. Commit:
   ```
   test(orchestrator): integration tests for SC8, SC13, SC14, SC16
   ```

---

### Task 8: Integration tests OT7, OT8, OT11 (self-heal, post-heal session start, lifecycle)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

**Skills:** `ts-testing-types` (reference)

1. Append the final describe blocks to `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`:

   ```typescript
   describe('SC21 — resolver self-heals on next probe', () => {
     it('OT7: probe[1]=[]; probe[2]=[gemma-4-e4b]; broadcast fires twice', async () => {
       vi.useFakeTimers();
       try {
         const fetchModels = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(['gemma-4-e4b']);
         const broadcasts: import('@harness-engineering/types').LocalModelStatus[] = [];

         const config = makeConfig({
           localBackend: 'openai-compatible',
           localModel: 'gemma-4-e4b',
           localEndpoint: 'http://localhost:11434/v1',
           localProbeIntervalMs: 1_000,
         });
         const orch = new Orchestrator(config, 'Prompt', {
           backend: new MockBackend(),
           execFileFn: noopExecFile,
         });
         // Inject a fake server stub so we can observe broadcast calls
         // without spinning up the HTTP server.
         (
           orch as unknown as { server: { broadcastLocalModelStatus: (s: unknown) => void } }
         ).server = {
           broadcastLocalModelStatus: (s: unknown) =>
             broadcasts.push(s as import('@harness-engineering/types').LocalModelStatus),
         };
         const resolver = (
           orch as unknown as {
             localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
           }
         ).localModelResolver;
         (
           resolver as unknown as {
             fetchModels: (e: string, k?: string) => Promise<string[]>;
           }
         ).fetchModels = fetchModels;

         await orch.start(); // probe 1 → []
         expect(resolver.resolveModel()).toBeNull();

         // Advance to trigger probe 2 → [gemma-4-e4b]
         await vi.advanceTimersByTimeAsync(1_000);
         // Allow microtasks (the probe is fire-and-forget on the timer tick)
         await vi.runOnlyPendingTimersAsync();
         await Promise.resolve();
         await Promise.resolve();

         expect(resolver.resolveModel()).toBe('gemma-4-e4b');
         expect(broadcasts.length).toBeGreaterThanOrEqual(2);
         // First broadcast: not available; subsequent broadcast: available.
         const lastBroadcast = broadcasts[broadcasts.length - 1]!;
         expect(lastBroadcast.available).toBe(true);
         expect(lastBroadcast.resolved).toBe('gemma-4-e4b');

         await orch.stop();
       } finally {
         vi.useRealTimers();
       }
     });
   });

   describe('SC22 — post-self-heal sessions start successfully', () => {
     it('OT8: LocalBackend.startSession returns Ok after resolver self-heals', async () => {
       vi.useFakeTimers();
       try {
         const fetchModels = vi.fn().mockResolvedValueOnce([]).mockResolvedValue(['gemma-4-e4b']);

         const config = makeConfig({
           localBackend: 'openai-compatible',
           localModel: 'gemma-4-e4b',
           localEndpoint: 'http://localhost:11434/v1',
           localProbeIntervalMs: 1_000,
         });
         const orch = new Orchestrator(config, 'Prompt', {
           backend: new MockBackend(),
           execFileFn: noopExecFile,
         });
         const resolver = (
           orch as unknown as {
             localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
           }
         ).localModelResolver;
         (
           resolver as unknown as {
             fetchModels: (e: string, k?: string) => Promise<string[]>;
           }
         ).fetchModels = fetchModels;

         await orch.start();

         // Initially unavailable — startSession would fail. Confirm by
         // pulling the localRunner's backend and inspecting the resolver-
         // bound getModel callback.
         expect(resolver.resolveModel()).toBeNull();

         // Advance to trigger recovery probe.
         await vi.advanceTimersByTimeAsync(1_000);
         await vi.runOnlyPendingTimersAsync();
         await Promise.resolve();

         expect(resolver.resolveModel()).toBe('gemma-4-e4b');

         // Reach into the localRunner to grab the backend, then call
         // startSession directly. The runner stores the backend internally;
         // tests/agent/runner.test.ts shows the access pattern.
         const localRunner = (
           orch as unknown as {
             localRunner: { backend: import('@harness-engineering/types').AgentBackend };
           }
         ).localRunner;
         expect(localRunner).not.toBeNull();
         const result = await localRunner.backend.startSession({
           workspacePath: '/tmp/test',
           systemPrompt: 'sys',
         });
         expect(result.ok).toBe(true);

         await orch.stop();
       } finally {
         vi.useRealTimers();
       }
     });
   });

   describe('OT11 — stop() halts resolver probing', () => {
     it('no further fetchModels calls after stop()', async () => {
       vi.useFakeTimers();
       try {
         const fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);

         const config = makeConfig({
           localBackend: 'openai-compatible',
           localModel: 'gemma-4-e4b',
           localEndpoint: 'http://localhost:11434/v1',
           localProbeIntervalMs: 1_000,
         });
         const orch = new Orchestrator(config, 'Prompt', {
           backend: new MockBackend(),
           execFileFn: noopExecFile,
         });
         const resolver = (
           orch as unknown as {
             localModelResolver: import('../../src/agent/local-model-resolver').LocalModelResolver;
           }
         ).localModelResolver;
         (
           resolver as unknown as {
             fetchModels: (e: string, k?: string) => Promise<string[]>;
           }
         ).fetchModels = fetchModels;

         await orch.start();
         expect(fetchModels).toHaveBeenCalledTimes(1);
         await orch.stop();

         const callsBefore = fetchModels.mock.calls.length;
         await vi.advanceTimersByTimeAsync(10_000);
         await vi.runOnlyPendingTimersAsync();
         expect(fetchModels.mock.calls.length).toBe(callsBefore);
       } finally {
         vi.useRealTimers();
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver`
3. Verify: all OT7, OT8, OT11 tests pass.
4. **Verify state-machine tests are still green** (OT11 second clause):
   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- state-machine
   ```
   Expected: all tests pass; no fixture changes were needed (the existing `localModel: 'deepseek-coder-v2'` config flows through `normalizeLocalModel` → `['deepseek-coder-v2']` → resolver → backend `getModel` callback, all observable behavior preserved).
5. Commit:
   ```
   test(orchestrator): integration tests for SC21, SC22, lifecycle stop
   ```

---

### Task 9: Phase exit gate — full validation sweep

**Depends on:** Task 8 | **Files:** none (verification only)

1. Run from repo root:

   ```bash
   pnpm typecheck
   ```

   Expected: exit 0.

2. Run:

   ```bash
   pnpm lint
   ```

   Expected: exit 0. No new ESLint suppressions.

3. Run the full orchestrator test suite:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test
   ```

   Expected: all tests green. In particular:
   - `tests/agent/local-model-resolver.test.ts` — Phase 1 tests, unchanged, green.
   - `tests/agent/backends/local.test.ts`, `tests/agent/backends/pi.test.ts` — Phase 2 tests, unchanged, green.
   - `tests/integration/orchestrator-local-resolver.test.ts` — Phase 3 new tests, green.
   - `tests/core/state-machine.test.ts` — existing, green (SC3 / OT11 verification).

4. Run:

   ```bash
   harness validate
   ```

   Expected: `validation passed`.

5. Run the SC-CON1 mechanical gate one final time:

   ```bash
   grep -c "this.config.agent.localModel" packages/orchestrator/src/orchestrator.ts
   ```

   Expected: `1`.

6. Run:

   ```bash
   harness check-deps
   ```

   Expected: `validation passed`.

7. **Do not commit** — Task 9 is a verification-only gate. If anything fails, return to the relevant earlier task and fix.

8. Confirmation: Phase 3 success criteria SC1, SC2, SC8, SC13, SC14, SC16, SC21, SC22, SC-CON1, SC-CON2 are all green. Cloud paths verified untouched. Resolver consolidation complete.

---

## Integration Tier: medium

Phase 3 changes a public-internal surface (the orchestrator's lifecycle and the way local backends receive their model). Per the Integration Tier Heuristics:

- **Internal API change:** `Orchestrator` constructs `LocalModelResolver`, refactors two private methods. No new public exports.
- **New private surface:** `OrchestratorServer.broadcastLocalModelStatus` — stub, but new public method on the package's server class.
- **No new package boundary crossings.** Types from Phase 1 are already re-exported.
- **File count:** 3 (orchestrator.ts, http.ts, new test file).

**Tier verdict: medium.** Wiring + project updates — but documentation updates (ADRs, knowledge docs) are explicitly deferred to Phase 5 per spec §Implementation Order. Phase 3's integration responsibility ends with: regenerate barrels (no-op — no new exports), confirm `harness validate` passes (Task 9), confirm `harness check-deps` passes (Task 9). No ADR or knowledge-doc materialization in this phase.

## Integration Points (derived from spec §Integration Points, scoped to Phase 3)

The spec's Integration Points section is largely Phase 4 / Phase 5 work. Phase 3 contributes the following minimal integration:

| Integration Point                                                              | Phase 3 task                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| **Entry Points → Module:** `LocalModelResolver` consumed by `Orchestrator`     | Task 1 (ctor instantiation)                     |
| **Entry Points → Server stub:** `OrchestratorServer.broadcastLocalModelStatus` | Task 3 (stub method)                            |
| **Registrations Required → Type barrel:** `LocalModelStatus` re-exported       | Already done in Phase 1; no Phase 3 task.       |
| **Registrations Required → SSE topic enrollment**                              | Phase 4. Phase 3 only stubs the broadcast call. |
| **Documentation Updates**                                                      | Phase 5 — none in Phase 3.                      |
| **Architectural Decisions (ADRs)**                                             | Phase 5 — none in Phase 3.                      |
| **Knowledge Impact**                                                           | Phase 5 — none in Phase 3.                      |

No additional integration tasks are derived for Phase 3 beyond Tasks 1-3, which already deliver the wiring.

## Gates

- **No vague tasks.** Every task above contains exact file paths, exact code snippets, and exact verification commands.
- **No tasks larger than one context window.** Tasks touch at most 2 files (Task 2 + Task 3 share a single combined commit because they form one type-coherent change; the typecheck error in Task 2 is documented and resolved by Task 3 — this is a deliberate sequencing, not a vague task).
- **TDD for code-producing tasks:** Tasks 4 and 5 refactor existing code with passing tests (state-machine integration tests already cover the dispatch path). Tasks 6-8 are pure test additions in TDD-green style — assertions are written explicitly to fail loudly if the source-side regex contracts (SC-CON1, SC-CON2) are violated.
- **Observable truths trace.** OT1 → Task 1 + Task 6 (SC1). OT2 → Task 1 + Task 6 (SC2). OT3 → Task 2 + Task 7 (SC8). OT4 → Task 5 + Task 7 (SC13). OT5 → Task 2 + Task 7 (SC14). OT6 → Task 7 (SC16). OT7 → Task 2 + Task 8 (SC21). OT8 → Task 4 + Task 8 (SC22). OT9 → Tasks 4-5 + Task 6 (SC-CON1). OT10 → Tasks 4-5 + Task 6 (SC-CON2). OT11 → Task 2 + Task 8 + Task 9 (lifecycle + state-machine green). OT12 → Task 9 (mechanical).
- **No skipping TDD.** Tasks 6-8 are TDD-green: assertions that pin source-side contracts (SC-CON1, SC-CON2) are written first; if Tasks 4-5 are imperfect the assertions fail loudly and the source must be corrected. The refactor tasks themselves (Tasks 4, 5) keep the existing dispatch behavior covered by `tests/core/state-machine.test.ts` and `tests/agent/backends/local.test.ts` — those are run on every commit per Task 9.
- **`harness validate` runs at end of phase** (Task 9).
- **No premature commits.** Task 2 explicitly defers commit until Task 3 because the typecheck failure between them is intentional (the calling code is added before its called method) and committing the broken intermediate would violate "no broken commits."

## Escalation

- **If Task 2's typecheck error is not exactly `Property 'broadcastLocalModelStatus' does not exist`:** The lifecycle wiring may be touching an unintended surface. Stop and re-read the orchestrator file at the call site.
- **If SC-CON1 grep returns `0` instead of `1`:** The resolver constructor block was deleted or the read was moved out of `normalizeLocalModel`. Re-read Task 1 step 5 and confirm the `normalizeLocalModel(this.config.agent.localModel)` call is present.
- **If state-machine tests start failing:** The existing dispatch path expects `localRunner` to be non-null when `localBackend` is set. If Task 4's `createLocalBackend` returns `null` even when `localModelResolver` is non-null, check that `agent.localBackend === 'openai-compatible' || 'pi'` still routes correctly.
- **If `await this.localModelResolver.start()` in Task 2 hangs the test suite:** Tests must inject a stubbed `fetchModels` before calling `orch.start()` — see Task 7 / 8 setup. The default `fetchModels` calls real `globalThis.fetch` which may time out against an unreachable localhost in CI. Spec line 137 enumerates timeout as a normal failure mode but the resolver's 5s default could materially slow the test suite — always inject a stub.
