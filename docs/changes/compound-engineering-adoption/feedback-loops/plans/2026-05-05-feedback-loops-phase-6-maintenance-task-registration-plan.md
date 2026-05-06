# Plan: Feedback Loops — Phase 6 Maintenance Task Registration

**Date:** 2026-05-05
**Spec:** `docs/changes/compound-engineering-adoption/feedback-loops/proposal.md` (Phase 6, complexity: low)
**Tasks:** 7
**Time:** ~24 min
**Integration Tier:** small
**Rigor:** fast (no skeleton pass)

## Goal

Register `product-pulse` (daily, gated on `pulse.enabled`) and `compound-candidates` (Mondays 9am, ungated) as `report-only` entries in `BUILT_IN_TASKS`, ensure the maintenance task-runner correctly maps the JSON status the Phase 4/5 CLIs emit, and surface a candidate-count badge on the existing maintenance dashboard.

## Observable Truths (Acceptance Criteria)

1. `BUILT_IN_TASKS` exported from `packages/orchestrator/src/maintenance/task-registry.ts` contains exactly 20 entries (was 18); the two new entries have `id: 'product-pulse'` and `id: 'compound-candidates'`, both `type: 'report-only'`, both `branch: null`.
2. `product-pulse` has `schedule: '0 8 * * *'` and `checkCommand: ['pulse', 'run', '--non-interactive']`.
3. `compound-candidates` has `schedule: '0 9 * * 1'` and `checkCommand: ['compound', 'scan-candidates', '--non-interactive']`.
4. When `runReportOnly` runs `product-pulse` and the CLI emits `{"status":"skipped","reason":"pulse.enabled is false or missing"}` on stdout, the resulting `RunResult.status === 'skipped'` (not `'success'`).
5. When `runReportOnly` runs `compound-candidates` and the CLI emits `{"status":"success","candidatesFound":7}`, the resulting `RunResult.status === 'success'` and `RunResult.findings === 7`.
6. When the CLI emits `{"status":"no-issues"}`, the runner returns `RunResult.status === 'no-issues'`.
7. When the CLI emits `{"status":"failure","error":"…"}`, the runner returns `RunResult.status === 'failure'` with `error` populated.
8. When the CLI emits no JSON status line (legacy `report-only` tasks like `perf-check`), the runner falls back to the existing `'success'` mapping — backward compatible.
9. The maintenance dashboard `HistoryRow` shows a small badge `<N candidates>` next to `compound-candidates` history rows when `findings > 0`; no badge when `findings === 0`.
10. `harness validate` and the `packages/orchestrator` test suite pass.

## File Map

- MODIFY `packages/orchestrator/src/maintenance/task-registry.ts` (add 2 entries to `BUILT_IN_TASKS`)
- MODIFY `packages/orchestrator/src/maintenance/task-runner.ts` (extend `CheckCommandResult` shape; rewrite `runReportOnly` to honor JSON status)
- CREATE `packages/orchestrator/src/maintenance/__tests__/task-registry.test.ts` (asserts the two new entries)
- CREATE `packages/orchestrator/src/maintenance/__tests__/task-runner.report-only-status.test.ts` (covers status mapping)
- MODIFY `packages/dashboard/src/client/pages/Maintenance.tsx` (candidate-count badge on `compound-candidates` rows)
- MODIFY `packages/dashboard/src/client/pages/__tests__/Maintenance.test.tsx` _if it exists_; otherwise add a minimal unit test alongside the page (component test)

## Skeleton

_Skipped (rigor: fast)._

## Uncertainties

- **[ASSUMPTION]** The Phase 4 `harness pulse run --non-interactive` and Phase 5 `harness compound scan-candidates --non-interactive` CLIs emit a single-line JSON status (the last stdout line) matching the contract in the spec. If they emit multi-line JSON or wrap the status, Task 3's parsing must be revised to read the **last** non-empty stdout line as JSON and fall through if it does not parse.
- **[ASSUMPTION]** `CheckCommandResult` is owned by the maintenance package and not yet consumed by external packages — adding optional fields (`status?`, `error?`) is non-breaking. (Verified: `task-runner.ts` is the only producer/consumer in the workspace.)
- **[DEFERRABLE]** Whether the dashboard badge should also appear for `product-pulse` (e.g., showing `skipped` reason). Out of scope for Phase 6; spec only asks for candidate-count.
- **[DEFERRABLE]** The pre-existing CLI build issue (gray-matter resolution making the locally-built CLI dist stale) is a release-blocker for the maintenance task to actually work in production, but does not block this plan's structural work. Flag in handoff `concerns`.

## Tasks

### Task 1: Add `product-pulse` and `compound-candidates` to `BUILT_IN_TASKS`

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/task-registry.ts`

1. Open `packages/orchestrator/src/maintenance/task-registry.ts`. After the existing `graph-refresh` entry (last `Report-only` task before the `Housekeeping` group, ending around line 152) and before the `// --- Housekeeping ---` comment, insert:
   ```typescript
     {
       id: 'product-pulse',
       type: 'report-only',
       description: 'Generate time-windowed pulse report (usage, errors, latency, followups)',
       schedule: '0 8 * * *',
       branch: null,
       checkCommand: ['pulse', 'run', '--non-interactive'],
     },
     {
       id: 'compound-candidates',
       type: 'report-only',
       description: 'Scan recent fixes for undocumented learnings; surface candidates',
       schedule: '0 9 * * 1',
       branch: null,
       checkCommand: ['compound', 'scan-candidates', '--non-interactive'],
     },
   ```
2. Update the doc comment at the top of the file from `report-only (5)` to `report-only (7)` and bump the total from `18` to `20`.
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): register product-pulse and compound-candidates maintenance tasks`

### Task 2 (TDD): Add registry assertions for the two new tasks

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/maintenance/__tests__/task-registry.test.ts`

1. Create `packages/orchestrator/src/maintenance/__tests__/task-registry.test.ts` with this exact content:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { BUILT_IN_TASKS } from '../task-registry';

   describe('BUILT_IN_TASKS', () => {
     it('contains exactly 20 entries (18 originals + product-pulse + compound-candidates)', () => {
       expect(BUILT_IN_TASKS).toHaveLength(20);
     });

     it('registers product-pulse as a daily report-only task', () => {
       const task = BUILT_IN_TASKS.find((t) => t.id === 'product-pulse');
       expect(task).toBeDefined();
       expect(task!.type).toBe('report-only');
       expect(task!.schedule).toBe('0 8 * * *');
       expect(task!.branch).toBeNull();
       expect(task!.checkCommand).toEqual(['pulse', 'run', '--non-interactive']);
       expect(task!.fixSkill).toBeUndefined();
     });

     it('registers compound-candidates on Mondays 9am', () => {
       const task = BUILT_IN_TASKS.find((t) => t.id === 'compound-candidates');
       expect(task).toBeDefined();
       expect(task!.type).toBe('report-only');
       expect(task!.schedule).toBe('0 9 * * 1');
       expect(task!.branch).toBeNull();
       expect(task!.checkCommand).toEqual(['compound', 'scan-candidates', '--non-interactive']);
     });

     it('keeps cron schedules unique enough to avoid collision with the 6am Monday block', () => {
       // traceability and cross-check both run at '0 6 * * 1'; compound-candidates moved to 9am to leave room
       const at6amMonday = BUILT_IN_TASKS.filter((t) => t.schedule === '0 6 * * 1');
       expect(at6amMonday.map((t) => t.id).sort()).toEqual([
         'cross-check',
         'perf-check',
         'traceability',
       ]);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/maintenance/__tests__/task-registry.test.ts`
3. Observe the four tests pass (Task 1 already shipped the registry change).
4. Run: `harness validate`
5. Commit: `test(orchestrator): assert product-pulse and compound-candidates registry entries`

### Task 3 (TDD): Status mapping in `runReportOnly` — write the failing test first

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/maintenance/__tests__/task-runner.report-only-status.test.ts`

1. Create the test file with this exact content:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { TaskRunner } from '../task-runner';
   import type { TaskDefinition } from '../types';
   import type { CheckCommandRunner, CheckCommandResult } from '../task-runner';

   const baseConfig = { enabled: true, schedule: {}, overrides: {} } as never;

   function makeRunner(output: string): TaskRunner {
     const checkRunner: CheckCommandRunner = {
       run: async (): Promise<CheckCommandResult> => ({
         passed: true,
         findings: 0,
         output,
       }),
     };
     return new TaskRunner({
       config: baseConfig,
       checkRunner,
       agentDispatcher: { dispatch: async () => ({ producedCommits: false, fixed: 0 }) },
       commandExecutor: { exec: async () => undefined },
       cwd: '/tmp',
     });
   }

   const reportTask: TaskDefinition = {
     id: 'product-pulse',
     type: 'report-only',
     description: 'test',
     schedule: '0 8 * * *',
     branch: null,
     checkCommand: ['pulse', 'run', '--non-interactive'],
   };

   describe('runReportOnly: JSON status mapping', () => {
     it('maps {"status":"skipped"} to RunResult.status="skipped"', async () => {
       const runner = makeRunner(
         'some log line\n{"status":"skipped","reason":"pulse.enabled is false or missing"}\n'
       );
       const result = await runner.run(reportTask);
       expect(result.status).toBe('skipped');
     });

     it('maps {"status":"success","candidatesFound":7} to status=success and findings=7', async () => {
       const runner = makeRunner('{"status":"success","candidatesFound":7}\n');
       const result = await runner.run({ ...reportTask, id: 'compound-candidates' });
       expect(result.status).toBe('success');
       expect(result.findings).toBe(7);
     });

     it('maps {"status":"no-issues"} to status=no-issues', async () => {
       const runner = makeRunner('{"status":"no-issues"}\n');
       const result = await runner.run(reportTask);
       expect(result.status).toBe('no-issues');
     });

     it('maps {"status":"failure","error":"boom"} to status=failure with error', async () => {
       const runner = makeRunner('{"status":"failure","error":"boom"}\n');
       const result = await runner.run(reportTask);
       expect(result.status).toBe('failure');
       expect(result.error).toBe('boom');
     });

     it('falls back to status=success when no JSON status line is present (legacy report-only)', async () => {
       const runner = makeRunner('legacy plain output without json status\n');
       const result = await runner.run(reportTask);
       expect(result.status).toBe('success');
     });

     it('ignores non-JSON last line and falls back to success', async () => {
       const runner = makeRunner('{"status":"success","candidatesFound":3}\nDone.\n');
       // Last non-empty line is "Done." which does not parse — runner should scan from end for last JSON line.
       const result = await runner.run(reportTask);
       expect(result.status).toBe('success');
       expect(result.findings).toBe(3);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator vitest run src/maintenance/__tests__/task-runner.report-only-status.test.ts`
3. Observe failures (existing `runReportOnly` always returns `'success'` and ignores stdout JSON).
4. Do NOT commit yet — implementation lands in Task 4.

### Task 4: Implement JSON-status-aware `runReportOnly`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/maintenance/task-runner.ts`

1. In `task-runner.ts`, replace the body of `runReportOnly` (currently always returns `status: 'success'`) with:

   ```typescript
   private async runReportOnly(task: TaskDefinition, startedAt: string): Promise<RunResult> {
     if (!task.checkCommand || task.checkCommand.length === 0) {
       return this.failureResult(task.id, startedAt, 'report-only task missing checkCommand');
     }

     const checkResult = await this.checkRunner.run(task.checkCommand, this.cwd);
     const parsed = parseStatusLine(checkResult.output);

     // Map JSON status to RunResult.status, with safe fallbacks.
     const status: RunResult['status'] = parsed?.status ?? 'success';
     const findings =
       typeof parsed?.candidatesFound === 'number'
         ? parsed.candidatesFound
         : checkResult.findings;

     const result: RunResult = {
       taskId: task.id,
       startedAt,
       completedAt: new Date().toISOString(),
       status,
       findings,
       fixed: 0,
       prUrl: null,
       prUpdated: false,
     };
     if (parsed?.error) {
       result.error = parsed.error;
     }
     return result;
   }
   ```

2. At the bottom of the file (or near other helpers), add:

   ```typescript
   /**
    * Parse the last JSON-object line from a CLI's stdout. Returns `null` when no
    * line parses as JSON. The maintenance task-runner uses this to consume the
    * status contract emitted by `harness pulse run` and `harness compound scan-candidates`.
    *
    * Contract (Phase 4/5 CLIs):
    *   {"status":"success"|"skipped"|"failure"|"no-issues", "candidatesFound"?: number, "error"?: string, "reason"?: string}
    */
   interface ParsedStatus {
     status: RunResult['status'];
     candidatesFound?: number;
     error?: string;
     reason?: string;
   }

   function parseStatusLine(output: string): ParsedStatus | null {
     const lines = output
       .split('\n')
       .map((l) => l.trim())
       .filter(Boolean);
     for (let i = lines.length - 1; i >= 0; i--) {
       const line = lines[i];
       if (!line.startsWith('{') || !line.endsWith('}')) continue;
       try {
         const obj = JSON.parse(line) as Record<string, unknown>;
         const s = obj.status;
         if (s === 'success' || s === 'skipped' || s === 'failure' || s === 'no-issues') {
           return {
             status: s,
             candidatesFound:
               typeof obj.candidatesFound === 'number' ? obj.candidatesFound : undefined,
             error: typeof obj.error === 'string' ? obj.error : undefined,
             reason: typeof obj.reason === 'string' ? obj.reason : undefined,
           };
         }
       } catch {
         // not JSON; keep scanning earlier lines
       }
     }
     return null;
   }
   ```

3. Re-run: `pnpm --filter @harness-engineering/orchestrator vitest run src/maintenance/__tests__/task-runner.report-only-status.test.ts`
4. Observe all six tests pass.
5. Run: `pnpm --filter @harness-engineering/orchestrator vitest run` (full orchestrator suite — ensure no regressions in legacy `report-only` task tests).
6. Run: `harness validate`
7. Run: `harness check-deps`
8. Commit: `feat(orchestrator): map CLI JSON status to RunResult in report-only tasks`

### Task 5 (TDD): Dashboard candidate-count badge

**Depends on:** Task 4 | **Files:** `packages/dashboard/src/client/pages/Maintenance.tsx`, `packages/dashboard/src/client/pages/__tests__/Maintenance.test.tsx` (create only if a sibling test does not already exist; otherwise extend the existing one)

[checkpoint:human-verify] — Confirm the dashboard `HistoryEntry` type either already exposes `findings`/`task` adequately, or extend it. The current file shows `interface HistoryEntry { task: string; status: 'success' | 'failed' | 'skipped'; startedAt: string; durationMs: number; }`. We need to add an optional `findings?: number` field and ensure the API serializer populates it from `RunResult.findings`. If the API serializer lives outside this file, surface that in the checkpoint and proceed to Task 5b.

1. In `Maintenance.tsx`, extend the inline type:
   ```typescript
   interface HistoryEntry {
     task: string;
     status: 'success' | 'failed' | 'skipped';
     startedAt: string;
     durationMs: number;
     findings?: number;
   }
   ```
2. In the `HistoryRow` component, after the `<td>` rendering `entry.task`, add a conditional badge:
   ```tsx
   <td className="py-2 px-3 font-mono text-xs text-gray-200">
     {entry.task}
     {entry.task === 'compound-candidates' && (entry.findings ?? 0) > 0 && (
       <span
         className="ml-2 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
         title="Undocumented learnings detected this run"
       >
         {entry.findings} candidates
       </span>
     )}
   </td>
   ```
3. Add a unit test in `packages/dashboard/src/client/pages/__tests__/Maintenance.test.tsx` (or the closest existing test colocated with the page) that renders a `HistoryRow` (or its parent table) with `{ task: 'compound-candidates', status: 'success', findings: 5, ... }` and asserts the badge text `5 candidates` is in the document; render with `{ findings: 0 }` and assert the badge is absent; render with `{ task: 'product-pulse', findings: 5 }` and assert the badge is also absent (badge is only for `compound-candidates`).
4. Run: `pnpm --filter @harness-engineering/dashboard vitest run`
5. Observe pass.
6. Run: `harness validate`
7. Commit: `feat(dashboard): show candidate-count badge on compound-candidates history rows`

### Task 6: Wire `RunResult.findings` through the maintenance API serializer (if not already)

**Depends on:** Task 5 | **Files:** the dashboard/maintenance API serializer (location to be confirmed during the task — search for where `HistoryEntry` is produced server-side)

[checkpoint:human-verify] — Locate the serializer that produces `HistoryEntry` from `RunResult`. Likely candidates: `packages/orchestrator/src/maintenance/reporter.ts` or the dashboard server route that exposes maintenance history. Read the candidate file before editing.

1. Add `findings: result.findings` (default `0`) to the serializer that converts `RunResult` to the dashboard `HistoryEntry` shape.
2. If the serializer already exposes `findings`, this task is a no-op — verify and skip the commit.
3. Run: `pnpm --filter @harness-engineering/orchestrator vitest run` and `pnpm --filter @harness-engineering/dashboard vitest run`
4. Run: `harness validate`
5. Commit (only if a change was needed): `feat(maintenance): expose RunResult.findings in dashboard history payload`

### Task 7: Integration — update AGENTS.md and regenerate slash-command/registration metadata

**Depends on:** Task 6 | **Files:** `AGENTS.md` | **Category:** integration

1. Open `AGENTS.md` and locate the maintenance-tasks reference (search for `BUILT_IN_TASKS` or `maintenance task`).
2. Add a brief mention of the two new tasks in the appropriate list:
   ```markdown
   - `product-pulse` (daily 8am, gated on `pulse.enabled`) — generates `docs/pulse-reports/`
   - `compound-candidates` (Mondays 9am) — surfaces undocumented learnings into `docs/solutions/.candidates/`
   ```
3. Run: `harness validate`
4. Commit: `docs(agents): document product-pulse and compound-candidates maintenance tasks`

## Out of Scope for This Plan (per spec)

- Orchestrator step 6b (Phase 7).
- Roadmap-pilot pulse-reading integration (Phase 7).
- BusinessKnowledgeIngestor consuming `docs/solutions/` (Phase 7).
- ADRs (Phase 8).
- Fixing the pre-existing gray-matter CLI build resolution issue (release-blocker but tracked separately).

## Concerns / Risks

1. **`checkCommand` multi-token args**: existing report-only tasks pass at most 2 tokens. The two new tasks pass 3 tokens including a `--non-interactive` flag. The runner forwards this to `CheckCommandRunner.run(command: string[])` which already takes `string[]`, so the structural shape is fine — but Task 4's tests should also cover that flag tokens are not stripped or re-quoted. _Mitigation:_ Task 2's registry assertions verify exact `checkCommand` arrays.
2. **Status mapping divergence**: Phase 4/5 CLIs emit JSON status; legacy `report-only` tasks emit free-form output. Task 4's parser returns `null` on non-JSON and falls back to `'success'`, preserving legacy behavior. _Mitigation:_ explicit "legacy fallback" test in Task 3.
3. **Pre-existing CLI build / gray-matter**: the maintenance task runner shells out to the locally-built CLI dist. Currently stale. **This is a release-blocker for Phase 6 to function in production but does NOT block this plan**, since all our tests stub `CheckCommandRunner`. Flag in handoff.
4. **Dashboard `HistoryEntry` schema**: the in-page inline type may not be the canonical shape. Task 6 audits the serializer. If a separate type lives in `@harness-engineering/types`, Task 5/6 must update both.

## Validation Gates

- After every task: `harness validate`
- After Tasks 1, 2, 4: `pnpm --filter @harness-engineering/orchestrator vitest run`
- After Tasks 5, 6: `pnpm --filter @harness-engineering/dashboard vitest run`
- After Task 4: `harness check-deps`

## Estimated Time

| Task                         | Time        |
| ---------------------------- | ----------- |
| 1. Registry entries          | 3 min       |
| 2. Registry test             | 3 min       |
| 3. Status-mapping test (TDD) | 4 min       |
| 4. Status-mapping impl       | 5 min       |
| 5. Dashboard badge           | 4 min       |
| 6. Serializer audit          | 3 min       |
| 7. AGENTS.md update          | 2 min       |
| **Total**                    | **~24 min** |
