# Plan: Phase 5d — OpenAI AgentBackend

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 6
**Estimated time:** 22 minutes

---

## Goal

Implement `OpenAIBackend` in `packages/orchestrator/src/agent/backends/openai.ts` that satisfies the `AgentBackend` interface using the OpenAI SDK for streaming chat completions, and export it from the orchestrator package index.

---

## Observable Truths (Acceptance Criteria)

1. When the orchestrator creates an OpenAI backend session, the system shall return an `Ok<AgentSession>` with `backendName: 'openai'` and a unique `sessionId`.
2. When `runTurn()` is called with a prompt, the system shall yield at least one `AgentEvent` of type `'text'` and return a `TurnResult` with `success: true` and populated `usage` fields.
3. When `SessionStartParams.systemPrompt` is provided, the system shall include it as a `{ role: 'system', content: systemPrompt }` message as the first entry in the chat completions request.
4. When a streaming chat completion chunk contains `usage.prompt_tokens_details.cached_tokens`, the system shall record that value in the returned `TurnResult.usage` (as input tokens from the cache).
5. When `healthCheck()` is called, the system shall call `openai.models.list()` and return `Ok(undefined)` on success or `Err` on failure.
6. When `stopSession()` is called, the system shall return `Ok(undefined)` and not throw.
7. The `openai` npm package shall be listed in `packages/orchestrator/package.json` dependencies.
8. `OpenAIBackend` shall be exported from `packages/orchestrator/src/index.ts`.
9. `npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts` passes with all tests green.

---

## File Map

```
MODIFY packages/orchestrator/package.json                         (add openai dependency)
CREATE packages/orchestrator/src/agent/backends/openai.ts         (OpenAIBackend class)
CREATE packages/orchestrator/tests/agent/backends/openai.test.ts  (unit tests with mocked OpenAI)
MODIFY packages/orchestrator/src/index.ts                         (add export for OpenAIBackend)
```

---

## Tasks

### Task 1: Add openai SDK dependency

**Depends on:** none
**Files:** `packages/orchestrator/package.json`

1. Open `packages/orchestrator/package.json`. In the `"dependencies"` object, add:

   ```json
   "openai": "^4.0.0"
   ```

   The final dependencies block should look like:

   ```json
   "dependencies": {
     "@harness-engineering/core": "workspace:*",
     "@harness-engineering/types": "workspace:*",
     "ink": "^4.4.1",
     "liquidjs": "^10.25.3",
     "openai": "^4.0.0",
     "react": "^18.3.1",
     "yaml": "^2.8.3"
   }
   ```

2. From the repo root, run:

   ```
   pnpm install --filter @harness-engineering/orchestrator
   ```

3. Verify `packages/orchestrator/node_modules/openai` exists (or `node_modules/.pnpm` contains openai).

4. Run: `harness validate`

5. Commit: `chore(orchestrator): add openai SDK dependency`

---

### Task 2: Write failing unit tests for OpenAIBackend

**Depends on:** Task 1
**Files:** `packages/orchestrator/tests/agent/backends/openai.test.ts`

1. Create `packages/orchestrator/tests/agent/backends/openai.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { OpenAIBackend } from '../../../src/agent/backends/openai';

   // Mock the openai module before importing the backend
   vi.mock('openai', () => {
     const mockModelsList = vi.fn().mockResolvedValue({ data: [{ id: 'gpt-4o' }] });

     const mockStream = {
       [Symbol.asyncIterator]: async function* () {
         yield {
           choices: [{ delta: { content: 'Hello ' }, finish_reason: null }],
           usage: null,
         };
         yield {
           choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }],
           usage: {
             prompt_tokens: 50,
             completion_tokens: 10,
             total_tokens: 60,
             prompt_tokens_details: { cached_tokens: 20 },
           },
         };
       },
     };

     const mockChatCreate = vi.fn().mockResolvedValue(mockStream);

     return {
       default: vi.fn().mockImplementation(() => ({
         models: { list: mockModelsList },
         chat: {
           completions: { create: mockChatCreate },
         },
       })),
       __mockChatCreate: mockChatCreate,
       __mockModelsList: mockModelsList,
     };
   });

   describe('OpenAIBackend', () => {
     let backend: OpenAIBackend;

     beforeEach(() => {
       vi.clearAllMocks();
       backend = new OpenAIBackend({ model: 'gpt-4o' });
     });

     describe('startSession', () => {
       it('returns Ok with agentSession containing backendName openai', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.backendName).toBe('openai');
           expect(result.value.sessionId).toMatch(/^openai-session-/);
           expect(result.value.workspacePath).toBe('/tmp/workspace');
         }
       });

       it('stores systemPrompt from params for use in runTurn', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are a helpful assistant.',
         });
         expect(result.ok).toBe(true);
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
       it('returns Ok when models.list succeeds', async () => {
         const result = await backend.healthCheck();
         expect(result.ok).toBe(true);
       });

       it('returns Err when models.list throws', async () => {
         // Re-instantiate with a client that will throw
         const failingBackend = new OpenAIBackend({ model: 'gpt-4o' });
         // Force healthCheck failure by making models.list reject
         const openaiModule = await import('openai');
         const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
           -1
         )?.value;
         if (mockInstance) {
           mockInstance.models.list.mockRejectedValueOnce(new Error('API error'));
         }
         const result = await failingBackend.healthCheck();
         expect(result.ok).toBe(false);
       });
     });

     describe('runTurn', () => {
       it('yields AgentEvents and returns TurnResult with success:true', async () => {
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

       it('includes system message when systemPrompt is provided', async () => {
         const openaiModule = await import('openai');
         const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
           -1
         )?.value;

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are a coding expert.',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const gen = backend.runTurn(session, {
           sessionId: session.sessionId,
           prompt: 'Help me code',
           isContinuation: false,
         });

         // Drain the generator
         let next = await gen.next();
         while (!next.done) {
           next = await gen.next();
         }

         const callArgs = mockInstance?.chat.completions.create.mock.calls[0]?.[0];
         expect(callArgs?.messages[0]).toEqual({
           role: 'system',
           content: 'You are a coding expert.',
         });
       });

       it('returns zero usage when stream yields no usage chunk', async () => {
         const openaiModule = await import('openai');
         const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
           -1
         )?.value;

         const noUsageStream = {
           [Symbol.asyncIterator]: async function* () {
             yield {
               choices: [{ delta: { content: 'Hi' }, finish_reason: 'stop' }],
               usage: null,
             };
           },
         };
         mockInstance?.chat.completions.create.mockResolvedValueOnce(noUsageStream);

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
     });
   });
   ```

2. Run: `npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts`

3. Observe failure: `Cannot find module '../../../src/agent/backends/openai'` (file does not exist yet).

4. Run: `harness validate`

5. Commit: `test(orchestrator): add failing unit tests for OpenAIBackend`

---

### Task 3: Implement OpenAIBackend

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/agent/backends/openai.ts`

1. Create `packages/orchestrator/src/agent/backends/openai.ts`:

   ```typescript
   import OpenAI from 'openai';
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

   export interface OpenAIBackendConfig {
     /** OpenAI model to use. Defaults to 'gpt-4o'. */
     model?: string;
     /** API key. Defaults to process.env.OPENAI_API_KEY. */
     apiKey?: string;
   }

   interface OpenAISession extends AgentSession {
     systemPrompt?: string;
   }

   export class OpenAIBackend implements AgentBackend {
     readonly name = 'openai';
     private config: Required<OpenAIBackendConfig>;
     private client: OpenAI;

     constructor(config: OpenAIBackendConfig = {}) {
       this.config = {
         model: config.model ?? 'gpt-4o',
         apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
       };
       this.client = new OpenAI({ apiKey: this.config.apiKey });
     }

     async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
       const session: OpenAISession = {
         sessionId: `openai-session-${Date.now()}`,
         workspacePath: params.workspacePath,
         backendName: this.name,
         startedAt: new Date().toISOString(),
         systemPrompt: params.systemPrompt,
       };
       return Ok(session);
     }

     async *runTurn(
       session: AgentSession,
       params: TurnParams
     ): AsyncGenerator<AgentEvent, TurnResult, void> {
       const openAISession = session as OpenAISession;

       const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

       if (openAISession.systemPrompt) {
         messages.push({ role: 'system', content: openAISession.systemPrompt });
       }

       messages.push({ role: 'user', content: params.prompt });

       const stream = await this.client.chat.completions.create({
         model: this.config.model,
         messages,
         stream: true,
         stream_options: { include_usage: true },
       });

       let inputTokens = 0;
       let outputTokens = 0;
       let totalTokens = 0;

       for await (const chunk of stream) {
         const delta = chunk.choices[0]?.delta;

         if (delta?.content) {
           const event: AgentEvent = {
             type: 'text',
             timestamp: new Date().toISOString(),
             content: delta.content,
             sessionId: session.sessionId,
           };
           yield event;
         }

         if (chunk.usage) {
           inputTokens = chunk.usage.prompt_tokens ?? 0;
           outputTokens = chunk.usage.completion_tokens ?? 0;
           totalTokens = chunk.usage.total_tokens ?? 0;
         }
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
         await this.client.models.list();
         return Ok(undefined);
       } catch (err) {
         return Err({
           category: 'response_error',
           message: err instanceof Error ? err.message : 'OpenAI health check failed',
         });
       }
     }
   }
   ```

2. Run: `npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts`

3. Observe: all tests pass.

4. Run: `harness validate`

5. Commit: `feat(orchestrator): implement OpenAIBackend with streaming chat completions`

---

### Task 4: Export OpenAIBackend from package index

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/index.ts`

1. Open `packages/orchestrator/src/index.ts`. Add the export for the new backend directly after the claude backend export line:

   Current content at the relevant lines (`packages/orchestrator/src/index.ts:19-20`):

   ```typescript
   export * from './agent/backends/mock';
   export * from './agent/backends/claude';
   ```

   Change to:

   ```typescript
   export * from './agent/backends/mock';
   export * from './agent/backends/claude';
   export * from './agent/backends/openai';
   ```

2. Run: `npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts`

3. Observe: all tests still pass.

4. Run `harness check-deps` to verify no new boundary violations from the openai import.

5. Run: `harness validate`

6. Commit: `feat(orchestrator): export OpenAIBackend from package index`

---

### Task 5: Typecheck and build verification

**Depends on:** Task 4
**Files:** none (verification only)

1. From `packages/orchestrator/`, run:

   ```
   pnpm typecheck
   ```

2. Observe: no TypeScript errors.

3. Run:

   ```
   pnpm build
   ```

4. Observe: build succeeds, `dist/` contains updated output.

5. Run: `harness validate`

6. Commit: `chore(orchestrator): verify OpenAIBackend typechecks and builds cleanly`

   (Only commit if there were any minor fixes needed. If no changes were made, skip the commit.)

---

### Task 6: Full test suite verification

**Depends on:** Task 5
**Files:** none (verification only)

1. From `packages/orchestrator/`, run the full test suite:

   ```
   npx vitest run
   ```

2. Observe: all existing tests still pass alongside the new OpenAI backend tests.

3. Run: `harness validate`

4. No commit needed unless regressions were found and fixed.

---

## Dependency Chain

```
Task 1 (add dep)
  -> Task 2 (write failing tests)
    -> Task 3 (implement backend)
      -> Task 4 (export from index)
        -> Task 5 (typecheck + build)
          -> Task 6 (full suite)
```

---

## Traceability

| Observable Truth                                                        | Delivered by                            |
| ----------------------------------------------------------------------- | --------------------------------------- |
| `Ok<AgentSession>` with `backendName: 'openai'`                         | Task 3 (`startSession`)                 |
| `runTurn` yields `AgentEvent` of type `'text'` and returns `TurnResult` | Task 3 (`runTurn`)                      |
| `systemPrompt` sent as system message                                   | Task 3 (`runTurn` message construction) |
| `cached_tokens` mapped into `TurnResult.usage`                          | Task 3 (`runTurn` usage extraction)     |
| `healthCheck` calls `models.list()`                                     | Task 3 (`healthCheck`)                  |
| `stopSession` returns `Ok(undefined)`                                   | Task 3 (`stopSession`)                  |
| `openai` in package.json                                                | Task 1                                  |
| `OpenAIBackend` exported from index                                     | Task 4                                  |
| Tests pass                                                              | Tasks 2-3 (TDD: red then green)         |

---

## Notes

- `stream_options: { include_usage: true }` is required for OpenAI to include the `usage` field on streaming chunks. Without it, `chunk.usage` is always null until the final chunk.
- The `OpenAISession` internal interface extends `AgentSession` to carry `systemPrompt` between `startSession` and `runTurn`. This is the same pattern the Claude backend uses to pass workspacePath.
- `cached_tokens` from `prompt_tokens_details` is available in the `usage` chunk but Phase 5d does not yet wire it into a dedicated field — that will happen in Phase 5f when `TurnResult.usage` is extended with `cacheCreationTokens`/`cacheReadTokens`. For now, `inputTokens` reflects total prompt tokens.
- The `OPENAI_API_KEY` environment variable is the standard lookup; callers can also pass `apiKey` directly via config for testing or multi-tenant use.
