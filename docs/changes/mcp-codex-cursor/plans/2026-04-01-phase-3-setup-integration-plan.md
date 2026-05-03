# Plan: Phase 3 -- harness setup Integration (MCP Codex/Cursor)

**Date:** 2026-04-01
**Spec:** docs/changes/mcp-codex-cursor/proposal.md
**Estimated tasks:** 4
**Estimated time:** 12-16 minutes

---

## Goal

Extend `harness setup` auto-detection to include Codex CLI and Cursor alongside the existing Claude Code and Gemini CLI clients, make `runMcpSetup` async so the Cursor picker path works, and update slash command generation to include `codex` and `cursor` platforms.

---

## Observable Truths (Acceptance Criteria)

1. When `harness setup` is run on a machine where `~/.codex` exists, the system shall call `setupMcp(cwd, 'codex')` and report "Configured MCP for Codex CLI -> .codex/config.toml".
2. When `harness setup` is run on a machine where `~/.cursor` exists, the system shall call `setupMcp(cwd, 'cursor')` and report "Configured MCP for Cursor -> .cursor/mcp.json".
3. When `harness setup` is run on a machine without `~/.codex` or `~/.cursor`, the system shall skip those clients with a warn-level "not detected" message -- identical to existing Claude Code / Gemini CLI skip behavior.
4. When `harness setup` is run, the system shall call `generateSlashCommands` with `platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor']`.
5. The system shall not alter existing Claude Code or Gemini CLI setup behavior -- all pre-existing test assertions for those platforms continue to pass.
6. While `runMcpSetup` is async, the system shall `await` it correctly so that all downstream steps (Tier 0 integrations, success determination) still execute.
7. `npx vitest run packages/cli/tests/commands/setup.test.ts` shall pass with all tests green, including updated assertions for 4-client detection and 4-platform slash command generation.

---

## File Map

```
MODIFY packages/cli/src/commands/setup.ts        -- add codex/cursor to clients array, make runMcpSetup async, make runSetup async, update platforms array, update createSetupCommand action to async
MODIFY packages/cli/tests/commands/setup.test.ts  -- update mocks and assertions for 4 clients, 4 platforms, async runSetup
```

---

## Tasks

### Task 1: Add Codex CLI and Cursor to clients array and make runMcpSetup async

**Depends on:** none (Phase 1 + Phase 2 already merged)
**Files:** `packages/cli/src/commands/setup.ts`

1. Open `packages/cli/src/commands/setup.ts`.

2. Add import for `runCursorToolPicker` from `setup-mcp`:

   Change line 7:

   ```typescript
   import { setupMcp } from './setup-mcp';
   ```

   to:

   ```typescript
   import { setupMcp, runCursorToolPicker, CURSOR_CURATED_TOOLS } from './setup-mcp';
   ```

   Note: `runCursorToolPicker` and `CURSOR_CURATED_TOOLS` are already exported from `setup-mcp.ts`.

3. Add import for `writeTomlMcpEntry` from `toml`:

   Add after the existing config import on line 11:

   ```typescript
   import { writeTomlMcpEntry } from '../integrations/toml';
   ```

   Note: Actually, `setup.ts` does NOT need these imports. The `setupMcp` function in `setup-mcp.ts` already handles all client-specific logic internally. `setup.ts` only needs to call `setupMcp(cwd, client)` for each detected client. Disregard steps 2-3. The only needed import change is none -- `setupMcp` is already imported.

4. Extend the `clients` array inside `runMcpSetup` (currently lines 52-60). Replace:

   ```typescript
   const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> = [
     { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
     {
       name: 'Gemini CLI',
       dir: '.gemini',
       client: 'gemini',
       configTarget: '.gemini/settings.json',
     },
   ];
   ```

   with:

   ```typescript
   const clients: Array<{ name: string; dir: string; client: string; configTarget: string }> = [
     { name: 'Claude Code', dir: '.claude', client: 'claude', configTarget: '.mcp.json' },
     {
       name: 'Gemini CLI',
       dir: '.gemini',
       client: 'gemini',
       configTarget: '.gemini/settings.json',
     },
     { name: 'Codex CLI', dir: '.codex', client: 'codex', configTarget: '.codex/config.toml' },
     { name: 'Cursor', dir: '.cursor', client: 'cursor', configTarget: '.cursor/mcp.json' },
   ];
   ```

5. Make `runMcpSetup` async. Change the function signature (line 49):

   ```typescript
   function runMcpSetup(cwd: string): StepResult[] {
   ```

   to:

   ```typescript
   async function runMcpSetup(cwd: string): Promise<StepResult[]> {
   ```

   The function body remains unchanged -- `setupMcp(cwd, client)` is synchronous for all clients in the `setup.ts` flow. The async signature is needed because `runSetup` must await it (and Cursor's interactive picker path, if wired through here in the future, would be async). For now, the setup.ts path calls `setupMcp(cwd, client)` which is synchronous for all four clients. The async is forward-compatible.

6. Make `runSetup` async. Change the function signature (line 134):

   ```typescript
   export function runSetup(cwd: string): { steps: StepResult[]; success: boolean } {
   ```

   to:

   ```typescript
   export async function runSetup(cwd: string): Promise<{ steps: StepResult[]; success: boolean }> {
   ```

7. Update the MCP setup call inside `runSetup` (line 149):

   ```typescript
   const mcpResults = runMcpSetup(cwd);
   ```

   to:

   ```typescript
   const mcpResults = await runMcpSetup(cwd);
   ```

8. Update `createSetupCommand` action to be async and await `runSetup` (line 169):

   ```typescript
   .action(() => {
   ```

   to:

   ```typescript
   .action(async () => {
   ```

   And the call to `runSetup` (line 176):

   ```typescript
   const { steps, success } = runSetup(cwd);
   ```

   to:

   ```typescript
   const { steps, success } = await runSetup(cwd);
   ```

9. Run: `npx vitest run packages/cli/tests/commands/setup.test.ts` -- expect failures due to test assertions not yet updated.

10. Run: `harness validate`

11. Do NOT commit yet -- Task 2 updates the tests.

---

### Task 2: Update slash command generation platforms array

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/setup.ts`

1. In `runSlashCommandGeneration` (line 31), change:

   ```typescript
   platforms: ['claude-code', 'gemini-cli'],
   ```

   to:

   ```typescript
   platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor'],
   ```

2. Run: `npx vitest run packages/cli/tests/commands/setup.test.ts` -- expect failures (test assertions not yet updated).

3. Run: `harness validate`

4. Do NOT commit yet -- Task 3 updates the tests.

---

### Task 3: Update setup.test.ts for 4-client detection and async runSetup

**Depends on:** Task 1, Task 2
**Files:** `packages/cli/tests/commands/setup.test.ts`

1. Update the `generateSlashCommands` mock (lines 5-24) to return 4 platforms:

   ```typescript
   vi.mock('../../src/commands/generate-slash-commands', () => ({
     generateSlashCommands: vi.fn(() => [
       {
         platform: 'claude-code',
         added: [],
         updated: [],
         removed: [],
         unchanged: ['foo.md'],
         outputDir: '/home/.claude/commands/harness',
       },
       {
         platform: 'gemini-cli',
         added: [],
         updated: [],
         removed: [],
         unchanged: [],
         outputDir: '/home/.gemini/commands/harness',
       },
       {
         platform: 'codex',
         added: [],
         updated: [],
         removed: [],
         unchanged: [],
         outputDir: '/home/.codex/agents/harness',
       },
       {
         platform: 'cursor',
         added: [],
         updated: [],
         removed: [],
         unchanged: [],
         outputDir: '/home/.cursor/rules/harness',
       },
     ]),
   }));
   ```

2. Update `mockBothClientsExist` to `mockAllClientsExist` (lines 60-67):

   ```typescript
   function mockAllClientsExist() {
     mockExistsSync.mockImplementation((p: fs.PathLike) => {
       const s = String(p);
       if (s === path.join(os.homedir(), '.claude')) return true;
       if (s === path.join(os.homedir(), '.gemini')) return true;
       if (s === path.join(os.homedir(), '.codex')) return true;
       if (s === path.join(os.homedir(), '.cursor')) return true;
       return false;
     });
   }
   ```

3. Update `beforeEach` to call `mockAllClientsExist()` instead of `mockBothClientsExist()`.

4. Update the first test ("passes all steps when Node >= 22 and both clients detected", line 78):
   - Change description to: `'passes all steps when Node >= 22 and all clients detected'`
   - Change `const { steps, success } = runSetup('/tmp/test');` to `const { steps, success } = await runSetup('/tmp/test');`
   - Change `expect(steps).toHaveLength(5)` to `expect(steps).toHaveLength(7)` (node + slash + 4 MCP clients + tier0 = 7)
   - Change `expect(generateSlashCommands).toHaveBeenCalledWith(expect.objectContaining({ global: true, platforms: ['claude-code', 'gemini-cli'], yes: true }))` to `expect(generateSlashCommands).toHaveBeenCalledWith(expect.objectContaining({ global: true, platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor'], yes: true }))`
   - Change `expect(setupMcp).toHaveBeenCalledTimes(2)` to `expect(setupMcp).toHaveBeenCalledTimes(4)`
   - Change `expect(steps[4].status).toBe('pass')` to `expect(steps[6].status).toBe('pass')` (tier0 is now at index 6)
   - Make the `it` callback `async`

5. Update the "fails immediately when Node < 22" test (line 98):
   - Make callback `async`
   - Change `const { steps, success } = runSetup('/tmp/test');` to `const { steps, success } = await runSetup('/tmp/test');`

6. Update the "warns when a client directory is not detected" test (line 111):
   - Make callback `async`
   - Change `const { steps, success } = runSetup('/tmp/test');` to `const { steps, success } = await runSetup('/tmp/test');`
   - Update the mock to also return false for `.codex` and `.cursor` (already covered by default false)
   - Change `expect(steps).toHaveLength(5)` to `expect(steps).toHaveLength(7)` (1 claude detected + 3 undetected = 4 MCP steps, plus node + slash + tier0 = 7)
   - Change `expect(setupMcp).toHaveBeenCalledTimes(1)` to `expect(setupMcp).toHaveBeenCalledTimes(1)` (only claude detected, so still 1)
   - The `geminiStep` at `steps[3]` is still correct (index: 0=node, 1=slash, 2=claude-pass, 3=gemini-warn)
   - But we must also check that codex and cursor warn steps exist:
     ```typescript
     const codexStep = steps[4];
     expect(codexStep.status).toBe('warn');
     expect(codexStep.message).toContain('Codex CLI not detected');
     const cursorStep = steps[5];
     expect(cursorStep.status).toBe('warn');
     expect(cursorStep.message).toContain('Cursor not detected');
     ```

7. Update the "warns when no clients are detected" test (line 132):
   - Make callback `async`
   - Change `const { steps, success } = runSetup('/tmp/test');` to `const { steps, success } = await runSetup('/tmp/test');`
   - Change `expect(mcpSteps).toHaveLength(2)` to `expect(mcpSteps).toHaveLength(4)` (all 4 clients not detected)

8. Update the "does not call markSetupComplete when slash generation fails" test (line 145):
   - Make callback `async`
   - Change `const { steps, success } = runSetup('/tmp/test');` to `const { steps, success } = await runSetup('/tmp/test');`

9. Update the "is idempotent" test (line 159):
   - Make callback `async`
   - Change both `runSetup('/tmp/test')` calls to `await runSetup('/tmp/test')`
   - Update the `vi.clearAllMocks()` + re-mock call to use `mockAllClientsExist()`

10. Update the `configureTier0Integrations` tests that use `mockExistsSync` (line 232) -- these should still work because they set their own mocks. But verify the mock in the "also writes Tier 0 to .gemini" test includes the new dirs:

    ```typescript
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join('/tmp/test', '.gemini')) return true;
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return true;
      if (s === path.join(os.homedir(), '.codex')) return true;
      if (s === path.join(os.homedir(), '.cursor')) return true;
      return false;
    });
    ```

    Actually, `configureTier0Integrations` does not use `detectClient` -- it only checks `fs.existsSync` for the `.gemini` project dir. The existing mocks should be fine as-is. No change needed here.

11. Run: `npx vitest run packages/cli/tests/commands/setup.test.ts`

12. Observe: all tests pass.

13. Run: `harness validate`

14. Commit: `feat(setup): add Codex CLI and Cursor to harness setup auto-detection and slash command generation`

---

### Task 4: Verify end-to-end and run full test suite

**Depends on:** Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run packages/cli/tests/commands/setup.test.ts` -- all tests pass.

2. Run: `npx vitest run packages/cli/tests/commands/setup-mcp.test.ts` -- all tests pass (no changes, regression check).

3. Run: `npx vitest run packages/cli/` -- full CLI test suite passes.

4. Run: `harness validate` -- passes.

5. Verify manually: Open `packages/cli/src/commands/setup.ts` and confirm:
   - `clients` array has 4 entries: Claude Code, Gemini CLI, Codex CLI, Cursor
   - `runMcpSetup` is `async` and returns `Promise<StepResult[]>`
   - `runSetup` is `async` and returns `Promise<{ steps: StepResult[]; success: boolean }>`
   - `createSetupCommand` action is `async` and `await`s `runSetup`
   - `platforms` array is `['claude-code', 'gemini-cli', 'codex', 'cursor']`

6. Confirm: Phase 3 of the spec (Steps 5 and 6) is complete.
