# Plan: Orchestrator Main-Sync — Phase 2 Maintenance Task Wiring

**Date:** 2026-05-09 | **Spec:** `docs/changes/orchestrator-main-sync/proposal.md` | **Tasks:** 8 | **Time:** ~28 min | **Integration Tier:** small

## Goal

Register `main-sync` as a built-in housekeeping task whose `--json` `SyncMainResult` is captured by `TaskRunner` and recorded in run history, verified end-to-end through `POST /api/maintenance/trigger`.

## Context

Phase 1 shipped `syncMain()` (`packages/orchestrator/src/maintenance/sync-main.ts`) and the `harness sync-main [--json]` CLI command (`packages/cli/src/commands/sync-main.ts`). Phase 1 review is clean; `harness validate` and `harness check-deps` pass on `main`.

This phase does the wiring so the helper actually runs on a 15-minute cron and surfaces results in the dashboard's existing event/history stream. **Out of scope:** D6 baseref_fallback warning (Phase 3), dashboard per-row buttons (Phase 4).

## Observable Truths (Acceptance Criteria)

1. **(R1, D3 — Ubiquitous)** `BUILT_IN_TASKS` exported from `packages/orchestrator/src/maintenance/task-registry.ts` contains exactly one entry whose `id === 'main-sync'`, `type === 'housekeeping'`, `description === 'Fast-forward local default branch from origin'`, `schedule === '*/15 * * * *'`, `branch === null`, and `checkCommand` deep-equals `['harness', 'sync-main', '--json']`. The registry length increases from 20 to 21.
2. **(R1 — Event-driven)** When `TaskRunner.run({ id: 'main-sync', type: 'housekeeping', checkCommand: ['harness', 'sync-main', '--json'] })` is invoked and the executor returns stdout `'{"status":"updated","from":"abc","to":"def","defaultBranch":"main"}\n'`, the returned `RunResult` shall have `status: 'success'`, `findings: 0`, and a structured field carrying the parsed `SyncMainResult` so the reporter can persist it.
3. **(D2 — Event-driven)** When the executor stdout is `'{"status":"skipped","reason":"dirty-conflict","detail":"…","defaultBranch":"main"}\n'`, the returned `RunResult` shall have `status: 'skipped'`, `findings: 0`, and the parsed payload preserved (no `failure`).
4. **(Error Handling — Event-driven)** When the executor stdout is `'{"status":"error","message":"git not found"}\n'`, the returned `RunResult` shall have `status: 'failure'` with `error` containing `'git not found'`.
5. **(Backwards-compat — Ubiquitous)** Existing housekeeping tasks (`session-cleanup`, `perf-baselines`) whose stdout is empty or non-JSON shall still resolve with `status: 'success'`, `findings: 0` — no behavior change for legacy housekeeping output.
6. **(Smoke test — Event-driven)** When `triggerFn('main-sync')` (per `orchestrator.ts:551-559`) is invoked against an in-memory orchestrator harness whose `commandExecutor.exec` is stubbed to return a synthetic `{"status":"updated",…}\n` line, the call shall complete without throwing, the reporter shall record one entry whose `taskId === 'main-sync'` and `status === 'success'`, and `maintenance:completed` shall be emitted with the same payload.
7. **(Documentation — Ubiquitous)** `harness.orchestrator.md` shall mention `main-sync` in or adjacent to the `maintenance:` config block, briefly describing what it does and how to disable maintenance.
8. **(Health gate — Ubiquitous)** `pnpm harness validate` and `pnpm harness check-deps` shall pass with no errors after the change.

## Uncertainties

- **[ASSUMPTION]** The latent bug in `commandExecutor` at `orchestrator.ts:466-485` (which shells out to `command[0]` as a literal binary on PATH) is **dodged** for `main-sync` by registering `checkCommand: ['harness', 'sync-main', '--json']` — the `harness` CLI is on PATH. The bug remains for the two existing housekeeping tasks (`['cleanup-sessions']`, `['perf', 'baselines', 'update']`) and is **out of scope** for this spec; track separately. The smoke test still mocks `CommandExecutor.exec` to keep the test deterministic.
- **[ASSUMPTION]** Modifying `CommandExecutor.exec` to return `{ stdout: string }` instead of `Promise<void>` is acceptable because the only producer is `orchestrator.ts:466` and the only consumer is `runHousekeeping` in `task-runner.ts:349`. The signature change is internal to the maintenance module and not part of the package's public API surface (it is exported as a `type` from `maintenance/index.ts:40`, but only for DI in tests).
- **[DEFERRABLE]** The wire-format for "structured field carrying the parsed `SyncMainResult`" — we will use the existing `RunResult.error` field for `error`/`skipped` reasons and rely on the reporter's existing serialization. No new fields on `RunResult`. If a richer payload is needed (e.g., dashboard wants `from`/`to` SHAs), that's Phase 4.
- **[DEFERRABLE]** Per-task disable knob (mentioned in spec "Configuration: Per-task disable is not part of this spec"). Confirmed deferred — `maintenance.enabled` is the only switch.

## File Map

```
MODIFY packages/orchestrator/src/maintenance/task-registry.ts      (append main-sync entry)
MODIFY packages/orchestrator/src/maintenance/task-runner.ts        (housekeeping JSON capture + parsing)
MODIFY packages/orchestrator/src/orchestrator.ts                   (CommandExecutor.exec returns { stdout })
MODIFY packages/orchestrator/tests/maintenance/task-registry.test.ts        (assert main-sync entry; bump count to 21)
MODIFY packages/orchestrator/tests/maintenance/task-runner.test.ts          (housekeeping JSON parse cases)
CREATE packages/orchestrator/tests/maintenance/main-sync-trigger.test.ts    (end-to-end trigger smoke test)
MODIFY harness.orchestrator.md                                              (one-paragraph note about main-sync)
```

No new public exports from `@harness-engineering/orchestrator`. No new MCP tools. No barrel regen expected.

## Tasks

---

### Task 1: Add `main-sync` to `BUILT_IN_TASKS`

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/task-registry.ts`

1. Open `packages/orchestrator/src/maintenance/task-registry.ts`.
2. After the `perf-baselines` entry (currently the last item, lines 179-186) and before the closing `] as const;`, append the entry below. **Pattern reference:** `session-cleanup` (lines 171-178) and `perf-baselines` (lines 179-186).

   ```ts
     {
       id: 'main-sync',
       type: 'housekeeping',
       description: 'Fast-forward local default branch from origin',
       schedule: '*/15 * * * *',
       branch: null,
       checkCommand: ['harness', 'sync-main', '--json'],
     },
   ```

3. Update the JSDoc header comment (lines 3-11) so the housekeeping count reads `(3)` instead of `(2)`. Specifically change:

   ```ts
    * - housekeeping (2): Mechanical command, no AI, no PR.
   ```

   to

   ```ts
    * - housekeeping (3): Mechanical command, no AI, no PR.
   ```

   And change line 4 from `All 20 built-in maintenance task definitions` to `All 21 built-in maintenance task definitions`.

4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` (must pass — no other type changes here).
5. Run: `pnpm harness validate` (must pass).
6. Commit: `feat(orchestrator): register main-sync built-in maintenance task`.

---

### Task 2 (TDD red): registry assertions for `main-sync`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-registry.test.ts`

1. Open `packages/orchestrator/tests/maintenance/task-registry.test.ts`.
2. Change the count assertion from 20 → 21:

   ```ts
   it('exports exactly 21 built-in task definitions', () => {
     expect(BUILT_IN_TASKS).toHaveLength(21);
   });
   ```

3. In `describe('housekeeping tasks have checkCommand and null branch', …)` (currently lines 61-69), change the count assertion from 2 → 3:

   ```ts
   expect(housekeeping.length).toBe(3);
   ```

4. After the `perf-baselines: daily 7am, housekeeping` test (lines 192-197), add a sibling `it()`:

   ```ts
   it('main-sync: every 15 min, housekeeping', () => {
     const t = taskMap.get('main-sync')!;
     expect(t.type).toBe('housekeeping');
     expect(t.schedule).toBe('*/15 * * * *');
     expect(t.branch).toBeNull();
     expect(t.checkCommand).toEqual(['harness', 'sync-main', '--json']);
     expect(t.description).toBe('Fast-forward local default branch from origin');
     expect(t.fixSkill).toBeUndefined();
   });
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator test --run tests/maintenance/task-registry.test.ts`.
6. Confirm all assertions PASS (the registry already has the entry from Task 1 — this is a "double-confirm" pattern, not red→green, because Task 1 was the production change).
7. Run: `pnpm harness validate`.
8. Commit: `test(orchestrator): assert main-sync registered in BUILT_IN_TASKS`.

---

### Task 3 (TDD red): housekeeping JSON-capture tests

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Open `packages/orchestrator/tests/maintenance/task-runner.test.ts`.
2. Locate the existing `describe('housekeeping tasks', …)` block (search for `housekeeping`). If absent, place the new block immediately before the final closing `});` of `describe('TaskRunner', …)`.
3. Update `createMockCommandExecutor` (lines 36-40) to accept a configurable stdout return:

   ```ts
   function createMockCommandExecutor(stdout = ''): CommandExecutor {
     return {
       exec: vi.fn().mockResolvedValue({ stdout }),
     };
   }
   ```

4. Add this nested `describe` block at the bottom of `describe('TaskRunner', …)`:

   ```ts
   describe('housekeeping JSON capture (sync-main contract)', () => {
     const SYNC_TASK: TaskDefinition = {
       id: 'main-sync',
       type: 'housekeeping',
       description: 'Fast-forward local default branch from origin',
       schedule: '*/15 * * * *',
       branch: null,
       checkCommand: ['harness', 'sync-main', '--json'],
     };

     it("maps sync-main 'updated' JSON to status: 'success' with no findings", async () => {
       const stdout =
         '{"status":"updated","from":"aaaaaaa","to":"bbbbbbb","defaultBranch":"main"}\n';
       const executor = createMockCommandExecutor(stdout);
       const runner = new TaskRunner(createRunnerOptions({ commandExecutor: executor }));

       const result = await runner.run(SYNC_TASK);

       expect(result.status).toBe('success');
       expect(result.findings).toBe(0);
       expect(result.error).toBeUndefined();
       expect(executor.exec).toHaveBeenCalledWith(
         ['harness', 'sync-main', '--json'],
         '/test/project'
       );
     });

     it("maps sync-main 'no-op' JSON to status: 'success'", async () => {
       const stdout = '{"status":"no-op","defaultBranch":"main"}\n';
       const runner = new TaskRunner(
         createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
       );
       const result = await runner.run(SYNC_TASK);
       expect(result.status).toBe('success');
     });

     it("maps sync-main 'skipped' JSON to status: 'skipped' with reason in error field", async () => {
       const stdout =
         '{"status":"skipped","reason":"dirty-conflict","detail":"local edits","defaultBranch":"main"}\n';
       const runner = new TaskRunner(
         createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
       );
       const result = await runner.run(SYNC_TASK);
       expect(result.status).toBe('skipped');
       expect(result.error).toContain('dirty-conflict');
       expect(result.error).toContain('local edits');
     });

     it("maps sync-main 'error' JSON to status: 'failure' with error message", async () => {
       const stdout = '{"status":"error","message":"git binary missing"}\n';
       const runner = new TaskRunner(
         createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
       );
       const result = await runner.run(SYNC_TASK);
       expect(result.status).toBe('failure');
       expect(result.error).toContain('git binary missing');
     });

     it('falls back to status: success for legacy housekeeping with empty stdout', async () => {
       const SESSION_CLEANUP: TaskDefinition = {
         id: 'session-cleanup',
         type: 'housekeeping',
         description: 'Clean up stale orchestrator sessions',
         schedule: '0 0 * * *',
         branch: null,
         checkCommand: ['cleanup-sessions'],
       };
       const runner = new TaskRunner(
         createRunnerOptions({ commandExecutor: createMockCommandExecutor('') })
       );
       const result = await runner.run(SESSION_CLEANUP);
       expect(result.status).toBe('success');
       expect(result.findings).toBe(0);
     });

     it('falls back to status: success for non-JSON stdout', async () => {
       const runner = new TaskRunner(
         createRunnerOptions({
           commandExecutor: createMockCommandExecutor('cleaned 4 sessions\n'),
         })
       );
       const result = await runner.run({
         ...SYNC_TASK,
         id: 'session-cleanup',
         checkCommand: ['cleanup-sessions'],
       });
       expect(result.status).toBe('success');
       expect(result.findings).toBe(0);
     });

     it('returns failure when executor throws', async () => {
       const executor: CommandExecutor = {
         exec: vi.fn().mockRejectedValue(new Error('spawn ENOENT')),
       };
       const runner = new TaskRunner(createRunnerOptions({ commandExecutor: executor }));
       const result = await runner.run(SYNC_TASK);
       expect(result.status).toBe('failure');
       expect(result.error).toContain('spawn ENOENT');
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator test --run tests/maintenance/task-runner.test.ts`.
6. **Expected:** all seven new tests FAIL — `runHousekeeping` currently ignores stdout and returns hardcoded `success`. The executor signature change in step 3 also breaks any other test that mocks `commandExecutor`. Fix any unrelated breakage in step 7 of Task 4. Capture the failing test names in the commit body.
7. Commit: `test(orchestrator): red — housekeeping JSON capture for sync-main contract`.

---

### Task 4: Implement housekeeping JSON capture in `TaskRunner`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/maintenance/task-runner.ts`, `packages/orchestrator/src/orchestrator.ts`

1. **Update `CommandExecutor` interface** in `packages/orchestrator/src/maintenance/task-runner.ts` (lines 53-61) so `exec` returns stdout:

   ```ts
   /**
    * Interface for running housekeeping commands directly.
    */
   export interface CommandExecutor {
     /**
      * Executes a command directly (no AI). Returns captured stdout so
      * housekeeping tasks emitting a JSON status line (e.g. `sync-main --json`)
      * can be parsed by the runner.
      *
      * @param command - Command args (e.g., ['cleanup-sessions'])
      * @param cwd - Working directory
      */
     exec(command: string[], cwd: string): Promise<CommandExecResult>;
   }

   export interface CommandExecResult {
     /** Captured stdout. May be empty for legacy housekeeping commands. */
     stdout: string;
   }
   ```

2. **Rewrite `runHousekeeping`** (lines 349-366) to parse `--json` output. Reuse the existing `parseStatusLine` helper at the bottom of the same file (lines 413-442) — it already handles the contract. Extend it to also recognize `'updated'`, `'no-op'`, and `'error'` because they are the `SyncMainResult` discriminator values.

   First, **extend `parseStatusLine`'s recognized statuses**. Replace the if-condition on the parsed `status` (around line 424) and the `ParsedStatus` interface as follows:

   ```ts
   interface ParsedStatus {
     /** The maintenance run-result status this output maps to. */
     status: RunResult['status'];
     candidatesFound?: number;
     error?: string;
     reason?: string;
     /** Original raw status from the JSON line, preserved for error/skip messages. */
     rawStatus?: string;
   }

   function parseStatusLine(output: string): ParsedStatus | null {
     const lines = output
       .split('\n')
       .map((l) => l.trim())
       .filter(Boolean);
     for (let i = lines.length - 1; i >= 0; i--) {
       const line = lines[i];
       if (!line || !line.startsWith('{') || !line.endsWith('}')) continue;
       try {
         const obj = JSON.parse(line) as Record<string, unknown>;
         const s = obj.status;
         // Phase 4/5 contract: 'success' | 'skipped' | 'failure' | 'no-issues'
         if (s === 'success' || s === 'skipped' || s === 'failure' || s === 'no-issues') {
           const parsed: ParsedStatus = { status: s, rawStatus: s };
           if (typeof obj.candidatesFound === 'number')
             parsed.candidatesFound = obj.candidatesFound;
           if (typeof obj.error === 'string') parsed.error = obj.error;
           if (typeof obj.reason === 'string') parsed.reason = obj.reason;
           return parsed;
         }
         // sync-main contract: 'updated' | 'no-op' | 'skipped' | 'error'
         if (s === 'updated' || s === 'no-op') {
           return { status: 'success', rawStatus: s };
         }
         if (s === 'error') {
           const message = typeof obj.message === 'string' ? obj.message : 'unknown error';
           return { status: 'failure', error: message, rawStatus: 'error' };
         }
         // sync-main 'skipped' shape includes `reason` + `detail` (no `error` field)
         // — falls through to the report-only branch above which already handles
         // status === 'skipped'. Detail is captured by augmentation below.
       } catch {
         // not JSON; keep scanning earlier lines
       }
     }
     return null;
   }
   ```

   Then **also** capture `detail` for the sync-main `skipped` shape. Modify the `'skipped'` branch above by inserting one more field-extraction line just before `return parsed;`:

   ```ts
   if (typeof obj.detail === 'string' && !parsed.error) {
     // sync-main skipped shape: { status: 'skipped', reason, detail, defaultBranch }
     parsed.error = `${parsed.reason ?? 'skipped'}: ${obj.detail}`;
   }
   ```

3. **Replace `runHousekeeping`** (lines 349-366) with:

   ```ts
   /**
    * Housekeeping: run command directly, no AI, no PR.
    *
    * Captures stdout and parses a trailing JSON status line if present.
    * Recognized contracts:
    *   - Phase 4/5 status contract (e.g., harness pulse run): success/skipped/failure/no-issues
    *   - sync-main contract: updated/no-op/skipped/error → mapped onto the run-result status
    * Legacy housekeeping commands that emit no JSON keep the prior behavior:
    *   status: 'success', findings: 0.
    */
   private async runHousekeeping(task: TaskDefinition, startedAt: string): Promise<RunResult> {
     if (!task.checkCommand || task.checkCommand.length === 0) {
       return this.failureResult(task.id, startedAt, 'housekeeping task missing checkCommand');
     }

     let stdout = '';
     try {
       const out = await this.commandExecutor.exec(task.checkCommand, this.cwd);
       stdout = out.stdout ?? '';
     } catch (err) {
       return this.failureResult(task.id, startedAt, String(err));
     }

     const parsed = parseStatusLine(stdout);
     const status: RunResult['status'] = parsed?.status ?? 'success';
     const result: RunResult = {
       taskId: task.id,
       startedAt,
       completedAt: new Date().toISOString(),
       status,
       findings: 0,
       fixed: 0,
       prUrl: null,
       prUpdated: false,
     };
     if (parsed?.error) result.error = parsed.error;
     return result;
   }
   ```

4. **Update the orchestrator's `commandExecutor` factory** in `packages/orchestrator/src/orchestrator.ts` (lines 466-485) to capture and return stdout:

   ```ts
   const commandExecutor: CommandExecutor = {
     exec: async (command: string[], cwd: string) => {
       const { execFile } = await import('node:child_process');
       const { promisify } = await import('node:util');
       const execFileAsync = promisify(execFile);
       const [cmd, ...args] = command;
       if (!cmd) return { stdout: '' };

       try {
         const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 120_000 });
         return { stdout: String(stdout) };
       } catch (err) {
         logger.warn('Maintenance command execution failed', {
           command,
           cwd,
           error: String(err),
         });
         throw err;
       }
     },
   };
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`. Expect 0 errors.
6. Run: `pnpm --filter @harness-engineering/orchestrator test --run tests/maintenance/task-runner.test.ts`. **All seven** new tests from Task 3 must now pass. The pre-existing report-only tests must also still pass — `parseStatusLine`'s extension is additive.
7. Run: `pnpm --filter @harness-engineering/orchestrator test --run tests/maintenance/`. Full maintenance suite must pass. Fix any other test that mocked `commandExecutor.exec` to return `undefined` — they need to return `{ stdout: '' }`. Likely candidates: any pre-existing test in `task-runner.test.ts` that exercises the housekeeping path with a mock from `createMockCommandExecutor`.
8. Run: `pnpm harness validate` and `pnpm harness check-deps`. Both must pass.
9. Commit: `feat(orchestrator): capture housekeeping stdout and parse sync-main JSON status`.

---

### Task 5 (TDD red): smoke test for `POST /api/maintenance/trigger` → main-sync

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/maintenance/main-sync-trigger.test.ts` (CREATE)

This test invokes the trigger pathway programmatically rather than via HTTP because the existing `maintenance-routes.test.ts` already covers the HTTP framing (`POST /api/maintenance/trigger` with `{taskId}`); what we need to assert here is the chain `triggerFn → scheduler.getOnTaskDue → TaskRunner.run(housekeeping) → reporter.record`. This mirrors the spec's allowance: "via `POST /api/maintenance/trigger` (or programmatically via `scheduler.getOnTaskDue()` per the orchestrator's existing test pattern)."

1. Create `packages/orchestrator/tests/maintenance/main-sync-trigger.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { TaskRunner } from '../../src/maintenance/task-runner';
   import { MaintenanceReporter } from '../../src/maintenance/reporter';
   import { BUILT_IN_TASKS } from '../../src/maintenance/task-registry';
   import type {
     CheckCommandRunner,
     AgentDispatcher,
     CommandExecutor,
   } from '../../src/maintenance/task-runner';
   import { mkdtempSync, rmSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';

   const SILENT_LOGGER = {
     debug: () => {},
     info: () => {},
     warn: () => {},
     error: () => {},
   };

   function silentChecks(): CheckCommandRunner {
     return { run: vi.fn().mockResolvedValue({ passed: true, findings: 0, output: '' }) };
   }
   function silentAgent(): AgentDispatcher {
     return { dispatch: vi.fn().mockResolvedValue({ producedCommits: false, fixed: 0 }) };
   }

   describe('main-sync trigger smoke (Phase 2)', () => {
     it('routes a triggered main-sync run through TaskRunner.runHousekeeping and records the result', async () => {
       const persistDir = mkdtempSync(join(tmpdir(), 'main-sync-trigger-'));
       try {
         const reporter = new MaintenanceReporter({
           persistDir,
           logger: SILENT_LOGGER,
         });
         await reporter.load();

         const stdout =
           '{"status":"updated","from":"aaaaaaa","to":"bbbbbbb","defaultBranch":"main"}\n';
         const executor: CommandExecutor = {
           exec: vi.fn().mockResolvedValue({ stdout }),
         };

         const taskRunner = new TaskRunner({
           config: { enabled: true },
           checkRunner: silentChecks(),
           agentDispatcher: silentAgent(),
           commandExecutor: executor,
           cwd: persistDir,
         });

         const task = BUILT_IN_TASKS.find((t) => t.id === 'main-sync');
         expect(task).toBeDefined();

         // Simulate the orchestrator's onTaskDue callback (orchestrator.ts:517-541).
         const result = await taskRunner.run(task!);
         await reporter.record(result);

         expect(executor.exec).toHaveBeenCalledWith(['harness', 'sync-main', '--json'], persistDir);
         expect(result.taskId).toBe('main-sync');
         expect(result.status).toBe('success');
         expect(result.findings).toBe(0);
         expect(result.error).toBeUndefined();

         const history = reporter.getHistory(10, 0);
         expect(history).toHaveLength(1);
         expect(history[0]!.taskId).toBe('main-sync');
         expect(history[0]!.status).toBe('success');
       } finally {
         rmSync(persistDir, { recursive: true, force: true });
       }
     });

     it('records a skipped sync-main run with the skip reason in the run history', async () => {
       const persistDir = mkdtempSync(join(tmpdir(), 'main-sync-trigger-skip-'));
       try {
         const reporter = new MaintenanceReporter({ persistDir, logger: SILENT_LOGGER });
         await reporter.load();

         const stdout =
           '{"status":"skipped","reason":"diverged","detail":"local main has 2 extra commits","defaultBranch":"main"}\n';
         const executor: CommandExecutor = {
           exec: vi.fn().mockResolvedValue({ stdout }),
         };

         const taskRunner = new TaskRunner({
           config: { enabled: true },
           checkRunner: silentChecks(),
           agentDispatcher: silentAgent(),
           commandExecutor: executor,
           cwd: persistDir,
         });
         const task = BUILT_IN_TASKS.find((t) => t.id === 'main-sync')!;
         const result = await taskRunner.run(task);
         await reporter.record(result);

         expect(result.status).toBe('skipped');
         expect(result.error).toContain('diverged');

         const history = reporter.getHistory(10, 0);
         expect(history).toHaveLength(1);
         expect(history[0]!.status).toBe('skipped');
         expect(history[0]!.error).toContain('diverged');
       } finally {
         rmSync(persistDir, { recursive: true, force: true });
       }
     });
   });
   ```

2. **Verify the `MaintenanceReporter` constructor signature matches** by skimming `packages/orchestrator/src/maintenance/reporter.ts` for the exported `MaintenanceReporterOptions` shape. If the option name differs (e.g., `historyDir` instead of `persistDir`), update the test calls before running. **Pattern reference:** the existing `reporter.test.ts` in the same directory uses the same constructor and is the authoritative example.
3. Run: `pnpm --filter @harness-engineering/orchestrator test --run tests/maintenance/main-sync-trigger.test.ts`.
4. **Expected:** PASS (Task 4 already wired the JSON capture). If FAIL, the failure should reveal a mismatch between assumed reporter API and reality — fix the test, do not re-engineer Task 4.
5. Run: `pnpm harness validate`.
6. Commit: `test(orchestrator): smoke-test main-sync trigger end-to-end through TaskRunner + reporter`.

---

### Task 6: Update `harness.orchestrator.md` with `main-sync` documentation

**Depends on:** Task 1 | **Files:** `harness.orchestrator.md` | **Category:** integration

1. Open `harness.orchestrator.md`.
2. Locate the `maintenance:` section in the YAML frontmatter (line 67-68 currently):

   ```yaml
   maintenance:
     enabled: true
   ```

3. Add a comment immediately above the `maintenance:` key so the note is co-located with the toggle:

   ```yaml
   # Built-in maintenance tasks run on cron when `maintenance.enabled: true`.
   # Notable housekeeping tasks: `main-sync` (every 15 min) fast-forwards the
   # orchestrator's local default branch from origin so files read from `cwd`
   # (e.g., docs/roadmap.md, harness.orchestrator.md) stay current. Sync is
   # fast-forward-only — never destructive — and skips with a structured
   # warning event if the working tree is dirty, the branch is wrong, or the
   # local default has diverged. Disable all maintenance via `maintenance.enabled: false`.
   maintenance:
     enabled: true
   ```

4. Run: `pnpm harness validate`.
5. Run: `pnpm harness check-docs` if available; otherwise skip. **Pattern reference:** the existing housekeeping tasks do not have per-task docs; this single co-located block satisfies spec's Documentation Updates Integration Point.
6. Commit: `docs(orchestrator): describe main-sync maintenance task adjacent to maintenance config`.

---

### Task 7: Full quality gate

**Depends on:** Tasks 2, 4, 5, 6 | **Files:** none (gates only)

1. Run the full orchestrator test suite: `pnpm --filter @harness-engineering/orchestrator test --run`. Required: all green. If any pre-existing test broke, it is almost certainly because it mocked `commandExecutor.exec` to resolve `undefined` (now needs to resolve `{ stdout: '' }`). Fix in place — do not skip.
2. Run the CLI test suite: `pnpm --filter @harness-engineering/cli test --run`. Phase 1 noted 8 pre-existing failures in `graph.test.ts` and `glob-helper.test.ts`; only flag a regression if the failure count climbs above 8 or shifts to a different file.
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`. Required: 0 errors.
4. Run: `pnpm harness validate`. Required: pass.
5. Run: `pnpm harness check-deps`. Required: pass.
6. Run: `pnpm --filter @harness-engineering/cli generate-barrels --check` if the script exists; otherwise skip. **Reason:** Phase 1 found this catches latent registry drift. Phase 2 does not add new commands so it should be a no-op, but cheap to verify.
7. If everything passes, no commit needed. If anything required a fix-up, commit: `chore(orchestrator): fix-up after main-sync wiring (<one-line summary>)`.

---

### Task 8: Phase 3/4 boundary check

**Depends on:** Task 7 | **Files:** none (verification only) | **Category:** integration

1. From the repo root, run these three checks. Each must return zero matches:

   ```sh
   git diff main -- packages/orchestrator/src/workspace/manager.ts
   git diff main -- packages/dashboard/src/client/pages/Maintenance.tsx
   git grep -n 'baseref_fallback' -- 'packages/**/*.ts'
   ```

2. Confirm `packages/dashboard/src/client/pages/Maintenance.tsx` is unchanged (Phase 4 territory).
3. Confirm no `baseref_fallback` strings have been introduced (Phase 3 territory).
4. If any check fails, revert the offending change before completion — Phase 2 must stay scoped.
5. Document the verification in the handoff under `phaseBoundaryVerification`.

---

## Concerns / Risks

1. **Latent: existing housekeeping commands shell out to non-existent binaries.** `['cleanup-sessions']` and `['perf', 'baselines', 'update']` are passed as literal `command[0]` to `execFile` in `orchestrator.ts:466-485`. There is no binary named `cleanup-sessions` (or `perf`) on PATH — the `harness` CLI registers them as subcommands. The cron path errors in production for those two tasks. **`main-sync` dodges this** by registering `['harness', 'sync-main', '--json']` (per amended spec D4). **Recommendation:** track the existing-task fix as a separate issue ("wire `cleanup-sessions` and `perf-baselines` through `harness <subcommand>`"). Not a Phase 2 deliverable.
2. **`CommandExecutor.exec` signature change is a public-API ripple.** The interface is exported from `@harness-engineering/orchestrator`'s maintenance barrel. External adopters who provide their own `CommandExecutor` would need to migrate from `Promise<void>` to `Promise<{ stdout: string }>`. There are no known external adopters at this stage — the orchestrator package is internal. Flag in the commit body so future readers can grep.
3. **`parseStatusLine` is now multi-contract.** It handles Phase 4/5 status JSON _and_ `SyncMainResult` JSON. Discriminator overlap is safe (the value sets are disjoint: `success/skipped/failure/no-issues` vs `updated/no-op/error`, with `skipped` shared and intentionally collapsed). If a future contract adds another status string, this function must be updated. Comment in code documents the two contracts.
4. **No real-binary integration test.** The smoke test mocks the executor. A true end-to-end test would need a fixture repo with a working `harness sync-main` binary on PATH — that belongs after the latent-binary issue (Concern 1) is fixed. Phase 1 already shipped real-`git` integration tests for `syncMain()` itself; the gap here is only "harness CLI subcommand resolution," not "sync-main correctness."

## Skill Annotations

- Tasks 3, 4, 5: TDD methodology applies; no specific harness skill recommendation found in `docs/changes/orchestrator-main-sync/SKILLS.md` (file does not exist).
- Task 6: documentation update — keep concise, co-locate with related config.

## Success Criteria

- All 8 tasks completed with their listed commits (Task 7 may produce 0 or 1 fix-up commit).
- Observable Truths 1-8 all verified.
- `BUILT_IN_TASKS.length === 21` and the new entry exactly matches the spec's "Task Registry Entry" snippet.
- TaskRunner housekeeping path captures stdout and reflects `SyncMainResult` discriminators in `RunResult.status` and `RunResult.error`.
- New smoke test exercises the trigger → runner → reporter chain with the canonical `updated` and `skipped` JSON payloads.
- `harness.orchestrator.md` mentions `main-sync` adjacent to the `maintenance:` config block.
- `harness validate`, `harness check-deps`, full orchestrator test suite — all green.
- Phase 3/4 boundaries clean (Task 8).

## Estimated Total Time

8 tasks × ~2-4 min = ~28 minutes.

## Handoff

Once approved and merged, write to `.harness/sessions/changes--orchestrator-main-sync--proposal/handoff.json` with `phase: "phase-2-complete"`, summary of registry changes + JSON-capture plumbing, and `nextStep.skill: harness-execution` pointing at Phase 3 (`packages/orchestrator/src/workspace/manager.ts` defensive `baseref_fallback` warning).
