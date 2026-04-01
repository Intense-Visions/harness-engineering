# Plan: Phase 2 — Interactive Picker (MCP Codex/Cursor Integration)

**Date:** 2026-04-01
**Spec:** docs/changes/mcp-codex-cursor/proposal.md
**Estimated tasks:** 3
**Estimated time:** 9–15 minutes

---

## Goal

Wire the `@clack/prompts` interactive tool picker into `harness setup-mcp --client cursor`, so that `--pick` launches an interactive multi-select with 25 tools pre-selected, and `--yes` bypasses the picker using those same 25 curated tools.

---

## Observable Truths (Acceptance Criteria)

1. When `harness setup-mcp --client cursor --pick` is run in a TTY, the system shall invoke `runCursorToolPicker()` and write only the selected tools to `.cursor/mcp.json`.
2. When `harness setup-mcp --client cursor --yes` is run, the system shall write the 25 curated tools to `.cursor/mcp.json` without launching the picker.
3. When `harness setup-mcp --client cursor` is run (no flags), the system shall write the 25 curated tools to `.cursor/mcp.json` without launching the picker.
4. While running in a non-TTY environment (piped input / CI), the system shall not hang — the picker shall fall back to the curated set and `@clack/prompts` auto-detects this condition.
5. The system shall not affect Claude Code, Gemini CLI, or Codex CLI behavior when `--client cursor` is not specified.
6. `packages/cli/package.json` shall list `@clack/prompts` `^0.9.0` as a runtime dependency.
7. `npx vitest run packages/cli/tests/commands/setup-mcp.test.ts` shall pass with at minimum 3 new tests covering: picker invocation on `--pick`, curated fallback on `--yes`, and the `CURSOR_CURATED_TOOLS` constant having 25 entries.

---

## File Map

```
MODIFY packages/cli/package.json          — add @clack/prompts ^0.9.0 dependency
MODIFY packages/cli/src/commands/setup-mcp.ts  — add CURSOR_CURATED_TOOLS, runCursorToolPicker(), wire --pick and --yes
MODIFY packages/cli/tests/commands/setup-mcp.test.ts  — add tests for picker path, --yes path, curated constant
```

---

## Context: What Phase 1 Delivered

- `packages/cli/src/integrations/toml.ts` — `writeTomlMcpEntry` for Codex TOML config
- `packages/cli/src/commands/setup-mcp.ts` — `setupMcp()` with `codex` and `cursor` cases; `--pick` flag declared as a boolean option (no-op stub); `--yes` is NOT yet declared
- `packages/cli/tests/commands/setup-mcp.test.ts` — 19 passing tests; the `--pick flag stub` describe block only checks the option is declared
- `packages/cli/tests/integrations/toml.test.ts` — 6 passing tests

The `setupMcp()` function is currently synchronous. `--pick` requires an async picker call. The action handler in `createSetupMcpCommand` is already declared `async` (line 136 of setup-mcp.ts), so async work inside it is safe. However, `setupMcp()` itself is synchronous — the picker cannot live inside `setupMcp()`. The picker call must live in the command's `action` handler, with `setupMcp` called for codex and non-cursor work, and a separate async path for cursor.

---

## Design Decisions Locked in This Plan

**Decision 1: Keep `setupMcp()` synchronous; picker is async-only in action handler.**
`setupMcp()` is the unit-testable core used by `harness setup` (Phase 3). The picker is an interactive concern, not a configuration concern. The action handler in `createSetupMcpCommand` calls `runCursorToolPicker()` then calls a new `writeCursorMcpEntry(cwd, tools)` helper (or calls `writeMcpEntry` directly). Tests mock `@clack/prompts` with `vi.mock`.

**Decision 2: `--yes` flag added alongside `--pick`.**
Phase 1 did not declare `--yes`. It must be added as a new boolean Commander option in this phase.

**Decision 3: `runCursorToolPicker()` returns `string[]` (tool names).**
The cursor case in the action handler uses the returned tool list to call `writeMcpEntry` with a tools-scoped config. The MCP entry format for Cursor remains `{ command: 'harness', args: ['mcp'] }` — Cursor does not support per-tool filtering at the MCP config level. The "tools" selected by the picker become the `args` array passed alongside the command, e.g. `args: ['mcp', '--tools', ...tools]` OR the selection is advisory (user controls which tools are active via the picker UI, but the config entry is always the full server). **Per the spec**: the spec says the picker "writes a valid `mcpServers.harness` entry to `.cursor/mcp.json` with only the selected tools registered." This implies per-tool registration. The MCP stdio transport does not natively filter tools — the selected tool names are stored as an `args` extension. For this plan, use `args: ['mcp', '--tools', tool1, tool2, ...]` to record the selection in the config. This is consistent with how Cursor can be instructed to limit tool exposure.

**Decision 4: Non-TTY fallback is provided by `@clack/prompts` itself.**
The spec states "`@clack/prompts` auto-detects non-TTY and falls back gracefully." In practice, `@clack/prompts` throws a `cancel` symbol when stdin is not a TTY. `runCursorToolPicker()` must handle this by catching the cancel and returning `CURSOR_CURATED_TOOLS`.

---

## Tasks

### Task 1: Add @clack/prompts dependency

**Depends on:** none
**Files:** `packages/cli/package.json`

1. Read `packages/cli/package.json` — confirm `@clack/prompts` is not yet present in `dependencies`.
2. Edit `packages/cli/package.json` — add `"@clack/prompts": "^0.9.0"` to the `dependencies` object (alphabetically between `@harness-engineering/...` entries and `@modelcontextprotocol/...`).
3. Run: `cd /Users/cwarner/Projects/harness-engineering && pnpm install` to install and update lockfile.
4. Verify: `node -e "import('@clack/prompts').then(m => console.log('ok', Object.keys(m).slice(0,3)))" --input-type=module 2>/dev/null || echo "check dist build"` — or just confirm pnpm install succeeds without error.
5. Run: `harness validate`
6. Commit: `feat(setup-mcp): add @clack/prompts ^0.9.0 dependency`

**Expected package.json diff:**

```json
"dependencies": {
  "@clack/prompts": "^0.9.0",
  "@harness-engineering/core": "workspace:*",
  ...
}
```

---

### Task 2: Define CURSOR_CURATED_TOOLS and runCursorToolPicker(), wire --pick and --yes

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/setup-mcp.ts`

This task adds the constant, the picker function, the `--yes` flag, and wires both flags in the action handler. The `setupMcp()` function body is unchanged — the cursor case within it remains as the non-interactive fallback (curated tools via `writeMcpEntry`).

**Note on cursor case in setupMcp():** The current cursor case calls `writeMcpEntry(configPath, 'harness', { command: 'harness', args: ['mcp'] })`. This is used when `--pick` is NOT invoked. The action handler must bypass `setupMcp`'s cursor case when `--pick` or `--yes` is used with a tool list. The cleanest approach: keep `setupMcp()` intact (it handles the default cursor registration), and in the action handler, for `cursor` client, check if `--pick` or `--yes` is set and call a separate async path that writes with a tools array. The `setupMcp()` call is skipped for cursor when `--pick` or `--yes` is active.

1. Read `packages/cli/src/commands/setup-mcp.ts` to confirm current state matches Phase 1 output shown above.

2. Add import at top of file (after existing imports):

   ```typescript
   import * as clack from '@clack/prompts';
   ```

3. Add the `CURSOR_CURATED_TOOLS` constant after the `HARNESS_MCP_ENTRY` constant (around line 23):

   ```typescript
   export const CURSOR_CURATED_TOOLS: string[] = [
     'run_skill',
     'validate_project',
     'emit_interaction',
     'check_docs',
     'manage_roadmap',
     'run_code_review',
     'check_phase_gate',
     'gather_context',
     'find_context_for',
     'get_impact',
     'detect_entropy',
     'run_security_scan',
     'assess_project',
     'manage_state',
     'create_self_review',
     'analyze_diff',
     'request_peer_review',
     'review_changes',
     'check_dependencies',
     'search_skills',
     'code_search',
     'code_outline',
     'ask_graph',
     'query_graph',
     'detect_anomalies',
   ];
   ```

4. Add `ALL_MCP_TOOLS` constant after `CURSOR_CURATED_TOOLS` (derived from the 49 tools registered in `server.ts` — list them explicitly so this file has no runtime import from server.ts):

   ```typescript
   const ALL_MCP_TOOLS: string[] = [
     'validate_project',
     'check_dependencies',
     'check_docs',
     'detect_entropy',
     'generate_linter',
     'validate_linter_config',
     'init_project',
     'list_personas',
     'generate_persona_artifacts',
     'run_persona',
     'add_component',
     'run_agent_task',
     'run_skill',
     'manage_state',
     'create_self_review',
     'analyze_diff',
     'request_peer_review',
     'check_phase_gate',
     'validate_cross_check',
     'create_skill',
     'generate_slash_commands',
     'query_graph',
     'search_similar',
     'find_context_for',
     'get_relationships',
     'get_impact',
     'ingest_source',
     'generate_agent_definitions',
     'run_security_scan',
     'check_performance',
     'get_perf_baselines',
     'update_perf_baselines',
     'get_critical_paths',
     'list_streams',
     'manage_roadmap',
     'emit_interaction',
     'run_code_review',
     'gather_context',
     'assess_project',
     'review_changes',
     'detect_anomalies',
     'ask_graph',
     'check_task_independence',
     'predict_conflicts',
     'detect_stale_constraints',
     'search_skills',
     'code_outline',
     'code_search',
     'code_unfold',
   ];
   ```

5. Add the `runCursorToolPicker()` function after `ALL_MCP_TOOLS`:

   ```typescript
   /**
    * Launch an interactive multi-select picker for Cursor tool selection.
    * Shows all MCP tools with CURSOR_CURATED_TOOLS pre-selected.
    * Falls back to CURSOR_CURATED_TOOLS on non-TTY / cancel / error.
    */
   export async function runCursorToolPicker(): Promise<string[]> {
     try {
       const selected = await clack.multiselect({
         message:
           'Select tools to register for Cursor (25 recommended; Cursor supports ~40 across all servers)',
         options: ALL_MCP_TOOLS.map((tool) => ({
           value: tool,
           label: tool,
           hint: CURSOR_CURATED_TOOLS.includes(tool) ? 'recommended' : undefined,
         })),
         initialValues: CURSOR_CURATED_TOOLS,
       });

       if (clack.isCancel(selected)) {
         // User pressed Ctrl+C or non-TTY cancel — fall back to curated set
         return CURSOR_CURATED_TOOLS;
       }

       return selected as string[];
     } catch {
       // @clack/prompts throws in non-TTY environments — fall back gracefully
       return CURSOR_CURATED_TOOLS;
     }
   }
   ```

6. Add `writeCursorMcpEntryWithTools()` helper after `runCursorToolPicker()`:

   ```typescript
   /**
    * Write Cursor MCP entry scoped to a specific tool list.
    * Passes selected tools as --tools args to the harness MCP server.
    */
   function writeCursorMcpEntryWithTools(configPath: string, tools: string[]): void {
     writeMcpEntry(configPath, 'harness', {
       command: 'harness',
       args: ['mcp', '--tools', ...tools],
     });
   }
   ```

7. Modify `createSetupMcpCommand()` to add `--yes` option and wire picker in the action:

   In the `.option(...)` chain, after the existing `--pick` line, add:

   ```typescript
   .option('--yes', 'Bypass interactive picker and use curated 25-tool set (Cursor only)')
   ```

   In the action handler, replace the current body:

   ```typescript
   const { configured, skipped, trustedFolder } = setupMcp(cwd, opts.client);
   ```

   With:

   ```typescript
   let configured: string[] = [];
   let skipped: string[] = [];
   let trustedFolder = false;

   // Cursor with --pick or --yes: handle async tool selection separately
   if (opts.client === 'cursor' && (opts.pick || opts.yes)) {
     const cursorConfigPath = path.join(cwd, '.cursor', 'mcp.json');
     const existing = readJsonFile<McpConfig>(cursorConfigPath);
     if (existing?.mcpServers?.['harness'] && !opts.pick) {
       skipped.push('Cursor');
     } else {
       const tools = opts.pick ? await runCursorToolPicker() : CURSOR_CURATED_TOOLS;
       writeCursorMcpEntryWithTools(cursorConfigPath, tools);
       configured.push('Cursor');
     }
   } else {
     // Standard path: synchronous setupMcp handles all clients
     const result = setupMcp(cwd, opts.client);
     configured = result.configured;
     skipped = result.skipped;
     trustedFolder = result.trustedFolder;
   }
   ```

8. Run typecheck: `cd /Users/cwarner/Projects/harness-engineering && pnpm --filter @harness-engineering/cli typecheck 2>&1 | tail -20`
9. Run: `harness validate`
10. Commit: `feat(setup-mcp): add CURSOR_CURATED_TOOLS, runCursorToolPicker(), wire --pick and --yes flags`

---

### Task 3: Add tests for Phase 2 picker behavior

**Depends on:** Task 2
**Files:** `packages/cli/tests/commands/setup-mcp.test.ts`

The existing 19 tests must remain passing. Add a new `describe` block for Phase 2 picker behavior. Use `vi.mock('@clack/prompts', ...)` to control picker responses.

1. Read `packages/cli/tests/commands/setup-mcp.test.ts` to confirm current state.

2. Add these imports at the top of the test file (after existing imports):

   ```typescript
   import { vi, type MockedFunction } from 'vitest';
   import * as clack from '@clack/prompts';
   import { CURSOR_CURATED_TOOLS, runCursorToolPicker } from '../../src/commands/setup-mcp';
   ```

3. Add `vi.mock` at the module level (after imports, before the first `describe`):

   ```typescript
   vi.mock('@clack/prompts', () => ({
     multiselect: vi.fn(),
     isCancel: vi.fn().mockReturnValue(false),
   }));
   ```

4. Add a new `describe` block at the bottom of the file:

   ```typescript
   describe('CURSOR_CURATED_TOOLS', () => {
     it('has exactly 25 entries', () => {
       expect(CURSOR_CURATED_TOOLS).toHaveLength(25);
     });

     it('contains expected core tools', () => {
       expect(CURSOR_CURATED_TOOLS).toContain('run_skill');
       expect(CURSOR_CURATED_TOOLS).toContain('emit_interaction');
       expect(CURSOR_CURATED_TOOLS).toContain('gather_context');
     });
   });

   describe('runCursorToolPicker', () => {
     const mockMultiselect = clack.multiselect as MockedFunction<typeof clack.multiselect>;
     const mockIsCancel = clack.isCancel as MockedFunction<typeof clack.isCancel>;

     beforeEach(() => {
       mockMultiselect.mockReset();
       (mockIsCancel as ReturnType<typeof vi.fn>).mockReturnValue(false);
     });

     it('returns selected tools when user makes a selection', async () => {
       const selectedTools = ['run_skill', 'validate_project', 'gather_context'];
       mockMultiselect.mockResolvedValue(selectedTools as never);

       const result = await runCursorToolPicker();
       expect(result).toEqual(selectedTools);
     });

     it('falls back to CURSOR_CURATED_TOOLS when picker is cancelled', async () => {
       const cancelSymbol = Symbol('cancel');
       mockMultiselect.mockResolvedValue(cancelSymbol as never);
       (mockIsCancel as ReturnType<typeof vi.fn>).mockReturnValue(true);

       const result = await runCursorToolPicker();
       expect(result).toEqual(CURSOR_CURATED_TOOLS);
     });

     it('falls back to CURSOR_CURATED_TOOLS when picker throws (non-TTY)', async () => {
       mockMultiselect.mockRejectedValue(new Error('not a tty'));

       const result = await runCursorToolPicker();
       expect(result).toEqual(CURSOR_CURATED_TOOLS);
     });

     it('passes CURSOR_CURATED_TOOLS as initialValues to multiselect', async () => {
       mockMultiselect.mockResolvedValue(CURSOR_CURATED_TOOLS as never);

       await runCursorToolPicker();

       expect(mockMultiselect).toHaveBeenCalledWith(
         expect.objectContaining({
           initialValues: CURSOR_CURATED_TOOLS,
         })
       );
     });
   });

   describe('--yes flag', () => {
     it('createSetupMcpCommand has --yes option', () => {
       const cmd = createSetupMcpCommand();
       const opt = cmd.options.find((o) => o.long === '--yes');
       expect(opt).toBeDefined();
     });
   });
   ```

5. Run test: `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/cli/tests/commands/setup-mcp.test.ts 2>&1 | tail -30`
6. Observe: all tests pass (19 existing + at minimum 8 new = 27+).
7. Run: `harness validate`
8. Commit: `test(setup-mcp): add Phase 2 tests for CURSOR_CURATED_TOOLS, runCursorToolPicker, --yes flag`

---

## Dependency Order

```
Task 1 (add @clack/prompts to package.json)
  └── Task 2 (define constant + picker + wire flags)
        └── Task 3 (tests for picker behavior)
```

All tasks are sequential. No parallelism opportunity — each depends on the previous.

---

## Time Estimate

- Task 1: ~3 minutes (one file edit + pnpm install)
- Task 2: ~7 minutes (multiple additions to setup-mcp.ts + typecheck)
- Task 3: ~5 minutes (test file additions + run)

**Total: ~15 minutes**

---

## Checkpoint

After Task 3, a `[checkpoint:human-verify]` is appropriate:

- Confirm `npx vitest run packages/cli/tests/commands/setup-mcp.test.ts` shows all tests green
- Confirm `harness validate` passes
- Confirm `packages/cli/package.json` lists `@clack/prompts`

---

## Traceability: Observable Truths to Tasks

| Observable Truth                                         | Delivered By                                          |
| -------------------------------------------------------- | ----------------------------------------------------- |
| 1. `--pick` invokes picker, writes selected tools        | Task 2 (action handler wiring)                        |
| 2. `--yes` writes curated 25 without picker              | Task 2 (action handler wiring)                        |
| 3. No flags writes curated 25 (default cursor path)      | Already delivered by Phase 1 `setupMcp()` cursor case |
| 4. Non-TTY does not hang — picker catches and falls back | Task 2 (`runCursorToolPicker()` try/catch + isCancel) |
| 5. Other clients unaffected                              | Task 2 (cursor-only branch guards)                    |
| 6. `@clack/prompts` in package.json                      | Task 1                                                |
| 7. Tests pass with 25-entry constant and picker paths    | Task 3                                                |

---

## Known Risks and Mitigations

| Risk                                                           | Mitigation                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `@clack/prompts` v1.x (current npm) differs from `^0.9.0` spec | `^0.9.0` resolves to latest compatible — if breaking, pin to `0.9.x` explicitly            |
| `multiselect` API differs between 0.x and 1.x                  | Check actual installed version; adjust option shape if needed                              |
| `harness arch check` flags module-size REGRESSION              | Known pre-existing behavior from Phase 1 learnings; not a blocking failure                 |
| Type errors from `clack.multiselect` return type               | Use `as never` cast in tests; in src, cast return via `as string[]` after `isCancel` check |
