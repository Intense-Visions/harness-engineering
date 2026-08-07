# Plan: Phase 1 — Canary Adapter `readRunHistory` + `canary_run_history` MCP tool

**Date:** 2026-08-07 | **Spec:** `docs/changes/canary-results-ingest/proposal.md` | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** large

## Phase Overview

Ship the acquisition foundation: a new **injectable file-read seam** (`CanaryReader`) beside the existing `CanaryExec` seam in `packages/intelligence/src/adapters/canary.ts`, a new total `CanaryAdapter.readRunHistory(opts?)` method returning validated `CanaryRunRecord[]`, permissive zod schemas (`canaryRunRecordSchema` / `canaryTestResultSchema`), and a thin `canary_run_history` MCP tool wired through **all five** MCP registries (server `TOOL_DEFINITIONS` + `TOOL_HANDLERS`, `tool-capability-declarations.ts`, `tool-tiers.ts` optional, `ALL_MCP_TOOLS`, and the capability/`ALL_MCP_TOOLS`-sync tests). Canary coupling stays confined to `intelligence`/`cli`. Everything degrades to `[]` and never throws.

This mirrors the existing `reviewTest()` + `canary_recommend_framework` wiring (the sibling `listFrameworks` pattern) exactly: one total adapter method + one thin MCP tool per capability, both seams injectable and unit-tested against the degrade taxonomy.

Grounding facts verified in the codebase:

- `packages/intelligence/src/adapters/canary.ts` currently exports `CanaryDegradeReason`, `CanaryExec`, `createCanaryAdapter(exec)`, and the `CanaryAdapter` interface (`probe`/`recommendFramework`/`reviewTest`). No `read`/history surface yet.
- Barrels re-export canary symbols from `packages/intelligence/src/adapters/index.ts` (lines 13-21) and `packages/intelligence/src/index.ts` (lines 13-21).
- MCP tool pattern: `packages/cli/src/mcp/tools/canary.ts` (thin handlers, `jsonResponse`, default-adapter param).
- Registries: `server.ts` imports (lines 123-128) + `TOOL_DEFINITIONS` (line 318-319) + `TOOL_HANDLERS` (lines 429-430); `tool-capability-declarations.ts` (lines 58-59); `tool-tiers.ts` `STANDARD_EXTRA` (lines 56-57); `setup-mcp.ts` `ALL_MCP_TOOLS` (lines 95-96).
- Registry-sync tests: `packages/cli/tests/commands/setup-mcp.test.ts` (`ALL_MCP_TOOLS sync`, lines 424-432) asserts `ALL_MCP_TOOLS === getToolDefinitions().map(name)`; `packages/cli/tests/commands/mcp-list-capabilities.test.ts` (lines 96-124) asserts every registered tool has a declaration.

## Observable Truths (Acceptance Criteria)

1. `createCanaryAdapter(exec, reader).readRunHistory()` returns a validated `CanaryRunRecord[]` from a well-formed `history-v2.jsonl` (newest-last, honoring `limit`), proven with an injected `CanaryReader`.
2. `readRunHistory()` returns `[]` (never throws) when the file is missing (reader rejects `ENOENT`), unreadable (reader rejects), or every line is malformed.
3. A single malformed line among valid lines is dropped; the valid records survive (permissive per-line `safeParse`).
4. `canary_run_history` MCP tool returns the JSON array (or `[]`), delegating to `createCanaryAdapter().readRunHistory()`.
5. `ALL_MCP_TOOLS sync` test passes: `ALL_MCP_TOOLS` equals `getToolDefinitions()` names.
6. `mcp-list-capabilities` coverage test passes: `canary_run_history` carries a declared `{ scopes: ['read'] }` capability (no heuristic fallback).

## File Map

- MODIFY `packages/intelligence/src/adapters/canary.ts` (add `CanaryReader`, zod schemas, `CanaryRunRecord`/`CanaryTestResult`, `readRunHistory`, extend `CanaryAdapter` + `createCanaryAdapter`)
- CREATE `packages/intelligence/src/adapters/canary-history.test.ts` (degrade-taxonomy unit tests)
- MODIFY `packages/intelligence/src/adapters/index.ts` (re-export new types)
- MODIFY `packages/intelligence/src/index.ts` (re-export new types)
- MODIFY `packages/cli/src/mcp/tools/canary.ts` (add `canaryRunHistoryDefinition` + `handleCanaryRunHistory`)
- MODIFY `packages/cli/src/mcp/tools/canary.test.ts` (add `canary_run_history` handler test + extend `fakeAdapter`)
- MODIFY `packages/cli/src/mcp/server.ts` (import + `TOOL_DEFINITIONS` + `TOOL_HANDLERS`)
- MODIFY `packages/cli/src/mcp/tool-capability-declarations.ts` (add `canary_run_history: { scopes: ['read'] }`)
- MODIFY `packages/cli/src/mcp/tool-tiers.ts` (add `canary_run_history` to `STANDARD_EXTRA`)
- MODIFY `packages/cli/src/commands/setup-mcp.ts` (add `canary_run_history` to `ALL_MCP_TOOLS`)
- CREATE `.changeset/canary-run-history-adapter.md` (`@harness-engineering/intelligence` minor, `@harness-engineering/cli` minor)

## Tasks

### Task 1: Add `CanaryReader` seam + zod schemas + `readRunHistory` to the adapter

**Depends on:** none | **Files:** `packages/intelligence/src/adapters/canary.ts`, `packages/intelligence/src/adapters/canary-history.test.ts`

**Inputs:** Existing `canary.ts` module (the `CanaryExec` seam + `execCanary` degrade taxonomy at lines 53-153; `createCanaryAdapter` at lines 188-200). Documented store path `test-results/reports/history-v2.jsonl` relative to `cwd`.

**Outputs / files touched:**

- MODIFY `canary.ts`:
  1. Add permissive zod schemas near the existing `canaryFindingSchema` (line 36), mirroring the "`severity`-as-permissive-string" rationale so one unmodeled field never drops a whole record:

     ```ts
     // Per-test result embedded in a canary RunRecord. Permissive on unmodeled fields:
     // status/failure_category kept as raw strings (a strict enum would drop a whole
     // record on one unseen value — same rationale as `severity` in canaryFindingSchema).
     export const canaryTestResultSchema = z
       .object({
         name: z.string(),
         status: z.string(),
         test_file: z.string().optional(),
         failure_category: z.string().optional(),
         retry_count: z.number().optional(),
         flaky: z.boolean().optional(),
       })
       .passthrough();
     export type CanaryTestResult = z.infer<typeof canaryTestResultSchema>;

     // One RunRecord per NDJSON line in history-v2.jsonl. `tests` defaults to []
     // so a record missing the array still validates.
     export const canaryRunRecordSchema = z
       .object({
         run_id: z.string().optional(),
         timestamp: z.string().optional(),
         exit_code: z.number().optional(),
         passed: z.number().optional(),
         failed: z.number().optional(),
         flaky: z.number().optional(),
         skipped: z.number().optional(),
         tests: z.array(canaryTestResultSchema).default([]),
       })
       .passthrough();
     export type CanaryRunRecord = z.infer<typeof canaryRunRecordSchema>;
     ```

     (Field names are permissive/optional so schema drift never hard-fails; confirm against canary `ts/src/history/record.ts` shape if available, otherwise the `.passthrough()` preserves unmodeled keys.)

  2. Add the read seam beside `CanaryExec` (after line 62):
     ```ts
     /**
      * The raw file-read seam: resolves the utf8 contents of a path, or rejects
      * (ENOENT / EACCES). Parallels CanaryExec — the single injection point for the
      * documented-artifact acquisition path. Default reads the real file; tests inject a fake.
      */
     export type CanaryReader = (filePath: string) => Promise<string>;
     ```
  3. Add default reader + the history-store relative path constant:
     ```ts
     import { readFile } from 'node:fs/promises';
     import * as nodePath from 'node:path';
     const HISTORY_STORE_RELATIVE = 'test-results/reports/history-v2.jsonl';
     const defaultReader: CanaryReader = (filePath) => readFile(filePath, 'utf8');
     ```
  4. Add the pure parse+degrade function:
     ```ts
     async function readRunHistoryCanary(
       reader: CanaryReader,
       opts: { cwd?: string; limit?: number } = {}
     ): Promise<CanaryRunRecord[]> {
       const filePath = nodePath.resolve(opts.cwd ?? process.cwd(), HISTORY_STORE_RELATIVE);
       let raw: string;
       try {
         raw = await reader(filePath);
       } catch {
         return []; // missing / unreadable → degrade to []
       }
       const records: CanaryRunRecord[] = [];
       for (const line of raw.split('\n')) {
         const trimmed = line.trim();
         if (trimmed === '') continue;
         const json = safeJson(trimmed); // reuse existing safeJson (line 110)
         if (json === undefined) continue; // drop malformed line, keep the rest
         const parsed = canaryRunRecordSchema.safeParse(json);
         if (parsed.success) records.push(parsed.data);
       }
       // Records are newest-last in the file; `limit` caps to the most-recent N.
       return typeof opts.limit === 'number' && opts.limit >= 0
         ? records.slice(-opts.limit)
         : records;
     }
     ```
  5. Extend the `CanaryAdapter` interface (line 47-51): add
     `readRunHistory(opts?: { cwd?: string; limit?: number }): Promise<CanaryRunRecord[]>;`
  6. Change `createCanaryAdapter` (line 188) to accept an optional reader and wire the method:
     ```ts
     export function createCanaryAdapter(
       exec: CanaryExec = defaultExec,
       reader: CanaryReader = defaultReader
     ): CanaryAdapter {
       // ...existing probe/recommendFramework/reviewTest...
       const readRunHistory = (opts?: { cwd?: string; limit?: number }) =>
         readRunHistoryCanary(reader, opts);
       return { probe, recommendFramework, reviewTest, readRunHistory };
     }
     ```

**Implementation notes:** Reuse the existing `safeJson` helper (line 110) — do NOT add a second JSON parser. Keep `HISTORY_STORE_RELATIVE` and the reader confined to this module (the boundary test enforces no canary references leak). `readRunHistory` MUST be total (never throw). Do not touch `CanaryExec`/`execCanary`.

**Verification:** Write `canary-history.test.ts` first (TDD), covering: (a) well-formed 2-line NDJSON via injected reader → 2 records; (b) `limit: 1` → newest 1; (c) reader rejects `Object.assign(new Error(), { code: 'ENOENT' })` → `[]`; (d) reader rejects generic error → `[]`; (e) all-malformed lines → `[]`; (f) one malformed line among two valid → 2 valid survive; (g) blank lines ignored. Run:

```
npx vitest run packages/intelligence/src/adapters/canary-history.test.ts
```

### Task 2: Re-export new adapter types from both intelligence barrels

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/adapters/index.ts`, `packages/intelligence/src/index.ts`

**Inputs:** New exported symbols `CanaryReader`, `CanaryRunRecord`, `CanaryTestResult`, `canaryRunRecordSchema`, `canaryTestResultSchema` from `canary.ts`.

**Outputs / files touched:**

- MODIFY `adapters/index.ts` — extend the `export type { ... } from './canary.js'` block (lines 14-21) to add `CanaryReader`, `CanaryRunRecord`, `CanaryTestResult`; add a value re-export line for the schemas:
  ```ts
  export { createCanaryAdapter, canaryRunRecordSchema, canaryTestResultSchema } from './canary.js';
  ```
- MODIFY `src/index.ts` — mirror the same additions to the canary block (lines 13-21).

**Implementation notes:** Types go in `export type { ... }`; the two zod schemas are runtime values → the `export { ... }` line. Keep alphabetical/existing ordering conventions.

**Verification:** Type-check the package (barrels are `.ts` type re-exports):

```
npx tsc -p packages/intelligence/tsconfig.json --noEmit
```

### Task 3: Add the `canary_run_history` MCP tool handler + definition

**Depends on:** Task 2 | **Files:** `packages/cli/src/mcp/tools/canary.ts`, `packages/cli/src/mcp/tools/canary.test.ts`

**Inputs:** `createCanaryAdapter` + `CanaryAdapter` from `@harness-engineering/intelligence` (already imported at `canary.ts` line 1). Existing `jsonResponse` helper (line 42).

**Outputs / files touched:**

- MODIFY `tools/canary.ts` — add after `canaryRecommendFrameworkDefinition`:

  ```ts
  export const canaryRunHistoryDefinition = {
    name: 'canary_run_history',
    description:
      "Read canary's persisted structured run history (NDJSON at " +
      'test-results/reports/history-v2.jsonl) as a validated array of RunRecords ' +
      '(run outcome + per-test status/failure_category/retry_count/flaky). ' +
      'Optional { path?, limit? }: path is the project root (default cwd); limit caps ' +
      'to the most-recent N runs. Returns [] (never errors) when canary has produced no ' +
      'results or the store is missing/unreadable/malformed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Project root (default: cwd)' },
        limit: { type: 'number', description: 'Cap to the most-recent N run records' },
      },
    },
  };

  export async function handleCanaryRunHistory(
    input: { path?: unknown; limit?: unknown },
    adapter: CanaryAdapter = createCanaryAdapter()
  ) {
    const cwd = typeof input?.path === 'string' ? input.path : undefined;
    const limit = typeof input?.limit === 'number' ? input.limit : undefined;
    return jsonResponse(
      await adapter.readRunHistory({
        ...(cwd ? { cwd } : {}),
        ...(limit !== undefined ? { limit } : {}),
      })
    );
  }
  ```

- MODIFY `tools/canary.test.ts` — extend `fakeAdapter` (line 6) to add `readRunHistory: async () => []` to the defaults, then add a `describe('canary_run_history handler')` block: (a) passes through injected records; (b) default degrade returns `[]`.

**Implementation notes:** Keep the handler thin (mirrors `handleCanaryProbe`). Use `exactOptionalPropertyTypes`-safe spreads (only include `cwd`/`limit` keys when defined) — the package uses that tsconfig flag (seen in the adapter's `version` handling).

**Verification:**

```
npx vitest run packages/cli/src/mcp/tools/canary.test.ts
```

### Task 4: Register the tool in `server.ts` (definitions + handlers)

**Depends on:** Task 3 | **Files:** `packages/cli/src/mcp/server.ts`

**Inputs:** New `canaryRunHistoryDefinition` + `handleCanaryRunHistory` exports.

**Outputs / files touched:**

- MODIFY `server.ts`:
  1. Extend the canary import block (lines 123-128) to add `canaryRunHistoryDefinition, handleCanaryRunHistory`.
  2. Add `canaryRunHistoryDefinition,` to `TOOL_DEFINITIONS` (after line 319, beside `canaryRecommendFrameworkDefinition`).
  3. Add `canary_run_history: handleCanaryRunHistory as ToolHandler,` to `TOOL_HANDLERS` (after line 430).

**Implementation notes:** Keep the new entries adjacent to the existing canary entries for reviewability. No `trustedOutput`/capability manual edit needed here — `TOOL_DEFINITIONS.map` (line 380) merges capability from `TOOL_CAPABILITY_DECLARATIONS` (added in Task 5).

**Verification:** Confirm the registry lists the tool and the sync test still resolves the name:

```
npx vitest run packages/cli/tests/mcp/server.test.ts
```

### Task 5: Sync the capability declaration + tier + `ALL_MCP_TOOLS`

**Depends on:** Task 4 | **Files:** `packages/cli/src/mcp/tool-capability-declarations.ts`, `packages/cli/src/mcp/tool-tiers.ts`, `packages/cli/src/commands/setup-mcp.ts`

**Inputs:** Registered tool name `canary_run_history` (read-only: reads a file, no write/exec/network).

**Outputs / files touched:**

- MODIFY `tool-capability-declarations.ts` — add to the read-only block beside the other canary entries (after line 59):
  `canary_run_history: { scopes: ['read'] },`
- MODIFY `tool-tiers.ts` — add `'canary_run_history',` to `STANDARD_EXTRA` beside `'canary_recommend_framework'` (line 57). (Sibling canary tools are `standard`, not `core`; match that.)
- MODIFY `setup-mcp.ts` — add `'canary_run_history',` to `ALL_MCP_TOOLS` beside `'canary_recommend_framework'` (line 96).

**Implementation notes:** This is the load-bearing "update ALL registries" step — omitting any one fails a whole-registry test:

- Missing capability entry → `mcp-list-capabilities.test.ts` "has a capability declaration for every registered tool" fails.
- Missing `ALL_MCP_TOOLS` entry → `setup-mcp.test.ts` "ALL_MCP_TOOLS sync" fails.
- An orphan declaration (declared but not registered) → `mcp-list-capabilities.test.ts` "declaration map has no entries for tools that are not registered" fails; so register (Task 4) before/with this.
  `tool-tiers.ts` has no exhaustiveness test but keeps the tool available in the `standard` tier — do it for parity.

**Verification:**

```
npx vitest run packages/cli/tests/commands/setup-mcp.test.ts packages/cli/tests/commands/mcp-list-capabilities.test.ts
```

### Task 6: Add changeset + regenerate MCP reference docs (Phase 5 DoD fold-in)

**Depends on:** Task 5 | **Files:** `.changeset/canary-run-history-adapter.md`, `docs/reference/mcp-tools.md` (generated), `docs/knowledge/intelligence/canary-adapter.md`

**Inputs:** Completed adapter + tool + registry sync.

**Outputs / files touched:**

- CREATE `.changeset/canary-run-history-adapter.md`:

  ```md
  ---
  '@harness-engineering/intelligence': minor
  '@harness-engineering/cli': minor
  ---

  Add `CanaryAdapter.readRunHistory` (new injectable `CanaryReader` file-read seam +
  permissive `canaryRunRecordSchema`/`canaryTestResultSchema`) and the thin
  `canary_run_history` MCP tool. Reads canary's documented NDJSON run-history store
  (`test-results/reports/history-v2.jsonl`) and degrades to `[]` — never throws — on a
  missing/unreadable store or malformed lines. Foundation for graph/outcome-eval ingest.
  ```

- MODIFY `docs/knowledge/intelligence/canary-adapter.md` — add a `readRunHistory` capability subsection + the D1 NDJSON acquisition decision (the read seam generalizes ADR-0039's exec-only boundary to "exec + documented-artifact read").
- REGENERATE `docs/reference/mcp-tools.md` — after a full build, run the reference-doc generator so `canary_run_history` appears.

**Implementation notes:** The generated `docs/reference/mcp-tools.md` requires a built CLI (`dist/`). If building from a worktree, follow the deps-dist/symlink recipe. The D1 ADR itself (`docs/knowledge/decisions/NNNN-canary-ndjson-acquisition.md`) may be authored here or deferred to Phase 3's DoD — but it MUST land before final PR (Integration Points → Architectural Decisions).

**Verification:**

```
harness validate
pnpm generate:plugin:check
npx prettier --check "docs/reference/mcp-tools.md" ".changeset/canary-run-history-adapter.md"
```

## Dependency Ordering

- Task 1 (adapter) → Task 2 (barrels) → Task 3 (tool handler) → Task 4 (server registration) → Task 5 (registry sync) → Task 6 (changeset + docs).
- Strictly linear: each downstream task imports/asserts the previous task's output. Task 5's three files can be edited in one pass (no inter-file dependency among them).

## Verification / Definition of Done

- [ ] `npx vitest run packages/intelligence/src/adapters/canary-history.test.ts` — all degrade-taxonomy cases green (Truths 1-3).
- [ ] `npx vitest run packages/cli/src/mcp/tools/canary.test.ts` — `canary_run_history` handler passes through + degrades to `[]` (Truth 4).
- [ ] `npx vitest run packages/cli/tests/commands/setup-mcp.test.ts packages/cli/tests/commands/mcp-list-capabilities.test.ts` — `ALL_MCP_TOOLS` sync + capability coverage green (Truths 5-6).
- [ ] `npx tsc -p packages/intelligence/tsconfig.json --noEmit` and `npx tsc -p packages/cli/tsconfig.json --noEmit` clean.
- [ ] Boundary test still passes: no canary/file-read reference leaks outside `canary.ts`.
- [ ] `harness validate` exit 0; `.harness/arch/baselines.json` byte-identical to origin/main.
- [ ] Changeset present (`@harness-engineering/intelligence` minor, `@harness-engineering/cli` minor).
- [ ] `pnpm generate:plugin:check` exit 0; `format:check` clean; `docs/reference/mcp-tools.md` regenerated.
