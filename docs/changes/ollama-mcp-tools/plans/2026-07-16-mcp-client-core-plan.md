# Plan: MCP tools for the OllamaBackend agent — Phase 1 (MCP client core)

**Date:** 2026-07-16 | **Spec:** `docs/changes/ollama-mcp-tools/proposal.md` | **Tasks:** 12 | **Time:** ~48 min | **Integration Tier:** medium

## Goal

The local `OllamaBackend` agent connects to configured MCP servers at `startSession`, merges their tools (namespaced) into the model's tool set, forwards model tool-calls to those servers via the SDK `Client`, and closes the clients at `stopSession` — with graceful degradation and heartbeat wrapping — while behaving byte-identically to today when `mcpServers` is unset.

## Scope note

This plan covers **Phase 1 only** — the whole MCP client engine (config field on def/schema/factory + SDK dep; connect/listTools/aggregate; namespacing + schema passthrough; `callTool` execution + heartbeat + events; graceful degradation; close on stopSession; the `connectMcp` test seam; tests SC1–SC6). **Phase 2 (scaffolded config example, guide + AGENTS.md note, ADR for D1, SC7) is explicitly OUT OF SCOPE** and planned separately.

## Observable Truths (Acceptance Criteria)

1. **SC1** — With `mcpServers` unset/empty, `OllamaBackend` is byte-identical to today: the tool set sent to the model is exactly `TOOL_SCHEMAS` (3 built-ins), and the 20 existing tests in `packages/orchestrator/tests/agent/backends/ollama.test.ts` stay green.
2. **SC2** — When the system starts a session with a server configured (in-memory transport exposing tool `echo`), the tools array sent to the model contains a namespaced entry `demo__echo` whose `function.parameters` equals the server's `inputSchema` unchanged.
3. **SC3** — When the model emits a `tool_call` for `demo__echo`, the system forwards it to `client.callTool({ name: 'echo', arguments })`, extracts the joined `type:'text'` content, truncates it, and appends it to the conversation as a `tool` message.
4. **SC4** — If a configured server fails to connect (or `listTools` rejects), the system logs a warning, skips that server, and `startSession` still succeeds; built-ins and any other working server remain usable.
5. **SC5** — When an MCP tool call runs, the system emits `tool_execution_start` and `tool_execution_end` events with the namespaced name as `subtype`, and wraps the `callTool` promise in `withHeartbeat` so a slow call does not stall the dispatch.
6. **SC6** — For a server spec without `cwd`, the system spawns the transport with `cwd = session.workspacePath`; a spec-supplied `cwd` overrides it.
7. `node packages/cli/dist/bin/harness.js check-deps` stays clean; new SDK import resolves.

## Change Specification (deltas to existing behavior)

- **[ADDED]** `McpServerSpec` type and `mcpServers?: McpServerSpec[]` on `OllamaBackendDef` (types), `OllamaBackendConfig` (ollama.ts), and the `ollama` Zod variant (schema.ts).
- **[ADDED]** `@modelcontextprotocol/sdk` `^1.29.0` dep on `packages/orchestrator/package.json`.
- **[ADDED]** `OpenAITool` type, `mcpTools`/`mcpToolMap` on `OllamaSession`, MCP connect/aggregate at `startSession`, MCP forward at `runTurn`, client close at `stopSession`, and a `connectMcp` test seam on the config.
- **[MODIFIED]** `createOllamaBackend` threads `mcpServers` through (conditional-spread).
- **[MODIFIED]** `runTurn` sends `TOOL_SCHEMAS ++ session.mcpTools` and dispatches MCP tool calls; built-in name wins on collision; unknown tool → existing error string.
- **[UNCHANGED]** Claude/AMR/other backends; all `OllamaBackend` behavior when `mcpServers` is absent.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` (add `McpServerSpec` + `mcpServers` on `OllamaBackendDef`)
- MODIFY `packages/orchestrator/package.json` (add SDK dep)
- MODIFY `packages/orchestrator/src/workflow/schema.ts` (add `mcpServers` to `.strict()` ollama variant)
- MODIFY `packages/orchestrator/src/agent/backends/ollama.ts` (config field, `OpenAITool`, session fields, connect/aggregate, runTurn forward, stopSession close, `connectMcp` seam)
- MODIFY `packages/orchestrator/src/agent/backend-factory.ts` (thread `mcpServers` in `createOllamaBackend`)
- CREATE `packages/orchestrator/tests/agent/backends/ollama-mcp.test.ts` (SC2–SC6 with in-memory transport)
- MODIFY `packages/orchestrator/tests/agent/backends/ollama.test.ts` (add SC1 byte-identical assertion; keep 20 green)

## Uncertainties

- [ASSUMPTION] `OpenAITool` is not an existing exported type; the built-in `TOOL_SCHEMAS` are `as const`. This plan introduces `OpenAITool` in `ollama.ts` as the shared shape for built-ins + MCP tools and casts `TOOL_SCHEMAS` to `OpenAITool[]`. If a canonical `OpenAITool` already exists in `@harness-engineering/types`, Task 5 imports it instead. (Grep confirmed no such export today.)
- [DEFERRABLE] `harness validate` exits 1 in this worktree on **pre-existing** dashboard design-token findings (`packages/dashboard/**`), unrelated to Phase 1 files. Each task's validate step targets orchestrator/types health; the dashboard baseline is not introduced or worsened here. Treat the orchestrator/types typecheck + the ollama test suite as the effective gate.
- [DEFERRABLE] Bounded connect timeout value (spec says "bounded timeout"). This plan uses a `DEFAULT_MCP_CONNECT_TIMEOUT_MS = 15_000` constant, `Promise.race` per server. Wording/value can be tuned at execution without changing task structure.

## Skeleton

1. Config surface — types, dep, schema, factory (~4 tasks, ~14 min)
2. Session shape + `OpenAITool` + `connectMcp` seam (~2 tasks, ~9 min)
3. Connect/aggregate at startSession + graceful degradation (~2 tasks, ~10 min)
4. runTurn forward + events + heartbeat, stopSession close (~2 tasks, ~10 min)
5. SC1 byte-identical guard + integration wiring check (~2 tasks, ~5 min)

**Estimated total:** 12 tasks, ~48 minutes. _Skeleton approved: pending._

## Skills

No `SKILLS.md` found for this feature. Run `harness advise-skills --spec-path docs/changes/ollama-mcp-tools/proposal.md` to discover relevant skills. Manual annotation below where obviously relevant.

---

## Tasks

> Every task ends with a scoped typecheck + the ollama test suite (`npx vitest run tests/agent/backends/ollama.test.ts tests/agent/backends/ollama-mcp.test.ts` once that file exists) as the effective gate, since repo-wide `harness validate` carries a pre-existing dashboard baseline failure (see Uncertainties). Run `node packages/cli/dist/bin/harness.js validate` where noted for project-health signal, but do not block on the dashboard-token findings.

### Task 1: Add `McpServerSpec` type + `mcpServers` field to `OllamaBackendDef`

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

1. In `packages/types/src/orchestrator.ts`, immediately **above** `export interface OllamaBackendDef {`, add:

   ```ts
   /**
    * A single MCP server the OllamaBackend agent may connect to. The agent spawns
    * `command` (with `args`/`env`) over stdio, lists its tools, and exposes them to
    * the model namespaced as `<name>__<tool>`. `cwd` defaults to the session
    * workspace so code-intelligence servers (e.g. `harness-mcp`) operate on the
    * agent's worktree, not the daemon's repo.
    */
   export interface McpServerSpec {
     /** Server label; becomes the `<name>__` tool namespace prefix (sanitized). */
     name: string;
     /** Executable to spawn over stdio (e.g. `npx`, `harness-mcp`). */
     command: string;
     /** Arguments passed to `command`. */
     args?: string[];
     /** Extra environment for the spawned process. */
     env?: Record<string, string>;
     /** Working directory; defaults to the session `workspacePath`. */
     cwd?: string;
   }
   ```

2. Inside `OllamaBackendDef`, directly after the `disableReasoning?: boolean;` field, add:

   ```ts
     /**
      * MCP servers whose tools are merged into the model's tool set (opt-in
      * allowlist). Absent/empty ⇒ built-ins only (byte-identical to today).
      */
     mcpServers?: McpServerSpec[];
   ```

3. Typecheck: `npx tsc -p packages/types/tsconfig.json --noEmit`
4. Build types so downstream packages resolve the new export: `pnpm --filter @harness-engineering/types build`
5. Commit: `feat(types): add McpServerSpec + mcpServers on OllamaBackendDef`

### Task 2: Add `@modelcontextprotocol/sdk` dependency to orchestrator

**Depends on:** none | **Files:** `packages/orchestrator/package.json`

1. In `packages/orchestrator/package.json`, add to `dependencies` (keep alphabetical ordering; match the cli's version):

   ```json
   "@modelcontextprotocol/sdk": "^1.29.0",
   ```

2. Install: `pnpm install`
3. Verify resolution: `node -e "require.resolve('@modelcontextprotocol/sdk/client/index.js', { paths: ['packages/orchestrator'] })"` (should print a path, not throw). If ESM resolution differs, confirm via `ls node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js`.
4. Run: `node packages/cli/dist/bin/harness.js check-deps` (expect clean)
5. Commit: `chore(orchestrator): add @modelcontextprotocol/sdk ^1.29.0`

### Task 3: Add `mcpServers` to the `.strict()` ollama Zod variant

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/workflow/schema.ts`

1. Near the top of `schema.ts`, add a reusable schema (after the `ModelSchema` const, before `// --- AMR ...`):

   ```ts
   /**
    * MCP server allowlist entry for the ollama backend. `.strict()` so a typo'd
    * field fails at config-load (mirrors BackendCapabilities). Absent ⇒ built-ins only.
    */
   const McpServerSpecSchema = z
     .object({
       name: z.string().min(1),
       command: z.string().min(1),
       args: z.array(z.string()).optional(),
       env: z.record(z.string(), z.string()).optional(),
       cwd: z.string().min(1).optional(),
     })
     .strict();
   ```

2. In the `z.literal('ollama')` object in `BackendDefSchema`, add after `disableReasoning: z.boolean().optional(),`:

   ```ts
       mcpServers: z.array(McpServerSpecSchema).optional(),
   ```

3. Add a drift-guard so the schema output stays assignable to the type. After the ollama variant is defined (or alongside the existing `_capsGuard`/`_policyGuard` pattern), add:

   ```ts
   const _mcpGuard = (
     s: import('@harness-engineering/types').McpServerSpec
   ): z.infer<typeof McpServerSpecSchema> => s;
   void _mcpGuard;
   ```

4. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit`
5. Commit: `feat(orchestrator): accept mcpServers in the ollama backend schema`

### Task 4: Thread `mcpServers` through `createOllamaBackend`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/backend-factory.ts`

1. In `createOllamaBackend`, add the conditional-spread line after `disableReasoning` (exactOptionalPropertyTypes — never assign `undefined`):

   ```ts
       ...(def.mcpServers !== undefined ? { mcpServers: def.mcpServers } : {}),
   ```

   Resulting block:

   ```ts
   function createOllamaBackend(def: BackendDefOf<'ollama'>): AgentBackend {
     return new OllamaBackend({
       endpoint: def.endpoint,
       model: def.model,
       ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
       ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
       ...(def.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: def.maxTurnsPerRun } : {}),
       ...(def.disableReasoning !== undefined ? { disableReasoning: def.disableReasoning } : {}),
       ...(def.mcpServers !== undefined ? { mcpServers: def.mcpServers } : {}),
     });
   }
   ```

   (`OllamaBackendConfig.mcpServers` is added in Task 5; if this task runs first, it will fail typecheck — hence the dependency ordering puts Task 5 before validation here is optional. Run typecheck after Task 5 lands; commit the factory edit now, it is source-complete.)

2. Commit: `feat(orchestrator): thread mcpServers into createOllamaBackend`

### Task 5: Add `OpenAITool` type, `mcpServers` config field, and MCP fields on `OllamaSession`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

1. Add SDK + type imports at the top of `ollama.ts` (after the existing `@harness-engineering/types` import):

   ```ts
   import type { McpServerSpec } from '@harness-engineering/types';
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
   import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
   ```

2. Add the shared tool shape near the `ChatMessage`/`ToolCall` interfaces:

   ```ts
   /** OpenAI function-tool schema shape — covers both built-ins and MCP-derived tools. */
   export interface OpenAITool {
     type: 'function';
     function: {
       name: string;
       description?: string;
       parameters: Record<string, unknown>;
     };
   }
   ```

3. In `OllamaBackendConfig`, after `onModelFailed`, add:

   ```ts
     /**
      * MCP servers whose tools are merged into the model's tool set. Absent/empty
      * ⇒ built-ins only (byte-identical to today).
      */
     mcpServers?: McpServerSpec[] | undefined;
     /**
      * Test seam: factory that connects one MCP server and returns a live SDK
      * Client (mirrors the `verifyRunner`/`diffRunner` seams). Defaults to the real
      * stdio path. Unit tests inject an in-memory-transport variant so no external
      * process spawns. Receives the resolved `cwd` (spec.cwd ?? workspacePath).
      */
     connectMcp?:
       | ((spec: McpServerSpec, cwd: string) => Promise<{ client: Client; tools: McpToolDescriptor[] }>)
       | undefined;
   ```

4. Add the descriptor type near `OpenAITool`:

   ```ts
   /** A tool as reported by an MCP server's `listTools`. */
   export interface McpToolDescriptor {
     name: string;
     description?: string;
     inputSchema: Record<string, unknown>;
   }
   ```

5. In `OllamaSession`, after `resolvedModel: string;`, add:

   ```ts
     /** Namespaced MCP tools (`<server>__<tool>`) merged into the model tool set. */
     mcpTools: OpenAITool[];
     /** Namespaced tool name → the client + original tool name to forward to. */
     mcpToolMap: Map<string, { client: Client; toolName: string }>;
     /** Live MCP clients to close at `stopSession`. */
     mcpClients: Client[];
   ```

6. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit` (expect it to now also clear Task 4's factory edit)
7. Commit: `feat(orchestrator): add OpenAITool, mcpServers config + session MCP fields`

### Task 6: Implement the default `connectMcp` (real stdio path) + tool namespacing helper

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`
**Skills:** context7 (reference — verify `@modelcontextprotocol/sdk` client API at exec time)

1. Add a module-level constant near the other defaults:

   ```ts
   /** Bounded wall-clock (ms) for a single MCP server connect+listTools. */
   const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 15_000;
   ```

2. Add a free function (module scope, below `resolveInsideWorkspace`):

   ```ts
   /** Sanitize a segment to `[A-Za-z0-9_-]` for use in a namespaced tool name. */
   function sanitizeSegment(s: string): string {
     return s.replace(/[^A-Za-z0-9_-]/g, '_');
   }

   /**
    * Default MCP connector: spawn the server over stdio, connect, and list its
    * tools. Injectable via `OllamaBackendConfig.connectMcp` for tests.
    */
   async function defaultConnectMcp(
     spec: McpServerSpec,
     cwd: string
   ): Promise<{ client: Client; tools: McpToolDescriptor[] }> {
     const client = new Client(
       { name: `ollama-mcp-${spec.name}`, version: '1.0.0' },
       { capabilities: {} }
     );
     const transport: Transport = new StdioClientTransport({
       command: spec.command,
       ...(spec.args !== undefined ? { args: spec.args } : {}),
       ...(spec.env !== undefined ? { env: spec.env } : {}),
       cwd,
     });
     await client.connect(transport);
     const listed = await client.listTools();
     const tools: McpToolDescriptor[] = listed.tools.map((t) => ({
       name: t.name,
       ...(t.description !== undefined ? { description: t.description } : {}),
       inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
     }));
     return { client, tools };
   }
   ```

3. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit`
4. Commit: `feat(orchestrator): default stdio connectMcp + tool-name sanitizer`

### Task 7: Connect + aggregate MCP servers at `startSession` (concurrent, bounded, graceful)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

1. In `startSession`, after building the `session` object but before `return Ok(session)`, initialize the MCP fields and connect:

   ```ts
   session.mcpTools = [];
   session.mcpToolMap = new Map();
   session.mcpClients = [];

   const specs = this.config.mcpServers ?? [];
   const connect = this.config.connectMcp ?? defaultConnectMcp;
   await Promise.all(
     specs.map(async (spec) => {
       const cwd = spec.cwd ?? params.workspacePath;
       try {
         const { client, tools } = await withTimeout(
           connect(spec, cwd),
           DEFAULT_MCP_CONNECT_TIMEOUT_MS,
           `MCP connect '${spec.name}'`
         );
         session.mcpClients.push(client);
         const nsPrefix = sanitizeSegment(spec.name);
         for (const tool of tools) {
           const namespaced = `${nsPrefix}__${sanitizeSegment(tool.name)}`;
           if (session.mcpToolMap.has(namespaced)) continue;
           session.mcpTools.push({
             type: 'function',
             function: {
               name: namespaced,
               ...(tool.description !== undefined ? { description: tool.description } : {}),
               parameters: tool.inputSchema,
             },
           });
           session.mcpToolMap.set(namespaced, { client, toolName: tool.name });
         }
       } catch (err) {
         const msg = err instanceof Error ? err.message : String(err);
         console.warn(`[ollama-mcp] skipping server '${spec.name}': ${msg}`);
       }
     })
   );
   ```

   Note: initialize the three `session.mcp*` fields in the `OllamaSession` object literal too (so the object is never partially typed) — either set them in the literal at construction or immediately after as above; prefer setting them in the literal to satisfy strict init. Adjust so the literal includes `mcpTools: []`, `mcpToolMap: new Map()`, `mcpClients: []`.

2. Add the `withTimeout` helper at module scope:

   ```ts
   /** Reject with a labeled timeout error if `p` does not settle within `ms`. */
   function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
     if (ms <= 0) return p;
     return new Promise<T>((resolve, reject) => {
       const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
       p.then(
         (v) => {
           clearTimeout(timer);
           resolve(v);
         },
         (e) => {
           clearTimeout(timer);
           reject(e instanceof Error ? e : new Error(String(e)));
         }
       );
     });
   }
   ```

3. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit`
4. Commit: `feat(orchestrator): connect + aggregate MCP tools at startSession`

### Task 8: Forward MCP tool calls in `runTurn` (events + heartbeat + text extraction)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

1. In `callModel`, change the `tools` sent to the model to include MCP tools. Update the body-building to accept the merged list — pass `session.mcpTools` through. Replace `tools: TOOL_SCHEMAS,` with:

   ```ts
         tools: [...TOOL_SCHEMAS, ...session.mcpTools] as OpenAITool[],
   ```

   (Cast `TOOL_SCHEMAS` to `OpenAITool[]` — it is `as const`; a `TOOL_SCHEMAS as unknown as OpenAITool[]` or a typed const annotation is acceptable. Prefer annotating the merged array.)

2. In `runTurn`'s tool-call loop, before the `bash`/`write_file`/`read_file` switch (which lives in `executeTool`), branch on MCP tools. The cleanest seam: keep `executeTool` for built-ins and add an MCP path in the loop. Modify the per-toolCall block so that when `name` is NOT a built-in but IS in `ollamaSession.mcpToolMap`, forward via `callTool`:

   ```ts
   const isBuiltin = name === 'bash' || name === 'write_file' || name === 'read_file';
   const mcpEntry = isBuiltin ? undefined : ollamaSession.mcpToolMap.get(name);

   let result: string;
   if (mcpEntry) {
     let args: Record<string, unknown> = {};
     try {
       args = JSON.parse(argsJson) as Record<string, unknown>;
     } catch {
       args = {};
     }
     try {
       const callRes =
         yield *
         this.withHeartbeat(
           mcpEntry.client.callTool({ name: mcpEntry.toolName, arguments: args }),
           session.sessionId,
           name
         );
       result = truncate(extractMcpText(callRes));
     } catch (err) {
       result = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
     }
   } else {
     result =
       yield *
       this.withHeartbeat(this.executeTool(ollamaSession, name, argsJson), session.sessionId, name);
   }
   ```

   The `tool_execution_start`/`tool_execution_end` events already fire with `subtype: name` (the namespaced name for MCP) — keep them wrapping this block unchanged. Built-in name wins because `isBuiltin` short-circuits the map lookup; an unknown non-MCP tool falls through to `executeTool` → existing `ERROR: unknown tool` string.

3. Add the text-extraction helper at module scope:

   ```ts
   /** Join the `type:'text'` blocks of an MCP callTool result into one string. */
   function extractMcpText(res: unknown): string {
     const content = (res as { content?: Array<{ type?: string; text?: string }> })?.content ?? [];
     const text = content
       .filter((b) => b?.type === 'text' && typeof b.text === 'string')
       .map((b) => b.text as string)
       .join('\n');
     return text.length > 0 ? text : '(no output)';
   }
   ```

4. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit`
5. Commit: `feat(orchestrator): forward MCP tool calls in runTurn with heartbeat + events`

### Task 9: Close MCP clients at `stopSession` (best-effort)

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/agent/backends/ollama.ts`

1. In `stopSession`, after `ollamaSession.activeController?.abort();` (inside the existing try or after it), close all clients best-effort:

   ```ts
   await Promise.all(
     (ollamaSession.mcpClients ?? []).map(async (client) => {
       try {
         await client.close();
       } catch {
         // best-effort — a failing close must not break session teardown.
       }
     })
   );
   ```

   Guard with `?? []` so a session created before MCP fields (or via a mock) never throws.

2. Typecheck: `npx tsc -p packages/orchestrator/tsconfig.json --noEmit`
3. Commit: `feat(orchestrator): close MCP clients on stopSession`

### Task 10: Add SC1 byte-identical guard to the existing ollama test suite

**Depends on:** Task 8 | **Files:** `packages/orchestrator/tests/agent/backends/ollama.test.ts`

1. Add a test inside the `describe('runTurn — agentic loop', ...)` block that asserts, with `mcpServers` unset, the `tools` array POSTed to the model is exactly the 3 built-ins. Capture the fetch body:

   ```ts
   it('sends only the 3 built-in tools when mcpServers is unset (SC1)', async () => {
     let sentTools: unknown;
     const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
       sentTools = JSON.parse(init.body as string).tools;
       return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
     });
     vi.stubGlobal('fetch', fetchMock);
     const backend = new OllamaBackend(baseConfig);
     const start = await backend.startSession({ workspacePath: workspace, permissionMode: 'full' });
     expect(start.ok).toBe(true);
     if (!start.ok) return;
     await drain(backend.runTurn(start.value, { prompt: 'go' }));
     const names = (sentTools as Array<{ function: { name: string } }>).map((t) => t.function.name);
     expect(names).toEqual(['bash', 'write_file', 'read_file']);
   });
   ```

2. Run the full existing suite — all 20 prior tests + this one must pass:
   `npx vitest run tests/agent/backends/ollama.test.ts`
3. Commit: `test(orchestrator): assert built-ins-only tool set when mcpServers unset (SC1)`

### Task 11: Add SC2–SC6 MCP integration tests with in-memory transport

**Depends on:** Task 9, Task 10 | **Files:** `packages/orchestrator/tests/agent/backends/ollama-mcp.test.ts`
**Skills:** context7 (reference — confirm `InMemoryTransport`/`Server` API)

1. Create `packages/orchestrator/tests/agent/backends/ollama-mcp.test.ts`. Build a tiny in-process MCP `Server` exposing one tool `echo`, linked to a `Client` via `InMemoryTransport.createLinkedPair()`, and inject it through a `connectMcp` seam. Skeleton:

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import type { AgentEvent, TurnResult } from '@harness-engineering/types';
   import { Server } from '@modelcontextprotocol/sdk/server/index.js';
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
   import {
     CallToolRequestSchema,
     ListToolsRequestSchema,
   } from '@modelcontextprotocol/sdk/types.js';
   import {
     OllamaBackend,
     type OllamaBackendConfig,
     type OllamaSession,
   } from '../../../src/agent/backends/ollama';

   const ECHO_SCHEMA = {
     type: 'object',
     properties: { text: { type: 'string' } },
     required: ['text'],
   };

   /** Stand up a linked in-memory MCP server exposing one `echo` tool + a connected Client. */
   async function makeLinkedServer(): Promise<Client> {
     const server = new Server({ name: 'demo', version: '1.0.0' }, { capabilities: { tools: {} } });
     server.setRequestHandler(ListToolsRequestSchema, async () => ({
       tools: [{ name: 'echo', description: 'echo text', inputSchema: ECHO_SCHEMA }],
     }));
     server.setRequestHandler(CallToolRequestSchema, async (req) => ({
       content: [{ type: 'text', text: `echoed:${String(req.params.arguments?.text ?? '')}` }],
     }));
     const [clientT, serverT] = InMemoryTransport.createLinkedPair();
     await server.connect(serverT);
     const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
     await client.connect(clientT);
     return client;
   }

   /** connectMcp seam that returns the linked in-memory client + a listTools result. */
   function inMemoryConnect() {
     return async () => {
       const client = await makeLinkedServer();
       const listed = await client.listTools();
       return {
         client,
         tools: listed.tools.map((t) => ({
           name: t.name,
           description: t.description,
           inputSchema: t.inputSchema as Record<string, unknown>,
         })),
       };
     };
   }
   // ... drain()/okFetch()/chatResponse() helpers copied or imported from ollama.test patterns ...
   ```

2. Write these cases (reuse `drain`/`okFetch`/`chatResponse` from the existing test — copy the small helpers into this file):
   - **SC2**: start a session with `mcpServers: [{ name: 'demo', command: 'x' }]` + `connectMcp: inMemoryConnect()`; assert `(session as OllamaSession).mcpTools` contains one entry named `demo__echo` whose `function.parameters` deep-equals `ECHO_SCHEMA`.
   - **SC2 (cross-platform)**: this test must NOT be `skipIf(win32)` — in-memory transport spawns no process.
   - **SC3**: stub `fetch` so call 1 returns a `tool_call` for `demo__echo` with `{text:'hi'}` and call 2 returns `TASK_COMPLETE`; drain `runTurn`; assert the appended `tool` message content is `echoed:hi` and `result.success === true`.
   - **SC4**: `connectMcp` that rejects for a bad spec; spy on `console.warn`; assert `startSession` still `ok`, `session.mcpTools` is empty, and a warning was logged; then confirm a built-in `bash` call still works.
   - **SC5**: drain the SC3 turn; assert events include `tool_execution_start` and `tool_execution_end` with `subtype === 'demo__echo'`. Add a slow-callTool variant (connectMcp whose client.callTool resolves after a delay) with `heartbeatMs: 10` and assert at least one `status`/`heartbeat` event is emitted during the call.
   - **SC6**: pass a `connectMcp` spy that records its `cwd` argument; with a spec lacking `cwd`, assert the spy received `session.workspacePath`; with `cwd: '/custom'`, assert it received `/custom`.

3. Run: `npx vitest run tests/agent/backends/ollama-mcp.test.ts`
4. Run the full backend suite to confirm no regression: `npx vitest run tests/agent/backends/ollama.test.ts tests/agent/backends/ollama-mcp.test.ts`
5. Commit: `test(orchestrator): MCP client integration tests SC2–SC6 (in-memory transport)`

### Task 12: Integration wiring check — verify schema round-trip + check-deps

**Depends on:** Task 3, Task 11 | **Files:** `packages/orchestrator/src/workflow/schema.ts` (assertion only) | **Category:** integration

1. Confirm a config with `mcpServers` parses through `BackendDefSchema` and a typo is rejected. Add a focused test (append to the nearest existing schema test file, e.g. `tests/workflow/schema*.test.ts` — locate with `ls packages/orchestrator/tests/workflow/`), or add a minimal inline check:

   ```ts
   it("accepts an ollama backend with mcpServers and rejects a typo'd field", () => {
     const ok = BackendDefSchema.safeParse({
       type: 'ollama',
       endpoint: 'http://127.0.0.1:11434/v1',
       model: 'm',
       mcpServers: [{ name: 'context7', command: 'npx', args: ['-y', '@upstash/context7-mcp'] }],
     });
     expect(ok.success).toBe(true);
     const bad = BackendDefSchema.safeParse({
       type: 'ollama',
       endpoint: 'http://127.0.0.1:11434/v1',
       model: 'm',
       mcpServers: [{ name: 'x', command: 'y', bogus: true }],
     });
     expect(bad.success).toBe(false);
   });
   ```

2. Run the schema test file: `npx vitest run <that schema test path>`
3. Run: `node packages/cli/dist/bin/harness.js check-deps` (expect clean)
4. Run: `node packages/cli/dist/bin/harness.js validate` — record the result; the ONLY failures may be the pre-existing dashboard design-token findings (see Uncertainties). No orchestrator/types finding is acceptable.
5. Commit: `test(orchestrator): validate mcpServers schema round-trip (integration)`

---

## Sequencing & Parallelism

- **Wave A (no deps):** Task 1, Task 2 — parallel (types vs package.json).
- **Wave B:** Task 3 (needs T1), Task 4 (needs T1), Task 5 (needs T1) — Task 3 and Task 5 touch different files and can run in parallel; Task 4 depends on T1 but typechecks only after T5 (documented in Task 4).
- **Wave C:** Task 6 → Task 7 → (Task 8, Task 9 both need T7; T8 and T9 touch the same file `ollama.ts`, so serialize T8 then T9).
- **Wave D:** Task 10 (needs T8), then Task 11 (needs T9 + T10), then Task 12 (needs T3 + T11).

## Checkpoints

None. Every task is deterministic (types, schema, code, tests) with no human decision or external action required. The single manual/e2e check (live context7 self-correction) is SC7, deferred to Phase 2.

## Integration Points (this phase)

- **Entry Points:** `mcpServers` on the ollama def (Tasks 1, 3); MCP paths in `startSession`/`runTurn`/`stopSession` (Tasks 7–9). ✓ covered.
- **Registrations Required:** SDK dep on orchestrator (Task 2); `ollama` Zod variant gains `mcpServers` (Task 3). ✓ covered. Scaffolded-config example is **Phase 2**.
- **Documentation Updates / Architectural Decisions (ADR) / Knowledge Impact:** **all Phase 2** — out of scope here.

Integration tier: **medium** — new feature within an existing package, new exports (`McpServerSpec`, `OpenAITool`), new SDK dep, ~6 files. Wiring + the schema round-trip project-update are covered by Task 12; knowledge materialization (ADR) is deferred to Phase 2.
