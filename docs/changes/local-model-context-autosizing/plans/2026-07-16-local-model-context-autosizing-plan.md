# Plan: Autosize context/output for the OllamaBackend via native /api/chat

**Date:** 2026-07-16 | **Spec:** `docs/changes/local-model-context-autosizing/proposal.md` | **Tasks:** 12 | **Time:** ~50 min | **Integration Tier:** medium

## Goal

Migrate `OllamaBackend`'s model call from Ollama's OpenAI-compat `/v1/chat/completions` to native `/api/chat` (honors `num_ctx`/`think`/`keep_alive`), autosize `num_ctx` from model-max + a hardware cap, and retire the `/no_think` hack for native `think:false` — keeping the agentic tool loop byte-identical.

## Observable Truths (Acceptance Criteria)

1. **SC1** — When `callModel` runs, the system shall POST `${base}/api/chat` (trailing `/v1` stripped from `endpoint`), never `/v1/chat/completions`, with a body carrying `options.num_ctx`, `keep_alive`, and — when `disableReasoning` — `think:false`. Assert on the captured request body (URL + JSON body).
2. **SC2** — When the native response returns `message.tool_calls[].function.arguments` as an object with no `id`, the system shall normalize it into the internal `OllamaChatResponse`/`ToolCall` shape (`{choices:[{message}]}`, args JSON-stringified, synthetic `call_<n>` id) so `runTurn`/`runModelStep`/`dispatchToolCall`/`runToolCalls` drive the loop unchanged — a native `tool_calls` turn executes the tool and appends the `tool` message.
3. **SC3** — `resolveNumCtx` shall return the `numCtx` override when set; else `min(modelMax from /api/show, maxContextTokens ?? DEFAULT_AUTO_CTX)`; an `/api/show` failure shall fall back to `DEFAULT_AUTO_CTX` (16384). Unit tests at each branch.
4. **SC4** — Usage totals shall come from native `prompt_eval_count`/`eval_count` mapped to `usage.prompt_tokens`/`completion_tokens`; token accounting across turns unchanged.
5. **SC5** — The ` /no_think` user-message append shall be gone and `think:false` shall ride the `/api/chat` body when `disableReasoning` is set.
6. **SC6** — All pre-existing OllamaBackend + MCP tests (aggregation, curation, heartbeat, graceful skip, TASK_COMPLETE completion, path traversal, stopSession, healthCheck) shall pass against the native transport — behavior identical except wire format + `num_ctx`.

## File Map

- MODIFY `packages/orchestrator/src/agent/backends/ollama.ts` — native transport (`callModel`), `fromNativeResponse` + `toNativeMessages` free functions, `resolveNumCtx`, config fields, `think:false`, `num_predict`/`keep_alive`, retire `/no_think`
- MODIFY `packages/orchestrator/tests/agent/backends/ollama.test.ts` — migrate mocks to native shape + assert request body; add native-normalization, resolveNumCtx, usage-mapping, think:false tests
- MODIFY `packages/orchestrator/tests/agent/backends/ollama-mcp.test.ts` — migrate mocks to native shape
- MODIFY `packages/types/src/orchestrator.ts` — `OllamaBackendDef`: `numCtx?`, `maxContextTokens?`, `numPredict?`, `keepAlive?`
- MODIFY `packages/orchestrator/src/workflow/schema.ts` — ollama Zod variant: 4 new optional fields
- MODIFY `packages/orchestrator/tests/workflow/schema.test.ts` — accept the new fields
- MODIFY `packages/orchestrator/src/agent/backend-factory.ts` — `maxContextTokens` seam: memory→context helper + `detectHardware` wiring in `createOllamaBackend`
- MODIFY `packages/orchestrator/tests/agent/backend-factory.test.ts` — new-field propagation
- MODIFY `docs/guides/multi-backend-routing.md` — native transport, `num_ctx` autosizing, `think` note
- CREATE `.changeset/<generated>.md` — orchestrator + types minor

## Migration surface (verified against code — the silent-breakage risk)

The internal `OllamaChatResponse` (`ollama.ts:949`) is `{ choices:[{ message }], usage }`; `runModelStep` reads `response.choices[0]?.message` (`:596`) and `response.usage` (`:604`). Native `/api/chat` returns `{ message, prompt_eval_count, eval_count, done }` — **no `choices` array**, tool-call `arguments` an **object**, **no `id`**, usage under different keys. The entire format delta is contained in two free functions so the reviewed tool loop needs ZERO changes:

- `fromNativeResponse(native) → OllamaChatResponse`: wrap `native.message` into `{ choices:[{ message:{ content, tool_calls } }] }`; per tool-call `JSON.stringify(function.arguments)` + synthesize `id: call_<n>`; map `{ prompt_eval_count, eval_count }` → `usage:{ prompt_tokens, completion_tokens }`.
- `toNativeMessages(messages) → NativeMessage[]`: for each stored `ChatMessage`, convert assistant `tool_calls` args string→object; convert `{ role:'tool', tool_call_id, content }` → `{ role:'tool', content, tool_name }` (tool_name recovered from the matching assistant tool_call by id, or the tool-call name; there is no native id).

**Existing tests requiring mock migration (all assume `/v1` URL + `{choices:[{message}]}` OpenAI shape via the shared `chatResponse()`/`okFetch()` helpers):**

`ollama.test.ts` — the module-local `chatResponse()` builder (`:9`) + these cases:

- `executes a bash tool call then stops on a plain final message` (`:122`)
- `sends only the 3 built-in tools when mcpServers is unset (SC1)` (`:195`)
- `appends /no_think to the user turn when disableReasoning is set` (`:222`) — **rewritten** to assert `think:false` in body, no `/no_think`
- `does NOT append /no_think when disableReasoning is unset` (`:244`) — **rewritten** to assert no `think` / `think` omitted
- `emits heartbeat status events while a slow model call is pending` (`:266`)
- `does not hang on a command that reads stdin` (`:298`)
- `kills a bash command that exceeds bashTimeoutMs` (`:333`)
- `surfaces failure on a non-200 HTTP response` (`:369`)
- `calls onModelFailed on failure and onModelUsed on success` (`:400`)
- premature-stop trio: `WITHOUT TASK_COMPLETE → success:false` (`:429`), `WITH TASK_COMPLETE → success:true` (`:454`), `TASK_COMPLETED substring` (`:478`)
- `stopSession aborts the loop between iterations` (`:504`)
- path-traversal: `rejects write_file escape` (`:542`), `rejects read_file escape` (`:585`)
- `healthCheck` returns Ok on 200 from `/models` (`:626`) — **untouched** (probe stays on `/v1`, verify no regression)

`ollama-mcp.test.ts` — the module-local `chatResponse()` builder (`:23`) + these cases:

- `exposes a configured server tool namespaced (SC2)` (`:163`) — no fetch, verify unaffected
- `forwards a model tool_call to callTool and appends the text result (SC3)` (`:180`)
- `skips a failing server with a warning and keeps built-ins usable (SC4)` (`:216`)
- `emits namespaced start/end events for an MCP tool call (SC5)` (`:262`)
- `heartbeat-wraps a slow MCP call (SC5)` (`:294`)
- `connects with cwd = workspacePath ... (SC6)` (`:327`) — no fetch, verify unaffected
- allowlist trio (`:359`, `:374`, `:391`) — no fetch, verify unaffected
- `fires exactly one large-tool-set warning (SC5)` (`:410`) — no fetch, verify unaffected

Migration mechanics: update each file's `chatResponse()` helper to emit native shape `{ message:{ content, tool_calls:[{ function:{ name, arguments:<OBJECT> } }] }, prompt_eval_count, eval_count, done:true }` (drop the `id`; args as object), and where a test reads a `tool` message's `tool_call_id` (e.g. `ollama.test.ts:175`, `ollama-mcp.test.ts:212/255`) assert on the SYNTHESIZED id (`call_0`, `call_1`, …) since native has none.

## Skeleton

Phase 1 — Native transport + mock migration (~5 tasks, ~22 min)
Phase 2 — Autosizing + reasoning + budget + docs (~7 tasks, ~28 min)
**Estimated total:** 12 tasks, ~50 min.
_Skeleton approved: pending._

---

## Tasks

### Task 1: Native round-trip test for `fromNativeResponse` + `toNativeMessages` (FIRST — risk mitigation)

**Depends on:** none | **Files:** `packages/orchestrator/tests/agent/backends/ollama.test.ts`

Getting native tool-call normalization wrong SILENTLY breaks the tool loop, so pin it with a direct unit test before touching `callModel`. Export the two helpers from `ollama.ts` for testing (add to Task 2; this test drives their signature).

1. In `ollama.test.ts`, add a `describe('native transport normalization')` block importing `fromNativeResponse, toNativeMessages` from `../../../src/agent/backends/ollama`:

   ```ts
   import { fromNativeResponse, toNativeMessages } from '../../../src/agent/backends/ollama';

   describe('native transport normalization', () => {
     it('normalizes a native tool-call turn into internal OllamaChatResponse shape', () => {
       const native = {
         message: {
           role: 'assistant',
           content: '',
           tool_calls: [
             { function: { name: 'bash', arguments: { command: 'echo hi' } } },
             { function: { name: 'read_file', arguments: { path: 'a.txt' } } },
           ],
         },
         prompt_eval_count: 30,
         eval_count: 5,
         done: true,
       };
       const r = fromNativeResponse(native);
       const msg = r.choices[0]!.message!;
       expect(msg.tool_calls).toHaveLength(2);
       expect(msg.tool_calls![0]).toEqual({
         id: 'call_0',
         type: 'function',
         function: { name: 'bash', arguments: JSON.stringify({ command: 'echo hi' }) },
       });
       expect(msg.tool_calls![1]!.id).toBe('call_1');
       expect(r.usage).toEqual({ prompt_tokens: 30, completion_tokens: 5 });
     });

     it('normalizes a plain text turn (no tool_calls) and omits usage keys when absent', () => {
       const r = fromNativeResponse({
         message: { role: 'assistant', content: 'TASK_COMPLETE' },
         done: true,
       });
       expect(r.choices[0]!.message!.content).toBe('TASK_COMPLETE');
       expect(r.choices[0]!.message!.tool_calls).toBeUndefined();
       expect(r.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0 });
     });

     it('builds native messages: assistant tool_calls args string→object, tool msg → {role,content,tool_name}', () => {
       const internal = [
         { role: 'system' as const, content: 'sys' },
         { role: 'user' as const, content: 'go' },
         {
           role: 'assistant' as const,
           content: '',
           tool_calls: [
             {
               id: 'call_0',
               type: 'function',
               function: { name: 'bash', arguments: '{"command":"ls"}' },
             },
           ],
         },
         { role: 'tool' as const, tool_call_id: 'call_0', content: 'file listing' },
       ];
       const native = toNativeMessages(internal);
       const asst = native[2] as {
         tool_calls: Array<{ function: { name: string; arguments: unknown } }>;
       };
       expect(asst.tool_calls[0]!.function.arguments).toEqual({ command: 'ls' });
       expect(native[3]).toEqual({ role: 'tool', content: 'file listing', tool_name: 'bash' });
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test ollama.test.ts` — observe failure (helpers not exported).
3. Commit: `test(orchestrator): pin native ollama normalization round-trip`

---

### Task 2: Implement `fromNativeResponse` + `toNativeMessages` free functions

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

Extract the format delta as pure free functions (keeps `callModel` complexity low — watch check-arch). Add a `NativeChatResponse`/`NativeMessage` type.

1. In `ollama.ts`, add after the `ToolCall` interface (`:131`):
   ```ts
   /** A native `/api/chat` message. Tool-call args are OBJECTS; tool results carry `tool_name` (no id). */
   interface NativeToolCall {
     function: { name: string; arguments: Record<string, unknown> };
   }
   interface NativeMessage {
     role: 'system' | 'user' | 'assistant' | 'tool';
     content: string;
     tool_calls?: NativeToolCall[];
     tool_name?: string;
   }
   /** Native `/api/chat` non-stream response shape. */
   interface NativeChatResponse {
     message?: { role?: string; content?: string | null; tool_calls?: NativeToolCall[] };
     prompt_eval_count?: number;
     eval_count?: number;
     done?: boolean;
     done_reason?: string;
   }
   ```
2. Add the two free functions near the other module-level helpers (after `resolveModelName`, `:249`), EXPORTED:

   ```ts
   /**
    * Normalize a native `/api/chat` response into the internal
    * {@link OllamaChatResponse} shape so the reviewed tool loop is unchanged:
    * wrap `message` into `choices[0]`, JSON.stringify each tool-call's object
    * arguments, synthesize a stable `id` (`call_<n>` — native provides none), and
    * map `prompt_eval_count`/`eval_count` → `usage.prompt_tokens`/`completion_tokens`.
    */
   export function fromNativeResponse(native: NativeChatResponse): OllamaChatResponse {
     const nm = native.message;
     const toolCalls: ToolCall[] | undefined = nm?.tool_calls?.map((tc, i) => ({
       id: `call_${i}`,
       type: 'function',
       function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments ?? {}) },
     }));
     const message: { content?: string | null; tool_calls?: ToolCall[] } = {
       content: nm?.content ?? '',
       ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
     };
     return {
       choices: [{ message }],
       usage: {
         prompt_tokens: native.prompt_eval_count ?? 0,
         completion_tokens: native.eval_count ?? 0,
       },
     };
   }

   /**
    * Convert internal conversation messages (OpenAI-shaped, args-as-string) to
    * native `/api/chat` messages: assistant `tool_calls` arguments string→object;
    * `tool` messages → `{ role:'tool', content, tool_name }` (the tool name is
    * recovered from the assistant tool-call matching `tool_call_id`).
    */
   export function toNativeMessages(messages: ChatMessage[]): NativeMessage[] {
     const nameById = new Map<string, string>();
     for (const m of messages) {
       for (const tc of m.tool_calls ?? []) nameById.set(tc.id, tc.function.name);
     }
     return messages.map((m) => {
       if (m.role === 'tool') {
         const toolName = m.tool_call_id ? nameById.get(m.tool_call_id) : undefined;
         return { role: 'tool', content: m.content, ...(toolName ? { tool_name: toolName } : {}) };
       }
       if (m.tool_calls && m.tool_calls.length > 0) {
         return {
           role: m.role,
           content: m.content,
           tool_calls: m.tool_calls.map((tc) => ({
             function: { name: tc.function.name, arguments: safeParseArgs(tc.function.arguments) },
           })),
         };
       }
       return { role: m.role, content: m.content };
     });
   }

   /** Parse a JSON tool-argument string to an object; `{}` on malformed input. */
   function safeParseArgs(argsJson: string): Record<string, unknown> {
     try {
       const v = JSON.parse(argsJson) as unknown;
       return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
     } catch {
       return {};
     }
   }
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator test ollama.test.ts` — Task 1's normalization block passes (other cases still fail until Task 3).
4. Run: `node packages/cli/dist/bin/harness.js check-deps`
5. Commit: `feat(orchestrator): native ollama response/request normalizers`

---

### Task 3: Wire `callModel` to POST native `/api/chat`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

Swap the transport only. Preserve the AbortController/timeout/heartbeat/error wiring byte-identical (`:730`–`:772`). Autosizing fields land in Phase 2 — for now send `options` empty (or omit) and no `think`/`keep_alive`.

1. Add a private base-URL helper on the class (or module free fn):
   ```ts
   /** Native base = endpoint with a trailing `/v1` stripped (probe stays on `/v1`). */
   private nativeBase(): string {
     return this.endpoint.replace(/\/v1\/?$/, '');
   }
   ```
2. In `callModel`, replace the `fetch(`${this.endpoint}/chat/completions`, …)` block (`:745`–`:762`) with:

   ```ts
   const res = await fetch(`${this.nativeBase()}/api/chat`, {
     method: 'POST',
     headers,
     body: JSON.stringify({
       model: session.resolvedModel,
       messages: toNativeMessages(session.messages),
       tools: [...(TOOL_SCHEMAS as unknown as OpenAITool[]), ...session.mcpTools],
       stream: false,
     }),
     signal: controller.signal,
   });

   if (!res.ok) {
     const body = await res.text().catch(() => '');
     throw new Error(`Ollama HTTP ${res.status} ${res.statusText}: ${truncate(body)}`);
   }

   return fromNativeResponse((await res.json()) as NativeChatResponse);
   ```

3. Run: `pnpm --filter @harness-engineering/orchestrator test ollama.test.ts` — remaining cases still fail (mocks still native-less); the bash/tool-loop cases will pass only after Task 4 migrates mocks. That is expected; do NOT tweak the loop.
4. Run: `node packages/cli/dist/bin/harness.js check-deps`
5. Commit: `feat(orchestrator): route ollama callModel through native /api/chat`

---

### Task 4: Migrate `ollama.test.ts` mocks to native shape + assert request

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/agent/backends/ollama.test.ts`

Rewrite the module-local `chatResponse()` helper (`:9`) to emit native shape; fix the two spots that read `tool_call_id` to expect the synthesized `call_<n>` id; add SC1 request-body assertions.

1. Replace the `chatResponse()` helper with a native builder:
   ```ts
   /** Build a canned NATIVE /api/chat response with optional tool calls. */
   function chatResponse(opts: {
     content?: string;
     toolCalls?: Array<{ name: string; args: unknown }>;
     usage?: { prompt_tokens?: number; completion_tokens?: number };
   }) {
     const message: Record<string, unknown> = { role: 'assistant', content: opts.content ?? '' };
     if (opts.toolCalls) {
       message.tool_calls = opts.toolCalls.map((tc) => ({
         function: { name: tc.name, arguments: tc.args },
       }));
     }
     return {
       message,
       done: true,
       ...(opts.usage?.prompt_tokens !== undefined
         ? { prompt_eval_count: opts.usage.prompt_tokens }
         : {}),
       ...(opts.usage?.completion_tokens !== undefined
         ? { eval_count: opts.usage.completion_tokens }
         : {}),
     };
   }
   ```
2. Drop the `id:` field from every `toolCalls: [...]` literal in this file (native has none). Update the two `tool_call_id` assertions to the synthesized id:
   - `:175` `expect(toolMsg!.tool_call_id).toBe('call-1')` → `toBe('call_0')`
   - The bash-loop `chatResponse` at `:130` no longer needs `id`.
3. In the `executes a bash tool call` case (`:122`), the usage-total assertions (input 70 / output 8 / total 78) stay valid since `chatResponse` now feeds `prompt_eval_count`/`eval_count`.
4. Add an SC1 request-body test:
   ```ts
   it('POSTs native /api/chat with stripped base and native tool schema (SC1)', async () => {
     let calledUrl = '';
     let body: any;
     const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
       calledUrl = url;
       body = JSON.parse(init.body as string);
       return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
     });
     vi.stubGlobal('fetch', fetchMock);
     const backend = new OllamaBackend(baseConfig); // endpoint ends in /v1
     const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
     if (!start.ok) return;
     await drain(
       backend.runTurn(start.value, {
         sessionId: start.value.sessionId,
         prompt: 'go',
         isContinuation: false,
       })
     );
     expect(calledUrl).toBe('http://127.0.0.1:11434/api/chat');
     expect(calledUrl).not.toContain('/chat/completions');
     expect(body.stream).toBe(false);
     // tool schema unchanged (function shape)
     expect(body.tools[0].function.name).toBe('bash');
   });
   ```
5. Run: `pnpm --filter @harness-engineering/orchestrator test ollama.test.ts` — all cases green EXCEPT the two `/no_think` cases (`:222`, `:244`) which Task 9 rewrites. Leave them failing/skipped with a `// TODO(Task 9): think:false` note, or temporarily `it.skip`.
6. Commit: `test(orchestrator): migrate ollama.test mocks to native /api/chat`

---

### Task 5: Migrate `ollama-mcp.test.ts` mocks to native shape

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/agent/backends/ollama-mcp.test.ts`

Same `chatResponse()` rewrite; fix the two synthesized-id assertions.

1. Replace the module-local `chatResponse()` (`:23`) with the native builder from Task 4 (drop `id` from the tool-call param type; args as object).
2. Drop `id:` from every `toolCalls: [...]` literal. Update:
   - `:212` `expect(toolMsg!.tool_call_id).toBe('c1')` → `toBe('call_0')`
   - `:255` `session.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'b1')` → `=== 'call_0'`
3. Run: `pnpm --filter @harness-engineering/orchestrator test ollama-mcp.test.ts` — all green.
4. Run: `node packages/cli/dist/bin/harness.js check-deps`
5. Commit: `test(orchestrator): migrate ollama-mcp.test mocks to native /api/chat`

---

### Task 6: `[checkpoint:human-verify]` — Prove the tool loop drives under native transport

**Depends on:** Task 5 | **Files:** (none — verification gate)

The transport migration is the highest-risk change; native tool-call normalization silently breaks the loop if wrong. Pause here so a human confirms the full ollama suite is green before autosizing lands on top.

1. Run: `pnpm --filter @harness-engineering/orchestrator test ollama` (both `ollama.test.ts` and `ollama-mcp.test.ts`).
2. Show the pass count. Confirm: the bash tool-loop case ran a real tool + appended a `tool` message, MCP forwarding works, premature-stop/TASK_COMPLETE semantics intact, heartbeats emitted, usage totals correct.
3. **[checkpoint:human-verify]** — Human confirms Phase 1 (SC2/SC4/SC6, transport half of SC1) is green before proceeding. If the loop is broken, STOP and fix normalization — do not proceed to Phase 2.

---

### Task 7: Add config fields to `OllamaBackendConfig`, `OllamaBackendDef`, Zod variant, schema test

**Depends on:** Task 6 | **Files:** `packages/types/src/orchestrator.ts`, `packages/orchestrator/src/workflow/schema.ts`, `packages/orchestrator/src/agent/backends/ollama.ts`, `packages/orchestrator/tests/workflow/schema.test.ts`

Add `numCtx?`, `maxContextTokens?`, `numPredict?`, `keepAlive?` (all optional) across the three declaration sites, TDD via the schema test.

1. In `schema.test.ts`, add a case asserting a valid ollama def with all four new fields parses, and that a negative `numCtx` is rejected (matches the `.int().positive()` guard). Run it — observe failure (schema rejects unknown keys via `.strict()`).
2. `types/src/orchestrator.ts` `OllamaBackendDef` (`:631`) — add after `disableReasoning`:
   ```ts
   /** Explicit context-window override (tokens). Set ⇒ autosizing is skipped. */
   numCtx?: number;
   /** Hardware-derived context cap (tokens) injected by the orchestrator wiring; the backend never imports local-models. */
   maxContextTokens?: number;
   /** Output-token budget (`num_predict`). Unset ⇒ model default. */
   numPredict?: number;
   /** Keep the sized model warm between turns (`keep_alive`). Default `'10m'`. */
   keepAlive?: string;
   ```
3. `workflow/schema.ts` ollama variant (`:180`–`:192`) — add before `capabilities`:
   ```ts
   numCtx: z.number().int().positive().optional(),
   maxContextTokens: z.number().int().positive().optional(),
   numPredict: z.number().int().positive().optional(),
   keepAlive: z.string().optional(),
   ```
4. `ollama.ts` `OllamaBackendConfig` (`:28`) — add the same four optional fields with JSDoc mirroring the def.
5. Run: `pnpm --filter @harness-engineering/orchestrator test schema.test.ts` — green.
6. Run: `node packages/cli/dist/bin/harness.js check-deps`
7. Commit: `feat(types,orchestrator): ollama numCtx/maxContextTokens/numPredict/keepAlive config`

---

### Task 8: Implement `resolveNumCtx` + cache on session at `startSession` (TDD)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`, `packages/orchestrator/tests/agent/backends/ollama.test.ts`

D3: `numCtx` override wins; else `min(modelMax from /api/show, maxContextTokens ?? DEFAULT_AUTO_CTX)`; `/api/show` failure ⇒ `DEFAULT_AUTO_CTX`. Store `session.numCtx`.

1. Add tests (native `/api/show` mocked via `fetch`):
   ```ts
   describe('resolveNumCtx (SC3)', () => {
     const showResp = (ctx: number) => okFetch({ model_info: { 'qwen3.context_length': ctx } });
     it('honors numCtx override without querying /api/show', async () => {
       const fetchMock = vi.fn();
       vi.stubGlobal('fetch', fetchMock);
       const backend = new OllamaBackend({ ...baseConfig, numCtx: 4096 });
       const start = await backend.startSession({
         workspacePath: workspace,
         permissionMode: 'full',
       });
       if (!start.ok) return;
       expect((start.value as any).numCtx).toBe(4096);
       expect(fetchMock).not.toHaveBeenCalled();
     });
     it('picks min(modelMax, maxContextTokens)', async () => {
       vi.stubGlobal('fetch', vi.fn().mockResolvedValue(showResp(262144)));
       const backend = new OllamaBackend({ ...baseConfig, maxContextTokens: 32768 });
       const start = await backend.startSession({
         workspacePath: workspace,
         permissionMode: 'full',
       });
       if (!start.ok) return;
       expect((start.value as any).numCtx).toBe(32768);
     });
     it('uses modelMax when smaller than cap', async () => {
       vi.stubGlobal('fetch', vi.fn().mockResolvedValue(showResp(8192)));
       const backend = new OllamaBackend({ ...baseConfig, maxContextTokens: 32768 });
       const start = await backend.startSession({
         workspacePath: workspace,
         permissionMode: 'full',
       });
       if (!start.ok) return;
       expect((start.value as any).numCtx).toBe(8192);
     });
     it('falls back to DEFAULT_AUTO_CTX (16384) on /api/show failure', async () => {
       vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
       const backend = new OllamaBackend(baseConfig);
       const start = await backend.startSession({
         workspacePath: workspace,
         permissionMode: 'full',
       });
       if (!start.ok) return;
       expect((start.value as any).numCtx).toBe(16384);
     });
   });
   ```
   Run — observe failure.
2. In `ollama.ts`: add `const DEFAULT_AUTO_CTX = 16384;` near the other constants; add `numCtx: number` to `OllamaSession`; add a private `resolveNumCtx`:

   ```ts
   /** D3: resolve the session's num_ctx once at startSession (override | min(modelMax, cap) | default). */
   private async resolveNumCtx(model: string): Promise<number> {
     if (this.config.numCtx !== undefined) return this.config.numCtx;
     const cap = this.config.maxContextTokens ?? DEFAULT_AUTO_CTX;
     const modelMax = await this.fetchModelMax(model);
     return Math.min(modelMax ?? DEFAULT_AUTO_CTX, cap);
   }

   /** POST /api/show and read the first `model_info` key ending `.context_length`; null on any failure. */
   private async fetchModelMax(model: string): Promise<number | null> {
     try {
       const headers: Record<string, string> = { 'Content-Type': 'application/json' };
       if (this.config.apiKey !== undefined) headers.Authorization = `Bearer ${this.config.apiKey}`;
       const res = await fetch(`${this.nativeBase()}/api/show`, {
         method: 'POST', headers, body: JSON.stringify({ model }),
       });
       if (!res.ok) return null;
       const json = (await res.json()) as { model_info?: Record<string, unknown> };
       const info = json.model_info ?? {};
       const key = Object.keys(info).find((k) => k.endsWith('.context_length'));
       const val = key ? info[key] : undefined;
       return typeof val === 'number' ? val : null;
     } catch {
       return null;
     }
   }
   ```

3. In `startSession` (`:459`), after building `session`, before returning: `session.numCtx = await this.resolveNumCtx(resolvedModel);` (set the field on the typed `OllamaSession`).
4. Run: `pnpm --filter @harness-engineering/orchestrator test ollama.test.ts` — green.
5. Run: `node packages/cli/dist/bin/harness.js check-deps`
6. Commit: `feat(orchestrator): autosize ollama num_ctx via /api/show at startSession`

---

### Task 9: Wire `num_ctx`/`num_predict`/`keep_alive` into `callModel`; retire `/no_think` for `think:false` (TDD)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`, `packages/orchestrator/tests/agent/backends/ollama.test.ts`

D4/D5/D6. Rewrite the two `/no_think` tests from Task 4 into `think` assertions, and assert `options.num_ctx`/`keep_alive` on the SC1 body.

1. Rewrite the two Task-4-skipped cases:

   ```ts
   it('sends think:false in the /api/chat body when disableReasoning is set (SC5)', async () => {
     let body: any;
     vi.stubGlobal(
       'fetch',
       vi.fn(async (_u, init: RequestInit) => {
         body = JSON.parse(init.body as string);
         return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
       })
     );
     const backend = new OllamaBackend({ ...baseConfig, disableReasoning: true });
     const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
     if (!start.ok) return;
     await drain(
       backend.runTurn(start.value, {
         sessionId: start.value.sessionId,
         prompt: 'do it',
         isContinuation: false,
       })
     );
     expect(body.think).toBe(false);
     const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
     const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
     expect(lastUser?.content).toBe('do it'); // no /no_think append
   });

   it('omits think when disableReasoning is unset (SC5)', async () => {
     let body: any;
     vi.stubGlobal(
       'fetch',
       vi.fn(async (_u, init: RequestInit) => {
         body = JSON.parse(init.body as string);
         return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
       })
     );
     const backend = new OllamaBackend(baseConfig);
     const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
     if (!start.ok) return;
     await drain(
       backend.runTurn(start.value, {
         sessionId: start.value.sessionId,
         prompt: 'do it',
         isContinuation: false,
       })
     );
     expect(body.think).toBeUndefined();
   });
   ```

   Extend the SC1 body test (Task 4) to also assert `body.options.num_ctx` (== resolved) and `body.keep_alive === '10m'`.
   Run — observe failure.

2. In `runTurn` (`:553`), remove the `/no_think` branch — always `const userContent = params.prompt;`.
3. Add a `DEFAULT_KEEP_ALIVE = '10m'` constant. In `callModel`, extend the request body:
   ```ts
   body: JSON.stringify({
     model: session.resolvedModel,
     messages: toNativeMessages(session.messages),
     tools: [...(TOOL_SCHEMAS as unknown as OpenAITool[]), ...session.mcpTools],
     stream: false,
     keep_alive: this.config.keepAlive ?? DEFAULT_KEEP_ALIVE,
     ...(this.config.disableReasoning ? { think: false } : {}),
     options: {
       num_ctx: session.numCtx,
       ...(this.config.numPredict !== undefined ? { num_predict: this.config.numPredict } : {}),
     },
   }),
   ```
4. Run: `pnpm --filter @harness-engineering/orchestrator test ollama` — all green (both files).
5. Update the doc comment on `OllamaBackendConfig.disableReasoning` (`:60`) to describe native `think:false` instead of `/no_think`.
6. Run: `node packages/cli/dist/bin/harness.js check-deps`
7. Commit: `feat(orchestrator): ollama think:false + num_ctx/num_predict/keep_alive body (retire /no_think)`

---

### Task 10: `maxContextTokens` factory seam — memory→context helper + `detectHardware` wiring (TDD)

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/agent/backend-factory.ts`, `packages/orchestrator/tests/agent/backend-factory.test.ts`

The backend never imports `local-models`; the factory (which already may) populates `maxContextTokens` from `detectHardware()` via a small pure tiered helper. Keep `createBackend` synchronous — compute the cap lazily/injected, or make the helper pure over a passed profile so the factory test can drive it without shelling out.

1. In `backend-factory.test.ts`, add a case importing the pure helper (export it) and asserting the tiers:
   ```ts
   import { contextCapFromMemoryGb } from '../../src/agent/backend-factory.js';
   it('maps a generous machine to a high context cap and a small one to a low cap', () => {
     expect(contextCapFromMemoryGb(128)).toBeGreaterThanOrEqual(131072); // modelMax wins
     expect(contextCapFromMemoryGb(8)).toBeLessThanOrEqual(16384); // small → conservative
     expect(contextCapFromMemoryGb(32)).toBeGreaterThan(16384);
   });
   it('propagates numCtx/numPredict/keepAlive to OllamaBackend when set', () => {
     const def: BackendDef = {
       type: 'ollama',
       endpoint: 'http://x/v1',
       model: 'm',
       numCtx: 4096,
       numPredict: 512,
       keepAlive: '5m',
     };
     expect(createBackend(def)).toBeInstanceOf(OllamaBackend);
   });
   ```
   Run — observe failure.
2. In `backend-factory.ts`, add the pure helper (conservative tiers, VRAM/unified-memory in GiB → context-token cap; a generous machine returns a cap ≥ any realistic `modelMax` so `min` picks `modelMax`):
   ```ts
   /**
    * Conservative memory→context-cap heuristic (tokens). A generous machine gets a
    * cap high enough that `modelMax` always wins; a constrained one gets a low cap
    * so `num_ctx` is sized down instead of loading the model's full declared window.
    */
   export function contextCapFromMemoryGb(memGb: number): number {
     if (memGb >= 64) return 262144;
     if (memGb >= 32) return 65536;
     if (memGb >= 16) return 32768;
     return 16384;
   }
   ```
3. Wire `detectHardware` into `createOllamaBackend`. Because `detect` is async and `createBackend` is sync, resolve the cap up-front where backends are constructed OR expose an async seam. Preferred minimal approach: import `detectHardware` from `@harness-engineering/local-models` (already an orchestrator dep) and compute the cap from the larger of `vramGb`/`ramGb` behind a best-effort try/catch, threaded via an optional `CreateBackendOptions.hardwareMemoryGb` the orchestrator can prefill; when absent, omit `maxContextTokens` (backend then defaults the cap to `DEFAULT_AUTO_CTX`). Add to `createOllamaBackend`:
   ```ts
   ...(def.numCtx !== undefined ? { numCtx: def.numCtx } : {}),
   ...(def.maxContextTokens !== undefined
     ? { maxContextTokens: def.maxContextTokens }
     : options.hardwareMemoryGb !== undefined
       ? { maxContextTokens: contextCapFromMemoryGb(options.hardwareMemoryGb) }
       : {}),
   ...(def.numPredict !== undefined ? { numPredict: def.numPredict } : {}),
   ...(def.keepAlive !== undefined ? { keepAlive: def.keepAlive } : {}),
   ```
   Add `hardwareMemoryGb?: number` to `CreateBackendOptions` with a JSDoc noting the orchestrator prefills it from `detectHardware()` (keeps the factory pure/sync and the async detection at the orchestrator boundary). Pass `options` through `createOllamaBackend(def, options)`.
4. Run: `pnpm --filter @harness-engineering/orchestrator test backend-factory.test.ts` — green.
5. Run: `node packages/cli/dist/bin/harness.js check-deps`
6. Commit: `feat(orchestrator): factory seam populates ollama maxContextTokens from hardware memory`

---

### Task 11: Docs + changeset

**Depends on:** Task 10 | **Files:** `docs/guides/multi-backend-routing.md`, `.changeset/<generated>.md` | **Category:** integration

1. In `docs/guides/multi-backend-routing.md`:
   - Update the ollama options row (`:37`) to add `numCtx`, `numPredict`, `keepAlive` (and note `maxContextTokens` is orchestrator-injected).
   - Add a short subsection near the ollama tools section (`:195`): the ollama backend now drives the model over native `/api/chat` (honors `num_ctx`), autosizes `num_ctx = min(modelMax, hardwareCap)` (default cap `DEFAULT_AUTO_CTX = 16384`, override via `numCtx`), keeps the model warm with `keep_alive` (default `10m`), and disables reasoning via native `think:false` (the old `/no_think` prompt hack is retired).
2. Create the changeset:

   ```
   ---
   '@harness-engineering/orchestrator': minor
   '@harness-engineering/types': minor
   ---

   OllamaBackend now drives the model over native `/api/chat` (honors `num_ctx`/`think`/`keep_alive`), autosizes `num_ctx` from the model's declared max and available hardware, sends native `think:false` for reasoning-off (retiring the `/no_think` hack), and adds optional `numCtx`/`maxContextTokens`/`numPredict`/`keepAlive` config.
   ```

3. Run: `node packages/cli/dist/bin/harness.js validate` (expect the pre-existing dashboard design-token warnings only; no new failures from these files).
4. Commit: `docs(local-model-context-autosizing): native /api/chat + num_ctx autosizing; changeset`

---

### Task 12: Full-suite + check-arch verification

**Depends on:** Task 11 | **Files:** (none — verification)

1. Run: `pnpm --filter @harness-engineering/orchestrator test` (full orchestrator suite — no ollama/MCP/schema/factory regressions).
2. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` and `pnpm --filter @harness-engineering/types typecheck`.
3. Run `node packages/cli/dist/bin/harness.js check-arch` (or `check-perf`) and confirm `callModel` / `startSession` introduce NO new complexity-baseline regressions — the normalizer/builder are extracted as free functions precisely to keep `callModel` under the threshold. If a NEW regression appears, extract further or `--update-baseline` only if intentional.
4. Run: `node packages/cli/dist/bin/harness.js validate` — confirm no NEW failures beyond the pre-existing dashboard design-token warnings.
5. Commit (if any lint/format churn): `chore(orchestrator): final validate for native ollama transport`

---

## Uncertainties

- [ASSUMPTION] `/api/show` `model_info` exposes a `<arch>.context_length` key (spec D3). Wrong key ⇒ safe fallback to `DEFAULT_AUTO_CTX`.
- [ASSUMPTION] Native `tool` result messages use `tool_name` for correlation (spec D2); there is no id to correlate. `toNativeMessages` recovers the name from the matching assistant tool-call.
- [DEFERRABLE] The memory→context tiers in `contextCapFromMemoryGb` are a first cut (spec: "conservative tiered heuristic is enough"); tune later without an interface change.
- [DEFERRABLE] `harness validate` exits 1 on PRE-EXISTING dashboard design-token warnings (NeonAI `ThreadMote.tsx`) unrelated to this feature — non-blocking; Task 12 confirms no NEW failures.

## Integration Points (from spec "Tests" + Implementation Order)

- **Documentation Updates:** `docs/guides/multi-backend-routing.md` (Task 11).
- **Registrations Required:** none (no new backend type, no new CLI command; the ollama variant already exists).
- **Changeset:** orchestrator + types minor (Task 11).
