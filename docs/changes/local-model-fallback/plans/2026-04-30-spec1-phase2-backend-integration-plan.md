# Plan: Spec 1 Phase 2 — Backend Integration (`getModel` callback wiring)

**Date:** 2026-04-30 | **Spec:** `docs/changes/local-model-fallback/proposal.md` (Phase 2 only) | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** small | **Session:** `changes--local-model-fallback--proposal`

## Goal

Add an optional `getModel: () => string | null` callback to both `LocalBackend` and `PiBackend` configs and thread it through `startSession()`. When the callback is provided and returns `null`, both backends return `Err({ category: 'agent_not_found', message: 'No local model available; check dashboard for details.' })` from `startSession()`. The static `model` field continues to work unchanged when `getModel` is not provided. No orchestrator wiring, no resolver instantiation — only the callback shape on the two backends.

## Phase 2 Scope (from spec, lines 399-407)

Phase 2 delivers:

- Add optional `getModel: () => string | null` to `LocalBackendConfig` (`packages/orchestrator/src/agent/backends/local.ts`)
- Add optional `getModel: () => string | null` to `PiBackendConfig` (`packages/orchestrator/src/agent/backends/pi.ts`)
- Both backends call `getModel()` at the top of `startSession()` when the callback is provided; on `null`, return typed `agent_not_found` `Err`
- Both backends fall back to the static `model` config field when `getModel` is not provided (backward compat — existing fixtures depend on this)
- `LocalBackend.runTurn` continues to use `this.config.model` for the OpenAI streaming call (existing behavior preserved); when `getModel` is supplied, the resolved model name from the most recent `startSession()` call is captured on the session so the in-flight streaming call uses the correct model
- `PiBackend` builds the pi `model` object lazily in `startSession()` from the resolved name when `getModel` is supplied; otherwise falls back to existing `buildLocalModel(this.config)` behavior
- New unit tests at `packages/orchestrator/tests/agent/backends/local.test.ts` covering SC15 for `LocalBackend`
- New unit tests at `packages/orchestrator/tests/agent/backends/pi.test.ts` covering SC15 for `PiBackend`
- Existing tests in both files keep passing without modification (regression coverage for SC3)

Phase 2 explicitly excludes (deferred to later phases of the same spec):

- Constructing or starting `LocalModelResolver` from the orchestrator (Phase 3)
- Refactor of `Orchestrator.createLocalBackend()` / `createAnalysisProvider()` to pass `getModel` (Phase 3)
- Dashboard surface, SSE, HTTP route, banner (Phase 4)
- ADRs and knowledge docs (Phase 5)

## Observable Truths (Acceptance Criteria — Phase 2 only)

1. **OT1 (SC15 / LocalBackend — getModel returns null):** Given a `LocalBackend` constructed with `{ getModel: () => null }`, `startSession({ workspacePath, permissionMode: 'full' })` resolves to `Err({ category: 'agent_not_found', message: 'No local model available; check dashboard for details.' })`. The OpenAI client is **not** consulted (verified by absence of any chat/streaming call on the mock).
2. **OT2 (SC15 / PiBackend — getModel returns null):** Given a `PiBackend` constructed with `{ getModel: () => null }`, `startSession({ workspacePath, permissionMode: 'full' })` resolves to `Err({ category: 'agent_not_found', message: 'No local model available; check dashboard for details.' })`. The pi SDK's `createAgentSession` is **not** invoked.
3. **OT3 (LocalBackend — getModel returns a string):** Given `{ getModel: () => 'qwen3:8b' }`, `startSession()` returns `Ok(session)` and the subsequent `runTurn()` chat completion call uses `model: 'qwen3:8b'` (not the static config default `'deepseek-coder-v2'`).
4. **OT4 (PiBackend — getModel returns a string):** Given `{ getModel: () => 'gemma-4-e4b' }` and no static `model` field, `startSession()` calls `createAgentSession` with `model.id === 'gemma-4-e4b'` and `model.api === 'openai-completions'`.
5. **OT5 (LocalBackend — backward compat, no getModel):** Given a `LocalBackend` constructed with only `{ endpoint, model: 'deepseek-coder-v2' }` (no `getModel`), `startSession()` returns `Ok(session)` and `runTurn()` uses `model: 'deepseek-coder-v2'` exactly as before. **All existing tests in `local.test.ts` continue to pass without source edits.**
6. **OT6 (PiBackend — backward compat, no getModel):** Given a `PiBackend` constructed with only `{ model: 'gemma-4-e4b', endpoint, apiKey }` (no `getModel`), `startSession()` invokes `createAgentSession` with `model.id === 'gemma-4-e4b'` exactly as before. **All existing tests in `pi.test.ts` continue to pass without source edits.**
7. **OT7 (mechanical):** `pnpm typecheck`, `pnpm lint`, `pnpm test --filter @harness-engineering/orchestrator -- backends`, and `harness validate` all pass at end of phase.

## Skill Recommendations

From `docs/changes/local-model-fallback/SKILLS.md`:

- `ts-testing-types` (reference) — relevant for tightly-typed mocks and assertions in Tasks 5 and 6
- `ts-type-guards` (reference) — minor relevance for narrowing the `getModel` callback's return type at the call site (Tasks 1, 3)

No skills need to be applied at the design level — the pattern is a straightforward optional-callback addition.

## Change Specification (delta against existing behavior)

- **[ADDED]** `LocalBackendConfig.getModel?: () => string | null` — lazy resolver; called once at `startSession()` start
- **[ADDED]** `PiBackendConfig.getModel?: () => string | null` — same shape and semantics
- **[ADDED]** `LocalSession.resolvedModel?: string` — internal session field carrying the resolved model name from `startSession()` to `runTurn()` so streaming uses the right model id
- **[MODIFIED]** `LocalBackend.startSession()` — when `getModel` is provided and returns `null`, returns typed `agent_not_found` `Err` instead of `Ok`; when it returns a string, that string is captured on the session for use in `runTurn()`
- **[MODIFIED]** `LocalBackend.runTurn()` — uses `localSession.resolvedModel ?? this.config.model` when calling `client.chat.completions.create`
- **[MODIFIED]** `PiBackend.startSession()` — when `getModel` is provided and returns `null`, returns typed `agent_not_found` `Err`; when it returns a string, builds the pi `model` object from that resolved name (using the existing endpoint/apiKey config) instead of from `this.config.model`
- **[REMOVED]** Nothing.

## File Map

- MODIFY `packages/orchestrator/src/agent/backends/local.ts` — add `getModel` to `LocalBackendConfig`; add `resolvedModel` to `LocalSession`; thread through `startSession` and `runTurn`
- MODIFY `packages/orchestrator/src/agent/backends/pi.ts` — add `getModel` to `PiBackendConfig`; thread through `startSession`
- MODIFY `packages/orchestrator/tests/agent/backends/local.test.ts` — add new `describe('getModel callback')` block covering OT1, OT3, OT5
- MODIFY `packages/orchestrator/tests/agent/backends/pi.test.ts` — add new `describe('getModel callback')` block covering OT2, OT4, OT6

No other files are touched in Phase 2. The orchestrator itself remains unchanged in this phase.

## Skeleton

1. `LocalBackend` failing tests for getModel callback (~1 task, ~4 min)
2. `LocalBackend` config + session + startSession + runTurn wiring (~1 task, ~6 min)
3. `PiBackend` failing tests for getModel callback (~1 task, ~4 min)
4. `PiBackend` config + startSession wiring (~1 task, ~5 min)
5. Phase exit gate — typecheck, lint, full test suite, validate (~1 task, ~3 min)

**Estimated total:** 5 tasks, ~22 min. Skeleton inline (autopilot non-interactive); proceed to full expansion. TDD ordering: each backend's test additions land first (red), then the implementation makes them green.

## Uncertainties

- **[ASSUMPTION]** `LocalBackend.runTurn` must use the `getModel`-resolved name when one was supplied at `startSession()` time. The spec only specifies the `agent_not_found` behavior on null, but a backend that ignored a non-null resolved name would be a footgun: callers wiring a resolver would expect dispatches to use the resolver's choice. We capture the resolved name on the session at `startSession()` and read it back in `runTurn()`. This is the minimal change that honors the contract.
- **[ASSUMPTION]** `PiBackend.startSession` does **not** re-call `getModel()` later in the session lifetime. One call per session is sufficient because pi sessions are single-shot. If this changes, the resolver fix lives in Phase 3 wiring, not in this backend.
- **[ASSUMPTION]** When `getModel` is provided but `model` is also set, `getModel` wins (per spec line 152: "Static model name. Ignored if `getModel` is provided."). When `getModel` is not provided, the existing `model` default behavior is preserved.
- **[DEFERRABLE]** Tests do not need to verify that the OpenAI/pi mocks were _not_ called when `getModel` returns null beyond a single assertion per backend; deeper isolation (e.g., asserting no network/import side-effects ever happen) is overkill for this phase.

## Tasks

### Task 1: Add failing tests for `LocalBackend.getModel` callback (TDD red)

**Depends on:** none | **Files:** `packages/orchestrator/tests/agent/backends/local.test.ts`

1. Open `packages/orchestrator/tests/agent/backends/local.test.ts`.
2. Append a new `describe('getModel callback')` block at the end of the outermost `describe('LocalBackend', ...)`, immediately before its closing `});`. The exact block:

   ```typescript
   describe('getModel callback', () => {
     it('returns Err agent_not_found when getModel() returns null', async () => {
       const localBackend = new LocalBackend({
         endpoint: 'http://localhost:11434/v1',
         getModel: () => null,
       });

       const result = await localBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });

       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.category).toBe('agent_not_found');
         expect(result.error.message).toBe(
           'No local model available; check dashboard for details.'
         );
       }
     });

     it('uses the resolved model name in runTurn when getModel returns a string', async () => {
       const openaiModule = await import('openai');
       const mockChatCreate = (
         openaiModule as unknown as { __mockChatCreate: ReturnType<typeof vi.fn> }
       ).__mockChatCreate;
       mockChatCreate.mockClear();

       const localBackend = new LocalBackend({
         endpoint: 'http://localhost:11434/v1',
         model: 'deepseek-coder-v2',
         getModel: () => 'qwen3:8b',
       });

       const sessionResult = await localBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });
       expect(sessionResult.ok).toBe(true);
       if (!sessionResult.ok) return;

       const gen = localBackend.runTurn(sessionResult.value, {
         sessionId: sessionResult.value.sessionId,
         prompt: 'Hi',
         isContinuation: false,
       });
       let next = await gen.next();
       while (!next.done) {
         next = await gen.next();
       }

       expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'qwen3:8b' }));
     });

     it('falls back to static config.model when getModel is not provided (backward compat)', async () => {
       const openaiModule = await import('openai');
       const mockChatCreate = (
         openaiModule as unknown as { __mockChatCreate: ReturnType<typeof vi.fn> }
       ).__mockChatCreate;
       mockChatCreate.mockClear();

       const localBackend = new LocalBackend({
         endpoint: 'http://localhost:11434/v1',
         model: 'deepseek-coder-v2',
       });

       const sessionResult = await localBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });
       if (!sessionResult.ok) return;

       const gen = localBackend.runTurn(sessionResult.value, {
         sessionId: sessionResult.value.sessionId,
         prompt: 'Hi',
         isContinuation: false,
       });
       let next = await gen.next();
       while (!next.done) {
         next = await gen.next();
       }

       expect(mockChatCreate).toHaveBeenCalledWith(
         expect.objectContaining({ model: 'deepseek-coder-v2' })
       );
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator test -- local.test`. The first two new tests must **fail** (the source has no `getModel` field yet, so the constructor accepts the unknown property but `startSession` ignores it). The third test (backward compat) must **pass** — it exercises only existing behavior. Confirm the failure modes: test 1 expects `result.ok === false` but currently gets `true`; test 2 expects `model: 'qwen3:8b'` but currently gets `'deepseek-coder-v2'`. Do not proceed to Task 2 until you have observed the expected red.
4. Run: `harness validate`. Should still pass — failing tests are not validation errors.
5. Commit: `test(orchestrator): add failing getModel callback tests for LocalBackend (TDD red)`

### Task 2: Implement `LocalBackend.getModel` to make Task 1 tests green

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/backends/local.ts`

This task combines the config/session shape change and the `startSession`/`runTurn` wiring in one atomic commit. Both are tightly coupled — the test from Task 1 cannot pass without both.

1. Open `packages/orchestrator/src/agent/backends/local.ts`.
2. Modify the `LocalBackendConfig` interface (currently lines 15-24) by adding the optional `getModel` callback. The new shape:

   ```typescript
   export interface LocalBackendConfig {
     /** Endpoint URL (e.g., http://localhost:11434/v1). Defaults to http://localhost:11434/v1. */
     endpoint?: string;
     /** Static model name (e.g., deepseek-coder-v2). Ignored if `getModel` is provided. Defaults to 'deepseek-coder-v2'. */
     model?: string;
     /** Lazy resolver. Called once at `startSession()`. Returning `null` causes `startSession()` to fail with typed `agent_not_found`. */
     getModel?: () => string | null;
     /** Optional API key (some servers require a dummy key). */
     apiKey?: string;
     /** Request timeout in ms (default: 90000). */
     timeoutMs?: number;
   }
   ```

3. Modify the `LocalSession` interface (currently lines 28-30) to carry the resolved model name from `startSession()` to `runTurn()`:

   ```typescript
   export interface LocalSession extends AgentSession {
     systemPrompt?: string;
     /** Model name resolved at session start (from getModel() if provided, else config.model). */
     resolvedModel: string;
   }
   ```

4. Update the private `config` field's `Required<LocalBackendConfig>` type so the new `getModel` field does not pollute the required-shape contract. Replace:

   ```typescript
   private config: Required<LocalBackendConfig>;
   ```

   with:

   ```typescript
   private config: Required<Omit<LocalBackendConfig, 'getModel'>>;
   private getModel: (() => string | null) | undefined;
   ```

5. In the constructor, store the callback alongside the existing `config` initialization:

   ```typescript
   constructor(config: LocalBackendConfig = {}) {
     this.config = {
       endpoint: config.endpoint ?? 'http://localhost:11434/v1',
       model: config.model ?? 'deepseek-coder-v2',
       apiKey: config.apiKey ?? 'ollama',
       timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
     };
     this.getModel = config.getModel;
     this.client = new OpenAI({
       apiKey: this.config.apiKey,
       baseURL: this.config.endpoint,
       timeout: this.config.timeoutMs,
     });
   }
   ```

6. Replace the existing `startSession` (currently lines 51-60) with:

   ```typescript
   async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
     let resolvedModel: string;
     if (this.getModel) {
       const candidate = this.getModel();
       if (candidate === null) {
         return Err({
           category: 'agent_not_found',
           message: 'No local model available; check dashboard for details.',
         });
       }
       resolvedModel = candidate;
     } else {
       resolvedModel = this.config.model;
     }

     const session: LocalSession = {
       sessionId: `local-session-${Date.now()}`,
       workspacePath: params.workspacePath,
       backendName: this.name,
       startedAt: new Date().toISOString(),
       resolvedModel,
       ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
     };
     return Ok(session);
   }
   ```

7. In `runTurn` (currently line 81), change the streaming call's `model` argument from `this.config.model` to `localSession.resolvedModel`. The full updated call within the `try` block:

   ```typescript
   const stream = await this.client.chat.completions.create({
     model: localSession.resolvedModel,
     messages,
     stream: true,
     stream_options: { include_usage: true },
   });
   ```

8. Run: `pnpm --filter @harness-engineering/orchestrator test -- local.test`. **All Task 1 tests now pass (green)** and all pre-existing tests continue to pass (regression check for OT5/SC3). If any pre-existing test fails, stop and inspect — the only legal break would be a consumer that was reading session fields directly. Existing tests in this file read only `backendName` and `sessionId`, so they should remain green.
9. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
10. Run: `harness validate`
11. Commit: `feat(orchestrator): wire getModel callback through LocalBackend startSession and runTurn`

### Task 3: Add failing tests for `PiBackend.getModel` callback (TDD red)

**Depends on:** none (parallelizable with Tasks 1-2) | **Files:** `packages/orchestrator/tests/agent/backends/pi.test.ts`

1. Open `packages/orchestrator/tests/agent/backends/pi.test.ts`.
2. Append a new `describe('getModel callback')` block at the end of the outermost `describe('PiBackend', ...)`, immediately before its closing `});`. The exact block:

   ```typescript
   describe('getModel callback', () => {
     it('returns Err agent_not_found when getModel() returns null without invoking the pi SDK', async () => {
       const piSdk = await import('@mariozechner/pi-coding-agent');
       const createSpy = piSdk.createAgentSession as ReturnType<typeof vi.fn>;
       createSpy.mockClear();

       const piBackend = new PiBackend({
         endpoint: 'http://localhost:1234/v1',
         apiKey: 'lm-studio',
         getModel: () => null,
       });

       const result = await piBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });

       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.category).toBe('agent_not_found');
         expect(result.error.message).toBe(
           'No local model available; check dashboard for details.'
         );
       }
       expect(createSpy).not.toHaveBeenCalled();
     });

     it('passes the resolved model name to createAgentSession when getModel returns a string', async () => {
       const piSdk = await import('@mariozechner/pi-coding-agent');
       const createSpy = piSdk.createAgentSession as ReturnType<typeof vi.fn>;
       createSpy.mockClear();

       const piBackend = new PiBackend({
         endpoint: 'http://localhost:1234/v1',
         apiKey: 'lm-studio',
         getModel: () => 'gemma-4-e4b',
       });

       const result = await piBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });

       expect(result.ok).toBe(true);
       expect(createSpy).toHaveBeenCalledWith(
         expect.objectContaining({
           model: expect.objectContaining({
             id: 'gemma-4-e4b',
             api: 'openai-completions',
             baseUrl: 'http://localhost:1234/v1',
           }),
         })
       );
     });

     it('falls back to static config.model when getModel is not provided (backward compat)', async () => {
       const piSdk = await import('@mariozechner/pi-coding-agent');
       const createSpy = piSdk.createAgentSession as ReturnType<typeof vi.fn>;
       createSpy.mockClear();

       const piBackend = new PiBackend({
         model: 'gemma-4-e4b',
         endpoint: 'http://localhost:1234/v1',
         apiKey: 'lm-studio',
       });

       const result = await piBackend.startSession({
         workspacePath: '/tmp/workspace',
         permissionMode: 'full',
       });

       expect(result.ok).toBe(true);
       expect(createSpy).toHaveBeenCalledWith(
         expect.objectContaining({
           model: expect.objectContaining({ id: 'gemma-4-e4b' }),
         })
       );
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator test -- pi.test`. The first new test must **fail** (`PiBackend` accepts the `getModel` field as an unknown property at construction but `startSession` ignores it, so it returns `Ok` instead of `Err`). The second test must also **fail** (createAgentSession is invoked with `model: undefined` because no static `model` was supplied and `getModel` is ignored). The third test (backward compat) must **pass** — it exercises only existing behavior. Confirm both expected failures before proceeding to Task 4.
4. Run: `harness validate`. Should pass.
5. Commit: `test(orchestrator): add failing getModel callback tests for PiBackend (TDD red)`

### Task 4: Implement `PiBackend.getModel` to make Task 3 tests green

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/backends/pi.ts`

1. Open `packages/orchestrator/src/agent/backends/pi.ts`.
2. Modify `PiBackendConfig` (currently lines 15-22) by adding the optional `getModel` callback:

   ```typescript
   export interface PiBackendConfig {
     /** Static model identifier (e.g., 'gemma-4-e4b'). Ignored if `getModel` is provided. */
     model?: string | undefined;
     /** Endpoint URL for the model server (e.g., 'http://localhost:1234/v1') */
     endpoint?: string | undefined;
     /** API key for the model server (default: 'lm-studio') */
     apiKey?: string | undefined;
     /** Lazy resolver. Called once at `startSession()`. Returning `null` causes `startSession()` to fail with typed `agent_not_found`. */
     getModel?: (() => string | null) | undefined;
   }
   ```

3. Replace `startSession` (currently lines 181-209) with the resolved-model variant. The new body:

   ```typescript
   async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
     try {
       let resolvedModelName: string | undefined;
       if (this.config.getModel) {
         const candidate = this.config.getModel();
         if (candidate === null) {
           return Err({
             category: 'agent_not_found',
             message: 'No local model available; check dashboard for details.',
           });
         }
         resolvedModelName = candidate;
       } else {
         resolvedModelName = this.config.model;
       }

       const piSdk = await import('@mariozechner/pi-coding-agent');
       const model = buildLocalModel({
         model: resolvedModelName,
         endpoint: this.config.endpoint,
         apiKey: this.config.apiKey,
       });

       const { session: piSession } = await piSdk.createAgentSession({
         cwd: params.workspacePath,
         ...(model !== undefined && { model }),
         tools: piSdk.codingTools,
         sessionManager: piSdk.SessionManager.inMemory(),
       });

       const session: PiSession = {
         sessionId: randomUUID(),
         workspacePath: params.workspacePath,
         backendName: this.name,
         startedAt: new Date().toISOString(),
         piSession,
         unsubscribe: null,
       };

       return Ok(session);
     } catch (err) {
       return Err({
         category: 'response_error',
         message: `Failed to create pi session: ${err instanceof Error ? err.message : String(err)}`,
       });
     }
   }
   ```

   Notes on the change:
   - The `agent_not_found` `Err` is returned **before** the `try`'s SDK import path is reached, so the pi SDK is not imported when no model is available. This matches OT2 / spec line 161.
   - `buildLocalModel` is now called with an inline object containing the resolved name, not `this.config` directly. The existing helper requires only `model`, `endpoint`, `apiKey` — all preserved. When `getModel` is not provided and `this.config.model` is `undefined`, `buildLocalModel` returns `undefined` (existing behavior, line 147).

4. Run: `pnpm --filter @harness-engineering/orchestrator test -- pi.test`. **All Task 3 tests now pass (green)** and pre-existing tests continue to pass (regression check for OT6/SC3). The first new test asserts `createAgentSession` is not called when `getModel` returns null — verify the spy assertion is met. The third test (backward compat with static `model`) must remain green throughout.
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): wire getModel callback through PiBackend.startSession`

### Task 5: Phase exit gate — typecheck, lint, full test suite, validate

**Depends on:** Tasks 2 and 4 | **Files:** none (gate only)

1. Run: `pnpm typecheck`. Must exit 0.
2. Run: `pnpm lint`. Must exit 0; no new ESLint suppressions introduced.
3. Run: `pnpm --filter @harness-engineering/orchestrator test`. Must pass. The orchestrator package's `local.test.ts` and `pi.test.ts` must both report all original tests plus the three new `getModel callback` tests in each file.
4. Run: `harness validate`. Must report `validation passed`.
5. Run: `harness check-deps`. Must report `validation passed` (no new package-edge violations expected — the changes only touch types and call sites within the orchestrator package).
6. If all gates pass, no further action. If any gate fails, do not patch in this task — open a follow-up after diagnosing.
7. Commit (only if a fix was needed in step 6): `chore(orchestrator): phase 2 exit gate fixups`. Otherwise no commit needed for this task.

## Phase 2 Exit Criteria

- OT1 through OT7 green (six unit assertions plus the mechanical gate).
- Spec SC15 fully satisfied for both `LocalBackend` and `PiBackend`.
- Spec SC3 partially exercised: existing tests in `local.test.ts` and `pi.test.ts` continue to pass without source edits. (Full SC3 — `state-machine.test.ts` — is a Phase 3 concern; we expect it to remain green here too, but the planning ownership is Phase 3.)
- Working tree contains only the four files in the file map plus a new commit history.

## Integration Tier — small

- Files touched: 4 (2 source, 2 test) — under the 10-file small-tier threshold
- New public exports: 0 (the `getModel` field is on existing exported types but adding an optional field is not a new export per the project's tier criteria)
- Architectural decision: none required — pattern already in use elsewhere
- Single-package boundary: yes (`@harness-engineering/orchestrator` only)

This stays small. No MATERIALIZE or UPDATE substeps for Phase 2; ADRs and knowledge docs land in Phase 5 (per spec line 432).

## Concerns

- The orchestrator's existing `state-machine.test.ts` constructs backends with the static `model` form; Phase 2 makes no changes there. If for any reason that test trips on Phase 2 changes, the root cause is a backward-compat regression — fix in `local.ts` / `pi.ts`, not in the test fixture (per spec D7 zero-breaking-changes). The Task 5 gate's `pnpm typecheck` and `pnpm lint` runs operate at repo scope and will catch any bleed-through immediately.
- `LocalSession` gains a required `resolvedModel` field. This is a structurally observable change to the session object's shape. Any external consumer reading `session.systemPrompt` directly continues to work; no consumer in the repo today reads `LocalSession` fields beyond the `AgentSession` base interface (verified by grep on `LocalSession` outside `local.ts` — should produce zero hits in `src/`). Recheck during Task 1 if grep shows external references.
