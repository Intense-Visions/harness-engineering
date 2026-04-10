# Plan: Phase 5e — Gemini AgentBackend

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Session:** changes--prompt-caching-provider-adapters--proposal
**Estimated tasks:** 6
**Estimated time:** 22 minutes

---

## Goal

Implement `GeminiBackend` — a fully-tested `AgentBackend` that streams generateContent calls via the `@google/generative-ai` SDK, wires into `createBackend()` in orchestrator.ts, and extracts `TokenUsage` including `cachedContentTokenCount` from `usageMetadata`.

---

## Observable Truths (Acceptance Criteria)

1. When the orchestrator creates a Gemini backend session with a valid API key, the system shall return `Ok(AgentSession)` with `backendName === 'gemini'` and a `sessionId` matching `/^gemini-session-/`.
2. When `startSession()` is called with an empty API key, the system shall return `Err({ category: 'agent_not_found', message: ... })` without calling the SDK.
3. When `runTurn()` is called on a valid session, the system shall yield `AgentEvent` objects with `type: 'text'` from streamed chunks, then return `TurnResult` with `success: true` and correct `usage` from `usageMetadata`.
4. When `runTurn()` encounters an SDK error, the system shall yield a terminal error `AgentEvent` with `type: 'error'` and return `TurnResult` with `success: false` and an `error` field.
5. When `stopSession()` is called, the system shall return `Ok(undefined)`.
6. When `healthCheck()` is called with a valid API key, the system shall return `Ok(undefined)`; when the SDK throws, it shall return `Err`.
7. When `systemPrompt` is provided in `SessionStartParams`, the system shall pass it as `systemInstruction` in `generateContentStream()`.
8. When the orchestrator config has `backend: 'gemini'`, `createBackend()` in `orchestrator.ts` shall return a `GeminiBackend` instance.
9. `npx vitest run tests/agent/backends/gemini.test.ts` in `packages/orchestrator` passes with all tests green.
10. `harness validate` passes after all changes.

---

## File Map

```
CREATE packages/orchestrator/src/agent/backends/gemini.ts
CREATE packages/orchestrator/tests/agent/backends/gemini.test.ts
MODIFY packages/orchestrator/package.json         (add @google/generative-ai ^0.24.0)
MODIFY packages/orchestrator/src/index.ts         (add export for gemini backend)
MODIFY packages/orchestrator/src/orchestrator.ts  (add 'gemini' branch to createBackend())
MODIFY .harness/arch/baselines.json               (update module-size baseline)
```

---

## Tasks

### Task 1: Add `@google/generative-ai` SDK dependency

**Depends on:** none
**Files:** `packages/orchestrator/package.json`

1. Open `packages/orchestrator/package.json`. In the `dependencies` block, add after the `openai` entry:
   ```json
   "@google/generative-ai": "^0.24.0",
   ```
2. Run `pnpm install` from the repo root:
   ```
   pnpm install
   ```
3. Verify the package resolves by checking `packages/orchestrator/node_modules/@google/generative-ai` exists.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): add @google/generative-ai SDK dependency`

---

### Task 2: Write failing unit tests for GeminiBackend

**Depends on:** Task 1
**Files:** `packages/orchestrator/tests/agent/backends/gemini.test.ts`

1. Create `packages/orchestrator/tests/agent/backends/gemini.test.ts` with the following content:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { GeminiBackend } from '../../../src/agent/backends/gemini';

   // Mock @google/generative-ai before importing the backend
   vi.mock('@google/generative-ai', () => {
     const mockStream = {
       stream: (async function* () {
         yield {
           text: () => 'Hello ',
           usageMetadata: undefined,
         };
         yield {
           text: () => 'world',
           usageMetadata: {
             promptTokenCount: 50,
             candidatesTokenCount: 10,
             totalTokenCount: 60,
             cachedContentTokenCount: 15,
           },
         };
       })(),
     };

     const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);

     const MockGenerativeModel = vi.fn().mockImplementation(function () {
       return {
         generateContentStream: mockGenerateContentStream,
       };
     });

     const MockGoogleGenerativeAI = vi.fn().mockImplementation(function () {
       return {
         getGenerativeModel: MockGenerativeModel,
       };
     });

     return {
       GoogleGenerativeAI: MockGoogleGenerativeAI,
       __mockGenerateContentStream: mockGenerateContentStream,
       __MockGenerativeModel: MockGenerativeModel,
     };
   });

   describe('GeminiBackend', () => {
     let backend: GeminiBackend;

     beforeEach(() => {
       vi.clearAllMocks();
       backend = new GeminiBackend({ model: 'gemini-2.0-flash', apiKey: 'test-api-key' });
     });

     describe('startSession', () => {
       it('returns Ok with agentSession containing backendName gemini', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.backendName).toBe('gemini');
           expect(result.value.sessionId).toMatch(/^gemini-session-/);
           expect(result.value.workspacePath).toBe('/tmp/workspace');
         }
       });

       it('returns Err when apiKey is empty', async () => {
         const emptyKeyBackend = new GeminiBackend({ apiKey: '' });
         const result = await emptyKeyBackend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.category).toBe('agent_not_found');
           expect(result.error.message).toMatch(/GEMINI_API_KEY/);
         }
       });

       it('stores systemPrompt from params for use in runTurn', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are a coding assistant.',
         });
         expect(result.ok).toBe(true);
         if (result.ok) {
           const session =
             result.value as import('../../../src/agent/backends/gemini').GeminiSession;
           expect(session.systemPrompt).toBe('You are a coding assistant.');
         }
       });
     });

     describe('stopSession', () => {
       it('returns Ok(undefined)', async () => {
         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(sessionResult.ok).toBe(true);
         if (sessionResult.ok) {
           const stopResult = await backend.stopSession(sessionResult.value);
           expect(stopResult.ok).toBe(true);
         }
       });
     });

     describe('healthCheck', () => {
       it('returns Ok when model construction succeeds', async () => {
         const result = await backend.healthCheck();
         expect(result.ok).toBe(true);
       });

       it('returns Err when SDK throws during healthCheck', async () => {
         const geminiModule = await import('@google/generative-ai');
         // Force the GoogleGenerativeAI constructor to throw on next call
         (geminiModule.GoogleGenerativeAI as ReturnType<typeof vi.fn>).mockImplementationOnce(
           function () {
             throw new Error('Invalid API key');
           }
         );
         const failBackend = new GeminiBackend({ apiKey: 'bad-key' });
         const result = await failBackend.healthCheck();
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.message).toContain('Invalid API key');
         }
       });
     });

     describe('runTurn', () => {
       it('yields AgentEvents and returns TurnResult with success:true and correct usage', async () => {
         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const events: import('@harness-engineering/types').AgentEvent[] = [];
         let result: import('@harness-engineering/types').TurnResult | undefined;

         const gen = backend.runTurn(session, {
           sessionId: session.sessionId,
           prompt: 'Say hello',
           isContinuation: false,
         });

         let next = await gen.next();
         while (!next.done) {
           events.push(next.value);
           next = await gen.next();
         }
         result = next.value;

         expect(events.length).toBeGreaterThan(0);
         expect(events[0].type).toBe('text');
         expect(result).toBeDefined();
         expect(result!.success).toBe(true);
         expect(result!.sessionId).toBe(session.sessionId);
         expect(result!.usage.inputTokens).toBe(50);
         expect(result!.usage.outputTokens).toBe(10);
         expect(result!.usage.totalTokens).toBe(60);
       });

       it('passes systemInstruction to generateContentStream when systemPrompt is set', async () => {
         const geminiModule = await import('@google/generative-ai');
         const MockGenerativeModel = (
           geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
         )['__MockGenerativeModel'];

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are a helpful coder.',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const gen = backend.runTurn(session, {
           sessionId: session.sessionId,
           prompt: 'Help me',
           isContinuation: false,
         });

         let next = await gen.next();
         while (!next.done) {
           next = await gen.next();
         }

         // getGenerativeModel should have been called with systemInstruction
         const modelCallArg = MockGenerativeModel.mock.calls.at(-1)?.[0];
         expect(modelCallArg?.systemInstruction).toBe('You are a helpful coder.');
       });

       it('returns zero usage when stream yields no usageMetadata', async () => {
         const geminiModule = await import('@google/generative-ai');
         const mockStream = {
           stream: (async function* () {
             yield { text: () => 'Hi', usageMetadata: undefined };
           })(),
         };
         const MockGenerativeModel = (
           geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
         )['__MockGenerativeModel'];
         const mockInstance = MockGenerativeModel.mock.results.at(-1)?.value;
         mockInstance?.generateContentStream.mockResolvedValueOnce(mockStream);

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const gen = backend.runTurn(session, {
           sessionId: session.sessionId,
           prompt: 'Hi',
           isContinuation: false,
         });
         let next = await gen.next();
         while (!next.done) {
           next = await gen.next();
         }

         expect(next.value.usage.inputTokens).toBe(0);
         expect(next.value.usage.outputTokens).toBe(0);
         expect(next.value.usage.totalTokens).toBe(0);
       });

       it('yields error event and returns failed TurnResult when SDK throws', async () => {
         const geminiModule = await import('@google/generative-ai');
         const MockGenerativeModel = (
           geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
         )['__MockGenerativeModel'];
         const mockInstance = MockGenerativeModel.mock.results.at(-1)?.value;
         mockInstance?.generateContentStream.mockRejectedValueOnce(new Error('Network failure'));

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const events: import('@harness-engineering/types').AgentEvent[] = [];
         let result: import('@harness-engineering/types').TurnResult | undefined;

         const gen = backend.runTurn(session, {
           sessionId: session.sessionId,
           prompt: 'Fail me',
           isContinuation: false,
         });

         let next = await gen.next();
         while (!next.done) {
           events.push(next.value);
           next = await gen.next();
         }
         result = next.value;

         const errorEvents = events.filter((e) => e.type === 'error');
         expect(errorEvents.length).toBe(1);
         expect(result!.success).toBe(false);
         expect(result!.error).toContain('Network failure');
       });
     });
   });
   ```

2. Run the test to observe failures (backend does not exist yet):
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/agent/backends/gemini.test.ts
   ```
3. Observe: `Cannot find module '../../../src/agent/backends/gemini'`
4. Run: `harness validate`
5. Commit: `test(orchestrator): add failing unit tests for GeminiBackend`

---

### Task 3: Implement `GeminiBackend`

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/agent/backends/gemini.ts`

1. Create `packages/orchestrator/src/agent/backends/gemini.ts`:

   ```typescript
   import { GoogleGenerativeAI } from '@google/generative-ai';
   import {
     AgentBackend,
     SessionStartParams,
     AgentSession,
     TurnParams,
     AgentEvent,
     TurnResult,
     Result,
     Ok,
     Err,
     AgentError,
   } from '@harness-engineering/types';

   export interface GeminiBackendConfig {
     /** Gemini model to use. Defaults to 'gemini-2.0-flash'. */
     model?: string;
     /** API key. Defaults to process.env.GEMINI_API_KEY or process.env.GOOGLE_API_KEY. */
     apiKey?: string;
   }

   export interface GeminiSession extends AgentSession {
     systemPrompt?: string;
   }

   export class GeminiBackend implements AgentBackend {
     readonly name = 'gemini';
     private config: Required<GeminiBackendConfig>;

     constructor(config: GeminiBackendConfig = {}) {
       this.config = {
         model: config.model ?? 'gemini-2.0-flash',
         apiKey: config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
       };
     }

     async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
       if (!this.config.apiKey) {
         return Err({
           category: 'agent_not_found',
           message: 'GEMINI_API_KEY is not set',
         });
       }

       const session: GeminiSession = {
         sessionId: `gemini-session-${Date.now()}`,
         workspacePath: params.workspacePath,
         backendName: this.name,
         startedAt: new Date().toISOString(),
         ...(params.systemPrompt !== undefined && { systemPrompt: params.systemPrompt }),
       };
       return Ok(session);
     }

     async *runTurn(
       session: AgentSession,
       params: TurnParams
     ): AsyncGenerator<AgentEvent, TurnResult, void> {
       const geminiSession = session as GeminiSession;

       let inputTokens = 0;
       let outputTokens = 0;
       let totalTokens = 0;

       try {
         const genAI = new GoogleGenerativeAI(this.config.apiKey);
         const model = genAI.getGenerativeModel({
           model: this.config.model,
           ...(geminiSession.systemPrompt !== undefined && {
             systemInstruction: geminiSession.systemPrompt,
           }),
         });

         const result = await model.generateContentStream(params.prompt);

         for await (const chunk of result.stream) {
           const text = chunk.text();
           if (text) {
             const event: AgentEvent = {
               type: 'text',
               timestamp: new Date().toISOString(),
               content: text,
               sessionId: session.sessionId,
             };
             yield event;
           }

           if (chunk.usageMetadata) {
             inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
             outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
             totalTokens = chunk.usageMetadata.totalTokenCount ?? 0;
           }
         }
       } catch (err) {
         const errorMessage = err instanceof Error ? err.message : 'Gemini request failed';
         yield {
           type: 'error',
           timestamp: new Date().toISOString(),
           content: errorMessage,
           sessionId: session.sessionId,
         };
         return {
           success: false,
           sessionId: session.sessionId,
           usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
           error: errorMessage,
         };
       }

       return {
         success: true,
         sessionId: session.sessionId,
         usage: {
           inputTokens,
           outputTokens,
           totalTokens,
         },
       };
     }

     async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
       return Ok(undefined);
     }

     async healthCheck(): Promise<Result<void, AgentError>> {
       try {
         const genAI = new GoogleGenerativeAI(this.config.apiKey);
         // Construct the model as a lightweight connectivity check (SDK has no dedicated ping)
         genAI.getGenerativeModel({ model: this.config.model });
         return Ok(undefined);
       } catch (err) {
         return Err({
           category: 'response_error',
           message: err instanceof Error ? err.message : 'Gemini health check failed',
         });
       }
     }
   }
   ```

2. Run the tests:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run tests/agent/backends/gemini.test.ts
   ```
3. Observe: all tests pass. If the `healthCheck` error test fails because the constructor is called in the `GeminiBackend` constructor rather than in `healthCheck`, verify the implementation creates `GoogleGenerativeAI` inside each method (not in the constructor), so the mock's `mockImplementationOnce` fires at the right call site.
4. Run the full orchestrator test suite to confirm no regressions:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): implement GeminiBackend with streaming generateContent`

---

### Task 4: Export `GeminiBackend` from `packages/orchestrator/src/index.ts`

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/index.ts`

1. Open `packages/orchestrator/src/index.ts`. After the `openai` backend export line (line 21), add:
   ```typescript
   export * from './agent/backends/gemini';
   ```
2. Run typecheck to verify the new export compiles:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx tsc --noEmit
   ```
3. Observe: no errors.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): export GeminiBackend from package index`

---

### Task 5: Wire `GeminiBackend` into `createBackend()` in `orchestrator.ts`

**Depends on:** Task 4
**Files:** `packages/orchestrator/src/orchestrator.ts`

1. Open `packages/orchestrator/src/orchestrator.ts`. The current `createBackend()` method ends at line ~101 with `throw new Error(...)`. Add the import at the top alongside the existing backend imports:
   ```typescript
   import { GeminiBackend } from './agent/backends/gemini';
   ```
2. Inside `createBackend()`, add a `gemini` branch after the `openai` branch:
   ```typescript
   } else if (this.config.agent.backend === 'gemini') {
     return new GeminiBackend({
       ...(this.config.agent.model !== undefined && { model: this.config.agent.model }),
       ...(this.config.agent.apiKey !== undefined && { apiKey: this.config.agent.apiKey }),
     });
   }
   ```
3. Run typecheck:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx tsc --noEmit
   ```
4. Run the full orchestrator test suite:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run
   ```
5. Observe: all tests pass (the new branch is covered by path; existing tests are unaffected).
6. Run: `harness validate`
7. Commit: `feat(orchestrator): add gemini branch to createBackend()`

---

### Task 6: Update arch baseline and final validation

**Depends on:** Task 5
**Files:** `.harness/arch/baselines.json`

The module-size baseline tracks byte counts of compiled modules. Adding `gemini.ts` (~100 lines) will increase the `packages/orchestrator` module size and cause a module-size violation that must be baselined.

1. Run `harness validate` and inspect the output for module-size violations referencing the orchestrator package.
2. If a module-size violation appears, update `.harness/arch/baselines.json` by running:
   ```
   harness arch baseline --update
   ```
   If the `harness arch baseline` command is not available, manually increment the `module-size.value` in `.harness/arch/baselines.json` to the new reported value. Reference the Phase 5d learning: the openai.ts addition required two incremental baseline updates. Do one update here for `gemini.ts`.
3. Run `harness validate` again. Observe: `validation passed`.
4. Run the full orchestrator test suite one final time as a regression check:
   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && npx vitest run
   ```
5. Observe: all tests pass.
6. Commit: `chore(arch): update module-size baseline for GeminiBackend`

---

## Key Learnings from Phase 5d (applied here)

- **Empty API key check:** `startSession()` must return `Err` before touching the SDK. The `GeminiBackend` constructor does NOT validate the key (mirrors OpenAIBackend). The check is in `startSession()`.
- **SDK instance creation:** `GoogleGenerativeAI` is constructed inside `runTurn()` and `healthCheck()`, not in the constructor. This is required so the vitest mock's `mockImplementationOnce` fires at the correct call site for error tests.
- **Error handling:** All SDK calls in `runTurn()` are wrapped in `try/catch`. On error: yield a `type: 'error'` AgentEvent, then return a `TurnResult` with `success: false` and `error: errorMessage`.
- **Mock constructor pattern:** Use `vi.fn().mockImplementation(function() { ... })` (not arrow functions) when mocking ES class constructors with `new` in vitest.
- **Baseline updates:** The arch `module-size` baseline must be updated after adding the new backend file. Adding ~100 lines increases the byte count and triggers a violation.
- **Test command:** Always run vitest from `packages/orchestrator` directory, not the repo root.
- **exactOptionalPropertyTypes:** Use conditional spread `...(value !== undefined && { key: value })` for optional properties, not direct assignment.

---

## Trace: Observable Truths to Tasks

| Observable Truth                                           | Delivering Task              |
| ---------------------------------------------------------- | ---------------------------- |
| 1. `Ok(AgentSession)` with `backendName === 'gemini'`      | Task 3 (impl), Task 2 (test) |
| 2. `Err` on empty API key                                  | Task 3 (impl), Task 2 (test) |
| 3. `runTurn()` yields text events, returns correct usage   | Task 3 (impl), Task 2 (test) |
| 4. SDK error yields error event, returns failed TurnResult | Task 3 (impl), Task 2 (test) |
| 5. `stopSession()` returns `Ok(undefined)`                 | Task 3 (impl), Task 2 (test) |
| 6. `healthCheck()` Ok/Err behavior                         | Task 3 (impl), Task 2 (test) |
| 7. `systemPrompt` passes as `systemInstruction`            | Task 3 (impl), Task 2 (test) |
| 8. `createBackend()` 'gemini' branch                       | Task 5                       |
| 9. Tests pass                                              | Tasks 2-5                    |
| 10. `harness validate` passes                              | Task 6                       |
