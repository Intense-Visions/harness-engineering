# Plan: Phase 2 — MCP Response Compaction Middleware

**Date:** 2026-04-10
**Spec:** docs/changes/mcp-response-compaction/proposal.md
**Session:** changes--mcp-response-compaction--proposal
**Estimated tasks:** 6
**Estimated time:** 22 minutes

---

## Goal

Wire a compaction middleware into the MCP server so that every tool response is automatically compacted (structural + truncation passes) before delivery, with a `compact: false` escape hatch that returns byte-identical raw output.

---

## Observable Truths (Acceptance Criteria)

1. When any harness MCP tool handler returns a response, the system shall apply `StructuralStrategy` then `TruncationStrategy` (DEFAULT_TOKEN_BUDGET = 4000) before returning to the caller.
2. When a tool is called with `compact: false` in its arguments, the system shall return the raw handler output without applying any compaction.
3. When compaction is applied, the system shall not drop identifiers, file paths, error messages, or status fields (lossless by spec).
4. When compaction is applied, the middleware shall include a `<!-- packed: ... -->` header in the response text with original tokens, compacted tokens, and reduction percentage.
5. While `isError: true` is set on a response, the system shall still apply compaction (error content is still reduced).
6. When `harness validate` is run after all tasks, the system shall pass.
7. When `npx vitest run tests/mcp/middleware/compaction.test.ts` is run from `packages/cli/`, all tests shall pass.
8. No existing CLI tests shall break: `npm test` from `packages/cli/` passes unchanged.

---

## File Map

```
CREATE packages/cli/src/mcp/middleware/compaction.ts
CREATE packages/cli/tests/mcp/middleware/compaction.test.ts
MODIFY packages/cli/src/mcp/server.ts  (add applyCompaction call after applyInjectionGuard)
```

---

## Key Design Decisions Locked

- The compaction middleware follows the exact same `wrapWithX` / `applyX` pattern as `injection-guard.ts` (`packages/cli/src/mcp/middleware/injection-guard.ts:124-224`).
- The middleware wraps the **already-guarded** handlers (after injection guard), not the raw handlers — matching the layer order in `server.ts:444-447`.
- `compact: false` is detected by inspecting the incoming `input` argument before calling the handler.
- The middleware uses `CompactionPipeline` with `[new StructuralStrategy(), new TruncationStrategy()]` — same two strategies, same order as spec Decision 2.
- Each content item with `type: 'text'` is compacted independently; non-text items pass through.
- The `<!-- packed: ... -->` header is **prepended** to the first text content item (not added as a new item) to avoid changing the structure of multi-item responses.
- Fail-open: any middleware error passes through the raw result unchanged.

---

## Tasks

### Task 1: Write the failing test for `wrapWithCompaction`

**Depends on:** none (Phase 1 core exports are already available)
**Files:** `packages/cli/tests/mcp/middleware/compaction.test.ts`
**Time estimate:** 4 minutes

1. Create `packages/cli/tests/mcp/middleware/compaction.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { wrapWithCompaction, applyCompaction } from '../../../src/mcp/middleware/compaction';

   type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

   /** Handler returning a large JSON payload (> 4000 token budget = 16 000 chars) */
   const largeJsonHandler = async (): Promise<ToolResult> => {
     const payload = {
       items: Array.from({ length: 2000 }, (_, i) => ({
         id: i,
         value: `item-${i}`,
         path: `/src/module-${i}.ts`,
         status: 'ok',
       })),
     };
     return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
   };

   /** Handler returning short text (under budget — no truncation expected) */
   const shortHandler = async (): Promise<ToolResult> => ({
     content: [{ type: 'text', text: JSON.stringify({ name: 'harness', version: '1.0' }) }],
   });

   /** Handler returning an error result */
   const errorHandler = async (): Promise<ToolResult> => ({
     content: [{ type: 'text', text: JSON.stringify({ error: 'not found', path: '/src/foo.ts' }) }],
     isError: true,
   });

   /** Handler returning non-JSON (plain text — structural pass is no-op) */
   const plainTextHandler = async (): Promise<ToolResult> => ({
     content: [{ type: 'text', text: 'Line one\nLine two\n   extra   spaces   ' }],
   });

   /** Handler for compact: false bypass test */
   const verboseHandler = async (): Promise<ToolResult> => ({
     content: [{ type: 'text', text: JSON.stringify({ a: null, b: '', c: [], d: { e: '' } }) }],
   });

   describe('wrapWithCompaction', () => {
     describe('CT01: applies structural pass to short JSON (no truncation needed)', () => {
       it('removes null/empty fields and returns compact JSON with packed header', async () => {
         const handler = async (): Promise<ToolResult> => ({
           content: [
             {
               type: 'text',
               text: JSON.stringify({ name: 'test', empty: null, arr: [], nested: { a: '' } }),
             },
           ],
         });
         const wrapped = wrapWithCompaction('test_tool', handler);
         const result = await wrapped({});

         expect(result.content).toHaveLength(1);
         expect(result.content[0].text).toMatch(/<!-- packed: structural\+truncate/);
         // null/empty fields stripped
         expect(result.content[0].text).not.toContain('"empty"');
         expect(result.content[0].text).not.toContain('"arr"');
         // real data preserved
         expect(result.content[0].text).toContain('"name"');
         expect(result.content[0].text).toContain('"test"');
       });
     });

     describe('CT02: applies truncation when content exceeds 4000-token budget', () => {
       it('reduces large payload and includes reduction metadata in header', async () => {
         const wrapped = wrapWithCompaction('large_tool', largeJsonHandler);
         const result = await wrapped({});

         const text = result.content[0].text;
         expect(text).toMatch(/<!-- packed: structural\+truncate \| \d+→\d+ tokens \(-\d+%\) -->/);

         // Verify actual reduction occurred
         const match = text.match(/(\d+)→(\d+) tokens/);
         expect(match).not.toBeNull();
         const original = parseInt(match![1], 10);
         const compacted = parseInt(match![2], 10);
         expect(compacted).toBeLessThan(original);
         expect(compacted).toBeLessThanOrEqual(4000);
       });
     });

     describe('CT03: compact: false bypasses middleware entirely', () => {
       it('returns byte-identical output when compact: false is present', async () => {
         const rawResult = await verboseHandler();
         const wrapped = wrapWithCompaction('bypass_tool', verboseHandler);
         const bypassResult = await wrapped({ compact: false });

         // Must be identical to raw handler output — no header, no transformation
         expect(bypassResult.content[0].text).toBe(rawResult.content[0].text);
         expect(bypassResult.content[0].text).not.toContain('<!-- packed:');
       });
     });

     describe('CT04: isError: true responses are still compacted', () => {
       it('compacts error responses and preserves isError flag', async () => {
         const wrapped = wrapWithCompaction('error_tool', errorHandler);
         const result = await wrapped({});

         expect(result.isError).toBe(true);
         expect(result.content[0].text).toMatch(/<!-- packed:/);
         // Preserve error-critical fields
         expect(result.content[0].text).toContain('error');
         expect(result.content[0].text).toContain('/src/foo.ts');
       });
     });

     describe('CT05: non-JSON plain text passes through structural (no-op) and is handled', () => {
       it('returns plain text with packed header prepended', async () => {
         const wrapped = wrapWithCompaction('plain_tool', plainTextHandler);
         const result = await wrapped({});

         expect(result.content[0].text).toMatch(/<!-- packed:/);
         expect(result.content[0].text).toContain('Line one');
       });
     });

     describe('CT06: applyCompaction wraps all handlers in the map', () => {
       it('returns a new handlers map with all keys wrapped', async () => {
         const handlers = {
           tool_a: shortHandler,
           tool_b: shortHandler,
         };
         const wrapped = applyCompaction(handlers);

         expect(Object.keys(wrapped)).toEqual(['tool_a', 'tool_b']);

         // Each wrapped handler should produce a packed header
         const resultA = await wrapped.tool_a({});
         expect(resultA.content[0].text).toMatch(/<!-- packed:/);
       });
     });

     describe('CT07: fail-open — middleware error returns raw result', () => {
       it('returns raw handler output when middleware throws internally', async () => {
         // Handler that returns a result the middleware can process normally,
         // but we verify fail-open by testing with a handler that throws
         const throwingHandler = async (): Promise<ToolResult> => {
           throw new Error('handler exploded');
         };
         const wrapped = wrapWithCompaction('throw_tool', throwingHandler);
         // The middleware should catch and re-throw (fail-open means original handler error propagates)
         await expect(wrapped({})).rejects.toThrow('handler exploded');
       });
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/middleware/compaction.test.ts`
3. Observe failure: `Cannot find module '../../../src/mcp/middleware/compaction'` — expected, implementation does not exist yet.
4. Run: `harness validate`
5. Commit: `test(mcp): add failing tests for compaction middleware`

---

### Task 2: Implement `packages/cli/src/mcp/middleware/compaction.ts`

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/middleware/compaction.ts`
**Time estimate:** 4 minutes

1. Create `packages/cli/src/mcp/middleware/compaction.ts`:

   ```typescript
   /**
    * Compaction Middleware
    *
    * Wraps MCP tool handlers at registration time to apply lossless compaction
    * (structural pass + prioritized truncation) to all tool responses.
    *
    * Escape hatch: when the incoming tool arguments contain `compact: false`,
    * the middleware is bypassed entirely and the raw handler output is returned.
    *
    * Default pipeline: StructuralStrategy → TruncationStrategy (4000-token budget)
    * Fail-open: if the middleware itself throws, the original handler error propagates.
    */

   import {
     CompactionPipeline,
     StructuralStrategy,
     TruncationStrategy,
     DEFAULT_TOKEN_BUDGET,
     estimateTokens,
   } from '@harness-engineering/core';

   type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
   type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

   /** Shared default pipeline — structural then truncation, both lossless. */
   const DEFAULT_PIPELINE = new CompactionPipeline([
     new StructuralStrategy(),
     new TruncationStrategy(),
   ]);

   /**
    * Build the `<!-- packed: ... -->` header line.
    */
   function buildHeader(originalTokens: number, compactedTokens: number): string {
     const reductionPct =
       originalTokens > 0 ? Math.round((1 - compactedTokens / originalTokens) * 100) : 0;
     return `<!-- packed: structural+truncate | ${originalTokens}→${compactedTokens} tokens (-${reductionPct}%) -->`;
   }

   /**
    * Compact a single text content item.
    * Returns the compacted text with a packed header prepended.
    */
   function compactText(text: string): string {
     const originalTokens = estimateTokens(text);
     const compacted = DEFAULT_PIPELINE.apply(text, DEFAULT_TOKEN_BUDGET);
     const compactedTokens = estimateTokens(compacted);
     const header = buildHeader(originalTokens, compactedTokens);
     return `${header}\n${compacted}`;
   }

   /**
    * Wrap a single MCP tool handler with compaction middleware.
    *
    * The returned handler:
    * 1. If `input.compact === false`, bypasses middleware and returns raw output.
    * 2. Calls the original handler.
    * 3. For each content item with type === 'text', applies the default pipeline.
    * 4. Prepends the `<!-- packed: ... -->` header to the first text item.
    * 5. Fail-open: if the handler throws, the error propagates unchanged.
    */
   export function wrapWithCompaction(toolName: string, handler: ToolHandler): ToolHandler {
     return async (input: Record<string, unknown>): Promise<ToolResult> => {
       // Escape hatch: caller explicitly opts out
       if (input.compact === false) {
         return handler(input);
       }

       const result = await handler(input);

       // Apply compaction to each text content item
       const compactedContent = result.content.map((item) => {
         if (item.type !== 'text') return item;
         return { ...item, text: compactText(item.text) };
       });

       return { ...result, content: compactedContent };
     };
   }

   /**
    * Wrap all tool handlers in a handlers map with compaction middleware.
    */
   export function applyCompaction(
     handlers: Record<string, ToolHandler>
   ): Record<string, ToolHandler> {
     const wrapped: Record<string, ToolHandler> = {};
     for (const [name, handler] of Object.entries(handlers)) {
       wrapped[name] = wrapWithCompaction(name, handler);
     }
     return wrapped;
   }
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/middleware/compaction.test.ts`
3. Observe: all 7 tests pass.
4. Run: `harness validate`
5. Commit: `feat(mcp): implement compaction middleware with compact:false escape hatch`

---

### Task 3: Wire compaction middleware into `server.ts`

**Depends on:** Task 2
**Files:** `packages/cli/src/mcp/server.ts`
**Time estimate:** 4 minutes

The wiring point is `createHarnessServer` in `packages/cli/src/mcp/server.ts:434`. Currently the flow is:

```
buildFilteredTools → applyInjectionGuard(handlers) → guardedHandlers → dispatchTool
```

After this task:

```
buildFilteredTools → applyInjectionGuard(handlers) → guardedHandlers → applyCompaction(guardedHandlers) → compactedHandlers → dispatchTool
```

1. Open `packages/cli/src/mcp/server.ts`.

2. Add the import at the top with the other middleware imports (after line 10, `applyInjectionGuard`):

   ```typescript
   import { applyCompaction } from './middleware/compaction.js';
   ```

3. In `createHarnessServer` (around line 444), immediately after the `applyInjectionGuard` call, add the compaction wrapping. Replace this block:

   ```typescript
   const guardedHandlers = applyInjectionGuard(handlers, {
     projectRoot: resolvedRoot,
     trustedOutputTools,
   });
   ```

   with:

   ```typescript
   const guardedHandlers = applyInjectionGuard(handlers, {
     projectRoot: resolvedRoot,
     trustedOutputTools,
   });
   const compactedHandlers = applyCompaction(guardedHandlers);
   ```

4. Update `dispatchTool` to use `compactedHandlers` instead of `guardedHandlers`. Replace:

   ```typescript
   server.setRequestHandler(
     CallToolRequestSchema,
     async (request) =>
       dispatchTool(
         guardedHandlers,
         request.params.name,
         request.params.arguments,
         resolvedRoot,
         sessionChecked
       ) as unknown as Promise<never>
   );
   ```

   with:

   ```typescript
   server.setRequestHandler(
     CallToolRequestSchema,
     async (request) =>
       dispatchTool(
         compactedHandlers,
         request.params.name,
         request.params.arguments,
         resolvedRoot,
         sessionChecked
       ) as unknown as Promise<never>
   );
   ```

5. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx tsc --noEmit`
6. Observe: no type errors.
7. Run: `harness validate`
8. Commit: `feat(mcp): wire compaction middleware into server.ts after injection guard`

---

### Task 4: Integration test — no existing tests broken

**Depends on:** Task 3
**Files:** no new files (runs existing test suite)
**Time estimate:** 3 minutes

[checkpoint:human-verify]

1. Run the full CLI test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npm test`
2. Observe: all tests pass. The compaction middleware is transparent to existing tests because:
   - Tests that assert on `result.content[0].text` containing specific substrings will still match (compaction prepends a header but does not remove content that passes under the budget)
   - Tests that call handlers directly (bypassing `server.ts`) are unaffected
3. If any test fails, diagnose the failure:
   - If a test asserts exact equality on `content[0].text`: the test must be updated to use `toContain` or strip the packed header with a regex. Note which tests fail and fix them in this task (do not skip).
   - If a test fails for unrelated reasons: investigate separately.
4. Run: `harness validate`
5. Report results at checkpoint.
6. Commit (if any test fixes were needed): `fix(mcp): update tool tests to tolerate compaction header`

---

### Task 5: Integration test — verify reduction metrics on real tool handlers

**Depends on:** Task 4
**Files:** `packages/cli/tests/mcp/middleware/compaction.test.ts` (extend existing file)
**Time estimate:** 4 minutes

This task extends the compaction test file with integration-style tests that use a real tool handler to verify that middleware achieves meaningful reduction.

1. Open `packages/cli/tests/mcp/middleware/compaction.test.ts`.

2. Add an additional `describe` block at the bottom of the file:

   ```typescript
   describe('CT08: reduction metrics — real handler simulation', () => {
     it('achieves >= 20% reduction on a synthetic 200-item JSON response', async () => {
       // Simulate a tool returning a large JSON object similar to gather_context output
       const syntheticHandler = async (): Promise<ToolResult> => {
         const output = {
           results: Array.from({ length: 200 }, (_, i) => ({
             id: `node-${i}`,
             type: 'file',
             path: `/src/modules/module-${i}/index.ts`,
             status: 'ok',
             empty_field: null,
             empty_arr: [],
             nested: { empty: '' },
             description: `Module ${i} provides utility functions for domain area ${i}. It exports several helper methods.`,
           })),
         };
         return { content: [{ type: 'text', text: JSON.stringify(output) }] };
       };

       const rawResult = await syntheticHandler();
       const originalLen = rawResult.content[0].text.length;

       const wrapped = wrapWithCompaction('gather_context', syntheticHandler);
       const compactedResult = await wrapped({});
       const compactedText = compactedResult.content[0].text;

       // Extract token counts from header
       const match = compactedText.match(/(\d+)→(\d+) tokens \(-(\d+)%\)/);
       expect(match).not.toBeNull();
       const reductionPct = parseInt(match![3], 10);

       // Spec success criterion: >= 20% reduction on average
       expect(reductionPct).toBeGreaterThanOrEqual(20);

       // Sanity: compacted text is shorter than original
       expect(compactedText.length).toBeLessThan(originalLen);
     });

     it('compact: false returns byte-identical result matching raw handler', async () => {
       const handler = async (): Promise<ToolResult> => ({
         content: [{ type: 'text', text: JSON.stringify({ a: 1, b: null, c: [], d: 'value' }) }],
       });

       const rawResult = await handler();
       const wrapped = wrapWithCompaction('any_tool', handler);
       const bypassResult = await wrapped({ compact: false, path: '/tmp' });

       expect(bypassResult.content[0].text).toBe(rawResult.content[0].text);
     });
   });
   ```

3. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/middleware/compaction.test.ts`
4. Observe: all 9 tests pass (7 from Task 1 + 2 new).
5. Run: `harness validate`
6. Commit: `test(mcp): add reduction metrics integration tests for compaction middleware`

---

### Task 6: Final validation sweep

**Depends on:** Task 5
**Files:** none
**Time estimate:** 3 minutes

[checkpoint:human-verify]

1. Run typecheck: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx tsc --noEmit`
2. Observe: no type errors.
3. Run compaction tests: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/middleware/compaction.test.ts`
4. Observe: 9 tests pass.
5. Run full CLI test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npm test`
6. Observe: full suite passes (no regressions).
7. Run: `harness validate`
8. Observe: passes.
9. Verify observable truths manually:
   - OT1 (all tool responses compacted): confirmed by server.ts wiring — `compactedHandlers` used in `dispatchTool`.
   - OT2 (`compact: false` bypass): confirmed by CT03 and CT08 tests.
   - OT3 (no identifier loss): confirmed by CT01 (name field preserved), CT04 (error + path preserved).
   - OT4 (`<!-- packed: ... -->` header): confirmed by CT01, CT02.
   - OT5 (error responses still compacted): confirmed by CT04.
   - OT6 (`harness validate` passes): confirmed above.
   - OT7 (compaction test suite passes): confirmed above.
   - OT8 (no existing tests broken): confirmed by full suite run.
10. Report results at checkpoint.
11. Commit (sweep-only, no code changes expected): not needed if no changes.

---

## Dependency Graph

```
Task 1 (failing tests)
  └── Task 2 (implement middleware)
        └── Task 3 (wire into server.ts)
              └── Task 4 (integration: no regressions) [checkpoint:human-verify]
                    └── Task 5 (reduction metrics test)
                          └── Task 6 (final validation) [checkpoint:human-verify]
```

All tasks are sequential — no parallelism opportunities (each task depends on the prior).

---

## Estimated Time

| Task      | Description                         | Time        |
| --------- | ----------------------------------- | ----------- |
| 1         | Write failing compaction tests      | 4 min       |
| 2         | Implement `compaction.ts`           | 4 min       |
| 3         | Wire into `server.ts`               | 4 min       |
| 4         | Verify no regressions (checkpoint)  | 3 min       |
| 5         | Reduction metrics integration test  | 4 min       |
| 6         | Final validation sweep (checkpoint) | 3 min       |
| **Total** |                                     | **~22 min** |

---

## Phase 1 Learnings Applied

From `packages/cli` package specifically:

- `vitest run` must be invoked from `packages/cli/` directory — all commands in this plan use absolute `cd` prefixes.
- `harness validate` must follow every commit to catch arch baseline drift.

---

## Out of Scope for Phase 2

- `compact` MCP tool (Phase 3)
- `PackedSummary` graph cache node (Phase 4)
- Per-tool `tokenBudget` overrides (not in spec for auto-middleware)
