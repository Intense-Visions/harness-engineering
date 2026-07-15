# Plan: Local backend full workflow — Phase 3 (gate-provider routing seam + Phase-2 review hardening)

**Date:** 2026-07-15 | **Spec:** docs/changes/local-backend-full-workflow/proposal.md | **Tasks:** 8 | **Time:** ~34 min | **Integration Tier:** small

## Goal

On the LOCAL (`pi`) dispatch path only, an `agent.routing.workflowGates: local | primary` config flag routes the outcome-eval gate's `AnalysisProvider` to the PRIMARY backend when set to `primary` (absent ⇒ local SEL, byte-identical default — the D5 C-enablement seam); and four Phase-2 code-review follow-ups harden the local gate's safety-critical branches. The Claude/AMR path is untouched.

---

## Prior decisions inherited (do NOT re-decide)

- **D5 (spec):** gate provider defaults to local SEL; a config flag routes the judgment gate to a stronger provider. Absent ⇒ local, byte-identical.
- **Phase 2 (Option C):** the local-only enforced gate lives in `runLocalWorkflowGate` (`orchestrator.ts`), which calls `evaluateOutcomeCore(issue, workspacePath, model, 'local')` for the outcome-eval sub-gate; `evaluateOutcomeCore` resolves its provider via `this.resolveComplexityProvider()` (the `'sel'` layer = local SEL).
- **Shared engine constraint:** `evaluateOutcomeCore` is called by BOTH the local gate (`caller: 'local'`, line 2505) AND the AMR acceptance-eval feeder (`caller: 'amr'`, line 2594). Any provider-routing change MUST be gated on `caller === 'local'` so the AMR path stays byte-identical (SC-neutral).
- **Config-schema gotcha (repo memory + AMR lesson):** `RoutingConfigSchema` in `packages/orchestrator/src/workflow/schema.ts` is `.strict()`. A type-only add to the `RoutingConfig` interface is SILENTLY REJECTED at config-load. The Zod schema MUST be extended too, or `harness.config.json` with `workflowGates` fails validation.

---

## Observable Truths (Acceptance Criteria)

Using EARS where behavioral:

1. **(SC6, schema)** The system shall accept `agent.routing.workflowGates: 'local'` and `agent.routing.workflowGates: 'primary'` at config validation, and shall reject any other string (strict enum). — asserted by a `RoutingConfigSchema` safe-parse test.
2. **(SC6, provider-resolution, optional)** When `workflowGates: 'primary'` is set, the local gate's outcome-eval shall resolve its `AnalysisProvider` from the PRIMARY (routing.default) backend; when absent, it shall resolve from local SEL. — asserted by a resolution unit test that spies which provider-build path is taken.
3. **(SC6, isolation)** The AMR acceptance-eval caller (`caller: 'amr'`) shall resolve its provider identically regardless of `workflowGates` (byte-identical AMR path). — asserted in the same resolution test.
4. **(hardening B1, safety-critical, event-driven)** When the local gate's `verifyRunner` THROWS, `runLocalWorkflowGate` shall return `{ ok: false }` with a reason containing `"gate error"`, and the completion path shall emit `emitWorkerExit('error', …)` and NEVER `'normal'`. — asserted by a throwing-verifyRunner test.
5. **(hardening B2, state-driven)** While a local unit exhausts its retry budget on a red gate and escalates `needs-human`, the orchestrator shall delete that unit's `priorGateFailureByIssue` entry so no stale failure preamble leaks into a future re-dispatch of the same issue. — asserted by an escalation-then-clear test.
6. **(hardening B3, docs)** The `runLocalWorkflowGate` call site shall carry a one-line comment stating outcome-eval is fail-open-by-design (an unreachable eval provider must not wedge every local dispatch), in contrast to the fail-closed verify gate. — asserted by reading the source (structural).
7. **(hardening B4, optional, event-driven)** When `defaultLocalVerifyRunner` runs against a temp workspace whose `package.json` declares a failing `typecheck` (or `lint`/`test`) script, it shall short-circuit on the first red script and return `{ ok: false, output }` carrying that script's output. — asserted by a temp-workspace integration test.
8. **(regression)** The full orchestrator suite passes (`>= 2067` prior tests + new), typecheck green, `harness check-deps` passes, `harness validate` shows only the pre-existing baseline noise.

Trace: T1→(1), T2→(2,3), T3→(4), T4→(5), T5→(6), T6→(7), T7→(8 regression sweep), T8→docs note. Every truth traces to a task.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` — add `workflowGates?: 'local' | 'primary'` to the `RoutingConfig` interface (T1)
- MODIFY `packages/orchestrator/src/workflow/schema.ts` — extend `RoutingConfigSchema` with `workflowGates: z.enum(['local','primary']).optional()` (T1)
- MODIFY `packages/orchestrator/src/workflow/schema.amr-config.test.ts` — add SC6 schema-acceptance/rejection cases (T1)
- MODIFY `packages/orchestrator/src/orchestrator.ts` — route the local outcome-eval provider by `workflowGates` when `caller === 'local'`; add the B3 fail-open comment at the `runLocalWorkflowGate` call site; add the B2 `priorGateFailureByIssue.delete` on the escalate effect (T2, T3, T4, T5)
- MODIFY `packages/orchestrator/src/orchestrator.local-gate.test.ts` — B1 throwing-verifyRunner test + B2 escalation-clear test + SC6 provider-resolution test (T2, T3, T4)
- CREATE `packages/orchestrator/src/orchestrator.default-verify-runner.test.ts` — B4 temp-workspace first-red short-circuit test (T6)
- MODIFY `docs/guides/multi-backend-routing.md` — document the `workflowGates` flag (T8)

## Uncertainties

- **[ASSUMPTION]** The "primary" backend for provider routing is `agent.routing.default`. This matches the codebase convention (`config-migration.ts:120` seeds `routing: { default: 'primary' }`; the router resolves the default chain). If a project's default is itself a local backend, `workflowGates: 'primary'` resolves to that default — which is correct (the flag routes to the _default/primary_ backend, not literally a backend named "primary"). Documented in T8.
- **[ASSUMPTION]** Reusing `buildAnalysisProviderForLayer('sel', …)` with an override that forces the router's default backend is the cleanest resolution path (it already handles local/pi/anthropic/claude/openai types + resolver snapshots). T2 builds a small helper `resolveOutcomeEvalProvider(caller)` rather than widening `resolveComplexityProvider` (which is memoized and shared by the AMR classify path — must not be perturbed). If the router cannot resolve a distinct default, the helper degrades to the existing `resolveComplexityProvider()` (fail-open — see B3).
- **[DEFERRABLE]** Whether `review` (advisory) should also honor `workflowGates`. The spec's D5 names `outcome-eval`/`review`, but Phase 2 only wired `outcome-eval` as blocking on the local path; `review` is not yet a local gate. Scope Phase 3 to `outcome-eval` only; note `review` as future.

## Tasks

### Task 1: Accept `workflowGates` in the RoutingConfig type + Zod schema (SC6 front door)

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/orchestrator/src/workflow/schema.ts`, `packages/orchestrator/src/workflow/schema.amr-config.test.ts`

1. In `packages/orchestrator/src/workflow/schema.amr-config.test.ts`, add a new `describe` block (TDD — write first, will fail until the schema is extended):

   ```ts
   describe('RoutingConfigSchema — workflowGates (SC6, Phase 3)', () => {
     it("accepts workflowGates: 'local'", () => {
       expect(
         RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'local' }).success
       ).toBe(true);
     });
     it("accepts workflowGates: 'primary'", () => {
       expect(
         RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'primary' }).success
       ).toBe(true);
     });
     it('rejects an unknown workflowGates value (strict enum)', () => {
       expect(
         RoutingConfigSchema.safeParse({ default: 'primary', workflowGates: 'remote' }).success
       ).toBe(false);
     });
     it('still accepts a routing config with NO workflowGates (default-off, byte-identical)', () => {
       expect(RoutingConfigSchema.safeParse({ default: 'primary' }).success).toBe(true);
     });
   });
   ```

2. Run — observe failure: `npx vitest run packages/orchestrator/src/workflow/schema.amr-config.test.ts` (the two accept cases fail because `.strict()` rejects the unknown key; the reject case passes for the wrong reason).
3. In `packages/types/src/orchestrator.ts`, add to the `RoutingConfig` interface (after the `policy?: RoutingPolicy;` field, before the closing brace at line ~713):

   ```ts
   /**
    * local-backend-full-workflow Phase 3 (D5): routes the LOCAL gate's
    * judgment sub-gate (outcome-eval) to a stronger provider. `'primary'`
    * resolves the eval provider from the routing.default (primary) backend;
    * absent or `'local'` ⇒ local SEL (byte-identical default). Affects ONLY
    * the local (`pi`) dispatch gate — the Claude/AMR path is unchanged.
    */
   workflowGates?: 'local' | 'primary';
   ```

4. In `packages/orchestrator/src/workflow/schema.ts`, inside the `RoutingConfigSchema` `.object({ … })` (after `policy: RoutingPolicySchema.optional(),` at line ~222, before `})` `.strict()`):

   ```ts
   // local-backend-full-workflow Phase 3 (D5/SC6): routes the LOCAL outcome-eval
   // gate to the primary backend when 'primary'. .strict() above means this MUST
   // be declared here or a config with workflowGates is silently rejected.
   workflowGates: z.enum(['local', 'primary']).optional(),
   ```

5. Run — observe pass: `npx vitest run packages/orchestrator/src/workflow/schema.amr-config.test.ts`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): accept agent.routing.workflowGates in RoutingConfig + schema (SC6)`

---

### Task 2: Route the local outcome-eval provider by `workflowGates` (SC6 core, caller-gated)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.local-gate.test.ts`

1. In `packages/orchestrator/src/orchestrator.local-gate.test.ts`, add a `describe` block (TDD — write first). The resolution seam is a new private helper `resolveOutcomeEvalProvider(caller)`; the test asserts the LOCAL caller consults `workflowGates` while the AMR caller does not. Use the existing `stubProvider` pattern is insufficient here (it stubs `resolveComplexityProvider`); instead spy the new helper's two branches by spying `buildAnalysisProviderForLayer` is not possible (module import). Prefer a behavioral spy on the router. Concretely:

   ```ts
   describe('workflowGates provider routing (SC6, Phase 3)', () => {
     /** Reach the private resolveOutcomeEvalProvider. */
     function evalProvider(orch: Orchestrator): (caller: 'amr' | 'local') => unknown {
       return (
         orch as unknown as { resolveOutcomeEvalProvider: (c: 'amr' | 'local') => unknown }
       ).resolveOutcomeEvalProvider.bind(orch);
     }

     it("local caller + workflowGates:'primary' → resolves the PRIMARY-backend provider path", () => {
       const orch = newOrchWithGates(
         { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND },
         'primary',
         'primary'
       );
       const spy = spyResolveDefaultProvider(orch); // spies the primary-branch build
       evalProvider(orch)('local');
       expect(spy).toHaveBeenCalled();
     });

     it('local caller + workflowGates absent → resolves via local SEL (resolveComplexityProvider)', () => {
       const orch = newOrchWithGates({ local: LOCAL_BACKEND }, 'local', undefined);
       const selSpy = vi.spyOn(
         orch as unknown as { resolveComplexityProvider: () => unknown },
         'resolveComplexityProvider'
       );
       evalProvider(orch)('local');
       expect(selSpy).toHaveBeenCalled();
     });

     it('AMR caller ALWAYS resolves via local SEL regardless of workflowGates (byte-identical AMR path)', () => {
       const orch = newOrchWithGates(
         { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND },
         'primary',
         'primary'
       );
       const selSpy = vi.spyOn(
         orch as unknown as { resolveComplexityProvider: () => unknown },
         'resolveComplexityProvider'
       );
       const primSpy = spyResolveDefaultProvider(orch);
       evalProvider(orch)('amr');
       expect(selSpy).toHaveBeenCalled();
       expect(primSpy).not.toHaveBeenCalled();
     });
   });
   ```

   Add the two helpers near the top of the file's helper section:

   ```ts
   /** makeConfig variant that sets agent.routing.workflowGates. */
   function newOrchWithGates(
     backends: Record<string, BackendDef>,
     defaultName: string,
     gates: 'local' | 'primary' | undefined
   ): Orchestrator {
     const cfg = makeConfig(backends, defaultName);
     (cfg.agent.routing as Record<string, unknown>).workflowGates = gates;
     return new Orchestrator(cfg, 'PROMPT', {
       tracker: makeMockTracker(),
       backend: new MockBackend(),
       execFileFn: noopExecFile,
     });
   }

   /** Spy the private primary-backend provider-build branch; returns the spy. */
   function spyResolveDefaultProvider(orch: Orchestrator): ReturnType<typeof vi.fn> {
     const spy = vi.fn(() => undefined);
     (
       orch as unknown as { resolvePrimaryOutcomeEvalProvider: unknown }
     ).resolvePrimaryOutcomeEvalProvider = spy;
     return spy;
   }
   ```

2. Run — observe failure: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts` (the helpers reference private methods that do not exist yet).
3. In `packages/orchestrator/src/orchestrator.ts`, add the two private helpers immediately BEFORE `evaluateOutcomeCore` (line ~2607). `resolveOutcomeEvalProvider` is the caller-gated entry point; `resolvePrimaryOutcomeEvalProvider` builds a provider from the routing.default backend, degrading to local SEL on any miss (fail-open, per B3):

   ```ts
   /**
    * local-backend-full-workflow Phase 3 (D5/SC6): resolve the AnalysisProvider
    * for the outcome-eval gate. Caller-gated: ONLY the LOCAL gate caller consults
    * `agent.routing.workflowGates`. The AMR caller ALWAYS uses local SEL
    * (`resolveComplexityProvider`) so the AMR acceptance-eval path is byte-identical
    * (SC-neutral). When `workflowGates === 'primary'` on the local caller, resolve
    * from the primary (routing.default) backend; any miss degrades to local SEL
    * (fail-open — an unreachable stronger provider must NOT wedge the local gate;
    * see the fail-open note at the runLocalWorkflowGate call site).
    */
   private resolveOutcomeEvalProvider(caller: 'amr' | 'local'): AnalysisProvider | undefined {
     if (caller === 'local' && this.config.agent.routing?.workflowGates === 'primary') {
       return this.resolvePrimaryOutcomeEvalProvider() ?? this.resolveComplexityProvider();
     }
     return this.resolveComplexityProvider();
   }

   /**
    * Build an AnalysisProvider from the PRIMARY (routing.default) backend for the
    * Phase-3 `workflowGates:'primary'` seam. Reuses the shipped
    * `buildAnalysisProviderForLayer` translator but forces the router to the
    * default backend. Returns undefined (→ caller degrades to local SEL) when
    * intelligence is disabled, the factory is absent, or the default backend
    * cannot produce a provider — fully guarded, never throws.
    */
   private resolvePrimaryOutcomeEvalProvider(): AnalysisProvider | undefined {
     try {
       if (!this.config.intelligence?.enabled || !this.backendFactory) return undefined;
       const backends = this.config.agent.backends;
       // The "primary" backend is routing.default (a RoutingValue: scalar name or
       // a fallback chain). The shipped BackendRouter has NO { kind: 'default' }
       // query — it falls back to routing.default internally — so read it directly
       // and take the first entry when it's a chain (the primary backend name).
       const def0 = this.config.agent.routing?.default;
       const defaultName = Array.isArray(def0) ? def0[0] : def0;
       if (defaultName === undefined) return undefined;
       const def = backends?.[defaultName];
       if (!def) return undefined;
       return (
         buildAnalysisProvider({
           def,
           backendName: defaultName,
           layer: 'sel',
           getResolverStatusSnapshot: () => {
             const resolver = this.localResolvers.get(defaultName);
             if (!resolver) return null;
             const s = resolver.getStatus();
             return {
               available: s.available,
               resolved: s.resolved,
               configured: s.configured,
               detected: s.detected,
             };
           },
           intelligence: this.config.intelligence,
           logger: this.logger,
         }) ?? undefined
       );
     } catch {
       return undefined;
     }
   }
   ```

   > VERIFIED during planning: `BackendRouter.resolve` (backend-router.ts:169) has no `{ kind: 'default' }` use-case — it internally falls back to `tryChain('default', this.routing.default)`. The snippet above reads `routing.default` directly (correct). Reference `RoutingValue` is `string | string[]`; the `Array.isArray` branch handles a fallback chain by taking its first entry.

4. In `evaluateOutcomeCore` (line ~2614), change the provider resolution to route through the new helper:

   ```ts
   const provider = this.resolveOutcomeEvalProvider(caller);
   ```

   (was `const provider = this.resolveComplexityProvider();`)

5. Confirm `buildAnalysisProvider` and `AnalysisProvider` are imported in `orchestrator.ts` (both already are — `AnalysisProvider` at line 22, `buildAnalysisProviderForLayer` at line 103; add `buildAnalysisProvider` to that import from `./agent/intelligence-factory` OR from `./agent/analysis-provider-factory` — read the existing import lines and add the missing named import next to the sibling one).
6. Run — observe pass: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts`
7. Run: `harness check-deps` (new cross-module import) and `harness validate`
8. Commit: `feat(orchestrator): route local outcome-eval to primary backend on workflowGates:primary (SC6)`

---

### Task 3: [B1 — safety-critical] Test the fail-closed gate-EXCEPTION path (throwing verifyRunner)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`

1. In `packages/orchestrator/src/orchestrator.local-gate.test.ts`, add a `describe` block covering the single most safety-critical branch (the `catch` in `runLocalWorkflowGate`, which currently has ZERO coverage):

   ```ts
   describe('runLocalWorkflowGate — fail-closed on gate EXCEPTION (B1, safety-critical)', () => {
     it('verifyRunner THROWS → { ok: false, reason contains "gate error" }', async () => {
       const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => {
         throw new Error('boom');
       });
       const result = await gate(orch)(ISSUE, tmpDir, 'local');
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.reason).toContain('gate error');
         expect(result.reason).toContain('boom');
       }
     });

     it('completion path on a THROWING gate → emitWorkerExit(error, …), NEVER normal', async () => {
       const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => {
         throw new Error('boom');
       });
       const emit = spyEmitWorkerExit(orch);
       await finalize(orch)(ISSUE, tmpDir, 1, 'local');
       expect(emit).toHaveBeenCalledTimes(1);
       expect(emit.mock.calls[0]![1]).toBe('error');
       expect(emit.mock.calls[0]![3]).toContain('gate error');
       // The unreachable-success guard: a thrown gate must NEVER produce a normal exit.
       expect(emit.mock.calls.some((c) => c[1] === 'normal')).toBe(false);
     });
   });
   ```

2. Run — observe pass (the code path already exists from Phase 2 — the `catch` at `runLocalWorkflowGate` returns `{ ok: false, reason: 'gate error: …' }`; this task ADDS the missing coverage, so it should pass green immediately): `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts`

   > If either assertion FAILS, that is a real safety defect surfaced by the new test — STOP and report; do not weaken the assertion.

3. Run: `harness validate`
4. Commit: `test(orchestrator): cover fail-closed gate-exception path (B1, safety-critical)`

---

### Task 4: [B2] Clear the gate-failure preamble on needs-human escalation

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.local-gate.test.ts`

1. In `packages/orchestrator/src/orchestrator.local-gate.test.ts`, extend the existing exhaustion describe block (`local gate exhaustion → needs-human`) with a stale-preamble-clear assertion (TDD — write first):

   ```ts
   it('B2: on exhaustion→escalate, the priorGateFailure entry is cleared (no stale preamble leak)', async () => {
     const orch = newOrch(
       { local: LOCAL_BACKEND },
       'local',
       async () => ({ ok: false, output: 'verify perma-red' }),
       2
     );
     // Reach the private map.
     const priorMap = (orch as unknown as { priorGateFailureByIssue: Map<string, string> })
       .priorGateFailureByIssue;

     await finalize(orch)(ISSUE, tmpDir, 1, 'local'); // records preamble, schedules retry
     expect(priorMap.has(ISSUE.id)).toBe(true);

     await finalize(orch)(ISSUE, tmpDir, 2, 'local'); // exhausts budget → escalate + clear
     expect(priorMap.has(ISSUE.id)).toBe(false);
   });
   ```

2. Run — observe failure (the escalate effect does not yet clear the map): `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts`
3. In `packages/orchestrator/src/orchestrator.ts`, in the `handleEffect` switch's `case 'escalate':` (line ~1599), add the clear after `handleEscalation`:

   ```ts
   case 'escalate':
     await this.handleEscalation(effect as EscalateEffect);
     // local-backend-full-workflow Phase 3 (B2): the unit is handed to a human;
     // drop any recorded local-gate failure preamble so a future re-dispatch of
     // the SAME issue can't inherit a stale "previous attempt failed" block.
     this.priorGateFailureByIssue.delete((effect as EscalateEffect).issueId);
     await this.persistLaneSafe((effect as EscalateEffect).issueId, 'abandon');
     break;
   ```

4. Run — observe pass: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts`
5. Run: `harness validate`
6. Commit: `fix(orchestrator): clear gate-failure preamble on needs-human escalation (B2)`

---

### Task 5: [B3] Document the fail-open asymmetry at the runLocalWorkflowGate call site

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `packages/orchestrator/src/orchestrator.ts`, at the `runLocalWorkflowGate` call site inside `finalizeNormalCompletion` (line ~2424-2427), add a one-line comment making the fail-open-vs-fail-closed asymmetry explicit:

   ```ts
   const gate =
     gateBackendName !== undefined
       ? // B3: the VERIFY sub-gate is fail-CLOSED (a gate that can't run blocks +
         // re-dispatches). The outcome-eval sub-gate is fail-OPEN by design — an
         // unreachable eval provider (incl. a workflowGates:'primary' backend that's
         // down) degrades to a neutral verdict rather than wedging EVERY local
         // dispatch; the verify gate remains the hard safety floor.
         await this.runLocalWorkflowGate(issue, workspacePath, gateBackendName)
       : ({ ok: true } as const);
   ```

2. Run: `harness validate` (comment-only change; no test needed — B3 truth is structural/read-the-source).
3. Commit: `docs(orchestrator): note fail-open outcome-eval vs fail-closed verify asymmetry (B3)`

---

### Task 6: [B4, optional] Test defaultLocalVerifyRunner first-red short-circuit against a temp workspace

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.default-verify-runner.test.ts`

1. Create `packages/orchestrator/src/orchestrator.default-verify-runner.test.ts`. This exercises the REAL `defaultLocalVerifyRunner` (the concrete pnpm-script probe never hit by the injected-seam unit tests) against a temp workspace whose `package.json` declares a failing `typecheck` script:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { defaultLocalVerifyRunner } from './orchestrator.js';

   let tmp: string;
   beforeEach(() => {
     tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-default-verify-'));
   });
   afterEach(() => {
     try {
       fs.rmSync(tmp, { recursive: true, force: true });
     } catch {
       /* best-effort */
     }
   });

   describe('defaultLocalVerifyRunner (B4)', () => {
     it('missing package.json → passing gate (nothing to check, adopter-portable)', async () => {
       const r = await defaultLocalVerifyRunner(tmp);
       expect(r.ok).toBe(true);
     });

     it('first-red short-circuit: a failing typecheck script → { ok:false } carrying its output', async () => {
       fs.writeFileSync(
         path.join(tmp, 'package.json'),
         JSON.stringify({
           name: 'tmp-verify-fixture',
           scripts: {
             // Exit non-zero + print a recognizable marker; lint/test would pass but
             // must never run because typecheck fails first (short-circuit).
             typecheck: 'node -e "console.error(\'TYPECHECK_MARKER\'); process.exit(1)"',
             lint: 'node -e "process.exit(0)"',
             test: 'node -e "process.exit(0)"',
           },
         })
       );
       const r = await defaultLocalVerifyRunner(tmp);
       expect(r.ok).toBe(false);
       expect(r.output).toContain('typecheck failed');
       expect(r.output).toContain('TYPECHECK_MARKER');
     });
   });
   ```

   > NOTE: `defaultLocalVerifyRunner` invokes `pnpm -w run <script>`. In a bare temp dir with no pnpm workspace root, `pnpm -w` may error before running the script — which the runner treats as a red gate (`error` branch → `{ ok:false }`). If that makes the assertion on `'TYPECHECK_MARKER'` flaky in CI, downgrade the second test to assert only `r.ok === false` (the short-circuit intent still holds: a workspace it cannot cleanly verify is red, never a silent pass). Decide based on the observed run in step 2; this is the acceptable fallback for the OPTIONAL B4 truth. If `pnpm -w` behavior makes the test environment-dependent enough to be non-deterministic, DROP this task (it is explicitly optional) and note it in the handoff rather than shipping a flaky test.

2. Run — observe result: `npx vitest run packages/orchestrator/src/orchestrator.default-verify-runner.test.ts`. Green ⇒ proceed. Non-deterministic ⇒ apply the fallback in the note, or drop the file.
3. Run: `harness validate`
4. Commit: `test(orchestrator): cover defaultLocalVerifyRunner first-red short-circuit (B4)`

---

### Task 7: Full regression sweep + baseline check

**Depends on:** Task 6 | **Files:** none (verification only)

1. Build the affected packages: `pnpm -w build` (expect types + orchestrator green; types changed in T1).
2. Run the orchestrator suite: `npx vitest run` in `packages/orchestrator` (expect `>= 2067` prior + the new Phase-3 tests; 0 failures).
3. Run the schema suite: `npx vitest run packages/orchestrator/src/workflow/schema.amr-config.test.ts` (SC6 cases green).
4. Typecheck: `pnpm -w --filter @harness-engineering/orchestrator exec tsc --noEmit` (or the repo's typecheck script) — green.
5. Run: `harness check-deps` — passes.
6. Run: `harness validate` — assert ZERO NEW issues on any Phase-3 file (baseline-relative noise only, per the Phase-1/2 learning: the dashboard color warnings are pre-existing).
7. No commit (verification task). If any step fails, STOP and report — do not paper over a regression.

---

### Task 8: Document the `workflowGates` flag

**Depends on:** Task 7 | **Files:** `docs/guides/multi-backend-routing.md` | **Category:** integration

1. In `docs/guides/multi-backend-routing.md`, add a short subsection under the routing/AMR area documenting the flag. Read the existing structure first, then append content of this shape:

   ````markdown
   ### `agent.routing.workflowGates` (local gate provider)

   Controls which backend evaluates the LOCAL (`pi`) dispatch's `outcome-eval`
   sub-gate. This affects ONLY the local backend's harness-enforced gate — the
   Claude/primary dispatch path is unchanged.

   - **absent** or `local` (default): the local SEL provider judges outcome-eval.
     Byte-identical to pre-flag behavior.
   - `primary`: the outcome-eval gate resolves its provider from the primary
     (`routing.default`) backend, so a stronger model judges "does the diff satisfy
     the spec?" while the local model still does the implementation. If the primary
     provider is unreachable, the gate degrades to a neutral verdict (fail-open) —
     the fail-closed `verify` gate (typecheck+lint+test) remains the hard floor, so
     a broken build still halts regardless of this flag.

   ```json
   { "agent": { "routing": { "default": "primary", "workflowGates": "primary" } } }
   ```
   ````

   ```

   ```

2. Run: `harness validate`
3. Commit: `docs(routing): document agent.routing.workflowGates local gate provider (SC6)`

---

## Sequencing & Parallelism

Strictly linear (T1→T8): T2 depends on the T1 type/schema; T3-T5 all edit `orchestrator.ts` (file-overlap edges — cannot parallelize with T2 or each other safely); T6 is independent of T3-T5 but depends on T5 only for a clean single-file-at-a-time commit stream; T7 gates on all code tasks; T8 is docs-only after green. No parallel waves — the shared `orchestrator.ts` + `orchestrator.local-gate.test.ts` files serialize the middle.

## Success Criteria (plan-level gates)

- SC6 config front door: `workflowGates` accepted by the Zod schema AND read by the resolution (T1 + T2) — not type-only.
- SC6 caller isolation: the AMR path stays byte-identical (`caller === 'amr'` always local SEL) — asserted in T2.
- B1 safety-critical exception branch covered (T3).
- B2 stale-preamble leak closed (T4).
- B3 asymmetry documented at the call site (T5).
- B4 optional; ship only if deterministic (T6).
- Claude path untouched; changes scoped to the local/pi path + the config schema/type.
- Every code-producing task is TDD (test first where a behavior changes; B1 adds coverage for an existing branch).
