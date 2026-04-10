# Plan: Phase 5c — MCP Resource Stability Hints

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

Add a `_meta.stability` field to every entry in `RESOURCE_DEFINITIONS` in `server.ts` so
caching-aware MCP clients receive stability tier hints alongside resource descriptors, while
clients that do not support caching can safely ignore the field.

## Observable Truths (Acceptance Criteria)

1. When `getResourceDefinitions()` is called, every returned object has `_meta.stability` set
   to a valid `StabilityTier` value (`'static'`, `'session'`, or `'ephemeral'`).
2. Stability values match the spec:
   - `harness://skills` → `'static'`
   - `harness://state` → `'ephemeral'`
   - `harness://rules`, `harness://project`, `harness://learnings`, `harness://graph`,
     `harness://entities`, `harness://relationships` → `'session'`
3. `npx vitest run packages/cli/tests/mcp/server.test.ts` passes with the new stability
   assertions included.
4. `harness validate` passes.

## Key Design Note: Why `_meta` and not a top-level `stability` field

The MCP SDK `ResourceSchema` (`types.d.ts:1385`) uses Zod `z.core.$strip`, which silently
drops unknown top-level fields during serialization. A bare `stability: 'static'` key would
never reach the client. The `_meta` field is typed as `ZodObject<{}, z.core.$loose>`, which
is the SDK's explicit extension point for vendor metadata. Stability is placed at
`_meta.stability` so it survives Zod validation and reaches the client.

Evidence: `/Users/cwarner/Projects/harness-engineering/node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@3.25.76/node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts:1385`
— `ResourceSchema` declared with `z.core.$strip`; `_meta` declared with `z.core.$loose`.

## File Map

- MODIFY `packages/cli/src/mcp/server.ts` — add `_meta: { stability: '...' }` to each entry
  in `RESOURCE_DEFINITIONS` (lines 270–320)
- MODIFY `packages/cli/tests/mcp/server.test.ts` — add stability assertions to the resource
  test block

## Tasks

### Task 1: Add stability metadata to RESOURCE_DEFINITIONS

**Depends on:** none
**Files:** `packages/cli/src/mcp/server.ts`

1. Open `packages/cli/src/mcp/server.ts`.

2. Replace the `RESOURCE_DEFINITIONS` array (lines 270–320) with the following. The only
   change is the addition of `_meta: { stability: '...' }` to each object — all other fields
   are unchanged:

   ```typescript
   const RESOURCE_DEFINITIONS = [
     {
       uri: 'harness://skills',
       name: 'Harness Skills',
       description:
         'Available skills with metadata (name, description, cognitive_mode, type, triggers)',
       mimeType: 'application/json',
       _meta: { stability: 'static' },
     },
     {
       uri: 'harness://rules',
       name: 'Harness Rules',
       description: 'Active linter rules and constraints from harness config',
       mimeType: 'application/json',
       _meta: { stability: 'session' },
     },
     {
       uri: 'harness://project',
       name: 'Project Context',
       description: 'Project structure and agent instructions from AGENTS.md',
       mimeType: 'text/markdown',
       _meta: { stability: 'session' },
     },
     {
       uri: 'harness://learnings',
       name: 'Learnings',
       description: 'Review learnings and anti-pattern log from .harness/',
       mimeType: 'text/markdown',
       _meta: { stability: 'session' },
     },
     {
       uri: 'harness://state',
       name: 'Project State',
       description: 'Current harness state including position, progress, decisions, and blockers',
       mimeType: 'application/json',
       _meta: { stability: 'ephemeral' },
     },
     {
       uri: 'harness://graph',
       name: 'Knowledge Graph',
       description: 'Graph statistics, node/edge counts by type, staleness',
       mimeType: 'application/json',
       _meta: { stability: 'session' },
     },
     {
       uri: 'harness://entities',
       name: 'Graph Entities',
       description: 'All entity nodes with types and metadata',
       mimeType: 'application/json',
       _meta: { stability: 'session' },
     },
     {
       uri: 'harness://relationships',
       name: 'Graph Relationships',
       description: 'All edges with types, confidence scores, and timestamps',
       mimeType: 'application/json',
       _meta: { stability: 'session' },
     },
   ];
   ```

3. Run: `npx tsc --noEmit -p packages/cli/tsconfig.json`
   Observe: no type errors. TypeScript accepts `_meta` as `Record<string, unknown>` because
   the inferred type of `RESOURCE_DEFINITIONS` is a plain array literal — no SDK type
   constraint is applied to the const. The SDK validates `_meta` as `ZodObject<{}, $loose>`
   at runtime, which accepts any string-keyed values.

4. Run: `harness validate`
   Observe: validation passed.

5. Commit:
   ```
   feat(mcp): add _meta.stability hints to all resource descriptors
   ```

---

### Task 2: Add stability assertions to server.test.ts

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/server.test.ts`

1. Open `packages/cli/tests/mcp/server.test.ts`.

2. After the existing `'registers graph resources'` test block (line 67–72), add the following
   new test block inside the `describe('MCP Server', ...)` closure:

   ```typescript
   it('resource descriptors include stability hints in _meta', () => {
     const resources = getResourceDefinitions();
     const byUri = Object.fromEntries(resources.map((r) => [r.uri, r]));

     // skills index is static — changes only on deploy
     expect(byUri['harness://skills']._meta?.stability).toBe('static');

     // state is ephemeral — changes per invocation
     expect(byUri['harness://state']._meta?.stability).toBe('ephemeral');

     // session-scoped resources — stable within a session
     const sessionResources = [
       'harness://rules',
       'harness://project',
       'harness://learnings',
       'harness://graph',
       'harness://entities',
       'harness://relationships',
     ];
     for (const uri of sessionResources) {
       expect(byUri[uri]._meta?.stability).toBe('session');
     }
   });

   it('all resource descriptors have a _meta.stability field', () => {
     const resources = getResourceDefinitions();
     for (const resource of resources) {
       expect(resource._meta?.stability).toMatch(/^(static|session|ephemeral)$/);
     }
   });
   ```

3. Run: `npx vitest run packages/cli/tests/mcp/server.test.ts`
   Observe: all tests pass including the two new stability tests.

4. Run: `harness validate`
   Observe: validation passed.

5. Commit:
   ```
   test(mcp): assert _meta.stability on all resource descriptors
   ```

---

## Traceability

| Observable Truth                                                           | Delivered by                         |
| -------------------------------------------------------------------------- | ------------------------------------ |
| Every resource has `_meta.stability`                                       | Task 1 (RESOURCE_DEFINITIONS update) |
| Correct tier per resource (skills=static, state=ephemeral, others=session) | Task 1 (per-object `_meta` values)   |
| Tests pass with stability assertions                                       | Task 2 (two new `it(...)` blocks)    |
| `harness validate` passes                                                  | Both tasks (validate step in each)   |
