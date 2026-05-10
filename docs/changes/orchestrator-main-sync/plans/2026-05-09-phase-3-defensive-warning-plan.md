# Plan: Orchestrator Main-Sync — Phase 3 Defensive Worktree Warning

**Date:** 2026-05-09 | **Spec:** `docs/changes/orchestrator-main-sync/proposal.md` | **Tasks:** 7 | **Time:** ~22 min | **Integration Tier:** small

## Goal

When `WorkspaceManager.resolveBaseRef()` falls back past `origin/HEAD` and `origin/main`/`origin/master` to a local-only ref (`main`, `master`, or `HEAD`), emit a structured `baseref_fallback` event through the orchestrator's existing event bus so the operator sees a warning when the remote is misconfigured or unreachable instead of silently dispatching agents from a local-only ref.

## Context

Phases 1 and 2 are complete on `main` (commits `5cbc39fd`..`dec44e39`). `syncMain()` helper exists, `harness sync-main` CLI exists, `main-sync` is registered as the 21st `BUILT_IN_TASKS` entry, and the housekeeping path captures stdout and parses `SyncMainResult` JSON. All reviews are clean; `harness validate` and `harness check-deps` pass on `main`.

Phase 3 covers spec D6, EARS R4, and Success Criteria #10. Out of scope: dashboard rendering changes (Phase 4 covers per-row "Run Now" buttons; this phase touches no dashboard files).

The orchestrator's event surface today (`packages/orchestrator/src/orchestrator.ts:520-534`) emits maintenance events through two parallel channels per event:

1. `this.server?.broadcastMaintenance(<type>, <payload>)` — WebSocket fan-out to dashboard clients (`packages/orchestrator/src/server/http.ts:181`).
2. `this.emit(<type>, <payload>)` — Node `EventEmitter` for in-process subscribers (the `Orchestrator` class extends `EventEmitter`, line 84).

`WorkspaceManager` today has **no event reach**: it is constructed with a bare `WorkspaceConfig` (line 224) and never receives a callback or emitter. We must add a minimal injection so it can publish `baseref_fallback`. The smallest change that mirrors existing wiring is a single optional `emitEvent` callback on the `WorkspaceManager` constructor, threaded from the `Orchestrator` so both the in-process emitter and the WebSocket broadcaster are notified through one call. We do **not** introduce a shared event-bus singleton or a generic publish/subscribe abstraction — that would be premature for a single new event.

## Observable Truths (Acceptance Criteria)

1. **(R4 — Event-driven)** When `WorkspaceManager.resolveBaseRef()` is called and the priority chain selects `main`, `master`, or `HEAD` (i.e., none of `origin/HEAD`, `origin/main`, `origin/master`, or an explicit `config.baseRef` resolved), the system shall invoke the injected `emitEvent` callback exactly once with payload `{ kind: 'baseref_fallback', ref: <selected-ref>, repoRoot: <abs-path> }`.
2. **(R4 — Unwanted)** When `resolveBaseRef()` selects an `origin/`-prefixed ref (including the `origin/HEAD` symbolic-ref result, `origin/main`, `origin/master`, or any explicit `config.baseRef`), the system shall not invoke `emitEvent`.
3. **(SC10 — Event-driven)** When `WorkspaceManager.ensureWorkspace(identifier)` is called against a repo with no `origin/HEAD`, no `origin/main`, no `origin/master`, but a local `main`, the system shall invoke `emitEvent` exactly once per `ensureWorkspace` call (not once per worktree-add and once per recreate; not zero times when a stale worktree is removed first).
4. **(Wiring — Ubiquitous)** `Orchestrator`'s constructor shall pass an `emitEvent` callback into `new WorkspaceManager(config.workspace, { emitEvent })` such that the callback (a) calls `this.server?.broadcastMaintenance('maintenance:baseref_fallback', payload)` if `this.server` is set, and (b) calls `this.emit('maintenance:baseref_fallback', payload)`.
5. **(Backwards-compat — Ubiquitous)** Existing `WorkspaceManager` callers that omit the second constructor argument (notably the README example and any direct test-instantiation) shall continue to work — `emitEvent` is optional; when absent, `resolveBaseRef()` runs identically to today (no event, no error).
6. **(Test isolation — Event-driven)** When a test instantiates `WorkspaceManager` with a stub `emitEvent` and drives `ensureWorkspace` through a git impl that returns no `origin/*` refs, the stub shall be called exactly once with `{ kind: 'baseref_fallback', ref: 'HEAD', repoRoot: '/repo' }` (or `'main'` / `'master'` when those exist locally).
7. **(Health gate — Ubiquitous)** `pnpm harness validate` and `pnpm harness check-deps` shall pass after the change.

## Uncertainties

- **[ASSUMPTION]** WebSocket event type name. The spec says "the same maintenance/event stream the dashboard already subscribes to" — that stream is the `maintenance:*` topic family. We use `maintenance:baseref_fallback` as the WebSocket message type so it flows through `broadcastMaintenance()` without a new channel. The dashboard's `useOrchestratorSocket` switch (`packages/dashboard/src/client/hooks/useOrchestratorSocket.ts:90-112`) ignores unknown `msg.type` values silently — confirmed by reading the switch — so no dashboard schema/type change is required this phase. Phase 4 (dashboard work) can add a case if it wants UI rendering.
- **[ASSUMPTION]** `emitEvent` callback shape. We use `(event: { kind: 'baseref_fallback'; ref: string; repoRoot: string }) => void` — synchronous, fire-and-forget, no return value. This matches the existing `this.emit(...)` and `this.server?.broadcastMaintenance(...)` pattern (both synchronous) and keeps `WorkspaceManager` decoupled from `EventEmitter`.
- **[ASSUMPTION]** Single emission per `ensureWorkspace`. `resolveBaseRef()` is called exactly once per `ensureWorkspace` (line 102). The stale-worktree removal path (lines 70-91) does **not** call `resolveBaseRef`, so there is no double-emission risk on recreate.
- **[ASSUMPTION]** Explicit `config.baseRef` is never local-only-classified. When a user sets `workspace.baseRef: 'main'` explicitly, we treat that as an intentional override (not a fallback). The classification is "did the priority chain fall through to the local-only fallback list?" — not "is the final ref a local ref?". Implementation places the emission inside the `for (const candidate of [...])` fallback loop and the final `return 'HEAD'` line, but **not** in the configured-override branch.
- **[DEFERRABLE]** Rate-limiting / dedup of repeated emissions across multiple `ensureWorkspace` calls in one orchestrator session. Current dispatch volume is low (one per issue dispatch); if the dashboard event log gets noisy, a per-session "warned-once" cache can be added. Out of scope for Phase 3.
- **[DEFERRABLE]** Logger output. We do not also log via `this.logger.warn` from inside `WorkspaceManager` (it has no logger today). The event itself is the observability channel; if a duplicate log line is wanted, that's a follow-up.

## File Map

```
MODIFY packages/orchestrator/src/workspace/manager.ts                          (add emitEvent option + classify fallback)
MODIFY packages/orchestrator/src/orchestrator.ts                               (thread emitEvent into WorkspaceManager ctor)
MODIFY packages/orchestrator/tests/workspace/manager.test.ts                   (assert emit on local fallback; assert no-emit on origin path)
CREATE packages/orchestrator/tests/workspace/baseref-fallback.test.ts          (focused R4 + SC10 tests across all fallback shapes)
MODIFY packages/orchestrator/tests/integration/orchestrator.test.ts             (assert wired emitter forwards baseref_fallback to broadcast + emit) — only if an existing test already constructs an Orchestrator with a server stub; if not, do this assertion in a new small unit test alongside the constructor wiring
```

No new public exports from `@harness-engineering/orchestrator`. No new MCP tools. No barrel regen expected. No dashboard files touched.

## Skeleton (skipped — rigor: fast)

## Tasks

---

### Task 1: Extend `WorkspaceManager` constructor with optional `emitEvent` option

**Depends on:** none | **Files:** `packages/orchestrator/src/workspace/manager.ts`

Goal: introduce the injection point without changing any behavior. After this task the manager accepts `emitEvent` but does not yet call it.

1. Open `packages/orchestrator/src/workspace/manager.ts`.
2. Above the `export class WorkspaceManager` declaration (before line 7), add the event payload type and options interface:

   ```ts
   /**
    * Structured event emitted when {@link WorkspaceManager.resolveBaseRef}
    * falls back past `origin/HEAD` and `origin/main`/`origin/master` to a
    * local-only ref. Operators see this in the dashboard's maintenance
    * event stream when the remote is misconfigured or unreachable.
    */
   export interface BaseRefFallbackEvent {
     kind: 'baseref_fallback';
     /** The ref that was selected — `'main'`, `'master'`, or `'HEAD'`. */
     ref: string;
     /** Absolute path to the git repository root. */
     repoRoot: string;
   }

   /** Optional dependencies injected into {@link WorkspaceManager}. */
   export interface WorkspaceManagerOptions {
     /**
      * Synchronous fire-and-forget callback invoked when {@link
      * WorkspaceManager.resolveBaseRef} falls back to a local-only ref.
      * When omitted, fallback emission is silently skipped.
      */
     emitEvent?: (event: BaseRefFallbackEvent) => void;
   }
   ```

3. Change the class to accept the options:

   ```ts
   export class WorkspaceManager {
     private config: WorkspaceConfig;
     /** Absolute path to the git repository root (resolved lazily). */
     private repoRoot: string | null = null;
     /** Phase 3 (D6): emit baseref_fallback when fallback chain selects a local-only ref. */
     private emitEvent: ((event: BaseRefFallbackEvent) => void) | null;

     constructor(config: WorkspaceConfig, options: WorkspaceManagerOptions = {}) {
       this.config = config;
       this.emitEvent = options.emitEvent ?? null;
     }
   ```

   Replace the existing 3-line constructor (lines 12-14). The old single-arg signature is preserved as a no-options call.

4. Verify (do not run) — at this point `resolveBaseRef` is unchanged, so the only observable effect should be the new constructor signature. Save.
5. Run typecheck for the orchestrator package only:

   ```
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```

   Must pass with 0 errors. If existing call sites break (other than `orchestrator.ts:224`), revert and stop — the second-arg-optional contract is broken.

6. Commit:

   ```
   refactor(orchestrator): add WorkspaceManager emitEvent option for D6
   ```

---

### Task 2 (TDD red): Write failing tests for `resolveBaseRef` fallback emission

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/workspace/baseref-fallback.test.ts`

Goal: encode R4, SC10, and the no-emit-on-origin-path constraints as failing tests **before** implementing the emission. After Task 2 the new test file should fail with messages like "expected emitEvent to have been called once".

1. Create `packages/orchestrator/tests/workspace/baseref-fallback.test.ts` with the following exact contents:

   ```ts
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import * as fs from 'node:fs/promises';
   import { WorkspaceManager, type BaseRefFallbackEvent } from '../../src/workspace/manager';

   vi.mock('node:fs/promises');

   class TestableWorkspaceManager extends WorkspaceManager {
     public gitCalls: Array<{ args: string[]; cwd: string }> = [];
     private gitImpl: (args: string[], cwd: string) => string = () => '';
     setGitImpl(impl: (args: string[], cwd: string) => string) {
       this.gitImpl = impl;
     }
     protected async git(args: string[], cwd: string): Promise<string> {
       this.gitCalls.push({ args, cwd });
       return this.gitImpl(args, cwd);
     }
   }

   describe('WorkspaceManager — D6 baseref_fallback emission', () => {
     const config = { root: '/tmp/workspaces' };
     let emitted: BaseRefFallbackEvent[];
     let emitEvent: (e: BaseRefFallbackEvent) => void;

     beforeEach(() => {
       vi.resetAllMocks();
       emitted = [];
       emitEvent = (e) => {
         emitted.push(e);
       };
       vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
       vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
     });

     it('emits baseref_fallback when origin/* refs are missing and falls back to local main', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') {
           const ref = args[3];
           // origin/main, origin/master missing → local main exists.
           if (ref === 'origin/main' || ref === 'origin/master') throw new Error('missing');
           if (ref === 'main') return '';
           throw new Error('missing');
         }
         return '';
       });

       const result = await manager.ensureWorkspace('test-issue');
       expect(result.ok).toBe(true);
       expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'main', repoRoot: '/repo' }]);
     });

     it('emits baseref_fallback with ref=master when only local master exists', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') {
           const ref = args[3];
           if (ref === 'master') return '';
           throw new Error('missing');
         }
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'master', repoRoot: '/repo' }]);
     });

     it('emits baseref_fallback with ref=HEAD when no candidate resolves at all', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([{ kind: 'baseref_fallback', ref: 'HEAD', repoRoot: '/repo' }]);
     });

     it('does NOT emit when origin/HEAD resolves (the happy path)', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') return 'origin/main\n';
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([]);
     });

     it('does NOT emit when origin/main is found via the fallback list (origin/HEAD missing)', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') {
           const ref = args[3];
           if (ref === 'origin/main') return '';
           throw new Error('missing');
         }
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([]);
     });

     it('does NOT emit when origin/master is the matched fallback', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') {
           const ref = args[3];
           if (ref === 'origin/master') return '';
           throw new Error('missing');
         }
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([]);
     });

     it('does NOT emit when an explicit configured baseRef resolves', async () => {
       // Even if the configured ref looks "local" (e.g. 'main'), the
       // operator opted in — this is not a fallback and must not warn.
       const manager = new TestableWorkspaceManager(
         { root: '/tmp/workspaces', baseRef: 'main' },
         { emitEvent }
       );
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'rev-parse' && args[1] === '--verify') return '';
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toEqual([]);
     });

     it('emits exactly once per ensureWorkspace call (not duplicated by stale-worktree recreate)', async () => {
       const manager = new TestableWorkspaceManager(config, { emitEvent });
       // Simulate a stale .git so the remove-then-recreate branch fires.
       let gitCheckCount = 0;
       vi.mocked(fs.access).mockImplementation(async (p) => {
         const pathStr = String(p);
         if (pathStr.endsWith('.git')) {
           gitCheckCount++;
           if (gitCheckCount === 1) return undefined; // exists initially
           throw new Error('ENOENT');
         }
         throw new Error('ENOENT');
       });
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
         return '';
       });

       await manager.ensureWorkspace('test-issue');
       expect(emitted).toHaveLength(1);
       expect(emitted[0]).toEqual({ kind: 'baseref_fallback', ref: 'HEAD', repoRoot: '/repo' });
     });

     it('is silent (no throw, no event) when emitEvent is omitted from options', async () => {
       const manager = new TestableWorkspaceManager(config); // no options
       manager.setGitImpl((args) => {
         if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
         if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
         if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
         return '';
       });

       const result = await manager.ensureWorkspace('test-issue');
       expect(result.ok).toBe(true);
     });
   });
   ```

2. Run the new test file. It must fail (because `resolveBaseRef` does not yet emit):

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/baseref-fallback.test.ts
   ```

   Expect: 6+ failures (the 7 happy-path "does NOT emit" tests should pass incidentally; the 4 emit-expected tests should fail; the "no-throw when emitEvent omitted" test should pass). Confirm failure mode shows `expected emitted to deeply equal […]` not a TypeScript error.

3. Commit:

   ```
   test(orchestrator): red — assert baseref_fallback emission on local-only fallback
   ```

---

### Task 3 (TDD green): Implement fallback classification + emission in `resolveBaseRef`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/workspace/manager.ts`

Goal: make Task 2's failing tests green by emitting `baseref_fallback` from inside the fallback branch of `resolveBaseRef()`.

1. Open `packages/orchestrator/src/workspace/manager.ts`. Locate `resolveBaseRef()` (currently lines 134-159 prior to Task 1's edits — line numbers shift slightly after Task 1).
2. Replace the body of `resolveBaseRef()` with the following, preserving the existing JSDoc:

   ```ts
   private async resolveBaseRef(repoRoot: string): Promise<string> {
     const configured = this.config.baseRef;
     if (configured) {
       if (await this.refExists(configured, repoRoot)) return configured;
       throw new Error(
         `Configured workspace.baseRef "${configured}" does not resolve in this repository`
       );
     }

     try {
       const stdout = await this.git(
         ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
         repoRoot
       );
       const detected = stdout.trim();
       if (detected) return detected;
     } catch {
       // origin/HEAD not set — fall through to known-name lookups.
     }

     // origin/* candidates are NOT fallbacks worth warning about — they
     // still ground the worktree on a remote tracking ref.
     for (const candidate of ['origin/main', 'origin/master']) {
       if (await this.refExists(candidate, repoRoot)) return candidate;
     }

     // Local-only candidates ARE worth warning about. Per spec D6, falling
     // past origin/* nearly always means the remote is misconfigured or
     // unreachable; the operator should know rather than have the
     // orchestrator silently dispatch agents from a local-only ref.
     for (const candidate of ['main', 'master']) {
       if (await this.refExists(candidate, repoRoot)) {
         this.emitFallback(candidate, repoRoot);
         return candidate;
       }
     }

     this.emitFallback('HEAD', repoRoot);
     return 'HEAD';
   }

   /** Phase 3 (D6): emit baseref_fallback when fallback chain selects a local-only ref. */
   private emitFallback(ref: string, repoRoot: string): void {
     if (!this.emitEvent) return;
     try {
       this.emitEvent({ kind: 'baseref_fallback', ref, repoRoot });
     } catch {
       // emitEvent must never block worktree creation. Swallow errors —
       // a broken emitter shouldn't take down dispatch.
     }
   }
   ```

   Key changes from the prior implementation:
   - Split the single-loop `['origin/main', 'origin/master', 'main', 'master']` into two loops so `origin/*` is silent and `main`/`master` triggers emission.
   - Add `emitFallback()` helper that swallows errors to keep dispatch resilient.
   - The HEAD-tail emission ensures the no-candidate-resolves case still warns (R4 catches `ref: 'HEAD'`).

3. Save and re-run the focused tests:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/baseref-fallback.test.ts
   ```

   Expect: all 9 tests pass. If any fail, fix before continuing.

4. Run the full `manager.test.ts` to verify no regression in the existing fallback-priority tests:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/manager.test.ts
   ```

   Expect: all existing tests pass unchanged. The "falls back through common defaults when origin/HEAD is not set" test (which sets up `origin/master` to exist) and "ultimately falls back to HEAD when no default ref can be resolved" (HEAD path) both still hold; the only behavior change is that the latter now emits when an emitter is supplied — but the existing tests construct `manager` with no second argument, so `emitEvent` is null and emission is a no-op.

5. Run `harness validate`:

   ```
   harness validate
   ```

   Must pass. Then commit:

   ```
   feat(orchestrator): emit baseref_fallback when worktree base falls back past origin/*
   ```

---

### Task 4: Extend existing `manager.test.ts` no-emit invariants

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/workspace/manager.test.ts`

Goal: anchor the no-emit-by-default contract into the pre-existing test file so future refactors don't accidentally start emitting on the happy path. This is a small additive change — no existing test needs to be modified.

1. Open `packages/orchestrator/tests/workspace/manager.test.ts`.
2. Inside the `describe('base ref resolution', () => { ... })` block, after the existing `it('proceeds with local state when fetch fails (offline)', ...)` test (around line 195 in the current file), append:

   ```ts
   it('does not emit baseref_fallback by default (no emitter wired)', async () => {
     // Regression: the default WorkspaceManager construction in production
     // when no emitEvent is supplied must not throw or otherwise misbehave
     // on the local-only fallback path.
     manager.setGitImpl((args) => {
       if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
       if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
       if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
       return '';
     });

     const result = await manager.ensureWorkspace('test-issue');
     expect(result.ok).toBe(true);
     // The base ref ends up at 'HEAD' (existing behavior). The point of
     // this test is purely that no exception escaped from the (absent)
     // emitter path.
     expect(worktreeAddRef(manager)).toBe('HEAD');
   });
   ```

3. Run:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/manager.test.ts
   ```

   Must pass with the new test green and all existing tests unchanged.

4. Commit:

   ```
   test(orchestrator): assert WorkspaceManager is silent when no emitter wired
   ```

---

### Task 5 (TDD red): Write failing test for orchestrator wiring of `emitEvent`

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/workspace/baseref-fallback.test.ts`

Goal: lock in Observable Truth #4 — when the `Orchestrator` constructs `WorkspaceManager`, the emitter forwards events to **both** `this.emit(...)` and `this.server?.broadcastMaintenance(...)`. We assert this at the unit level by reading the wired callback off a constructed manager rather than spinning up the full orchestrator.

We add this test to the same `baseref-fallback.test.ts` file (kept focused on D6 concerns).

1. Open `packages/orchestrator/tests/workspace/baseref-fallback.test.ts`.
2. Append a second `describe` block at the end of the file:

   ```ts
   describe('Orchestrator wiring — baseref_fallback fans out to both bus channels', () => {
     it('orchestrator emitEvent callback calls server.broadcastMaintenance and EventEmitter.emit', async () => {
       // Lightweight wiring assertion: import the Orchestrator class and
       // verify that the callback it constructs WorkspaceManager with does
       // forward to both channels. Avoids spinning up the full orchestrator
       // (no tracker, no scheduler, no server port).
       const { Orchestrator } = await import('../../src/orchestrator');

       // Minimal config that satisfies the Orchestrator constructor without
       // triggering tracker/server construction. Reuses the same shape
       // existing orchestrator unit tests use.
       const broadcasts: Array<{ type: string; data: unknown }> = [];
       const emits: Array<{ type: string; data: unknown }> = [];

       // Subclass override: capture both channels.
       class TestOrchestrator extends (Orchestrator as any) {
         constructor(...args: any[]) {
           super(...args);
           // Stub a fake server to capture broadcasts.
           (this as any).server = {
             broadcastMaintenance: (type: string, data: unknown) => {
               broadcasts.push({ type, data });
             },
           };
           this.on('maintenance:baseref_fallback', (data: unknown) => {
             emits.push({ type: 'maintenance:baseref_fallback', data });
           });
         }
         /** Expose the wired emitter for direct invocation in this test. */
         public invokeWiredEmitter(
           event: import('../../src/workspace/manager').BaseRefFallbackEvent
         ): void {
           // Reach into the workspace manager and call its private emitEvent.
           // We rely on the fact that the orchestrator stored the same
           // callback reference it passed to the WorkspaceManager ctor.
           const cb = (this as any).workspace.emitEvent as (
             e: import('../../src/workspace/manager').BaseRefFallbackEvent
           ) => void;
           cb(event);
         }
       }

       // Construct with the minimum config the orchestrator constructor
       // tolerates. (Test file should mirror existing Orchestrator unit-
       // test fixture shape — see tests/integration/orchestrator.test.ts
       // for a working example to copy.) The exact config is intentionally
       // referenced from the integration test fixtures rather than
       // hand-built here, to avoid duplicating WorkflowConfig assembly.
       // For this Phase 3 plan we keep the wiring assertion small and
       // delegate full-orchestrator construction details to the executor.

       // If full Orchestrator construction is too heavy, an acceptable
       // alternative implementation is to directly construct
       // WorkspaceManager with a callback that mirrors orchestrator.ts's
       // wiring (lines 224-style) and assert both targets fire — see
       // Task 6 for the actual implementation choice.
       expect(true).toBe(true); // placeholder until Task 6 chooses approach
     });
   });
   ```

   Note: this scaffolding test is intentionally a placeholder — the real wiring assertion is structural. Task 6 chooses one of two approaches and replaces this body.

3. Run the file. The placeholder passes; the suite should be green except for the placeholder being a no-op:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/baseref-fallback.test.ts
   ```

4. Do NOT commit yet — the placeholder is replaced in Task 6.

---

### Task 6: Wire `emitEvent` into `WorkspaceManager` from the `Orchestrator` constructor + finalize wiring test

[checkpoint:human-verify] After this task, before committing, the executor pauses to verify the wiring approach matches the spec's "existing event bus" intent. Show the diff in `orchestrator.ts` and the wiring test body.

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/tests/workspace/baseref-fallback.test.ts`

Goal: change line 224 in `orchestrator.ts` so the orchestrator passes a callback that forwards `baseref_fallback` events through both the WebSocket broadcaster and the in-process `EventEmitter`. Then replace Task 5's placeholder with a real assertion.

**Implementation:**

1. Open `packages/orchestrator/src/orchestrator.ts`. Locate line 224:

   ```ts
   this.workspace = new WorkspaceManager(config.workspace);
   ```

2. Replace with:

   ```ts
   this.workspace = new WorkspaceManager(config.workspace, {
     emitEvent: (event) => {
       // Phase 3 / spec D6 / R4: surface worktree base-ref fallback in
       // the same maintenance/event stream the dashboard subscribes to.
       // Two parallel channels mirror the maintenance task pattern at
       // orchestrator.ts:520-534: WebSocket fan-out + Node EventEmitter.
       this.server?.broadcastMaintenance('maintenance:baseref_fallback', event);
       this.emit('maintenance:baseref_fallback', event);
     },
   });
   ```

   Note: at construction time `this.server` is still `undefined` (the server is built later in the same constructor, around line 367). That is fine — `resolveBaseRef` is never called from inside the constructor; it is called lazily from `ensureWorkspace`, by which time `this.server` is wired. The `this.server?.` optional chain handles the legacy "no server port configured" case.

3. Run the orchestrator typecheck:

   ```
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```

   Must pass with 0 errors.

4. Now replace Task 5's placeholder. Open `packages/orchestrator/tests/workspace/baseref-fallback.test.ts` and replace the entire second `describe` block from Task 5 with the implementation below. **Choose Approach A (preferred) — direct wiring assertion without instantiating the full Orchestrator:**

   ```ts
   describe('Orchestrator wiring — baseref_fallback fans out to both channels', () => {
     it('the wired emitter forwards to broadcastMaintenance and emit', () => {
       // Mirror orchestrator.ts:224-style wiring exactly. We do not
       // instantiate the full Orchestrator (tracker + server + scheduler
       // would all need stubbing); instead we assert the callback shape
       // the orchestrator constructs has the documented behavior.
       const broadcasts: Array<{ type: string; data: unknown }> = [];
       const emits: Array<{ type: string; data: unknown }> = [];

       const fakeServer = {
         broadcastMaintenance: (type: string, data: unknown) => broadcasts.push({ type, data }),
       };
       const fakeEmit = (type: string, data: unknown) => emits.push({ type, data });

       // This is the exact callback orchestrator.ts:224 constructs.
       const emitEvent = (event: { kind: 'baseref_fallback'; ref: string; repoRoot: string }) => {
         fakeServer.broadcastMaintenance('maintenance:baseref_fallback', event);
         fakeEmit('maintenance:baseref_fallback', event);
       };

       const event = { kind: 'baseref_fallback' as const, ref: 'main', repoRoot: '/repo' };
       emitEvent(event);

       expect(broadcasts).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
       expect(emits).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
     });

     it('the wired emitter is robust to server being undefined (pre-server-wire path)', () => {
       const emits: Array<{ type: string; data: unknown }> = [];
       const fakeEmit = (type: string, data: unknown) => emits.push({ type, data });
       const server: { broadcastMaintenance?: (t: string, d: unknown) => void } | undefined =
         undefined;

       const emitEvent = (event: { kind: 'baseref_fallback'; ref: string; repoRoot: string }) => {
         server?.broadcastMaintenance('maintenance:baseref_fallback', event);
         fakeEmit('maintenance:baseref_fallback', event);
       };

       const event = { kind: 'baseref_fallback' as const, ref: 'HEAD', repoRoot: '/repo' };
       expect(() => emitEvent(event)).not.toThrow();
       expect(emits).toEqual([{ type: 'maintenance:baseref_fallback', data: event }]);
     });
   });
   ```

   This approach mirrors the orchestrator's wiring as a snippet test. The risk it does not catch is "future refactor of orchestrator.ts:224 silently drops the broadcast call." That risk is acceptable here because the snippet is a literal copy and grepping for `maintenance:baseref_fallback` in `orchestrator.ts` is the actual contract — see Task 7 for the explicit grep gate.

5. Run the focused suite:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run tests/workspace/baseref-fallback.test.ts
   ```

   Must show all tests in both `describe` blocks passing.

6. Run the full orchestrator test suite to catch any regression from the constructor signature change:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run
   ```

   Expected: full pass (the only callers of `new WorkspaceManager(...)` outside the orchestrator are the test subclass `TestableWorkspaceManager` in `manager.test.ts` and the new `baseref-fallback.test.ts` — both already pass options correctly).

7. Run `harness validate` then commit:

   ```
   feat(orchestrator): wire baseref_fallback events through server and event bus
   ```

---

### Task 7: Final quality gate — grep contract, full test suite, validate, check-deps

**Depends on:** Task 6 | **Files:** none modified — read-only verification

Goal: lock the wiring contract (the exact event-type string and callsite shape) and confirm full project health before handoff.

1. Verify the exact event-type string appears in both producer and `WorkspaceManager` consumer plumbing:

   ```
   grep -n "maintenance:baseref_fallback" packages/orchestrator/src/orchestrator.ts
   grep -n "baseref_fallback" packages/orchestrator/src/workspace/manager.ts
   grep -rn "baseref_fallback" packages/orchestrator/tests/workspace/
   ```

   Expected: orchestrator.ts has 2 lines (broadcast + emit); manager.ts has the type definition + classification block; tests have several hits across both test files.

2. Confirm Phase 4 surfaces remain untouched:

   ```
   git diff --stat main packages/dashboard/
   ```

   Expected: no changes (Phase 3 must not touch dashboard files; Phase 4 owns those).

3. Run the full orchestrator package test suite:

   ```
   pnpm --filter @harness-engineering/orchestrator vitest run
   ```

   Must pass — the Phase 2 baseline was 874/874. Expect ≥875 (we added ≥9 tests in Task 2, +1 in Task 4, +2 in Task 6, so 874 + 12 = 886 minimum; allow for any tests merged on `main` since Phase 2's baseline).

4. Run the orchestrator typecheck:

   ```
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```

   Must pass with 0 errors.

5. Run `harness validate` and `harness check-deps`:

   ```
   harness validate
   harness check-deps
   ```

   Both must pass.

6. No commit needed for this task unless previous tasks left the tree dirty. If clean, the phase is done.

---

## Integration Tasks

The spec's Integration Points section for this phase is minimal — Phase 3 introduces no new entry points, no registrations, no new public exports. The dashboard guide and `harness.orchestrator.md` were updated in Phase 2; D6 does not warrant additional documentation since it is a defensive warning surfaced in an existing event stream.

No integration tasks for Phase 3.

## Risks & Concerns

1. **Test flakiness from shared `vi.mock('node:fs/promises')`.** The new `baseref-fallback.test.ts` uses the same module mock as `manager.test.ts`. If Vitest runs them in parallel within the same worker, mock state may bleed. Mitigation: each test calls `vi.resetAllMocks()` in `beforeEach`. If flakes appear, add `vi.clearAllMocks()` after each test or move the mock reset into an `afterEach`.

2. **Constructor signature change ripples.** `WorkspaceManager`'s constructor now takes a second argument. Production callers go through `orchestrator.ts:224` (updated). Test callers go through `TestableWorkspaceManager` (also updated). The only other reference is `packages/orchestrator/README.md` line 109, which is documentation and not enforced by typecheck — Task 1 does not touch the README, but the executor can optionally update it as a "nice-to-have" in Task 7 (out of scope unless a doc lint catches it).

3. **The "does not emit on configured local baseRef" invariant** rests on the structural decision to emit only inside the fallback loops, not after the configured-override branch. A future refactor that consolidates "is this a local ref?" classification could break that invariant silently. Test #6 in Task 2 (`'does NOT emit when an explicit configured baseRef resolves'`) guards this.

4. **Server vs. emit ordering.** The wired callback calls `broadcastMaintenance` before `this.emit`. If the WebSocket broadcaster throws synchronously, the in-process emit is skipped. Mitigation: `broadcastMaintenance` only calls `this.broadcaster.broadcast()`, which catches per-client errors; a synchronous throw is not expected. If this becomes a real concern, wrap each channel in its own try/catch — but that is over-engineering for Phase 3.

## Success Criteria

- `WorkspaceManager` constructor accepts an optional second argument with `emitEvent`.
- `resolveBaseRef()` invokes `emitEvent` exactly once when the priority chain falls past `origin/HEAD`/`origin/main`/`origin/master` to `main`, `master`, or `HEAD`.
- `resolveBaseRef()` does not invoke `emitEvent` on any `origin/*` path or when an explicit configured `baseRef` resolves.
- `Orchestrator` constructs `WorkspaceManager` with a callback that fans out to `server.broadcastMaintenance('maintenance:baseref_fallback', payload)` and `this.emit('maintenance:baseref_fallback', payload)`.
- All 9+ new tests in `baseref-fallback.test.ts` pass.
- The 1 new test in `manager.test.ts` passes; existing tests in that file pass unchanged.
- Full orchestrator test suite passes (≥886 tests).
- Phase 4 surfaces (`packages/dashboard/`) are byte-identical to the start of Phase 3.
- `harness validate` and `harness check-deps` both pass.
- No new public exports added to `@harness-engineering/orchestrator`.

## Gates

- **No dashboard changes.** Phase 4 owns the dashboard. Any diff under `packages/dashboard/` after Phase 3 is a violation.
- **No new event-bus abstraction.** Reuse the existing `broadcastMaintenance` + `EventEmitter.emit` pattern.
- **Single emission per `ensureWorkspace`.** Test #7 in Task 2 enforces this.
- **Backwards-compatible constructor.** The single-arg `new WorkspaceManager(config)` form must continue to work (Test #8 in Task 2).
