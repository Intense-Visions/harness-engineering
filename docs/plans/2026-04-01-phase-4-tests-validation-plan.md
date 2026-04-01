# Plan: MCP Codex/Cursor Phase 4 -- Tests & Validation (Gap Coverage)

**Date:** 2026-04-01
**Spec:** docs/changes/mcp-codex-cursor/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Close test coverage gaps for the 11 success criteria in the MCP Codex/Cursor spec, ensuring ALL_MCP_TOOLS stays in sync with TOOL_DEFINITIONS, CURSOR_CURATED_TOOLS is a valid subset, flag precedence is correct, and `harness validate` passes as the final gate.

## Observable Truths (Acceptance Criteria)

1. When ALL_MCP_TOOLS in `setup-mcp.ts` diverges from TOOL_DEFINITIONS in `server.ts`, the test suite shall fail with a clear message identifying which tools are missing or extra.
2. When CURSOR_CURATED_TOOLS contains a tool not in ALL_MCP_TOOLS, the test suite shall fail.
3. When `--yes` and `--pick` are both passed for `--client cursor`, the system shall launch the picker (`--pick` takes precedence).
4. When `--pick` is passed for `--client cursor`, the command shall invoke `runCursorToolPicker` and write the selected tools to `.cursor/mcp.json`.
5. The system shall have `harness validate` pass with all new tests included.
6. All 46 existing tests shall continue to pass (no regressions).

## Existing Coverage (46 tests, all passing)

- `toml.test.ts`: 6 tests -- TOML writer create/merge/preserve/idempotent/atomic
- `setup-mcp.test.ts`: 27 tests -- setupMcp 4 clients, curated tools count, picker mock, --yes flag, --pick flag existence
- `setup.test.ts`: 13 tests -- 4-client detection, async runSetup, slash command platforms, Tier 0 integrations

## Gap Analysis vs. 11 Success Criteria

| SC# | Description                           | Current Coverage                                                          | Gap?    |
| --- | ------------------------------------- | ------------------------------------------------------------------------- | ------- |
| 1   | setup + ~/.codex writes TOML          | setupMcp('codex') tested                                                  | No      |
| 2   | setup + ~/.cursor launches picker     | By design, setup.ts calls setupMcp (no picker); picker is --pick only     | No      |
| 3   | Picker writes selected tools          | --yes test covers writeCursorMcpEntryWithTools                            | No      |
| 4   | Without dirs, skips with warn         | setup.test.ts covers 4 clients                                            | No      |
| 5   | setup-mcp --client codex: all tools   | Tested but no assertion that "all tools" = no --tools filter              | Minor   |
| 6   | setup-mcp --client cursor: curated 25 | --yes test covers this path                                               | No      |
| 7   | --pick launches picker standalone     | --pick flag exists; no integration test that it calls runCursorToolPicker | **YES** |
| 8   | Non-TTY does not hang                 | runCursorToolPicker fallback test                                         | No      |
| 9   | Existing Claude/Gemini unaffected     | Multiple tests                                                            | No      |
| 10  | Slash cmds include codex/cursor       | setup.test.ts line 110                                                    | No      |
| 11  | TOML writer no clobber                | toml.test.ts preserves tests                                              | No      |

**Additional gaps not in success criteria:**

- **GAP A**: ALL_MCP_TOOLS must match TOOL_DEFINITIONS names (prevents silent desync)
- **GAP B**: CURSOR_CURATED_TOOLS must be subset of ALL_MCP_TOOLS
- **GAP C**: --yes --pick precedence (--pick wins) not tested

## File Map

- MODIFY `packages/cli/tests/commands/setup-mcp.test.ts` (add sync, subset, precedence, and --pick integration tests)

## Tasks

### Task 1: Add ALL_MCP_TOOLS / TOOL_DEFINITIONS sync test

**Depends on:** none
**Files:** `packages/cli/tests/commands/setup-mcp.test.ts`

1. Add a new `describe('ALL_MCP_TOOLS sync')` block at the end of `setup-mcp.test.ts`:

   ```typescript
   import { getToolDefinitions } from '../../src/mcp/server';

   describe('ALL_MCP_TOOLS sync', () => {
     it('matches TOOL_DEFINITIONS names from server.ts', () => {
       const serverToolNames = getToolDefinitions()
         .map((t) => t.name)
         .sort();
       const setupToolNames = [...ALL_MCP_TOOLS].sort();
       expect(setupToolNames).toEqual(serverToolNames);
     });
   });
   ```

   Note: `ALL_MCP_TOOLS` is not currently exported. If not exported, import it as a named import. Check if it needs to be exported first.

2. If `ALL_MCP_TOOLS` is not exported from `setup-mcp.ts`, add `export` to its declaration in `packages/cli/src/commands/setup-mcp.ts`:
   ```typescript
   export const ALL_MCP_TOOLS: string[] = [
   ```
3. Run test: `cd packages/cli && npx vitest run tests/commands/setup-mcp.test.ts`
4. Observe: test passes (tools are currently in sync)
5. Run: `harness validate`
6. Commit: `test(mcp): add ALL_MCP_TOOLS / TOOL_DEFINITIONS sync guard`

### Task 2: Add CURSOR_CURATED_TOOLS subset test

**Depends on:** Task 1 (needs ALL_MCP_TOOLS export)
**Files:** `packages/cli/tests/commands/setup-mcp.test.ts`

1. Add test inside the existing `describe('CURSOR_CURATED_TOOLS')` block:
   ```typescript
   it('is a subset of ALL_MCP_TOOLS', () => {
     const missing = CURSOR_CURATED_TOOLS.filter((t) => !ALL_MCP_TOOLS.includes(t));
     expect(missing).toEqual([]);
   });
   ```
2. Update the import at the top of the test file to include `ALL_MCP_TOOLS`:
   ```typescript
   import {
     setupMcp,
     createSetupMcpCommand,
     CURSOR_CURATED_TOOLS,
     runCursorToolPicker,
     ALL_MCP_TOOLS,
   } from '../../src/commands/setup-mcp';
   ```
3. Run test: `cd packages/cli && npx vitest run tests/commands/setup-mcp.test.ts`
4. Observe: test passes
5. Run: `harness validate`
6. Commit: `test(mcp): add CURSOR_CURATED_TOOLS subset validation`

### Task 3: Add --pick integration and --yes/--pick precedence tests

**Depends on:** Task 2
**Files:** `packages/cli/tests/commands/setup-mcp.test.ts`

1. Add a new `describe('--pick flag integration')` block:

   ```typescript
   describe('--pick flag integration', () => {
     let tempDir: string;

     beforeEach(() => {
       tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-pick-flag-'));
     });

     afterEach(() => {
       fs.rmSync(tempDir, { recursive: true, force: true });
     });

     it('--pick --client cursor invokes runCursorToolPicker and writes selected tools', async () => {
       const selectedTools = ['run_skill', 'validate_project'];
       (clack.multiselect as MockedFunction<typeof clack.multiselect>).mockResolvedValue(
         selectedTools as never
       );

       const cmd = createSetupMcpCommand();
       const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
       const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
         throw new Error('process.exit');
       });
       const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

       try {
         await cmd.parseAsync(['--client', 'cursor', '--pick'], { from: 'user' });
       } catch (e: unknown) {
         if (!(e instanceof Error) || e.message !== 'process.exit') throw e;
       } finally {
         cwdSpy.mockRestore();
         exitSpy.mockRestore();
         consoleSpy.mockRestore();
       }

       expect(clack.multiselect).toHaveBeenCalled();

       const configPath = path.join(tempDir, '.cursor', 'mcp.json');
       expect(fs.existsSync(configPath)).toBe(true);
       const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
       expect(config.mcpServers.harness.args).toEqual(['mcp', '--tools', ...selectedTools]);
     });

     it('--yes --pick --client cursor: --pick takes precedence and launches picker', async () => {
       const selectedTools = ['gather_context', 'emit_interaction'];
       (clack.multiselect as MockedFunction<typeof clack.multiselect>).mockResolvedValue(
         selectedTools as never
       );

       const cmd = createSetupMcpCommand();
       const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
       const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
         throw new Error('process.exit');
       });
       const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

       try {
         await cmd.parseAsync(['--client', 'cursor', '--yes', '--pick'], { from: 'user' });
       } catch (e: unknown) {
         if (!(e instanceof Error) || e.message !== 'process.exit') throw e;
       } finally {
         cwdSpy.mockRestore();
         exitSpy.mockRestore();
         consoleSpy.mockRestore();
       }

       // --pick should win: multiselect should be called
       expect(clack.multiselect).toHaveBeenCalled();

       const configPath = path.join(tempDir, '.cursor', 'mcp.json');
       const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
       expect(config.mcpServers.harness.args).toEqual(['mcp', '--tools', ...selectedTools]);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/commands/setup-mcp.test.ts`
3. Observe: all tests pass (new + existing)
4. Run: `harness validate`
5. Commit: `test(mcp): add --pick integration and --yes/--pick precedence tests`

### Task 4: Final validation gate

**Depends on:** Task 3
**Files:** none (validation only)

[checkpoint:human-verify] -- Review all test results before final sign-off.

1. Run full test suite for affected files:
   ```bash
   cd packages/cli && npx vitest run tests/integrations/toml.test.ts tests/commands/setup-mcp.test.ts tests/commands/setup.test.ts tests/mcp/server.test.ts
   ```
2. Observe: all tests pass, no regressions
3. Run: `harness validate`
4. Observe: validation passed
5. Commit: no commit needed (validation-only task)
