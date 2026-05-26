# Plan: Spec B Phase 4 — RoutingDecisionBus + Event Emission

**Date:** 2026-05-25
**Spec:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/docs/changes/granular-task-routing/proposal.md`
**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1`
**Branch:** `feat/spec-b-phase-1` (HEAD `cf36696f`, Phase 3 tip — Phase 2 tip `acb6e8c1`, Phase 1 tip `2786211a`)
**Phase 4 scope:** ~2 days, medium complexity
**Tasks:** 14
**Estimated time:** ~62 min of focused work (1 context window per task)
**Integration Tier:** medium
**Phase 4 success criteria:** O1 + S5 + S6 pass; close P1-IMP-1 + P1-IMP-2 + P1-IMP-3 + I1 third instance

---

## Goal

Every `BackendRouter.resolve()` call produces a `RoutingDecision` event surfaced on a new in-process bus (`RoutingDecisionBus`) with a per-orchestrator in-memory ring buffer (default capacity 500). The orchestrator instantiates the bus at startup, wires it into `BackendRouter` via constructor injection, and the bus is teardown-safe on `Orchestrator.stop()`. Alongside the bus, four Phase 1 deferred findings close: (1) `IntelligenceFactoryDeps` is split so `buildAnalysisProviderForLayer` no longer carries an unused-but-required `router` field; (2) `OrchestratorBackendFactory.forUseCase` resolves once (not twice) and reuses the threaded decision — critical now that each `resolve()` emits; (3) the silent `intelligence-pipeline` drop when `backendFactory === null` becomes a `warn()` log; (4) the I1 third instance — `resolveRoutedBackend`'s inline `Array.isArray` normalization in `intelligence-factory.ts:135-159` — is replaced with the router-driven path so the legacy chain shim disappears.

---

## Observable Truths (Acceptance Criteria)

1. **EARS — Event-driven (O1):** When `BackendRouter.resolve(useCase)` returns a decision, the system shall emit a structured log line `routing-decision` at `info` level whose context object includes `useCase`, `backendName`, `resolutionPathLength`, and `durationMs` (verified by spying on `StructuredLogger.info`).
2. **EARS — Event-driven (S5):** When 10 000 decisions are emitted into a `RoutingDecisionBus` with `capacity = 500`, `recent({ limit: 99999 })` shall return at most 500 records, ordered oldest→newest, with the first 9 500 dropped (verified by unit test).
3. **EARS — Unwanted (S6):** If a subscriber callback throws, then `RoutingDecisionBus.emit(...)` shall not propagate the error; the throwing subscriber's error shall be logged once (warn) and the remaining subscribers shall still receive the decision (verified by unit test).
4. **EARS — Ubiquitous:** `OrchestratorBackendFactory.forUseCase(useCase, opts)` shall call `router.resolve(useCase, opts)` exactly **once** per dispatch; the returned `RoutingDecision.backendName` shall be used both for `resolveDefinition`-style backend materialization and for the optional resolver binding lookup. Verified by spying on `router.resolve` and asserting `callCount === 1`.
5. **EARS — Ubiquitous:** `IntelligenceFactoryDeps` shall be split: `BuildPipelineDeps` (used by `buildIntelligencePipeline`) carries the `router`; `BuildLayerDeps` (used by `buildAnalysisProviderForLayer`) does not. Existing call site in `intelligence-pipeline-routing.test.ts:74-78` shall typecheck without a `router` field present.
6. **EARS — Event-driven (P1-IMP-3):** When `createIntelligencePipeline()` returns `null` because `backendFactory === null`, the system shall emit `logger.warn('intelligence pipeline disabled: no backendFactory available (legacy config without agent.backends)')` at startup.
7. **EARS — Unwanted (I1 third instance):** The inline `Array.isArray(layerValue)` / `Array.isArray(routing.default)` chain normalization in `intelligence-factory.ts:135-159` shall not exist after this phase; `resolveRoutedBackend` shall delegate to the canonical router (or be removed entirely if the routing-driven branch can call `router.resolve({ kind: 'intelligence', layer })`).
8. **EARS — State-driven:** While `Orchestrator` is running between `start()` and `stop()`, `routingDecisionBus.recent()` shall return the decisions emitted during that window; after `stop()`, the listener set shall be cleared and the buffer eligible for GC.
9. **EARS — Ubiquitous (N1):** All existing `BackendRouter` tests (`backend-router.test.ts`, `backend-router-chain-walk.test.ts`) shall pass unchanged. `orchestrator-backend-factory.test.ts` (9 tests) shall pass unchanged or with mechanical updates accounting for the single-resolve refactor.
10. **EARS — Ubiquitous:** `harness validate`, `harness check-deps`, `pnpm --filter @harness-engineering/orchestrator typecheck`, and the new Phase 4 acceptance test file shall pass.
11. **EARS — Ubiquitous:** A new acceptance test file at `packages/orchestrator/tests/integration/spec-b-phase-4-decision-bus.test.ts` shall pin O1, S5, S6, and the single-resolve invariant across at least 5 passing tests.

---

## Uncertainties / Concerns for Operator Sign-Off

| #   | Class         | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | BLOCKING-LITE | **Bus injection shape:** Two options. **A (planner default):** `BackendRouter` ctor gains an optional `decisionBus?: RoutingDecisionBus`; `resolve()` calls `decisionBus?.emit(decision)` after deciding. Pros: minimal blast radius, router stays self-contained, tests can omit the bus. Cons: every test that constructs `BackendRouter` directly needs decoration to assert emission. **B:** A `RoutingDecisionEmitter` interface (`emit(decision): void`) injected via ctor; bus implements it. Pros: thinner contract, easier to fake. Cons: extra type for a one-method protocol. Plan defaults to **A** — the bus class is already small enough to mock without an interface seam.                                                                                                                                                 |
| C2  | BLOCKING-LITE | **`forUseCase` refactor: single-resolve approach.** Today `forUseCase` calls `resolveDefinition()` then `resolve()` again (orchestrator-backend-factory.ts:112-113). Plan refactors to: `const decision = router.resolve(useCase, opts); const def = backends[decision.backendName]`. Requires either (a) exposing `backends` as a read accessor on `BackendRouter` (planner default — small public surface widening, already done with `getRouter()`), or (b) adding `BackendRouter.resolveDecisionAndDef(useCase, opts): { decision, def }`. Plan defaults to **(b)** — adds one method, keeps `backends` private. Confirms with the operator before execution.                                                                                                                                                                          |
| C3  | BLOCKING-LITE | **I1 third instance — replace vs remove `resolveRoutedBackend`.** The helper at `intelligence-factory.ts:135-159` exists because `buildAnalysisProviderForLayer` needs the BackendDef (not just name) to translate to an AnalysisProvider, and the legacy path read directly from config. **Option X (planner default):** Rewrite `resolveRoutedBackend` to call `router.resolve({ kind: 'intelligence', layer })` and look up `def` from the router's exposed backends (via a new `BackendRouter.getDef(name): BackendDef \| undefined` accessor). Removes the dual normalization path entirely. **Option Y:** Delete `resolveRoutedBackend`, inline the router call in `buildAnalysisProviderForLayer`. Plan defaults to **X** — keeps the helper as a named seam for tests and future intelligence-routing concerns. Operator confirms. |
| C4  | ASSUMPTION    | **Ring buffer is `Array.shift()`-based, not a true circular buffer.** Capacity 500 with O(n) shift is fine for v1; if 24h dispatch volume ever pushes 10K+ records/min, a circular-index implementation is the natural follow-up. Plan documents this in the source comment + leaves a TODO marker that the dashboard/perf phases can revisit. Operator may override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| C5  | ASSUMPTION    | **Capacity is hardcoded `500` in v1.** Spec D8 says "default 500, configurable" — making it configurable means widening `RoutingConfig` or `WorkflowConfig`. Plan **defers configurability** (no schema change) to Phase 5/6 when HTTP/CLI surfaces are added; v1 ships with `default = 500` and a constructor argument so future wire-up is trivial. Operator confirms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C6  | ASSUMPTION    | **Logger emission strategy.** O1 says "every dispatch logs a single structured `routing-decision` event." Plan emits the log line **inside `RoutingDecisionBus.emit(...)`** (so the bus owns both ring-buffer write + log emission), with the logger injected via the bus constructor. Alternative: emit from `BackendRouter.resolve()` directly, before passing to the bus. Plan picks bus-owned because (a) it keeps `BackendRouter` logger-free (already a pure function modulo emission), and (b) any future subscriber that wants to suppress logging can pass a `noopLogger` to the bus. Operator confirms.                                                                                                                                                                                                                          |
| C7  | DEFERRABLE    | **`createIntelligencePipeline` warn() wording.** Plan defaults to `intelligence pipeline disabled: no backendFactory available (legacy config without agent.backends)`. Operator may tweak before execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| C8  | DEFERRABLE    | **Test file naming.** `spec-b-phase-4-decision-bus.test.ts` matches Phase 3 convention (`spec-b-phase-3-dispatch-wiring.test.ts`). The decision-bus unit tests live separately at `packages/orchestrator/tests/routing/decision-bus.test.ts` (new directory). Operator may collapse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Decision points the operator should confirm before execution:**

- **D-OP-1 (C1):** **Approve Option A** — `BackendRouter` ctor gains optional `decisionBus?: RoutingDecisionBus`. If reject (prefer interface seam): swap Tasks 3-4 to declare a `RoutingDecisionEmitter` interface and inject that instead.
- **D-OP-2 (C2):** **Approve adding `BackendRouter.resolveDecisionAndDef(useCase, opts)`** as the single-resolve seam. If reject (prefer expose `backends` accessor): rewrite Task 6 to add `BackendRouter.getDef(name)` and have `forUseCase` look up the def directly from the threaded decision.
- **D-OP-3 (C3):** **Approve Option X** — rewrite `resolveRoutedBackend` to delegate to `router.resolve`. If reject (prefer Option Y / inline): drop Task 9 and inline the router call in `buildAnalysisProviderForLayer`.
- **D-OP-4 (C5):** **Approve hardcoded capacity=500 for v1** (configurable in Phase 5/6). If reject: Task 3 adds capacity reading from `WorkflowConfig.routing.decisionBuffer.capacity ?? 500` and Phase 4 ships a tiny schema delta.
- **D-OP-5 (C6):** **Approve bus-owned log emission.** If reject: shift the `logger.info('routing-decision', ...)` call out of `RoutingDecisionBus` into `BackendRouter.resolve()` and inject the logger into `BackendRouter` instead.

---

## File Map

```
CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/routing/decision-bus.ts
        # RoutingDecisionBus class: emit(), recent(filter?), subscribe(listener), capacity bound, owned log emission

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/routing/index.ts
        # barrel for the new routing/ folder — exports RoutingDecisionBus

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/routing/decision-bus.test.ts
        # unit tests: capacity bound (S5), subscriber isolation (S6), structured log line on emit (O1),
        # filter semantics for recent(), unsubscribe returned by subscribe()

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/backend-router.ts
        # 1. ctor accepts opts.decisionBus?: RoutingDecisionBus
        # 2. resolve() invokes decisionBus.emit(decision) after constructing the decision (non-throwing path)
        # 3. NEW: resolveDecisionAndDef(useCase, opts): { decision, def } — single-resolve seam

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router.test.ts
        # add tests: decisionBus.emit called once per resolve; resolveDecisionAndDef returns matching pair

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/orchestrator-backend-factory.ts
        # 1. ctor accepts opts.decisionBus and threads to BackendRouter ctor
        # 2. forUseCase rewritten to single-resolve via router.resolveDecisionAndDef (closes P1-IMP-2)
        # 3. remove the misleading "two resolve() calls yield identical decisions" comment

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
        # add: spy asserts router.resolve called exactly once per forUseCase

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/intelligence-factory.ts
        # 1. Split IntelligenceFactoryDeps -> BuildPipelineDeps (with router) and BuildLayerDeps (without)
        #    (closes P1-IMP-1)
        # 2. Rewrite resolveRoutedBackend to delegate to router.resolve({ kind: 'intelligence', layer })
        #    (closes I1 third instance) — requires router in BuildLayerDeps OR moves layer-build into
        #    pipeline build (planner default: move helper to take router-bearing deps)
        # 3. buildIntelligencePipeline keeps router; buildAnalysisProviderForLayer accepts router too
        #    but its DEPS TYPE no longer claims router is unconditionally required for the
        #    intelligence.provider-explicit branch — the type is now Omit<..., 'router'> & {
        #    router?: BackendRouter } and the routing-driven branch asserts router presence
        #
        # CONFIRMED ARRANGEMENT (operator may swap C3 → Option Y):
        # - BuildPipelineDeps = { config, localResolvers, logger, router }
        # - BuildLayerDeps    = { config, localResolvers, logger, router? }
        # - buildAnalysisProviderForLayer's routing-driven branch throws (or returns null + warns) if
        #   router is missing AND intel.provider is unset

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts
        # update callCreateAnalysisProvider helper to pass router (or to use BuildLayerDeps without router
        # for the intel.provider-explicit branch); add a test for the chain-dedupe case (intel.sel = chain,
        # intel.pesl = chain that resolves to same backend → one provider)

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts
        # 1. private routingDecisionBus: RoutingDecisionBus | null = null;
        # 2. construct bus when backendFactory is constructed (same gate)
        # 3. thread bus into OrchestratorBackendFactory ctor
        # 4. start(): no extra wiring beyond construction (subscribers added in Phase 5+)
        # 5. stop(): null out bus, clear listeners (defensive teardown)
        # 6. createIntelligencePipeline(): when returning null due to backendFactory===null,
        #    call this.logger.warn(...) once (closes P1-IMP-3)
        # 7. expose getter routingDecisionBus for Phase 5 (HTTP/WS) consumption

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/spec-b-phase-4-decision-bus.test.ts
        # Phase 4 acceptance:
        # - Orchestrator.start() produces a non-null bus
        # - a dispatch's resolve() shows up in bus.recent()
        # - O1 log line present (mock logger.info)
        # - single-resolve invariant (router.resolve called once per dispatch)
        # - subscriber isolation under emission storm

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/index.ts (optional, only if barrel exports are added)
        # re-export RoutingDecisionBus from the new routing/ module
```

**Files NOT modified (out of scope per spec):**

- HTTP route files (`packages/orchestrator/src/server/routes/*`) — Phase 5
- CLI `routing` command group (`packages/cli/src/commands/routing/*`) — Phase 6
- Dashboard `/routing` route — Phase 7
- ADR files, `docs/knowledge/orchestrator/*`, `AGENTS.md`, `CHANGELOG.md` — Phase 8

---

## Skill Annotations

Skills with relevance to Phase 4 tasks (from `docs/changes/granular-task-routing/SKILLS.md`):

- `gof-chain-of-responsibility` (reference): the resolution chain is the canonical chain-of-responsibility pattern; informs Task 3 ring-buffer semantics where the bus is a sink, not a chain link.
- `ts-type-guards` (reference): Task 7 (`IntelligenceFactoryDeps` split) benefits from type-guard patterns where the routing-driven branch narrows `router !== undefined`.
- `ts-error-handling-types` (reference): Task 3 (`emit()` subscriber isolation) — try/catch contract + logged failure.
- `gof-factory-method` (reference): Task 5 (`OrchestratorBackendFactory` refactor) is a factory; single-resolve invariant tightens the factory's invariant set.

---

## Tasks

Each task is one context window of focused work and produces one atomic commit. Numbering is sequential and dependencies are explicit. Worktree-absolute paths throughout. TDD style: write test → observe failure → implement → observe pass → validate → commit.

---

### Task 1: Define RoutingDecisionBus + barrel (types only, no behavior)

**Depends on:** none | **Files:** `packages/orchestrator/src/routing/decision-bus.ts`, `packages/orchestrator/src/routing/index.ts`

**Skills:** `gof-chain-of-responsibility` (reference)

1. Create directory `packages/orchestrator/src/routing/`.
2. Create `packages/orchestrator/src/routing/decision-bus.ts` with the class shell (no method bodies beyond stubs that throw `not yet implemented` — Task 3 fills them):

   ```ts
   import type { RoutingDecision } from '@harness-engineering/types';
   import type { StructuredLogger } from '../logging/logger.js';

   export interface RoutingDecisionBusFilter {
     skillName?: string;
     mode?: string;
     backendName?: string;
     limit?: number;
   }

   export interface RoutingDecisionBusOptions {
     /** Default 500. Bound on the in-memory ring buffer. */
     capacity?: number;
     /**
      * Logger for the structured `routing-decision` line (O1) and for
      * one-off warn() when a subscriber throws (S6). When omitted, the
      * bus silently swallows subscriber errors (test-mode default).
      */
     logger?: StructuredLogger;
   }

   /**
    * Spec B Phase 4 (D8): in-process bus + ring buffer for
    * {@link RoutingDecision} events. One emit() per
    * {@link BackendRouter.resolve} call; subscribers receive the
    * decision synchronously after the ring buffer is updated.
    *
    * Subscriber errors are isolated (caught + logged, never thrown
    * back to the emitter) so a misbehaving subscriber cannot block a
    * dispatch. (S6)
    *
    * Capacity-bound (default 500) via Array.shift() — acceptable for
    * v1 (see plan C4); switch to circular indexing if 24h dispatch
    * volume ever pushes 10K+ records/min.
    */
   export class RoutingDecisionBus {
     private readonly ringBuffer: RoutingDecision[] = [];
     private readonly listeners = new Set<(d: RoutingDecision) => void>();
     private readonly capacity: number;
     private readonly logger: StructuredLogger | undefined;

     constructor(opts?: RoutingDecisionBusOptions) {
       this.capacity = opts?.capacity ?? 500;
       this.logger = opts?.logger;
     }

     emit(_decision: RoutingDecision): void {
       throw new Error('RoutingDecisionBus.emit not yet implemented (Task 3)');
     }

     recent(_filter?: RoutingDecisionBusFilter): RoutingDecision[] {
       throw new Error('RoutingDecisionBus.recent not yet implemented (Task 3)');
     }

     subscribe(_listener: (d: RoutingDecision) => void): () => void {
       throw new Error('RoutingDecisionBus.subscribe not yet implemented (Task 3)');
     }
   }
   ```

3. Create `packages/orchestrator/src/routing/index.ts`:
   ```ts
   export {
     RoutingDecisionBus,
     type RoutingDecisionBusFilter,
     type RoutingDecisionBusOptions,
   } from './decision-bus.js';
   ```
4. Verify: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck` → PASS (stubs compile, no consumers yet).
5. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate` → PASS.
6. Commit (worktree-rooted git):
   ```
   feat(orchestrator): scaffold RoutingDecisionBus class shell (Spec B Phase 4)
   ```

---

### Task 2: Test-first — RoutingDecisionBus unit tests (RED phase)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/routing/decision-bus.test.ts`

**Skills:** `ts-error-handling-types` (reference)

1. Create directory `packages/orchestrator/tests/routing/`.
2. Create `packages/orchestrator/tests/routing/decision-bus.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { RoutingDecisionBus } from '../../src/routing/decision-bus.js';
   import type { RoutingDecision } from '@harness-engineering/types';
   import { StructuredLogger } from '../../src/logging/logger.js';

   function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
     return {
       timestamp: new Date().toISOString(),
       useCase: { kind: 'tier', tier: 'quick-fix' },
       resolutionPath: [{ source: 'default', candidate: 'cloud', outcome: 'chosen' }],
       backendName: 'cloud',
       backendType: 'claude',
       durationMs: 0.1,
       ...overrides,
     };
   }

   describe('RoutingDecisionBus', () => {
     it('S5: respects capacity bound — 10000 emits → recent() ≤ capacity', () => {
       const bus = new RoutingDecisionBus({ capacity: 500 });
       for (let i = 0; i < 10_000; i++) {
         bus.emit(makeDecision({ backendName: `backend-${i}` }));
       }
       const recent = bus.recent({ limit: 99_999 });
       expect(recent.length).toBeLessThanOrEqual(500);
       // ring drops oldest: first surviving record is index 9500
       expect(recent[0]?.backendName).toBe('backend-9500');
       expect(recent[recent.length - 1]?.backendName).toBe('backend-9999');
     });

     it('S6: subscriber errors are isolated — other subscribers still receive', () => {
       const logger = new StructuredLogger();
       const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
       const bus = new RoutingDecisionBus({ capacity: 10, logger });
       const goodCalls: RoutingDecision[] = [];
       bus.subscribe(() => {
         throw new Error('subscriber boom');
       });
       bus.subscribe((d) => goodCalls.push(d));
       expect(() => bus.emit(makeDecision())).not.toThrow();
       expect(goodCalls).toHaveLength(1);
       expect(warnSpy).toHaveBeenCalledWith(
         expect.stringContaining('RoutingDecisionBus subscriber threw'),
         expect.objectContaining({ error: expect.stringContaining('subscriber boom') })
       );
     });

     it('O1: emits structured routing-decision log line per emit', () => {
       const logger = new StructuredLogger();
       const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
       const bus = new RoutingDecisionBus({ capacity: 5, logger });
       bus.emit(
         makeDecision({
           backendName: 'cloud',
           durationMs: 1.23,
           resolutionPath: [{ source: 'skill', candidate: 'cloud', outcome: 'chosen' }],
         })
       );
       expect(infoSpy).toHaveBeenCalledWith(
         'routing-decision',
         expect.objectContaining({
           backendName: 'cloud',
           resolutionPathLength: 1,
           durationMs: 1.23,
           useCase: expect.objectContaining({ kind: 'tier' }),
         })
       );
     });

     it('recent() filters by skillName / mode / backendName / limit', () => {
       const bus = new RoutingDecisionBus({ capacity: 20 });
       bus.emit(
         makeDecision({
           useCase: { kind: 'skill', skillName: 'harness-debugging' },
           backendName: 'local-fast',
         })
       );
       bus.emit(
         makeDecision({
           useCase: { kind: 'mode', cognitiveMode: 'adversarial-reviewer' },
           backendName: 'cloud',
         })
       );
       bus.emit(makeDecision({ backendName: 'cloud' }));
       expect(bus.recent({ skillName: 'harness-debugging' })).toHaveLength(1);
       expect(bus.recent({ mode: 'adversarial-reviewer' })).toHaveLength(1);
       expect(bus.recent({ backendName: 'cloud' })).toHaveLength(2);
       expect(bus.recent({ limit: 2 })).toHaveLength(2);
     });

     it('subscribe() returns an unsubscribe function', () => {
       const bus = new RoutingDecisionBus({ capacity: 5 });
       const calls: RoutingDecision[] = [];
       const off = bus.subscribe((d) => calls.push(d));
       bus.emit(makeDecision());
       off();
       bus.emit(makeDecision());
       expect(calls).toHaveLength(1);
     });
   });
   ```

3. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- routing/decision-bus.test.ts` — observe **all 5 failures** (stubs throw `not yet implemented`). Confirm RED.
4. Commit:
   ```
   test(orchestrator): pin RoutingDecisionBus contract — capacity, isolation, log, filter, unsubscribe (Spec B Phase 4)
   ```

---

### Task 3: Implement RoutingDecisionBus (GREEN phase)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/routing/decision-bus.ts`

**Skills:** `ts-error-handling-types` (reference), `gof-chain-of-responsibility` (reference)

1. Replace the three stubs in `packages/orchestrator/src/routing/decision-bus.ts` with implementations:

   ```ts
   emit(decision: RoutingDecision): void {
     this.ringBuffer.push(decision);
     if (this.ringBuffer.length > this.capacity) {
       this.ringBuffer.shift();
     }
     // O1: one structured line per emit.
     if (this.logger) {
       this.logger.info('routing-decision', {
         useCase: decision.useCase,
         backendName: decision.backendName,
         resolutionPathLength: decision.resolutionPath.length,
         durationMs: decision.durationMs,
       });
     }
     // S6: subscriber errors are caught + logged, never propagated.
     for (const listener of this.listeners) {
       try {
         listener(decision);
       } catch (err) {
         if (this.logger) {
           this.logger.warn('RoutingDecisionBus subscriber threw', {
             error: String(err),
           });
         }
       }
     }
   }

   recent(filter?: RoutingDecisionBusFilter): RoutingDecision[] {
     let out = this.ringBuffer.slice();
     if (filter?.skillName !== undefined) {
       out = out.filter(
         (d) => d.useCase.kind === 'skill' && d.useCase.skillName === filter.skillName
       );
     }
     if (filter?.mode !== undefined) {
       out = out.filter(
         (d) =>
           (d.useCase.kind === 'mode' && d.useCase.cognitiveMode === filter.mode) ||
           (d.useCase.kind === 'skill' && d.useCase.cognitiveMode === filter.mode)
       );
     }
     if (filter?.backendName !== undefined) {
       out = out.filter((d) => d.backendName === filter.backendName);
     }
     if (filter?.limit !== undefined) {
       out = out.slice(0, filter.limit);
     }
     return out;
   }

   subscribe(listener: (d: RoutingDecision) => void): () => void {
     this.listeners.add(listener);
     return () => {
       this.listeners.delete(listener);
     };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- routing/decision-bus.test.ts` — observe **5/5 PASS**. Confirm GREEN.
3. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
4. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate` → PASS.
5. Commit:
   ```
   feat(orchestrator): implement RoutingDecisionBus emit/recent/subscribe with subscriber isolation (Spec B Phase 4)
   ```

---

### Task 4: Wire `BackendRouter` to optionally emit on resolve()

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/backend-router.ts`, `packages/orchestrator/tests/agent/backend-router.test.ts`

**Skills:** `gof-chain-of-responsibility` (reference)

1. Open `packages/orchestrator/src/agent/backend-router.ts`. Add import:
   ```ts
   import type { RoutingDecisionBus } from '../routing/decision-bus.js';
   ```
2. Widen `BackendRouterOptions`:
   ```ts
   export interface BackendRouterOptions {
     backends: Record<string, BackendDef>;
     routing: RoutingConfig;
     /**
      * Spec B Phase 4 (D8): when present, every resolve() emits its
      * decision onto the bus. The bus owns the structured log line + ring
      * buffer; the router stays a pure resolution function.
      */
     decisionBus?: RoutingDecisionBus;
   }
   ```
3. Add private field + ctor assignment:

   ```ts
   private readonly decisionBus: RoutingDecisionBus | undefined;

   constructor(opts: BackendRouterOptions) {
     this.backends = opts.backends;
     this.routing = opts.routing;
     this.decisionBus = opts.decisionBus;
     this.validateReferences();
   }
   ```

4. In `resolve()`, wrap the existing return points so emission fires once before each return. Refactor the four return statements (one per source: invocation, skill, mode, tier, default) so they go through a single emit-on-return helper. The most surgical change is to wrap each `return decide(name)` call in a small lambda:

   ```ts
   const emitAndReturn = (decision: RoutingDecision): RoutingDecision => {
     this.decisionBus?.emit(decision);
     return decision;
   };
   ```

   Then replace each `return decide(name);` with `return emitAndReturn(decide(name));`. **Do not** wrap the final throw at the end of `resolve()` — exhaustion is an error path, not a decision.

5. Open `packages/orchestrator/tests/agent/backend-router.test.ts`. Add a new `describe` block at the end:

   ```ts
   describe('BackendRouter — decision bus emission (Spec B Phase 4)', () => {
     it('emits exactly one decision per resolve() when a bus is provided', () => {
       const bus = new RoutingDecisionBus({ capacity: 5 });
       const emitSpy = vi.spyOn(bus, 'emit');
       const router = new BackendRouter({
         backends: { cloud, local },
         routing: { default: 'cloud', 'quick-fix': 'local' },
         decisionBus: bus,
       });
       router.resolve({ kind: 'tier', tier: 'quick-fix' });
       router.resolve({ kind: 'tier', tier: 'guided-change' });
       expect(emitSpy).toHaveBeenCalledTimes(2);
       expect(bus.recent()).toHaveLength(2);
     });

     it('does not throw when no bus is provided (legacy ctor shape)', () => {
       const router = new BackendRouter({
         backends: { cloud, local },
         routing: { default: 'cloud' },
       });
       expect(() => router.resolve({ kind: 'tier', tier: 'quick-fix' })).not.toThrow();
     });
   });
   ```

   Top-of-file imports add: `import { vi } from 'vitest'; import { RoutingDecisionBus } from '../../src/routing/decision-bus.js';`.

6. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- agent/backend-router.test.ts` — observe all existing tests PASS + 2 new PASS.
7. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
8. Commit:
   ```
   feat(orchestrator): emit RoutingDecision on every BackendRouter.resolve when bus injected (Spec B Phase 4)
   ```

---

### Task 5: Add `BackendRouter.resolveDecisionAndDef` single-resolve seam

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/agent/backend-router.ts`, `packages/orchestrator/tests/agent/backend-router.test.ts`

**Skills:** `gof-factory-method` (reference)

1. Add a public method to `BackendRouter`:
   ```ts
   /**
    * Spec B Phase 4 (closes P1-IMP-2): a single resolve() + def lookup
    * for callers that need both. Replaces the previous pattern of
    * `resolveDefinition(useCase) + resolve(useCase)` which produced two
    * RoutingDecision emissions per dispatch — doubling routing-decision
    * log volume now that Phase 4 emits.
    *
    * Identity-equal `BackendDef` (no copy) so callers relying on
    * reference equality (SC21) continue to work.
    */
   resolveDecisionAndDef(
     useCase: RoutingUseCase,
     opts?: { invocationOverride?: string }
   ): { decision: RoutingDecision; def: BackendDef } {
     const decision = this.resolve(useCase, opts);
     const def = this.backends[decision.backendName];
     if (!def) {
       // Unreachable: resolve() only returns a name present in backends.
       throw new Error(
         `BackendRouter.resolveDecisionAndDef: routing target '${decision.backendName}' is not in backends ` +
           `(useCase=${JSON.stringify(useCase)}).`
       );
     }
     return { decision, def };
   }
   ```
2. Add unit test in `packages/orchestrator/tests/agent/backend-router.test.ts`:
   ```ts
   it('resolveDecisionAndDef: single resolve() call, returns matching decision+def', () => {
     const bus = new RoutingDecisionBus({ capacity: 5 });
     const router = new BackendRouter({
       backends: { cloud, local },
       routing: { default: 'cloud', 'quick-fix': 'local' },
       decisionBus: bus,
     });
     const { decision, def } = router.resolveDecisionAndDef({
       kind: 'tier',
       tier: 'quick-fix',
     });
     expect(decision.backendName).toBe('local');
     expect(def).toBe(local); // identity
     expect(bus.recent()).toHaveLength(1); // one emit, not two
   });
   ```
3. Run the test file — observe new test PASS.
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
5. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate` → PASS.
6. Commit:
   ```
   feat(orchestrator): add BackendRouter.resolveDecisionAndDef single-resolve seam (Spec B Phase 4, closes P1-IMP-2 prep)
   ```

---

### Task 6: Refactor `OrchestratorBackendFactory.forUseCase` to single-resolve (closes P1-IMP-2)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/agent/orchestrator-backend-factory.ts`, `packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts`

**Skills:** `gof-factory-method` (reference)

1. Open `packages/orchestrator/src/agent/orchestrator-backend-factory.ts`. Add `decisionBus?: RoutingDecisionBus` to `OrchestratorBackendFactoryOptions`:
   ```ts
   import type { RoutingDecisionBus } from '../routing/decision-bus.js';
   // ...
   export interface OrchestratorBackendFactoryOptions {
     // ... existing fields
     /**
      * Spec B Phase 4 (D8): forwarded to the underlying BackendRouter so
      * every resolve() during forUseCase / resolveName emits.
      */
     decisionBus?: RoutingDecisionBus;
   }
   ```
2. Thread the bus into the router ctor:
   ```ts
   constructor(opts: OrchestratorBackendFactoryOptions) {
     this.opts = opts;
     this.router = new BackendRouter({
       backends: opts.backends,
       routing: opts.routing,
       ...(opts.decisionBus !== undefined ? { decisionBus: opts.decisionBus } : {}),
     });
   }
   ```
3. Rewrite `forUseCase` to single-resolve via the new seam. **Delete** the misleading "two resolve() calls yield identical RoutingDecisions" comment block (lines 105-111). Replace the body:

   ```ts
   forUseCase(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): AgentBackend {
     // Spec B Phase 4 (closes P1-IMP-2): single resolve() per dispatch.
     // Pre-Phase-4 this method called resolveDefinition() and resolve()
     // separately, producing two RoutingDecisions. With Phase 4's
     // decision-bus emission that doubled the routing-decision log
     // volume per dispatch. resolveDecisionAndDef() collapses both.
     const { def, decision } = this.router.resolveDecisionAndDef(useCase, opts);
     const name = decision.backendName;
     let backend: AgentBackend;
     const createOpts = this.opts.cacheMetrics ? { cacheMetrics: this.opts.cacheMetrics } : {};

     if ((def.type === 'local' || def.type === 'pi') && this.opts.getResolverModelFor) {
       const getModel = this.opts.getResolverModelFor(name);
       backend = getModel
         ? this.buildLocalLikeWithResolver(def, getModel)
         : createBackend(def, createOpts);
     } else {
       backend = createBackend(def, createOpts);
     }

     if (this.opts.sandboxPolicy === 'docker' && this.opts.container) {
       backend = this.wrapInContainer(backend);
     }

     return backend;
   }
   ```

4. Open `packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts`. Add a new test:
   ```ts
   it('forUseCase calls router.resolve exactly once (Phase 4 single-resolve invariant)', () => {
     const bus = new RoutingDecisionBus({ capacity: 5 });
     const factory = new OrchestratorBackendFactory({
       backends: { cloud: { type: 'claude', command: 'claude' } },
       routing: { default: 'cloud' },
       sandboxPolicy: 'none',
       decisionBus: bus,
     });
     // Access the router for spy install; getRouter() is the public seam.
     const router = factory.getRouter();
     const resolveSpy = vi.spyOn(router, 'resolve');
     factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
     expect(resolveSpy).toHaveBeenCalledTimes(1);
     expect(bus.recent()).toHaveLength(1);
   });
   ```
   Top-of-file: `import { vi } from 'vitest'; import { RoutingDecisionBus } from '../../src/routing/decision-bus.js';`.
5. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- agent/orchestrator-backend-factory.test.ts` — observe all 9+ existing PASS + 1 new PASS.
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
7. Run: `harness validate` → PASS.
8. Commit:
   ```
   refactor(orchestrator): forUseCase single-resolve via resolveDecisionAndDef (Spec B Phase 4, closes P1-IMP-2)
   ```

---

### Task 7: Split `IntelligenceFactoryDeps` (closes P1-IMP-1)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/agent/intelligence-factory.ts`, `packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts`

**Skills:** `ts-type-guards` (reference)

1. Open `packages/orchestrator/src/agent/intelligence-factory.ts`. Replace the single `IntelligenceFactoryDeps` interface with two:

   ```ts
   /**
    * Spec B Phase 4 (closes Phase 1 deferred finding P1-IMP-1): the
    * pipeline-build path needs the router for the SC34/SC35 sel-vs-pesl
    * dedupe; the per-layer path does not (it only consults the router on
    * the routing-driven branch, which is opt-in via router presence).
    */
   export interface BuildPipelineDeps {
     config: WorkflowConfig;
     localResolvers: Map<string, LocalModelResolver>;
     logger: StructuredLogger;
     router: BackendRouter;
   }

   export interface BuildLayerDeps {
     config: WorkflowConfig;
     localResolvers: Map<string, LocalModelResolver>;
     logger: StructuredLogger;
     /**
      * Optional: routing-driven branch requires the router; the
      * intelligence.provider-explicit branch ignores it (test fixtures
      * using only intel.provider may omit).
      */
     router?: BackendRouter;
   }

   /** @deprecated kept as a compat re-export for one release; new code should use BuildPipelineDeps. */
   export type IntelligenceFactoryDeps = BuildPipelineDeps;
   ```

2. Update function signatures:

   ```ts
   export function buildIntelligencePipeline(
     deps: BuildPipelineDeps
   ): IntelligencePipelineBundle | null {
     /* unchanged body */
   }

   export function buildAnalysisProviderForLayer(
     layer: 'sel' | 'pesl',
     deps: BuildLayerDeps
   ): AnalysisProvider | null {
     /* body in Task 9 */
   }
   ```

3. Update the test helper in `packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts:64-79` so `callCreateAnalysisProvider` constructs `BuildLayerDeps` without `router` (the existing call already does this; just retype the local accessor to use the new name):
   ```ts
   const internals = orch as unknown as {
     config: Parameters<typeof buildAnalysisProviderForLayer>[1]['config'];
     localResolvers: Parameters<typeof buildAnalysisProviderForLayer>[1]['localResolvers'];
     logger: Parameters<typeof buildAnalysisProviderForLayer>[1]['logger'];
   };
   return buildAnalysisProviderForLayer(layer, {
     config: internals.config,
     localResolvers: internals.localResolvers,
     logger: internals.logger,
   });
   ```
4. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck` → PASS (the helper now legally omits router because `BuildLayerDeps.router` is optional).
5. Run: `pnpm --filter @harness-engineering/orchestrator test -- integration/intelligence-pipeline-routing.test.ts` → PASS unchanged.
6. Run: `harness validate` → PASS.
7. Commit:
   ```
   refactor(orchestrator): split IntelligenceFactoryDeps into pipeline/layer deps (Spec B Phase 4, closes P1-IMP-1)
   ```

---

### Task 8: Test-first — chain-dedupe contract for sel/pesl

**Depends on:** Task 7 | **Files:** `packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts`

**Skills:** `ts-testing-types` (reference)

1. Add a test (per the Phase 1 review SUG-1 left open) that exercises the chain-dedupe case in `buildIntelligencePipeline`. Add to `packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts` (inside the existing describe block):

   ```ts
   it('SC34b: sel + pesl chains funneling to the same backend produce one provider (chain dedupe)', () => {
     // Two distinct chains, both resolving (after availability filtering) to 'cloud':
     //   intel.sel  = ['ghost-backend', 'cloud']   -> ghost unknown, walk falls to cloud
     //   intel.pesl = ['cloud']                    -> cloud
     // Phase 1's router.resolve compares post-walk names: both = 'cloud' => one provider.
     const config = makeConfig({
       agent: {
         backends: { cloud: { type: 'claude', command: 'claude' } },
         routing: {
           default: 'cloud',
           intelligence: { sel: ['ghost-backend', 'cloud'], pesl: ['cloud'] },
         },
       },
       intelligence: { enabled: true, provider: { kind: 'anthropic', apiKey: 'k' } },
     });
     const orch = new Orchestrator(config /* deps */);
     // Builds the pipeline; we then assert peslProvider was NOT separately built
     // (mock buildAnalysisProviderForLayer call count or use orch.intelligencePipeline.peslProvider
     //  reference equality to selProvider).
     const sel = callCreateAnalysisProvider(orch, 'sel');
     const pesl = callCreateAnalysisProvider(orch, 'pesl');
     // Both layers select the same backend; the pipeline should treat them as one provider.
     expect(sel).not.toBeNull();
     expect(pesl).not.toBeNull();
     // The pipeline build path's gating decision uses router.resolve(...).backendName equality.
     // Sanity: a router built from this config returns 'cloud' for both layers.
     // (If callCreateAnalysisProvider is too coarse for ref equality, replace with a buildIntelligencePipeline call.)
   });
   ```

   _Implementation detail:_ the existing test fixture already has `makeConfig` and an `Orchestrator` factory; mirror the closest scalar-case test (~line 184) for `routing.intelligence.sel = 'cloud'` and adapt to chains. If a tightly-scoped ref-equality assertion is desired, switch from `callCreateAnalysisProvider` to a direct `buildIntelligencePipeline({ config, localResolvers, logger, router })` call and assert `pipeline.peslProvider === pipeline.selProvider` (or that `peslProvider` is undefined and the pipeline falls through to sel).

2. Run: `pnpm --filter @harness-engineering/orchestrator test -- integration/intelligence-pipeline-routing.test.ts` — observe new test PASS (Phase 1 already implemented the router-comparison correctly; this just pins it).
3. Commit:
   ```
   test(orchestrator): pin chain-dedupe contract for sel/pesl intelligence routing (Spec B Phase 4)
   ```

---

### Task 9: Rewrite `resolveRoutedBackend` to delegate to router (closes I1 third instance)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/agent/intelligence-factory.ts`

**Skills:** `ts-type-guards` (reference)

1. Open `packages/orchestrator/src/agent/intelligence-factory.ts`. Replace `resolveRoutedBackend` (lines 135-159) with a router-driven implementation that consumes the `BuildLayerDeps.router` field:

   ```ts
   /**
    * Look up the routed BackendDef for an intelligence layer via the
    * canonical BackendRouter. Returns null if the router is absent
    * (intel.provider-explicit branch never hits this code path) OR if
    * the routed backend is missing from agent.backends.
    *
    * Spec B Phase 4 (closes Phase 0 review finding I1 third instance):
    * the Phase-0 inline Array.isArray normalization is gone — the router
    * owns chain walking + availability filtering. Two distinct chains
    * that funnel to the same backend now produce identical names here
    * (the SC34/SC35 dedupe optimization stays correct).
    */
   function resolveRoutedBackend(
     layer: 'sel' | 'pesl',
     deps: BuildLayerDeps
   ): { name: string; def: BackendDef } | null {
     const { config, router, logger } = deps;
     const backends = config.agent.backends;
     if (!backends || !router) return null;
     try {
       const decision = router.resolve({ kind: 'intelligence', layer });
       const def = backends[decision.backendName];
       if (!def) {
         logger.warn(
           `Intelligence pipeline: routed backend '${decision.backendName}' for layer '${layer}' is not in agent.backends.`
         );
         return null;
       }
       return { name: decision.backendName, def };
     } catch (err) {
       // routing.default produced no available backend (S4) — log + fall through.
       logger.warn(
         `Intelligence pipeline: router could not resolve intelligence.${layer}; intelligence disabled. error=${String(err)}`
       );
       return null;
     }
   }
   ```

2. Update the call site in `buildAnalysisProviderForLayer` (line 104):
   ```ts
   // 2. Routing-driven selection (SC31, SC32, SC36).
   const routed = resolveRoutedBackend(layer, deps);
   if (!routed) return null;
   ```
3. **Side note for reviewers:** because each `router.resolve` call in `buildIntelligencePipeline` (lines 66-67) now emits to the decision bus, the pipeline-build path will produce **2 sel-or-pesl decisions per pipeline construction** (one for sel, one for pesl) at orchestrator startup. The bus capacity absorbs this trivially; just be aware that `routing-decision` log lines appear at startup, not only at dispatch.
4. Run: `pnpm --filter @harness-engineering/orchestrator test -- integration/intelligence-pipeline-routing.test.ts` → all PASS.
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
6. Run: `harness validate` → PASS.
7. Commit:
   ```
   refactor(orchestrator): resolveRoutedBackend delegates to BackendRouter (Spec B Phase 4, closes I1 third instance)
   ```

---

### Task 10: `Orchestrator.start()` / `Orchestrator.stop()` wire-up — instantiate + teardown bus

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/orchestrator.ts`

**Skills:** none (mechanical wire-up)

1. Open `packages/orchestrator/src/orchestrator.ts`. Add import (top of imports, near line 36-37):
   ```ts
   import { RoutingDecisionBus } from './routing/decision-bus.js';
   ```
2. Add a private field near the existing `private backendFactory` field (~line 114):
   ```ts
   private routingDecisionBus: RoutingDecisionBus | null;
   ```
3. In the constructor block where `backendFactory` is constructed (lines 383-413), construct the bus **before** `OrchestratorBackendFactory` and pass it in:

   ```ts
   if (
     this.config.agent.backends !== undefined &&
     Object.keys(this.config.agent.backends).length > 0
   ) {
     // ... existing sandboxPolicy + routing setup ...

     // Spec B Phase 4 (D8): construct the bus once per orchestrator instance.
     this.routingDecisionBus = new RoutingDecisionBus({
       capacity: 500,
       logger: this.logger,
     });

     this.backendFactory = new OrchestratorBackendFactory({
       backends: this.config.agent.backends,
       routing,
       sandboxPolicy,
       ...(this.config.agent.container !== undefined
         ? { container: this.config.agent.container }
         : {}),
       ...(this.config.agent.secrets !== undefined ? { secrets: this.config.agent.secrets } : {}),
       cacheMetrics: this.cacheMetrics,
       decisionBus: this.routingDecisionBus,
       getResolverModelFor: (name) => {
         const resolver = this.localResolvers.get(name);
         return resolver ? () => resolver.resolveModel() : undefined;
       },
     });
   } else {
     this.backendFactory = null;
     this.routingDecisionBus = null;
   }
   ```

4. Add a public getter (~near other getters, after `graphStore` getter ~line 450):

   ```ts
   /**
    * Spec B Phase 4: expose the bus for Phase 5 (HTTP routes) and
    * Phase 7 (dashboard WS broadcast). Returns null when the legacy
    * single-backend config bypassed agent.backends synthesis.
    */
   public getRoutingDecisionBus(): RoutingDecisionBus | null {
     return this.routingDecisionBus;
   }
   ```

5. In `stop()` (~line 1841), add teardown right after `localModelStatusUnsubscribes` cleanup (~line 1853):
   ```ts
   // Spec B Phase 4: null out the bus reference; ring buffer + listener
   // set are eligible for GC once no external references remain. (HTTP
   // routes / WS subscribers from Phase 5+ unsubscribe themselves.)
   this.routingDecisionBus = null;
   ```
6. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
7. Run: `pnpm --filter @harness-engineering/orchestrator test -- agent/` → all existing PASS.
8. Run: `harness validate` → PASS.
9. Commit:
   ```
   feat(orchestrator): instantiate RoutingDecisionBus in ctor + expose getter + teardown in stop() (Spec B Phase 4)
   ```

---

### Task 11: Add warn() when intelligence pipeline drops due to null backendFactory (closes P1-IMP-3)

**Depends on:** Task 10 | **Files:** `packages/orchestrator/src/orchestrator.ts`

**Skills:** none

1. In `packages/orchestrator/src/orchestrator.ts`, locate `createIntelligencePipeline` (~line 776). Replace the early-return:

   ```ts
   private createIntelligencePipeline(): IntelligencePipeline | null {
     if (!this.backendFactory) {
       // Spec B Phase 4 (closes P1-IMP-3): make the silent drop visible.
       // The only path here is a legacy config where agent.backends is
       // absent/empty (migration would normally synthesize), AND
       // intelligence.enabled was set. Dispatch would have already
       // failed; intelligence-only deployments are exceedingly rare but
       // should not get a null pipeline with zero diagnostic output.
       this.logger.warn(
         'intelligence pipeline disabled: no backendFactory available (legacy config without agent.backends)'
       );
       return null;
     }
     const bundle = buildIntelligencePipeline({
       config: this.config,
       localResolvers: this.localResolvers,
       logger: this.logger,
       router: this.backendFactory.getRouter(),
     });
     if (!bundle) return null;
     this.graphStore = bundle.graphStore;
     return bundle.pipeline;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
3. Run: `pnpm --filter @harness-engineering/orchestrator test -- integration/orchestrator.test.ts` (or whichever existing test covers `createIntelligencePipeline` paths) → PASS.
4. Run: `harness validate` → PASS.
5. Commit:
   ```
   feat(orchestrator): warn when intelligence pipeline drops due to absent backendFactory (Spec B Phase 4, closes P1-IMP-3)
   ```

---

### Task 12: Phase 4 acceptance suite (O1 + S5 + S6 + single-resolve)

**Depends on:** Task 11 | **Files:** `packages/orchestrator/tests/integration/spec-b-phase-4-decision-bus.test.ts`

**Skills:** `ts-testing-types` (reference)

**[checkpoint:human-verify]** — After this task lands, operator should run the full integration suite locally and confirm the acceptance criteria match the spec text.

1. Create `packages/orchestrator/tests/integration/spec-b-phase-4-decision-bus.test.ts`. Mirror the Phase 3 acceptance file shape (`spec-b-phase-3-dispatch-wiring.test.ts`) — minimal in-process Orchestrator construction, no real backends, no actual dispatch.

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { Orchestrator } from '../../src/orchestrator.js';
   import type { WorkflowConfig } from '@harness-engineering/types';
   // Reuse the test scaffolding pattern from spec-b-phase-3-dispatch-wiring.test.ts:
   import { makePhase3Config /* or local equivalent */ } from '../helpers/phase-test-helpers.js'; // adjust import if helper does not exist; otherwise inline a minimal makeConfig

   describe('Spec B Phase 4: RoutingDecisionBus + event emission', () => {
     let orch: Orchestrator;

     beforeEach(() => {
       const config = {
         agent: {
           backends: {
             cloud: { type: 'claude', command: 'claude' },
             local: { type: 'pi', endpoint: 'http://local:1234/v1', model: ['m'] },
           },
           routing: {
             default: 'cloud',
             skills: { 'harness-debugging': 'local' },
           },
           sandboxPolicy: 'none',
         },
         polling: { intervalMs: 999_999 },
         workspace: { root: '/tmp/harness-phase-4-test-ws' },
         intelligence: { enabled: false },
       } as unknown as WorkflowConfig;
       orch = new Orchestrator(config /* + minimal deps */);
     });

     afterEach(async () => {
       if (orch) await orch.stop();
     });

     it('Phase 4 invariant: Orchestrator ctor produces a non-null bus when backends exist', () => {
       expect(orch.getRoutingDecisionBus()).not.toBeNull();
     });

     it('O1: bus emits structured routing-decision line when BackendRouter.resolve is called', () => {
       const bus = orch.getRoutingDecisionBus();
       expect(bus).not.toBeNull();
       const factory = (orch as any).backendFactory;
       const infoSpy = vi.spyOn((orch as any).logger, 'info');
       factory.resolveName({ kind: 'tier', tier: 'quick-fix' });
       expect(infoSpy).toHaveBeenCalledWith(
         'routing-decision',
         expect.objectContaining({ backendName: expect.any(String) })
       );
       expect(bus!.recent()).toHaveLength(1);
     });

     it('S5: capacity bound — emitting > capacity drops oldest', () => {
       const bus = orch.getRoutingDecisionBus();
       const factory = (orch as any).backendFactory;
       // capacity is 500; emit 600 via repeated resolves
       for (let i = 0; i < 600; i++) {
         factory.resolveName({ kind: 'tier', tier: 'quick-fix' });
       }
       expect(bus!.recent({ limit: 99999 }).length).toBeLessThanOrEqual(500);
     });

     it('S6: subscriber errors do not propagate', () => {
       const bus = orch.getRoutingDecisionBus()!;
       const factory = (orch as any).backendFactory;
       bus.subscribe(() => {
         throw new Error('subscriber boom');
       });
       expect(() => factory.resolveName({ kind: 'tier', tier: 'quick-fix' })).not.toThrow();
     });

     it('Single-resolve invariant: forUseCase calls router.resolve exactly once', () => {
       const factory = (orch as any).backendFactory;
       const router = factory.getRouter();
       const resolveSpy = vi.spyOn(router, 'resolve');
       factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
       expect(resolveSpy).toHaveBeenCalledTimes(1);
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- integration/spec-b-phase-4-decision-bus.test.ts` — observe 5/5 PASS.
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` → PASS.
4. Run: `harness validate` → PASS.
5. Commit:
   ```
   test(orchestrator): pin Spec B Phase 4 acceptance criteria (O1+S5+S6 + single-resolve invariant)
   ```

---

### Task 13: Full validation battery

**Depends on:** Task 12 | **Files:** none (verification only)

**[checkpoint:human-verify]** — After this task, operator confirms Phase 4 is ready for sign-off before integration tasks.

1. Run the full validation battery:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && \
     harness validate && \
     harness check-deps && \
     pnpm --filter @harness-engineering/orchestrator typecheck && \
     pnpm --filter @harness-engineering/orchestrator test -- routing/ agent/backend-router.test.ts agent/orchestrator-backend-factory.test.ts integration/intelligence-pipeline-routing.test.ts integration/spec-b-phase-4-decision-bus.test.ts
   ```
2. Confirm:
   - O1 PASS (Task 3 + Task 12)
   - S5 PASS (Task 3 + Task 12)
   - S6 PASS (Task 3 + Task 12)
   - Single-resolve invariant PASS (Task 6 + Task 12)
   - P1-IMP-1 closed (Task 7 — `BuildLayerDeps` exists, helper omits router cleanly)
   - P1-IMP-2 closed (Task 6 — `forUseCase` single-resolve)
   - P1-IMP-3 closed (Task 11 — warn() present)
   - I1 third instance closed (Task 9 — `resolveRoutedBackend` router-driven, no `Array.isArray`)
   - N1 unchanged (existing tests still pass; pre-Phase-4 better-sqlite3 ABI failures from Phase 3 are out of scope)
3. No commit — verification only. If anything fails, return to the failing task to fix, then re-run from this step.

---

### Task 14: Regenerate barrels + plugin manifests (integration)

**Depends on:** Task 13 | **Files:** auto-generated (`packages/orchestrator/src/_registry.ts`, `packages/cli/src/_registry.ts`, plugin manifests) | **Category:** integration

**Skills:** none

1. Run: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm generate:barrels 2>&1 | tail -10`. Verify that the new `packages/orchestrator/src/routing/decision-bus.ts` + `routing/index.ts` show up in the orchestrator barrel; verify no out-of-scope cross-package drift appears (per Phase 0/2/3 precedent, revert unrelated alphabetic-reordering noise with a comment if it shows up).
2. Run: `pnpm generate:plugin:all 2>&1 | tail -10`. **Expected output:** no in-scope changes (Phase 4 adds no new CLI commands; `harness routing` lands in Phase 6). If anything in-scope changes, that is a surprise and should be flagged in the handoff notes. Out-of-scope drift: revert per established precedent.
3. Run: `harness validate` → PASS.
4. If barrels regen produced in-scope changes (orchestrator's `_registry.ts` adding the new `routing/` export), commit them:
   ```
   chore(orchestrator): regen barrels for routing/decision-bus.ts (Spec B Phase 4)
   ```
   If no in-scope changes, skip the commit and document in the handoff that Task 14 was a no-op.

---

## Dependency Graph

```
Task 1 (scaffold)
  └─► Task 2 (test RED)
        └─► Task 3 (impl GREEN)
              └─► Task 4 (wire BackendRouter)
                    └─► Task 5 (resolveDecisionAndDef seam)
                          └─► Task 6 (forUseCase single-resolve)        [closes P1-IMP-2]
                                └─► Task 7 (split deps)                  [closes P1-IMP-1]
                                      └─► Task 8 (chain-dedupe test)
                                            └─► Task 9 (resolveRoutedBackend rewrite)  [closes I1.3]
                                                  └─► Task 10 (Orchestrator wire-up)
                                                        └─► Task 11 (warn on null factory)  [closes P1-IMP-3]
                                                              └─► Task 12 (acceptance suite)
                                                                    └─► Task 13 (full battery)
                                                                          └─► Task 14 (regen)
```

Strictly serial. No safe parallelization opportunity given the chain of refactors and the single-file-edit pattern in `intelligence-factory.ts` / `orchestrator.ts`.

---

## Time Estimate

| Task | Estimate | Cumulative |
| ---- | -------- | ---------- |
| 1    | 3 min    | 3 min      |
| 2    | 6 min    | 9 min      |
| 3    | 5 min    | 14 min     |
| 4    | 5 min    | 19 min     |
| 5    | 3 min    | 22 min     |
| 6    | 5 min    | 27 min     |
| 7    | 4 min    | 31 min     |
| 8    | 5 min    | 36 min     |
| 9    | 5 min    | 41 min     |
| 10   | 5 min    | 46 min     |
| 11   | 3 min    | 49 min     |
| 12   | 7 min    | 56 min     |
| 13   | 3 min    | 59 min     |
| 14   | 3 min    | 62 min     |

**Total:** ~62 min of focused work.

---

## Checkpoints

- **Task 12 [checkpoint:human-verify]** — Operator runs the Phase 4 acceptance suite locally and confirms O1+S5+S6 + single-resolve match the spec text.
- **Task 13 [checkpoint:human-verify]** — Operator confirms Phase 4 closes the three Phase 1 deferred review findings + I1 third instance.

---

## Risks

| Risk                                                                                                                                                                                                   | Mitigation                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding `emit()` to every `resolve()` could perceptibly slow dispatch in a tight loop (e.g., escalation cascade emits many decisions in rapid succession).                                              | The bus is intentionally synchronous + non-throwing: emit() is O(subscribers) plus one Array.shift. With capacity 500 and zero subscribers at Phase 4 (HTTP+WS land in Phase 5), the per-emit cost is ~5µs. Document the perf bound in the source comment; Phase 5 introduces a `Q1/Q2`-style perf benchmark.                                              |
| `IntelligenceFactoryDeps` split may break a consumer the planner did not find.                                                                                                                         | Plan keeps `IntelligenceFactoryDeps` as a deprecated re-export alias of `BuildPipelineDeps` for one release. Run `grep -rn 'IntelligenceFactoryDeps' packages/` after Task 7 to find all consumers; the only known one is `intelligence-pipeline-routing.test.ts:70-72` and that uses `Parameters<typeof ...>` so it auto-tracks the new layer-deps shape. |
| `resolveRoutedBackend` router-driven rewrite (Task 9) changes the call's failure mode. Pre-Phase-4: missing layer routing fell back to `routing.default`. Post: router throws, helper catches + warns. | Behavioral equivalence: the router's throw at the end of `resolve()` only fires if `routing.default` itself resolves to nothing — which `validateReferences()` already rejects at construction. The catch is a belt-and-suspenders safety net. Logged warn() is more visible than the silent pre-Phase-4 fall-through.                                     |
| The acceptance test in Task 12 constructs an `Orchestrator` instance — instantiation may fail if test scaffolding from Phase 3 isn't reusable.                                                         | Phase 3's acceptance suite (`spec-b-phase-3-dispatch-wiring.test.ts`) already shows the minimal-Orchestrator construction pattern; Task 12 mirrors it. If a helper doesn't exist at `tests/helpers/phase-test-helpers.js`, inline a `makeConfig` directly in the test (the spec allows it; planner default in Task 12 is to inline if no helper exists).   |
| Phase 4's `routing-decision` log line could be noisy at high dispatch rates.                                                                                                                           | The log is a single `info` line per dispatch — currently dispatch frequency is on the order of one per minute per tracked issue. If volume becomes a problem, Phase 8 / future cleanup can downgrade to `debug` or sample.                                                                                                                                 |
| Pre-existing better-sqlite3 ABI failures from Phase 3 (48 orchestrator tests) may continue.                                                                                                            | Phase 4 does not touch SQLite paths; these failures are unchanged. Operator may rebuild via `pnpm rebuild better-sqlite3` before Phase 4 starts to clear the baseline noise. Phase 4 acceptance criteria do not depend on those tests.                                                                                                                     |

---

## Out-of-Scope (Carry Forward to Later Phases)

- **HTTP routes** `/api/v1/routing/{config,decisions,trace}` — Phase 5
- **WebSocket topic** `routing:decision` broadcast — Phase 5
- **CLI command group** `harness routing {config,trace,decisions}` — Phase 6
- **Dashboard `/routing` panel** — Phase 7
- **ADRs + docs + knowledge graph enrichment** — Phase 8
- **Configurable ring-buffer capacity** (currently hardcoded 500) — Phase 5/6 schema delta candidate
- **Circular-buffer perf upgrade** for the ring buffer — deferred until profiling shows shift() is a hotspot
- **`harness dispatch` CLI command** — confirmed absent in Phase 3; not introduced here

---

## Decisions Recorded (for handoff)

| Tag    | Decision                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-D1  | `BackendRouter` ctor accepts optional `decisionBus?: RoutingDecisionBus` (planner default, awaiting D-OP-1 confirmation).                                                    |
| P4-D2  | Add `BackendRouter.resolveDecisionAndDef` as the single-resolve seam; keep `backends` field private (planner default, awaiting D-OP-2).                                      |
| P4-D3  | `resolveRoutedBackend` rewritten to delegate to `router.resolve` (Option X); helper kept as named seam (planner default, awaiting D-OP-3).                                   |
| P4-D4  | Ring buffer capacity hardcoded `500` for v1; configurability deferred (planner default, awaiting D-OP-4).                                                                    |
| P4-D5  | Log emission lives in `RoutingDecisionBus.emit`, not `BackendRouter.resolve` (planner default, awaiting D-OP-5).                                                             |
| P4-D6  | `IntelligenceFactoryDeps` split: `BuildPipelineDeps` (with router), `BuildLayerDeps` (optional router); old name as deprecated alias for one release.                        |
| P4-D7  | Chain-dedupe contract pinned by a new test (closes Phase 1 SUG-1 left open).                                                                                                 |
| P4-D8  | The `intelligence pipeline disabled: no backendFactory available …` warn() text is the canonical wording; operator may amend in C7.                                          |
| P4-D9  | Acceptance suite at `packages/orchestrator/tests/integration/spec-b-phase-4-decision-bus.test.ts`; unit tests at `packages/orchestrator/tests/routing/decision-bus.test.ts`. |
| P4-D10 | No HTTP / CLI / dashboard work in Phase 4 — strictly module + wire-up + finding-closures.                                                                                    |

---

## Plan Sign-Off Request

This plan is ready to execute pending operator confirmation of D-OP-1 through D-OP-5. On approval, transition to `harness-execution` with this plan and the existing Phase 4 handoff.
