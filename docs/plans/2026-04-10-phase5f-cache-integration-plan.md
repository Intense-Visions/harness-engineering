# Plan: Phase 5f -- Orchestrator Cache Integration

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 10
**Estimated time:** 40 minutes

## Goal

Wire cache adapters from `@harness-engineering/core` into all three direct-API orchestrator backends (Anthropic, OpenAI, Gemini), extend `TokenUsage` with cache fields, and propagate cache metrics through `TurnResult` and the `AgentRunner` event stream.

## Observable Truths (Acceptance Criteria)

1. When the Anthropic backend constructs an API request with a system prompt, the request body shall include `cache_control` breakpoints on system and tool blocks via `AnthropicCacheAdapter.wrapSystemBlock()`.
2. When the OpenAI backend constructs an API request, message content shall be ordered by stability tier (static first, ephemeral last) via `OpenAICacheAdapter.orderContent()`.
3. When the Gemini backend constructs an API request with static content, it shall reference `cachedContents` via `GeminiCacheAdapter.wrapSystemBlock()`.
4. When any direct-API backend completes a turn, `TurnResult.usage` shall include `cacheCreationTokens` and `cacheReadTokens` extracted via the adapter's `parseCacheUsage()`.
5. The `TokenUsage` interface shall include `cacheCreationTokens` and `cacheReadTokens` fields (optional, defaulting to 0).
6. When the `AgentRunner` accumulates usage across turns, cache token fields shall be propagated in emitted `AgentEvent.usage` snapshots.
7. When `createBackend()` in `orchestrator.ts` receives `backend: 'anthropic'`, the system shall instantiate `AnthropicBackend` with an `AnthropicCacheAdapter`.
8. `npx vitest run packages/orchestrator/tests/agent/backends/anthropic.test.ts` shall pass with tests covering session lifecycle, streaming, cache directive injection, and cache usage extraction.
9. All existing backend tests (OpenAI, Gemini, Claude, Mock) shall continue to pass unchanged.
10. `harness validate` shall pass.

## File Map

```
CREATE  packages/orchestrator/src/agent/backends/anthropic.ts
CREATE  packages/orchestrator/tests/agent/backends/anthropic.test.ts
MODIFY  packages/types/src/orchestrator.ts (add cacheCreationTokens, cacheReadTokens to TokenUsage)
MODIFY  packages/orchestrator/src/agent/backends/openai.ts (accept CacheAdapter, wire orderContent + parseCacheUsage)
MODIFY  packages/orchestrator/src/agent/backends/gemini.ts (accept CacheAdapter, wire wrapSystemBlock + parseCacheUsage)
MODIFY  packages/orchestrator/src/agent/runner.ts (propagate cache usage fields)
MODIFY  packages/orchestrator/src/orchestrator.ts (add 'anthropic' case to createBackend)
MODIFY  packages/orchestrator/src/index.ts (add AnthropicBackend export)
MODIFY  packages/orchestrator/package.json (add @anthropic-ai/sdk dependency)
MODIFY  packages/orchestrator/tests/agent/backends/openai.test.ts (add cache usage assertions)
MODIFY  packages/orchestrator/tests/agent/backends/gemini.test.ts (add cache usage assertions)
```

## Skeleton

1. TokenUsage extension (~1 task, ~3 min)
2. AnthropicBackend creation with TDD (~2 tasks, ~10 min)
3. OpenAI cache adapter wiring with TDD (~2 tasks, ~8 min)
4. Gemini cache adapter wiring with TDD (~2 tasks, ~8 min)
5. AgentRunner cache propagation (~1 task, ~4 min)
6. Orchestrator factory wiring and exports (~1 task, ~4 min)
7. Integration validation (~1 task, ~3 min)

**Estimated total:** 10 tasks, ~40 minutes

## Tasks

### Task 1: Extend TokenUsage with cache fields

**Depends on:** none
**Files:** packages/types/src/orchestrator.ts

1. Open `packages/types/src/orchestrator.ts` and add two optional fields to the `TokenUsage` interface:

   ```typescript
   export interface TokenUsage {
     /** Number of tokens used in the input (prompt) */
     inputTokens: number;
     /** Number of tokens generated in the output (response) */
     outputTokens: number;
     /** Combined total tokens used */
     totalTokens: number;
     /** Tokens used to create a new cache entry (provider-specific) */
     cacheCreationTokens?: number;
     /** Tokens read from an existing cache entry (provider-specific) */
     cacheReadTokens?: number;
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/types/tsconfig.json`
3. Verify: no type errors. The fields are optional so all existing consumers remain compatible.
4. Run: `harness validate`
5. Commit: `feat(types): add cacheCreationTokens and cacheReadTokens to TokenUsage`

---

### Task 2: Add @anthropic-ai/sdk dependency

**Depends on:** none
**Files:** packages/orchestrator/package.json

1. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/orchestrator && pnpm add @anthropic-ai/sdk`
2. Verify: `package.json` now lists `@anthropic-ai/sdk` in `dependencies`.
3. Run: `harness validate`
4. Commit: `build(orchestrator): add @anthropic-ai/sdk dependency`

---

### Task 3: Create AnthropicBackend test file (TDD -- red)

**Depends on:** Task 1, Task 2
**Files:** packages/orchestrator/tests/agent/backends/anthropic.test.ts

1. Create `packages/orchestrator/tests/agent/backends/anthropic.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { AnthropicBackend } from '../../../src/agent/backends/anthropic';

   // Mock the @anthropic-ai/sdk module
   vi.mock('@anthropic-ai/sdk', () => {
     const mockStream = {
       [Symbol.asyncIterator]: async function* () {
         yield {
           type: 'content_block_delta',
           delta: { type: 'text_delta', text: 'Hello ' },
         };
         yield {
           type: 'content_block_delta',
           delta: { type: 'text_delta', text: 'world' },
         };
         yield {
           type: 'message_stop',
         };
         yield {
           type: 'message_delta',
           usage: { output_tokens: 10 },
         };
       },
       finalMessage: async () => ({
         usage: {
           input_tokens: 50,
           output_tokens: 10,
           cache_creation_input_tokens: 1200,
           cache_read_input_tokens: 800,
         },
       }),
     };

     const mockMessagesCreate = vi.fn().mockResolvedValue(mockStream);

     const MockAnthropic = vi.fn().mockImplementation(function () {
       return {
         messages: {
           create: mockMessagesCreate,
         },
       };
     });

     return {
       default: MockAnthropic,
       __mockMessagesCreate: mockMessagesCreate,
     };
   });

   describe('AnthropicBackend', () => {
     let backend: AnthropicBackend;

     beforeEach(() => {
       vi.clearAllMocks();
       backend = new AnthropicBackend({ model: 'claude-sonnet-4-20250514', apiKey: 'test-key' });
     });

     describe('startSession', () => {
       it('returns Ok with session containing backendName anthropic', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(result.ok).toBe(true);
         if (result.ok) {
           expect(result.value.backendName).toBe('anthropic');
           expect(result.value.sessionId).toMatch(/^anthropic-session-/);
         }
       });

       it('returns Err when apiKey is empty', async () => {
         const noKeyBackend = new AnthropicBackend({ apiKey: '' });
         const result = await noKeyBackend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(result.ok).toBe(false);
         if (!result.ok) {
           expect(result.error.message).toMatch(/ANTHROPIC_API_KEY/);
         }
       });

       it('stores systemPrompt from params', async () => {
         const result = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are a coding assistant.',
         });
         expect(result.ok).toBe(true);
         if (result.ok) {
           const session =
             result.value as import('../../../src/agent/backends/anthropic').AnthropicSession;
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
         if (sessionResult.ok) {
           const result = await backend.stopSession(sessionResult.value);
           expect(result.ok).toBe(true);
         }
       });
     });

     describe('runTurn', () => {
       it('yields text events and returns TurnResult with cache usage', async () => {
         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         expect(sessionResult.ok).toBe(true);
         if (!sessionResult.ok) return;

         const session = sessionResult.value;
         const events: import('@harness-engineering/types').AgentEvent[] = [];
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
         const result = next.value;

         expect(events.length).toBeGreaterThan(0);
         expect(events[0].type).toBe('text');
         expect(result.success).toBe(true);
         expect(result.usage.inputTokens).toBe(50);
         expect(result.usage.outputTokens).toBe(10);
         expect(result.usage.cacheCreationTokens).toBe(1200);
         expect(result.usage.cacheReadTokens).toBe(800);
       });

       it('passes system prompt with cache_control to API', async () => {
         const sdkModule = await import('@anthropic-ai/sdk');
         const mockCreate = (sdkModule as unknown as Record<string, ReturnType<typeof vi.fn>>)[
           '__mockMessagesCreate'
         ];

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
           systemPrompt: 'You are an expert.',
         });
         if (!sessionResult.ok) return;

         const gen = backend.runTurn(sessionResult.value, {
           sessionId: sessionResult.value.sessionId,
           prompt: 'Help',
           isContinuation: false,
         });
         let next = await gen.next();
         while (!next.done) next = await gen.next();

         const callArgs = mockCreate.mock.calls[0]?.[0];
         expect(callArgs.system).toBeDefined();
         // System block should have cache_control from AnthropicCacheAdapter
         const systemBlocks = callArgs.system;
         expect(systemBlocks[0].cache_control).toBeDefined();
         expect(systemBlocks[0].cache_control.type).toBe('ephemeral');
       });

       it('returns failed TurnResult when SDK throws', async () => {
         const sdkModule = await import('@anthropic-ai/sdk');
         const mockCreate = (sdkModule as unknown as Record<string, ReturnType<typeof vi.fn>>)[
           '__mockMessagesCreate'
         ];
         mockCreate.mockRejectedValueOnce(new Error('Rate limited'));

         const sessionResult = await backend.startSession({
           workspacePath: '/tmp/workspace',
           permissionMode: 'full',
         });
         if (!sessionResult.ok) return;

         const events: import('@harness-engineering/types').AgentEvent[] = [];
         const gen = backend.runTurn(sessionResult.value, {
           sessionId: sessionResult.value.sessionId,
           prompt: 'Fail',
           isContinuation: false,
         });
         let next = await gen.next();
         while (!next.done) {
           events.push(next.value);
           next = await gen.next();
         }

         expect(next.value.success).toBe(false);
         expect(next.value.error).toContain('Rate limited');
       });
     });

     describe('healthCheck', () => {
       it('returns Ok when API key is set', async () => {
         const result = await backend.healthCheck();
         expect(result.ok).toBe(true);
       });
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/anthropic.test.ts`
3. Observe: test fails because `../../../src/agent/backends/anthropic` does not exist.
4. Do NOT commit yet -- proceed to Task 4.

---

### Task 4: Implement AnthropicBackend (TDD -- green)

**Depends on:** Task 3
**Files:** packages/orchestrator/src/agent/backends/anthropic.ts

1. Create `packages/orchestrator/src/agent/backends/anthropic.ts`:

   ```typescript
   import Anthropic from '@anthropic-ai/sdk';
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
   import { AnthropicCacheAdapter } from '@harness-engineering/core';

   export interface AnthropicBackendConfig {
     /** Anthropic model to use. Defaults to 'claude-sonnet-4-20250514'. */
     model?: string;
     /** API key. Defaults to process.env.ANTHROPIC_API_KEY. */
     apiKey?: string;
     /** Maximum output tokens. Defaults to 4096. */
     maxTokens?: number;
   }

   export interface AnthropicSession extends AgentSession {
     systemPrompt?: string;
   }

   export class AnthropicBackend implements AgentBackend {
     readonly name = 'anthropic';
     private config: Required<AnthropicBackendConfig>;
     private client: Anthropic;
     private cacheAdapter: AnthropicCacheAdapter;

     constructor(config: AnthropicBackendConfig = {}) {
       this.config = {
         model: config.model ?? 'claude-sonnet-4-20250514',
         apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
         maxTokens: config.maxTokens ?? 4096,
       };
       this.client = new Anthropic({ apiKey: this.config.apiKey });
       this.cacheAdapter = new AnthropicCacheAdapter();
     }

     async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
       if (!this.config.apiKey) {
         return Err({
           category: 'agent_not_found',
           message: 'ANTHROPIC_API_KEY is not set',
         });
       }

       const session: AnthropicSession = {
         sessionId: `anthropic-session-${Date.now()}`,
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
       const anthropicSession = session as AnthropicSession;

       const systemBlocks = anthropicSession.systemPrompt
         ? [this.cacheAdapter.wrapSystemBlock(anthropicSession.systemPrompt, 'session')]
         : undefined;

       try {
         const stream = await this.client.messages.create({
           model: this.config.model,
           max_tokens: this.config.maxTokens,
           ...(systemBlocks && { system: systemBlocks }),
           messages: [{ role: 'user', content: params.prompt }],
           stream: true,
         });

         for await (const event of stream) {
           if (event.type === 'content_block_delta' && 'text' in event.delta) {
             yield {
               type: 'text',
               timestamp: new Date().toISOString(),
               content: (event.delta as { text: string }).text,
               sessionId: session.sessionId,
             };
           }
         }

         // Extract final usage from the stream
         const finalMessage = await stream.finalMessage();
         const usage = finalMessage.usage as Record<string, number>;
         const cacheUsage = this.cacheAdapter.parseCacheUsage(finalMessage);

         return {
           success: true,
           sessionId: session.sessionId,
           usage: {
             inputTokens: usage.input_tokens ?? 0,
             outputTokens: usage.output_tokens ?? 0,
             totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
             cacheCreationTokens: cacheUsage.cacheCreationTokens,
             cacheReadTokens: cacheUsage.cacheReadTokens,
           },
         };
       } catch (err) {
         const errorMessage = err instanceof Error ? err.message : 'Anthropic request failed';
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
     }

     async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
       return Ok(undefined);
     }

     async healthCheck(): Promise<Result<void, AgentError>> {
       if (!this.config.apiKey) {
         return Err({
           category: 'response_error',
           message: 'ANTHROPIC_API_KEY is not set',
         });
       }
       return Ok(undefined);
     }
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/anthropic.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): add AnthropicBackend with cache_control directives`

---

### Task 5: Wire cache adapter into OpenAIBackend -- test first (TDD -- red)

**Depends on:** Task 1
**Files:** packages/orchestrator/tests/agent/backends/openai.test.ts

1. Add a new test to the existing `runTurn` describe block in `packages/orchestrator/tests/agent/backends/openai.test.ts`:

   ```typescript
   it('includes cacheReadTokens in usage from prompt_tokens_details', async () => {
     const sessionResult = await backend.startSession({
       workspacePath: '/tmp/workspace',
       permissionMode: 'full',
     });
     expect(sessionResult.ok).toBe(true);
     if (!sessionResult.ok) return;

     const session = sessionResult.value;
     const gen = backend.runTurn(session, {
       sessionId: session.sessionId,
       prompt: 'Say hello',
       isContinuation: false,
     });

     let next = await gen.next();
     while (!next.done) {
       next = await gen.next();
     }
     const result = next.value;

     // The mock stream yields prompt_tokens_details.cached_tokens: 20
     expect(result.usage.cacheReadTokens).toBe(20);
     expect(result.usage.cacheCreationTokens).toBe(0);
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts`
3. Observe: test fails because `cacheReadTokens` is undefined on the returned usage.
4. Do NOT commit yet -- proceed to Task 6.

---

### Task 6: Wire cache adapter into OpenAIBackend -- implement (TDD -- green)

**Depends on:** Task 5
**Files:** packages/orchestrator/src/agent/backends/openai.ts

1. Modify `packages/orchestrator/src/agent/backends/openai.ts`:
   - Add import: `import { OpenAICacheAdapter } from '@harness-engineering/core';`
   - Add `private cacheAdapter: OpenAICacheAdapter;` field to the class
   - In constructor, add: `this.cacheAdapter = new OpenAICacheAdapter();`
   - In `runTurn()`, after extracting `chunk.usage`, also extract cache usage:
     ```typescript
     // After the existing usage extraction from chunk.usage:
     let cacheCreationTokens = 0;
     let cacheReadTokens = 0;
     ```
   - In the `if (chunk.usage)` block, add:
     ```typescript
     const cacheUsage = this.cacheAdapter.parseCacheUsage(chunk);
     cacheCreationTokens = cacheUsage.cacheCreationTokens;
     cacheReadTokens = cacheUsage.cacheReadTokens;
     ```
   - In the success return, add the cache fields:
     ```typescript
     return {
       success: true,
       sessionId: session.sessionId,
       usage: {
         inputTokens,
         outputTokens,
         totalTokens,
         cacheCreationTokens,
         cacheReadTokens,
       },
     };
     ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/openai.test.ts`
3. Observe: all tests pass including the new cache assertion.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): wire OpenAICacheAdapter into OpenAIBackend for cache usage extraction`

---

### Task 7: Wire cache adapter into GeminiBackend -- test first (TDD -- red)

**Depends on:** Task 1
**Files:** packages/orchestrator/tests/agent/backends/gemini.test.ts

1. Add a new test to the existing `runTurn` describe block in `packages/orchestrator/tests/agent/backends/gemini.test.ts`:

   ```typescript
   it('includes cacheReadTokens in usage from cachedContentTokenCount', async () => {
     const sessionResult = await backend.startSession({
       workspacePath: '/tmp/workspace',
       permissionMode: 'full',
     });
     expect(sessionResult.ok).toBe(true);
     if (!sessionResult.ok) return;

     const session = sessionResult.value;
     const gen = backend.runTurn(session, {
       sessionId: session.sessionId,
       prompt: 'Say hello',
       isContinuation: false,
     });

     let next = await gen.next();
     while (!next.done) {
       next = await gen.next();
     }
     const result = next.value;

     // The mock stream yields cachedContentTokenCount: 15
     expect(result.usage.cacheReadTokens).toBe(15);
     expect(result.usage.cacheCreationTokens).toBe(0);
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/gemini.test.ts`
3. Observe: test fails because `cacheReadTokens` is undefined.
4. Do NOT commit yet -- proceed to Task 8.

---

### Task 8: Wire cache adapter into GeminiBackend -- implement (TDD -- green)

**Depends on:** Task 7
**Files:** packages/orchestrator/src/agent/backends/gemini.ts

1. Modify `packages/orchestrator/src/agent/backends/gemini.ts`:
   - Add import: `import { GeminiCacheAdapter } from '@harness-engineering/core';`
   - Add `private cacheAdapter: GeminiCacheAdapter;` field to the class
   - In constructor, add: `this.cacheAdapter = new GeminiCacheAdapter();`
   - In `runTurn()`, add variables after the existing ones:
     ```typescript
     let cacheCreationTokens = 0;
     let cacheReadTokens = 0;
     ```
   - In the `if (chunk.usageMetadata)` block, add:
     ```typescript
     const cacheUsage = this.cacheAdapter.parseCacheUsage(chunk);
     cacheCreationTokens = cacheUsage.cacheCreationTokens;
     cacheReadTokens = cacheUsage.cacheReadTokens;
     ```
   - In the success return, add the cache fields:
     ```typescript
     return {
       success: true,
       sessionId: session.sessionId,
       usage: {
         inputTokens,
         outputTokens,
         totalTokens,
         cacheCreationTokens,
         cacheReadTokens,
       },
     };
     ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/agent/backends/gemini.test.ts`
3. Observe: all tests pass including the new cache assertion.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): wire GeminiCacheAdapter into GeminiBackend for cache usage extraction`

---

### Task 9: Propagate cache usage through AgentRunner

**Depends on:** Task 1
**Files:** packages/orchestrator/src/agent/runner.ts

1. Modify `packages/orchestrator/src/agent/runner.ts`:
   - In the `lastResult` initialization (line 41-44), add cache fields to the default usage:
     ```typescript
     let lastResult: TurnResult = {
       success: false,
       sessionId: session.sessionId,
       usage: {
         inputTokens: 0,
         outputTokens: 0,
         totalTokens: 0,
         cacheCreationTokens: 0,
         cacheReadTokens: 0,
       },
     };
     ```
   - No other changes needed -- `TurnResult.usage` already propagates whatever the backend returns since `lastResult = next.value` (line 65) captures the full backend return including new fields.

2. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/`
3. Observe: all existing tests pass. The runner simply passes through the usage object from backends.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): initialize cache usage fields in AgentRunner default usage`

---

### Task 10: Wire AnthropicBackend into orchestrator factory and exports

**Depends on:** Task 4
**Files:** packages/orchestrator/src/orchestrator.ts, packages/orchestrator/src/index.ts

1. Modify `packages/orchestrator/src/orchestrator.ts`:
   - Add import at the top: `import { AnthropicBackend } from './agent/backends/anthropic';`
   - In `createBackend()`, add a new case before the `throw` statement:
     ```typescript
     } else if (this.config.agent.backend === 'anthropic') {
       return new AnthropicBackend({
         ...(this.config.agent.model !== undefined && { model: this.config.agent.model }),
         ...(this.config.agent.apiKey !== undefined && { apiKey: this.config.agent.apiKey }),
       });
     }
     ```

2. Modify `packages/orchestrator/src/index.ts`:
   - Add export line: `export * from './agent/backends/anthropic';`

3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/orchestrator/tsconfig.json`
4. Observe: no type errors.
5. Run: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/orchestrator/tests/`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(orchestrator): register AnthropicBackend in createBackend factory and exports`

---

## Traceability

| Observable Truth                       | Delivered by                                           |
| -------------------------------------- | ------------------------------------------------------ |
| 1. Anthropic cache_control in requests | Task 3, Task 4                                         |
| 2. OpenAI content ordering             | Task 6 (adapter already orders; wiring confirms usage) |
| 3. Gemini cachedContents reference     | Task 8 (adapter already wraps; wiring confirms usage)  |
| 4. TurnResult includes cache fields    | Task 4, Task 6, Task 8                                 |
| 5. TokenUsage extended                 | Task 1                                                 |
| 6. AgentRunner propagates cache fields | Task 9                                                 |
| 7. createBackend handles 'anthropic'   | Task 10                                                |
| 8. Anthropic tests pass                | Task 3, Task 4                                         |
| 9. Existing tests pass                 | Task 6, Task 8, Task 10                                |
| 10. harness validate passes            | Every task                                             |
