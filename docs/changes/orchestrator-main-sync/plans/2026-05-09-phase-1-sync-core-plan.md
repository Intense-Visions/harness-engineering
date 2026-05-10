# Plan: Phase 1 — Sync Core (helper + CLI)

**Date:** 2026-05-09
**Spec:** `docs/changes/orchestrator-main-sync/proposal.md` (Phase 1, "Implementation Order")
**Tasks:** 10
**Time:** ~38 minutes
**Integration Tier:** small

## Goal

Ship the pure `syncMain()` helper at `packages/orchestrator/src/maintenance/sync-main.ts` and the matching `harness sync-main` CLI subcommand, with full unit coverage of every status path and one integration test against a real `git` binary — so that Phase 2 (task-registry registration) can wire the helper in without touching its internals.

## Scope Notes (read first)

This plan implements **only** the items called out in the user's invocation:

1. The `syncMain()` helper plus its exported types `SyncMainResult` and `SyncSkipReason`, exactly per the spec's `### syncMain() Helper` and `### Algorithm` sections (proposal.md lines 89–121).
2. The `harness sync-main [--json]` CLI subcommand wrapping the helper, registered in `packages/cli/src/commands/_registry.ts` via the existing barrel-exports flow (proposal.md lines 124–129).
3. Unit tests for every status path: `updated`, `no-op`, `skipped:wrong-branch`, `skipped:diverged`, `skipped:dirty-conflict`, `skipped:no-remote`, `skipped:fetch-failed`, `error`.
4. One integration test that exercises the full code path against a real `git` binary using a fixture repo.

**Explicitly OUT of scope** (these are Phases 2–4):

- Adding `main-sync` to `BUILT_IN_TASKS` in `packages/orchestrator/src/maintenance/task-registry.ts`.
- The `baseref_fallback` defensive warning in `WorkspaceManager.resolveBaseRef()`.
- Dashboard schedule-table refactor / per-row "Run Now" buttons.
- Documentation updates to `harness.orchestrator.md` (those will arrive with Phase 2 when the task is actually registered).

**Implementation choice (decision D-P1-A in this plan):** the helper takes its `git` runner as an injectable function (`execFileFn?: ExecFileFn`) following the established `PRDetector` and `WorkspaceManager` patterns (`packages/orchestrator/src/core/pr-detector.ts:30`, `packages/orchestrator/src/workspace/manager.ts:17`). Unit tests inject a mock; the integration test uses the real `execFile`.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** The system shall export `syncMain`, `SyncMainResult`, and `SyncSkipReason` from `packages/orchestrator/src/maintenance/sync-main.ts`.
2. **Ubiquitous:** `SyncMainResult` shall be a discriminated union with exactly the four `status` variants from the spec (`'updated' | 'no-op' | 'skipped' | 'error'`) and the field shapes specified at proposal.md:93–97.
3. **Ubiquitous:** `SyncSkipReason` shall be a string-literal union of exactly: `'wrong-branch' | 'diverged' | 'dirty-conflict' | 'no-remote' | 'fetch-failed'` (proposal.md:99–104).
4. **Event-driven:** When `syncMain()` is called and `git symbolic-ref --short refs/remotes/origin/HEAD` resolves to `origin/<name>` and the local current branch matches `<name>` and `git fetch origin <name>` succeeds and `HEAD` is a strict ancestor of `origin/<name>`, the system shall run `git merge --ff-only origin/<name>` and return `{ status: 'updated', from: <oldSha>, to: <newSha>, defaultBranch: <name> }`.
5. **Event-driven:** When `syncMain()` is called and `HEAD === origin/<default>` (`merge-base --is-ancestor` reports both directions equal), the system shall return `{ status: 'no-op', defaultBranch: <name> }` and shall not invoke `git merge`.
6. **Event-driven:** When the current branch differs from the default branch's short name, the system shall return `{ status: 'skipped', reason: 'wrong-branch', detail: <descriptive>, defaultBranch: <name> }` and shall not invoke `git fetch` or `git merge`.
7. **Event-driven:** When `HEAD` has commits not on `origin/<default>` (i.e., neither equal nor strict-ancestor), the system shall return `{ status: 'skipped', reason: 'diverged', ..., defaultBranch: <name> }` and shall not invoke `git merge`.
8. **Event-driven:** When `git merge --ff-only` fails because of an uncommitted working-tree edit that conflicts with the incoming change, the system shall return `{ status: 'skipped', reason: 'dirty-conflict', detail: <stderr-derived>, defaultBranch: <name> }`.
9. **Event-driven:** When `git symbolic-ref --short refs/remotes/origin/HEAD` fails AND neither `origin/main` nor `origin/master` resolve via `git rev-parse --verify`, the system shall return `{ status: 'skipped', reason: 'no-remote', detail: <descriptive>, defaultBranch: '' }`.
10. **Event-driven:** When `git fetch origin <default> --quiet` exits non-zero (network/auth/etc.), the system shall return `{ status: 'skipped', reason: 'fetch-failed', detail: <stderr>, defaultBranch: <name> }`.
11. **Unwanted:** If any unexpected exception escapes the helper (e.g., `git` binary missing, `ENOENT`), then the system shall catch it and return `{ status: 'error', message: <stringified> }` rather than throwing.
12. **Ubiquitous:** The CLI shall expose `harness sync-main [--json]`.
13. **Event-driven:** When `harness sync-main` is run without `--json`, the system shall print a one-line human-readable summary derived from `SyncMainResult` and exit with code `0` for `updated`, `no-op`, and any `skipped:*` outcome.
14. **Event-driven:** When `harness sync-main --json` is run, the system shall write the `SyncMainResult` as JSON to stdout (one object) and exit with the same exit codes as #13.
15. **Unwanted:** If the helper returns `{ status: 'error' }`, then the CLI shall exit non-zero (`ExitCode.ERROR === 2`) — skips are not failures (proposal.md:129).
16. **Event-driven:** When `pnpm --filter @harness-engineering/orchestrator test` runs, all eight unit-test paths above and the one integration test shall pass.
17. **Event-driven:** When `pnpm run generate:barrels:check` runs, it shall pass (the new CLI command is picked up by `_registry.ts`).
18. **Event-driven:** When `harness validate` runs, it shall pass with no new errors.

## File Map

```
CREATE packages/orchestrator/src/maintenance/sync-main.ts
CREATE packages/orchestrator/tests/maintenance/sync-main.test.ts
CREATE packages/orchestrator/tests/maintenance/sync-main.integration.test.ts
CREATE packages/cli/src/commands/sync-main.ts
CREATE packages/cli/tests/commands/sync-main.test.ts
MODIFY packages/cli/src/commands/_registry.ts            (auto-regenerated by pnpm run generate-barrel-exports)
```

Files **not** touched in this phase:

- `packages/orchestrator/src/maintenance/task-registry.ts` — Phase 2.
- `packages/orchestrator/src/workspace/manager.ts` — Phase 3.
- `packages/dashboard/src/client/pages/Maintenance.tsx` — Phase 4.
- `harness.orchestrator.md` — lands with Phase 2 when the task actually registers.

## Decisions

| #      | Decision                                                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P1-A | The helper exposes an injectable `execFileFn?: ExecFileFn` parameter with a sensible default of Node's `child_process.execFile`.                                                                                                                              | Matches the existing `PRDetector` (`pr-detector.ts:30`) and `WorkspaceManager.git()` (`manager.ts:17`) patterns, makes unit tests purely deterministic without spawning a real `git`, and lets the integration test pass through the real binary by simply omitting the override.           |
| D-P1-B | `syncMain()` returns a `SyncMainResult` discriminated union; it does **not** throw under any expected condition. Even unexpected errors are caught and converted to `{ status: 'error', message }`.                                                           | Spec requires "skips are not failures" (proposal.md:129) and the maintenance scheduler must not back off on transient git issues (proposal.md:170). Total functions are easier to consume from the CLI and from a future `TaskRunner` housekeeping path.                                    |
| D-P1-C | Default-branch resolution uses the priority chain `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/main` → `origin/master`. If none resolve, return `skipped: 'no-remote'`.                                                                      | Mirrors `WorkspaceManager.resolveBaseRef()` (`manager.ts:134–158`) so behavior is consistent across orchestrator subsystems. The local-only `main`/`master`/`HEAD` fallbacks deliberately do **not** apply here — without an `origin/<default>` to compare against, sync has nothing to do. |
| D-P1-D | The helper shells out to plain `git` rather than depending on `simple-git` or any other library.                                                                                                                                                              | The orchestrator already shells `git` directly everywhere it needs to (`pr-detector.ts`, `manager.ts`, `orchestrator.ts:429`). Adding a dependency for four commands is pure overhead.                                                                                                      |
| D-P1-E | The CLI command lives at `packages/cli/src/commands/sync-main.ts` and is auto-registered via `_registry.ts` after running `pnpm run generate-barrel-exports`. The CLI imports `syncMain` from `@harness-engineering/orchestrator/dist/maintenance/sync-main`. | Established convention: every other CLI command is auto-registered and the orchestrator package is already a runtime dependency of the CLI (e.g., `dashboard.ts`, `orchestrator.ts` commands). Avoids a manual edit to `_registry.ts` that would just be overwritten on regeneration.       |
| D-P1-F | The integration test runs against a fixture repo created in a temp directory with two cooperating bare/working clones (a "remote" and the "local" checkout under test). It uses `child_process.execFileSync` to set up commits and the real `git` binary.     | This is the same pattern used by orchestrator integration tests under `tests/integration/` and `tests/workspace/`. It exercises the real argument-passing and stderr parsing that mocks cannot.                                                                                             |
| D-P1-G | Tests live at `packages/orchestrator/tests/maintenance/sync-main.test.ts` (unit) and `packages/orchestrator/tests/maintenance/sync-main.integration.test.ts` (integration), plus `packages/cli/tests/commands/sync-main.test.ts` for the CLI surface.         | Mirrors existing layout (`tests/maintenance/task-registry.test.ts`, `tests/maintenance/scheduler.test.ts`). Splitting unit/integration into separate files keeps the unit suite fast for inner-loop runs.                                                                                   |

## Uncertainties

- **[ASSUMPTION]** `merge --ff-only` returns a non-zero exit when the working tree has a conflicting uncommitted edit, with a stderr containing identifiable text (`local changes`, `would be overwritten`, or similar). If this assumption is wrong on certain git versions, Task 5's `dirty-conflict` classification logic may need to be tightened. Mitigation: the integration test (Task 9) exercises this on the real binary, so any divergence surfaces before we ship.
- **[ASSUMPTION]** The CLI package can `import` from `@harness-engineering/orchestrator` at runtime. The CLI already imports from the orchestrator for `dashboard.ts`/`orchestrator.ts` commands, so this is verified.
- **[DEFERRABLE]** Wiring the helper into the maintenance scheduler so it runs on a cron — that is explicitly Phase 2 and intentionally deferred.
- **[DEFERRABLE]** Exact wording of human-readable CLI output. Phase 1 ships sensible one-liners; Phase 4 may polish them when the dashboard surfaces them.

## Tasks

### Task 1: Define `SyncMainResult` and `SyncSkipReason` types (TDD setup)

**Depends on:** none
**Files:** `packages/orchestrator/src/maintenance/sync-main.ts`

1. Create `packages/orchestrator/src/maintenance/sync-main.ts` with **only** the type exports and a stub function (no implementation):

   ```ts
   import { execFile as nodeExecFile } from 'node:child_process';
   import { promisify } from 'node:util';

   /** Function signature compatible with Node's child_process.execFile. Allows injection for testing. */
   export type ExecFileFn = typeof nodeExecFile;

   export type SyncSkipReason =
     | 'wrong-branch'
     | 'diverged'
     | 'dirty-conflict'
     | 'no-remote'
     | 'fetch-failed';

   export type SyncMainResult =
     | { status: 'updated'; from: string; to: string; defaultBranch: string }
     | { status: 'no-op'; defaultBranch: string }
     | {
         status: 'skipped';
         reason: SyncSkipReason;
         detail: string;
         defaultBranch: string;
       }
     | { status: 'error'; message: string };

   export interface SyncMainOptions {
     execFileFn?: ExecFileFn;
   }

   export async function syncMain(
     repoRoot: string,
     opts: SyncMainOptions = {}
   ): Promise<SyncMainResult> {
     // Implementation arrives in Task 4. Stub returns error to keep types honest.
     void repoRoot;
     void opts;
     void promisify;
     return { status: 'error', message: 'syncMain not yet implemented' };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` (or `pnpm --filter @harness-engineering/orchestrator build` if no typecheck script) — observe success.
3. Run: `harness validate` — observe pass.
4. Commit: `feat(orchestrator/maintenance): scaffold sync-main types and stub`

### Task 2: Write unit tests for `no-op`, `wrong-branch`, `no-remote` paths (RED)

**Depends on:** Task 1
**Files:** `packages/orchestrator/tests/maintenance/sync-main.test.ts`

1. Create `packages/orchestrator/tests/maintenance/sync-main.test.ts`. Use an `ExecFileFn` mock that intercepts each `git` invocation and returns scripted stdout/stderr or throws scripted errors. The mock signature must match Node's `execFile(file, args, options, cb)` callback form (so `promisify` works).

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { ExecFileFn, SyncMainResult } from '../../src/maintenance/sync-main';
   import { syncMain } from '../../src/maintenance/sync-main';

   /** Builds an execFile-compatible mock from a list of scripted (args -> result) handlers. */
   function makeGitMock(
     scripts: Array<{
       match: (args: string[]) => boolean;
       result: { stdout?: string; stderr?: string } | { error: NodeJS.ErrnoException };
     }>
   ): ExecFileFn {
     const fn = ((file: string, args: readonly string[], _opts: unknown, cb: unknown) => {
       const callback = cb as (
         err: NodeJS.ErrnoException | null,
         stdout: string,
         stderr: string
       ) => void;
       expect(file).toBe('git');
       const script = scripts.find((s) => s.match([...(args ?? [])]));
       if (!script) {
         callback(
           new Error(`Unexpected git call: ${(args ?? []).join(' ')}`) as NodeJS.ErrnoException,
           '',
           ''
         );
         return undefined as never;
       }
       if ('error' in script.result) {
         callback(script.result.error, '', '');
       } else {
         callback(null, script.result.stdout ?? '', script.result.stderr ?? '');
       }
       return undefined as never;
     }) as unknown as ExecFileFn;
     return fn;
   }

   const eq = (expected: string[]) => (a: string[]) =>
     a.length === expected.length && a.every((v, i) => v === expected[i]);
   const startsWith = (prefix: string[]) => (a: string[]) => prefix.every((v, i) => a[i] === v);

   describe('syncMain — wrong-branch path', () => {
     it('returns skipped:wrong-branch when current branch is not default', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         {
           match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
           result: { stdout: 'feature/topic\n' },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') {
         expect(r.reason).toBe('wrong-branch');
         expect(r.defaultBranch).toBe('main');
       }
     });
   });

   describe('syncMain — no-remote path', () => {
     it('returns skipped:no-remote when origin/HEAD unset and origin/main+master missing', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: {
             error: Object.assign(new Error('no symbolic ref'), {
               code: 1,
             }) as NodeJS.ErrnoException,
           },
         },
         {
           match: eq(['rev-parse', '--verify', '--quiet', 'origin/main']),
           result: {
             error: Object.assign(new Error('not a ref'), { code: 1 }) as NodeJS.ErrnoException,
           },
         },
         {
           match: eq(['rev-parse', '--verify', '--quiet', 'origin/master']),
           result: {
             error: Object.assign(new Error('not a ref'), { code: 1 }) as NodeJS.ErrnoException,
           },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('no-remote');
     });

     it('falls back to origin/main when origin/HEAD unset', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: {
             error: Object.assign(new Error('no symbolic ref'), {
               code: 1,
             }) as NodeJS.ErrnoException,
           },
         },
         {
           match: eq(['rev-parse', '--verify', '--quiet', 'origin/main']),
           result: { stdout: 'abc123\n' },
         },
         {
           match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
           result: { stdout: 'main\n' },
         },
         {
           match: startsWith(['fetch', 'origin', 'main']),
           result: { stdout: '' },
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { stdout: '' }, // exit 0 → ancestor
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
           result: { stdout: '' }, // exit 0 → also ancestor → equal → no-op
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('no-op');
       if (r.status === 'no-op') expect(r.defaultBranch).toBe('main');
     });
   });

   describe('syncMain — no-op path', () => {
     it('returns no-op when HEAD equals origin/<default>', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         {
           match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
           result: { stdout: 'main\n' },
         },
         { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { stdout: '' },
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
           result: { stdout: '' },
         },
       ]);
       const r: SyncMainResult = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('no-op');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test sync-main` — observe **failures** (the stub returns `error` for all inputs). This is the RED step.
3. Commit: `test(orchestrator/maintenance): add red unit tests for sync-main no-op/wrong-branch/no-remote`

### Task 3: Write unit tests for `updated`, `diverged`, `dirty-conflict`, `fetch-failed`, `error` paths (RED)

**Depends on:** Task 2
**Files:** `packages/orchestrator/tests/maintenance/sync-main.test.ts` (extend)

1. Append the remaining five `describe` blocks. Each follows the same mock pattern from Task 2; use the helpers already defined.

   ```ts
   describe('syncMain — updated path', () => {
     it('runs ff-only merge and returns updated with both SHAs when HEAD strict-ancestor of origin', async () => {
       let mergeCalled = false;
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'main\n' } },
         { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { stdout: '' }, // exit 0 → HEAD is ancestor
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
           result: { error: Object.assign(new Error(''), { code: 1 }) as NodeJS.ErrnoException }, // origin not ancestor of HEAD → strict
         },
         { match: eq(['rev-parse', 'HEAD']), result: { stdout: 'aaaaaaaa\n' } }, // before
         {
           match: eq(['merge', '--ff-only', 'origin/main']),
           result: { stdout: 'Updating aaaaaaa..bbbbbbb\n' },
         },
         { match: eq(['rev-parse', 'HEAD']), result: { stdout: 'bbbbbbbb\n' } }, // after
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('updated');
       if (r.status === 'updated') {
         expect(r.from).toBe('aaaaaaaa');
         expect(r.to).toBe('bbbbbbbb');
         expect(r.defaultBranch).toBe('main');
       }
     });
   });

   describe('syncMain — diverged path', () => {
     it('returns skipped:diverged when HEAD is not ancestor of origin', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'main\n' } },
         { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { error: Object.assign(new Error(''), { code: 1 }) as NodeJS.ErrnoException },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('diverged');
     });
   });

   describe('syncMain — dirty-conflict path', () => {
     it('returns skipped:dirty-conflict when ff-only merge fails with conflict stderr', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'main\n' } },
         { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { stdout: '' },
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
           result: { error: Object.assign(new Error(''), { code: 1 }) as NodeJS.ErrnoException },
         },
         { match: eq(['rev-parse', 'HEAD']), result: { stdout: 'aaaaaaaa\n' } },
         {
           match: eq(['merge', '--ff-only', 'origin/main']),
           result: {
             error: Object.assign(
               new Error(
                 'error: Your local changes to the following files would be overwritten by merge'
               ),
               { code: 1, stderr: 'error: Your local changes ... would be overwritten' }
             ) as NodeJS.ErrnoException,
           },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('dirty-conflict');
     });
   });

   describe('syncMain — fetch-failed path', () => {
     it('returns skipped:fetch-failed when git fetch exits non-zero', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'main\n' } },
         {
           match: startsWith(['fetch', 'origin', 'main']),
           result: {
             error: Object.assign(new Error('Could not resolve host'), {
               code: 128,
               stderr: 'fatal: Could not resolve host',
             }) as NodeJS.ErrnoException,
           },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('fetch-failed');
     });
   });

   describe('syncMain — error path', () => {
     it('returns error when git binary is missing (ENOENT)', async () => {
       const execFileFn = makeGitMock([
         {
           match: () => true,
           result: {
             error: Object.assign(new Error('spawn git ENOENT'), {
               code: 'ENOENT',
             }) as NodeJS.ErrnoException,
           },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('error');
       if (r.status === 'error') expect(r.message).toMatch(/ENOENT|spawn git/);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test sync-main` — observe **failures** for these new cases. Tests from Task 2 still fail. RED across the board.
3. Commit: `test(orchestrator/maintenance): add red unit tests for sync-main updated/diverged/dirty/fetch-failed/error`

### Task 4: Implement `syncMain()` algorithm to drive tests GREEN

**Depends on:** Task 3
**Files:** `packages/orchestrator/src/maintenance/sync-main.ts`

1. Replace the stub body of `syncMain()` with the full algorithm below. Key contract: every code path returns a `SyncMainResult`; the only `throw` path is wrapped in a top-level `try`/`catch` that maps to `{ status: 'error' }`.

   ```ts
   import { execFile as nodeExecFile } from 'node:child_process';
   import { promisify } from 'node:util';

   export type ExecFileFn = typeof nodeExecFile;

   export type SyncSkipReason =
     | 'wrong-branch'
     | 'diverged'
     | 'dirty-conflict'
     | 'no-remote'
     | 'fetch-failed';

   export type SyncMainResult =
     | { status: 'updated'; from: string; to: string; defaultBranch: string }
     | { status: 'no-op'; defaultBranch: string }
     | { status: 'skipped'; reason: SyncSkipReason; detail: string; defaultBranch: string }
     | { status: 'error'; message: string };

   export interface SyncMainOptions {
     execFileFn?: ExecFileFn;
     /** Per-git-call timeout in ms. Default 60_000 to match hooks.timeoutMs convention. */
     timeoutMs?: number;
   }

   const DEFAULT_TIMEOUT_MS = 60_000;

   /** Internal: run git, return stdout/stderr or throw on non-zero exit. */
   async function git(
     execFileFn: ExecFileFn,
     args: string[],
     cwd: string,
     timeoutMs: number
   ): Promise<{ stdout: string; stderr: string }> {
     const exec = promisify(execFileFn);
     const { stdout, stderr } = await exec('git', args, { cwd, timeout: timeoutMs });
     return { stdout: String(stdout), stderr: String(stderr) };
   }

   /** True iff `git rev-parse --verify --quiet <ref>` succeeds. */
   async function refExists(
     execFileFn: ExecFileFn,
     ref: string,
     cwd: string,
     timeoutMs: number
   ): Promise<boolean> {
     try {
       await git(execFileFn, ['rev-parse', '--verify', '--quiet', ref], cwd, timeoutMs);
       return true;
     } catch {
       return false;
     }
   }

   /**
    * Resolves `origin/<default>` via priority: symbolic-ref → origin/main → origin/master.
    * Returns null when none resolve.
    */
   async function resolveOriginDefault(
     execFileFn: ExecFileFn,
     cwd: string,
     timeoutMs: number
   ): Promise<string | null> {
     try {
       const { stdout } = await git(
         execFileFn,
         ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
         cwd,
         timeoutMs
       );
       const v = stdout.trim();
       if (v) return v; // typically 'origin/main'
     } catch {
       // fall through
     }
     for (const candidate of ['origin/main', 'origin/master']) {
       if (await refExists(execFileFn, candidate, cwd, timeoutMs)) return candidate;
     }
     return null;
   }

   /** Strips the leading 'origin/' prefix to get the short branch name. */
   function shortName(originRef: string): string {
     return originRef.startsWith('origin/') ? originRef.slice('origin/'.length) : originRef;
   }

   function isDirtyConflictStderr(s: string): boolean {
     // git's user-facing error when ff-only fails because of working-tree edits.
     return /would be overwritten|local changes|Aborting/i.test(s);
   }

   export async function syncMain(
     repoRoot: string,
     opts: SyncMainOptions = {}
   ): Promise<SyncMainResult> {
     const execFileFn = opts.execFileFn ?? nodeExecFile;
     const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

     try {
       // 1. Resolve origin's default ref.
       const originRef = await resolveOriginDefault(execFileFn, repoRoot, timeoutMs);
       if (!originRef) {
         return {
           status: 'skipped',
           reason: 'no-remote',
           detail: 'origin/HEAD unset and neither origin/main nor origin/master resolves',
           defaultBranch: '',
         };
       }
       const defaultBranch = shortName(originRef);

       // 2. Compare current branch.
       const { stdout: currentRaw } = await git(
         execFileFn,
         ['rev-parse', '--abbrev-ref', 'HEAD'],
         repoRoot,
         timeoutMs
       );
       const current = currentRaw.trim();
       if (current !== defaultBranch) {
         return {
           status: 'skipped',
           reason: 'wrong-branch',
           detail: `current branch '${current}' is not the default '${defaultBranch}'`,
           defaultBranch,
         };
       }

       // 3. Fetch.
       try {
         await git(execFileFn, ['fetch', 'origin', defaultBranch, '--quiet'], repoRoot, timeoutMs);
       } catch (err) {
         return {
           status: 'skipped',
           reason: 'fetch-failed',
           detail: err instanceof Error ? err.message : String(err),
           defaultBranch,
         };
       }

       // 4. Compare HEAD to origin/<default>.
       const headIsAncestor = await isAncestor(execFileFn, 'HEAD', originRef, repoRoot, timeoutMs);
       const originIsAncestor = await isAncestor(
         execFileFn,
         originRef,
         'HEAD',
         repoRoot,
         timeoutMs
       );

       if (headIsAncestor && originIsAncestor) {
         // Equal commits → already up to date.
         return { status: 'no-op', defaultBranch };
       }
       if (!headIsAncestor) {
         // HEAD has commits not on origin (or unrelated histories) → can't fast-forward.
         return {
           status: 'skipped',
           reason: 'diverged',
           detail: `local '${defaultBranch}' has commits not on '${originRef}'`,
           defaultBranch,
         };
       }
       // headIsAncestor && !originIsAncestor → strictly behind → fast-forward.
       const before = (
         await git(execFileFn, ['rev-parse', 'HEAD'], repoRoot, timeoutMs)
       ).stdout.trim();
       try {
         await git(execFileFn, ['merge', '--ff-only', originRef], repoRoot, timeoutMs);
       } catch (err) {
         const stderr =
           err && typeof err === 'object' && 'stderr' in err
             ? String((err as { stderr?: unknown }).stderr ?? '')
             : err instanceof Error
               ? err.message
               : String(err);
         if (isDirtyConflictStderr(stderr)) {
           return {
             status: 'skipped',
             reason: 'dirty-conflict',
             detail: stderr.split('\n')[0] ?? 'merge --ff-only failed due to working-tree changes',
             defaultBranch,
           };
         }
         // Unexpected merge failure — bubble up to top-level error path.
         throw err;
       }
       const after = (
         await git(execFileFn, ['rev-parse', 'HEAD'], repoRoot, timeoutMs)
       ).stdout.trim();
       return { status: 'updated', from: before, to: after, defaultBranch };
     } catch (err) {
       return { status: 'error', message: err instanceof Error ? err.message : String(err) };
     }
   }

   /** True iff `git merge-base --is-ancestor a b` exits 0. */
   async function isAncestor(
     execFileFn: ExecFileFn,
     a: string,
     b: string,
     cwd: string,
     timeoutMs: number
   ): Promise<boolean> {
     try {
       await git(execFileFn, ['merge-base', '--is-ancestor', a, b], cwd, timeoutMs);
       return true;
     } catch {
       return false;
     }
   }
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test sync-main` — all eight unit-test paths should now pass. **GREEN.**
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` (or `build`) — observe success.
4. Run: `harness validate` — observe pass.
5. Commit: `feat(orchestrator/maintenance): implement syncMain helper with ff-only algorithm`

### Task 5: Add unit-test edge cases — fetch-failed via fall-back ref, dirty-conflict via stderr property

**Depends on:** Task 4
**Files:** `packages/orchestrator/tests/maintenance/sync-main.test.ts` (extend)

1. Add three small additional cases to harden the assertions made GREEN in Task 4:

   ```ts
   describe('syncMain — defaultBranch shape', () => {
     it('strips the origin/ prefix when fall-back resolves to origin/master', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: {
             error: Object.assign(new Error('no symbolic ref'), {
               code: 1,
             }) as NodeJS.ErrnoException,
           },
         },
         {
           match: eq(['rev-parse', '--verify', '--quiet', 'origin/main']),
           result: {
             error: Object.assign(new Error('not a ref'), { code: 1 }) as NodeJS.ErrnoException,
           },
         },
         {
           match: eq(['rev-parse', '--verify', '--quiet', 'origin/master']),
           result: { stdout: 'abc123\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'topic\n' } },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') {
         expect(r.reason).toBe('wrong-branch');
         expect(r.defaultBranch).toBe('master');
       }
     });
   });

   describe('syncMain — dirty-conflict stderr propagation', () => {
     it('classifies stderr containing "Aborting" as dirty-conflict', async () => {
       const execFileFn = makeGitMock([
         {
           match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
           result: { stdout: 'origin/main\n' },
         },
         { match: eq(['rev-parse', '--abbrev-ref', 'HEAD']), result: { stdout: 'main\n' } },
         { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
         {
           match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
           result: { stdout: '' },
         },
         {
           match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
           result: { error: Object.assign(new Error(''), { code: 1 }) as NodeJS.ErrnoException },
         },
         { match: eq(['rev-parse', 'HEAD']), result: { stdout: 'aaaaaaaa\n' } },
         {
           match: eq(['merge', '--ff-only', 'origin/main']),
           result: {
             error: Object.assign(new Error('Aborting'), {
               code: 1,
               stderr: 'error: Aborting due to dirty working tree',
             }) as NodeJS.ErrnoException,
           },
         },
       ]);
       const r = await syncMain('/repo', { execFileFn });
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('dirty-conflict');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test sync-main` — observe pass.
3. Commit: `test(orchestrator/maintenance): cover origin/master fallback and Aborting stderr`

### Task 6: Write CLI unit test for `harness sync-main` (RED)

**Depends on:** Task 4
**Files:** `packages/cli/tests/commands/sync-main.test.ts`

1. Create the CLI test. Approach: import the **runnable** function from `sync-main.ts` (named `runSyncMain`, parallel to `runCleanupSessions`), pass an injected helper, assert exit-code-equivalent return values and printed output.

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { runSyncMain } from '../../src/commands/sync-main';
   import type { SyncMainResult } from '@harness-engineering/orchestrator/dist/maintenance/sync-main';

   function captureStdout(): { lines: string[]; restore: () => void } {
     const original = process.stdout.write.bind(process.stdout);
     const lines: string[] = [];
     (process.stdout as unknown as { write: (s: string) => boolean }).write = (
       s: string
     ): boolean => {
       lines.push(s);
       return true;
     };
     return { lines, restore: () => (process.stdout.write = original) };
   }

   describe('harness sync-main CLI', () => {
     it('prints human-readable summary on updated and exits 0', async () => {
       const cap = captureStdout();
       const result: SyncMainResult = {
         status: 'updated',
         from: 'aaaaaaa',
         to: 'bbbbbbb',
         defaultBranch: 'main',
       };
       const exitCode = await runSyncMain({
         json: false,
         cwd: '/fake',
         syncMainFn: vi.fn().mockResolvedValue(result),
       });
       cap.restore();
       expect(exitCode).toBe(0);
       const out = cap.lines.join('');
       expect(out).toMatch(/updated/);
       expect(out).toMatch(/main/);
     });

     it('emits JSON when --json is set and exits 0 on no-op', async () => {
       const cap = captureStdout();
       const result: SyncMainResult = { status: 'no-op', defaultBranch: 'main' };
       const exitCode = await runSyncMain({
         json: true,
         cwd: '/fake',
         syncMainFn: vi.fn().mockResolvedValue(result),
       });
       cap.restore();
       expect(exitCode).toBe(0);
       const parsed = JSON.parse(cap.lines.join('').trim());
       expect(parsed).toEqual(result);
     });

     it('exits 0 on skipped:* (skips are not failures)', async () => {
       const cap = captureStdout();
       const result: SyncMainResult = {
         status: 'skipped',
         reason: 'wrong-branch',
         detail: 'on topic',
         defaultBranch: 'main',
       };
       const exitCode = await runSyncMain({
         json: false,
         cwd: '/fake',
         syncMainFn: vi.fn().mockResolvedValue(result),
       });
       cap.restore();
       expect(exitCode).toBe(0);
     });

     it('exits non-zero on error', async () => {
       const cap = captureStdout();
       const result: SyncMainResult = { status: 'error', message: 'git missing' };
       const exitCode = await runSyncMain({
         json: false,
         cwd: '/fake',
         syncMainFn: vi.fn().mockResolvedValue(result),
       });
       cap.restore();
       expect(exitCode).toBe(2); // ExitCode.ERROR
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/cli test sync-main` — observe **failure** (the file does not yet exist). RED.
3. Commit: `test(cli): add red tests for harness sync-main subcommand`

### Task 7: Implement `harness sync-main` CLI command and run barrel-exports regen

**Depends on:** Task 6
**Files:** `packages/cli/src/commands/sync-main.ts`, `packages/cli/src/commands/_registry.ts` (auto-regenerated)

1. Create `packages/cli/src/commands/sync-main.ts`:

   ```ts
   // packages/cli/src/commands/sync-main.ts
   import { Command } from 'commander';
   import * as path from 'node:path';
   import {
     syncMain as defaultSyncMain,
     type SyncMainResult,
   } from '@harness-engineering/orchestrator/dist/maintenance/sync-main';
   import { ExitCode } from '../utils/errors';

   export interface RunSyncMainOptions {
     cwd?: string;
     json?: boolean;
     /** Override for tests. */
     syncMainFn?: (repoRoot: string) => Promise<SyncMainResult>;
   }

   /** Returns the exit code; does not call process.exit so it stays unit-testable. */
   export async function runSyncMain(opts: RunSyncMainOptions): Promise<number> {
     const cwd = opts.cwd ?? process.cwd();
     const fn = opts.syncMainFn ?? ((root: string) => defaultSyncMain(root));
     const result = await fn(cwd);

     if (opts.json) {
       process.stdout.write(`${JSON.stringify(result)}\n`);
     } else {
       process.stdout.write(`${formatHuman(result)}\n`);
     }

     return result.status === 'error' ? ExitCode.ERROR : ExitCode.SUCCESS;
   }

   function formatHuman(r: SyncMainResult): string {
     switch (r.status) {
       case 'updated':
         return `updated ${r.defaultBranch}: ${r.from.slice(0, 7)} → ${r.to.slice(0, 7)}`;
       case 'no-op':
         return `up-to-date: ${r.defaultBranch}`;
       case 'skipped':
         return `skipped (${r.reason}): ${r.detail}`;
       case 'error':
         return `error: ${r.message}`;
     }
   }

   export function createSyncMainCommand(): Command {
     return new Command('sync-main')
       .description('Fast-forward the local default branch from origin (no-op on conflict)')
       .option('--json', 'Emit a SyncMainResult JSON object', false)
       .option('--path <path>', 'Project root path', '.')
       .action(async (opts) => {
         const cwd = path.resolve(opts.path);
         const exitCode = await runSyncMain({ cwd, json: Boolean(opts.json) });
         process.exit(exitCode);
       });
   }
   ```

2. Run: `pnpm run generate-barrel-exports` (regenerates `packages/cli/src/commands/_registry.ts` to import and register `createSyncMainCommand`).
3. Run: `pnpm run generate:barrels:check` — observe pass (no drift).
4. Run: `pnpm --filter @harness-engineering/cli test sync-main` — observe **GREEN**.
5. Run: `pnpm --filter @harness-engineering/cli typecheck` (or `build`) — observe success.
6. Commit: `feat(cli): add harness sync-main subcommand wrapping syncMain helper`

### Task 8: Write integration test using a real `git` binary against fixture repos (RED)

**Depends on:** Task 4
**Files:** `packages/orchestrator/tests/maintenance/sync-main.integration.test.ts`

1. Create the integration test. Pattern: build a "remote" bare repo and a "local" working clone in the OS tempdir, advance the remote, call `syncMain(localPath)` against it, assert outcomes.

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { execFileSync } from 'node:child_process';
   import { syncMain } from '../../src/maintenance/sync-main';

   function git(args: string[], cwd: string): string {
     return execFileSync('git', args, { cwd, encoding: 'utf8' }).toString();
   }

   describe('syncMain — integration (real git)', () => {
     let tmpDir: string;
     let remote: string;
     let local: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-syncmain-'));
       remote = path.join(tmpDir, 'remote.git');
       local = path.join(tmpDir, 'local');

       // Create a non-bare "upstream" working repo, then clone a bare from it.
       const seed = path.join(tmpDir, 'seed');
       fs.mkdirSync(seed, { recursive: true });
       git(['init', '-q', '-b', 'main'], seed);
       git(['config', 'user.email', 'test@example.com'], seed);
       git(['config', 'user.name', 'Test'], seed);
       fs.writeFileSync(path.join(seed, 'README.md'), 'one\n');
       git(['add', '.'], seed);
       git(['commit', '-q', '-m', 'one'], seed);
       git(['clone', '-q', '--bare', seed, remote], tmpDir);

       // Now clone the bare into our 'local' working copy and configure identity.
       git(['clone', '-q', remote, local], tmpDir);
       git(['config', 'user.email', 'test@example.com'], local);
       git(['config', 'user.name', 'Test'], local);
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('returns no-op when local equals origin', async () => {
       const r = await syncMain(local);
       expect(r.status).toBe('no-op');
       if (r.status === 'no-op') expect(r.defaultBranch).toBe('main');
     });

     it('returns updated and advances local HEAD when origin is ahead', async () => {
       // Advance the bare via a second working clone.
       const pusher = path.join(tmpDir, 'pusher');
       git(['clone', '-q', remote, pusher], tmpDir);
       git(['config', 'user.email', 'test@example.com'], pusher);
       git(['config', 'user.name', 'Test'], pusher);
       fs.writeFileSync(path.join(pusher, 'README.md'), 'two\n');
       git(['commit', '-q', '-am', 'two'], pusher);
       git(['push', '-q', 'origin', 'main'], pusher);

       const before = git(['rev-parse', 'HEAD'], local).trim();
       const r = await syncMain(local);
       expect(r.status).toBe('updated');
       const after = git(['rev-parse', 'HEAD'], local).trim();
       expect(after).not.toBe(before);
       if (r.status === 'updated') {
         expect(r.from).toBe(before);
         expect(r.to).toBe(after);
         expect(r.defaultBranch).toBe('main');
       }
       expect(fs.readFileSync(path.join(local, 'README.md'), 'utf8')).toBe('two\n');
     });

     it('returns skipped:wrong-branch when checked out on a topic branch', async () => {
       git(['checkout', '-q', '-b', 'topic'], local);
       const r = await syncMain(local);
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('wrong-branch');
     });

     it('returns skipped:diverged when local has a commit not on origin', async () => {
       fs.writeFileSync(path.join(local, 'README.md'), 'local-only\n');
       git(['commit', '-q', '-am', 'local-only'], local);
       const r = await syncMain(local);
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('diverged');
     });

     it('returns skipped:dirty-conflict when working-tree edit conflicts with incoming', async () => {
       // Origin advances README.md, local also dirties README.md uncommitted.
       const pusher = path.join(tmpDir, 'pusher2');
       git(['clone', '-q', remote, pusher], tmpDir);
       git(['config', 'user.email', 'test@example.com'], pusher);
       git(['config', 'user.name', 'Test'], pusher);
       fs.writeFileSync(path.join(pusher, 'README.md'), 'remote-change\n');
       git(['commit', '-q', '-am', 'remote-change'], pusher);
       git(['push', '-q', 'origin', 'main'], pusher);

       fs.writeFileSync(path.join(local, 'README.md'), 'local-uncommitted\n');
       const r = await syncMain(local);
       expect(r.status).toBe('skipped');
       if (r.status === 'skipped') expect(r.reason).toBe('dirty-conflict');
       // Working tree must remain byte-identical to what we wrote.
       expect(fs.readFileSync(path.join(local, 'README.md'), 'utf8')).toBe('local-uncommitted\n');
     });

     it('returns skipped:fetch-failed or no-remote when origin URL is unreachable', async () => {
       git(['remote', 'set-url', 'origin', 'file:///definitely/does/not/exist.git'], local);
       const r = await syncMain(local);
       expect(r.status).toBe('skipped');
       // Either reason is acceptable: depends on whether origin/HEAD survives.
       if (r.status === 'skipped') {
         expect(['fetch-failed', 'no-remote']).toContain(r.reason);
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test sync-main.integration` — observe **GREEN** (Task 4 already implemented the algorithm; integration just confirms behavior on the real binary).

   _If any case fails:_ this is a real-world deviation from assumptions; pause and revisit Task 4. Most likely culprits are the `dirty-conflict` stderr regex (Task 4 step `isDirtyConflictStderr`) or the `fetch-failed`/`no-remote` distinction. Update the regex / classification, re-run unit + integration suites.

3. Run: `harness validate` — observe pass.
4. Commit: `test(orchestrator/maintenance): add integration tests for syncMain against real git`

### Task 9: Run full Phase 1 quality gate

**Depends on:** Tasks 1–8
**Files:** none (verification only)

1. Run: `pnpm --filter @harness-engineering/orchestrator test` — observe pass for the whole orchestrator suite (no regressions in `task-registry`, `scheduler`, `pr-manager`, etc.).
2. Run: `pnpm --filter @harness-engineering/cli test` — observe pass for the whole CLI suite.
3. Run: `pnpm run generate:barrels:check` — observe pass.
4. Run: `harness validate` — observe pass.
5. Run: `harness check-deps` — observe no new layer or forbidden-import violations.
6. If anything fails, fix and re-run; do not advance until all five gates are green.
7. Commit (only if any fix-up was needed): `chore(phase-1-sync-core): close quality-gate findings`

### Task 10: Phase 1 wrap — verify no Phase 2/3/4 surface accidentally introduced

**Depends on:** Task 9
**Files:** none (verification only)

1. Verify the Phase 1 boundary is clean. Run these four `git diff` greps against the working tree:

   ```sh
   git diff --name-only main..HEAD | sort
   git grep -n "main-sync" -- 'packages/orchestrator/src/maintenance/task-registry.ts' || true
   git grep -n "baseref_fallback" -- 'packages/orchestrator/src/workspace/manager.ts' || true
   git grep -n "RunNowButton\|per-row" -- 'packages/dashboard/src/client/pages/Maintenance.tsx' || true
   ```

   Expected:
   - `git diff --name-only` shows **only** the files in the File Map plus the auto-regenerated `_registry.ts`.
   - The three `git grep` calls each return **no matches** (these are Phases 2, 3, 4 respectively).

2. If any check fails, the work bled across phase boundaries — revert that surface to keep Phase 1 minimal.
3. No commit needed if everything is clean. Otherwise: `chore(phase-1-sync-core): revert out-of-phase changes`.

## Quality Gates Summary

After completion of all 10 tasks:

- All 8 unit-test status paths pass: `updated`, `no-op`, `skipped:wrong-branch`, `skipped:diverged`, `skipped:dirty-conflict`, `skipped:no-remote`, `skipped:fetch-failed`, `error`.
- Integration test passes against the real `git` binary.
- `harness validate` passes.
- `harness check-deps` reports no new violations.
- `pnpm run generate:barrels:check` passes.
- File diff stays inside the declared File Map (verified in Task 10).

## Concerns / Risks

- **Dirty-conflict stderr matching** depends on git's user-facing wording, which has been stable but is not contractual. The regex in Task 4 (`/would be overwritten|local changes|Aborting/i`) is conservative; if a future git release reworded the message, classification would silently fall through to the top-level `error` path — still safe, just less informative. The integration test (Task 8) catches this immediately.
- **CLI imports from orchestrator's `dist/`** path. This works because the orchestrator package is built before the CLI runs, and `dashboard.ts` already does this. If TypeScript project-references are ever changed, this import path may need to switch to `@harness-engineering/orchestrator` root (which would require an explicit `exports` field for `./maintenance/sync-main`). Phase 2 implicitly validates this when the maintenance task scheduler calls into the same path.
