# Plan: Parallel Execution — Phase 2 (Firing Logic + Narration)

**Date:** 2026-07-07 | **Spec:** docs/changes/standardize-parallel-execution/proposal.md (Decision 2, Technical Design) | **Tasks:** 3 | **Time:** ~13 min | **Integration Tier:** medium

## Goal

Replace the intentionally-basic Phase-1 `deriveFiring` with the full risk-tiered firing classifier (keyed off conflict severity AND `analysisLevel`, emitting a standardized rationale) and upgrade `narrate` from the terse Phase-1 template into a rich, deterministic DAG summary that names each wave's tasks, the upstream tasks it waits on, and the firing decision with its reason — without weakening any Phase-1 invariant.

## Key Findings (grounding in actual code)

- **`analysisLevel` is ALREADY threaded to the per-wave firing point.** `packages/core/src/parallelization/plan.ts:238` calls `deriveFiring(severity, taskIds.length, minWaveSize, conflicts.analysisLevel)`. The hint's "likely main structural task" (thread `analysisLevel`) was completed in Phase 1. No re-threading needed.
- **The current `deriveFiring` decision-logic already matches the spec's Decision-2 table** (high→serialize; below-min→serialize; medium OR file-only→confirm; none/low+graph-expanded→auto-dispatch — plan.ts:168-178). Phase 2's additive value is therefore: (a) a `reason` phrase alongside each decision (the "why" narration needs), (b) a complete `(severity × analysisLevel × waveSize-tier)` truth-table lock, and (c) the rich narration. The decision behavior is preserved and locked, not rewritten.
- **The REAL structural gap is in `narrate`.** `narrate(waves, cyclic)` (plan.ts:181) never receives the dependency edges, so it cannot state why a wave waits ("Phase 1 blocks 2&3"). The `GraphNode[]` returned by `buildTaskGraph` (`{ id, dependsOn }`, review/types/parallel-groups.ts:9) carries exactly those edges and is already in scope in `planParallelization` as `nodes` (plan.ts:217). Phase 2 threads `nodes` + a parallel `reasons[]` into `narrate`.
- **No external consumers of `narrate`/`deriveFiring`.** Grep shows the MCP tool (`packages/cli/src/mcp/tools/parallelization.ts:86`) calls only `planParallelization` and serializes `plan.narration` as an opaque JSON string. So internal signature changes to `narrate`/`deriveFiring` are safe; only the barreled public surface (`planParallelization` + exported types) is a contract, and it stays unchanged.
- **Barrel unchanged.** `classifyFiring`/`FiringRationale` follow the Phase-1 precedent for `deriveFiring`/`narrate`: module-exported for tests, NOT barreled (they are Phase-internal detail). `node scripts/generate-core-barrel.mjs --check` currently reports "up to date" and must stay so.

## Observable Truths (Acceptance Criteria)

1. **Firing truth table.** `classifyFiring(severity, waveSize, minWaveSize, analysisLevel)` returns the correct `firing` for every combination of `severity ∈ {none, low, medium, high}` × `analysisLevel ∈ {graph-expanded, file-only}` at a wave size ≥ minWaveSize, plus the below-min gate:
   - none/low + graph-expanded → `auto-dispatch`
   - none/low + file-only → `confirm`
   - medium + (either) → `confirm`
   - high + (either) → `serialize`
   - any non-high severity with `waveSize < minWaveSize` → `serialize`
2. **Rationale.** Every `classifyFiring` result carries a non-empty `reason` string that names the deciding factor (`high-severity`, `below minimum wave size`, `medium-severity`, `file-only`, or the clean auto-dispatch reason with `graph-expanded`).
3. **`deriveFiring` preserved.** `deriveFiring(...)` still returns just the `FiringDecision` and passes all 5 existing Phase-1 `deriveFiring` tests unchanged (it delegates to `classifyFiring(...).firing`).
4. **Rich narration.** For a multi-wave fixture, `plan.narration` (a) contains `Wave 1`, (b) names each wave's tasks in `[a, b, c]` form, (c) for non-root waves states which upstream tasks it `waits on`, (d) states the firing decision and its reason (e.g. `auto-dispatch` … `graph-expanded`; or `confirm` … `file-only`; or the `Serialized` section for high-severity members).
5. **Determinism.** Narration is derived purely from sorted inputs; running `planParallelization` twice on the same input yields byte-identical `narration`.
6. **All Phase-1 invariants preserved.** waves/serialized/cyclic mutually disjoint; validate/planner cycle agreement; determinism; the `toContain('Wave 1')` assertion — every existing test in `packages/core/tests/parallelization/plan.test.ts` still passes with zero edits to existing test bodies.
7. `harness validate` introduces no NEW findings on any touched parallelization file; `generate-core-barrel.mjs --check` stays "up to date"; full core + CLI suites green.

## File Map

- MODIFY `packages/core/src/parallelization/plan.ts` (add `FiringRationale` + `classifyFiring`; re-express `deriveFiring` as a thin wrapper; rewrite `narrate` to take `reasons` + `nodes`; update the `planParallelization` call site to collect `reasons` and pass `nodes`)
- MODIFY `packages/core/tests/parallelization/plan.test.ts` (add a `classifyFiring()` truth-table describe block; add rich-narration assertion tests on a multi-wave fixture)

No new files. No barrel edit. No types-package or MCP-schema change.

## Skeleton

_Not produced — task count (3) is below the standard-rigor skeleton threshold (8)._

## Uncertainties

- [ASSUMPTION] `ParallelizationWave` public type stays unchanged; the per-wave firing `reason` is carried only inside `narration` text, not exposed as a structured field. If Phase 3 (autopilot wiring) needs a structured per-wave reason for its announce step, a follow-up adds an optional field. This keeps the barreled public type and the MCP output schema stable in Phase 2. (If wrong, Task 2's `reasons[]` plumbing is trivially promotable to a wave field.)
- [ASSUMPTION] Narration is validated by substring assertions, not an exact-string snapshot, to avoid brittle coupling to wording while still proving the required content (task names, waits-on, firing + reason). Determinism is proven by an equality assertion between two runs, not by a golden file.
- [DEFERRABLE] Edge **provenance** (explicit `dependsOn` vs implicit file/`owns` overlap) is not surfaced in narration — `buildTaskGraph` collapses both into `GraphNode.dependsOn`. The spec's worked example ("Phase 1 blocks 2&3") names the blocking relationship, not its provenance, so this is out of Phase-2 scope. A follow-up could have `buildTaskGraph` emit edge provenance if a future narration needs "shares file X".
- [DEFERRABLE] The firing decision-logic itself is functionally unchanged from Phase 1 (already spec-correct). Reviewers should read Task 1 as "lock + add rationale," not "rewrite behavior." Called out explicitly to pre-empt a "no behavioral delta" soundness flag.

## Tasks

### Task 1: Add `classifyFiring` (decision + rationale) and the full firing truth table

**Depends on:** none | **Files:** `packages/core/src/parallelization/plan.ts`, `packages/core/tests/parallelization/plan.test.ts`

1. **Write the failing truth-table tests.** In `packages/core/tests/parallelization/plan.test.ts`, add `classifyFiring` to the import from `../../src/parallelization/plan`, then add this describe block after the existing `describe('deriveFiring()', ...)` block:

   ```ts
   describe('classifyFiring() truth table', () => {
     const MIN = 3;
     const big = MIN; // wave size at/above minWaveSize so the size gate does not mask severity

     // Every (severity × analysisLevel) combination at a large-enough wave.
     const cases: Array<[WaveSeverity, 'graph-expanded' | 'file-only', FiringDecision]> = [
       ['none', 'graph-expanded', 'auto-dispatch'],
       ['none', 'file-only', 'confirm'],
       ['low', 'graph-expanded', 'auto-dispatch'],
       ['low', 'file-only', 'confirm'],
       ['medium', 'graph-expanded', 'confirm'],
       ['medium', 'file-only', 'confirm'],
       ['high', 'graph-expanded', 'serialize'],
       ['high', 'file-only', 'serialize'],
     ];

     it.each(cases)('%s severity + %s analysis => %s', (severity, analysisLevel, expected) => {
       const { firing, reason } = classifyFiring(severity, big, MIN, analysisLevel);
       expect(firing).toBe(expected);
       expect(reason.length).toBeGreaterThan(0);
     });

     it('serializes any non-high severity below minWaveSize (size gate)', () => {
       for (const sev of ['none', 'low', 'medium'] as WaveSeverity[]) {
         expect(classifyFiring(sev, MIN - 1, MIN, 'graph-expanded').firing).toBe('serialize');
       }
     });

     it('reason names the deciding factor', () => {
       expect(classifyFiring('high', big, MIN, 'graph-expanded').reason).toMatch(/high-severity/i);
       expect(classifyFiring('none', 1, MIN, 'graph-expanded').reason).toMatch(/wave size/i);
       expect(classifyFiring('medium', big, MIN, 'graph-expanded').reason).toMatch(
         /medium-severity/i
       );
       expect(classifyFiring('none', big, MIN, 'file-only').reason).toMatch(/file-only/i);
       expect(classifyFiring('none', big, MIN, 'graph-expanded').reason).toMatch(/graph-expanded/i);
     });
   });
   ```

   Also add the type imports at the top of the test file (extend the existing import line from `../../src/parallelization/plan` to include `classifyFiring`, and add a `import type { FiringDecision, WaveSeverity }` from the same module).

2. **Run the tests — observe failure** (`classifyFiring` undefined):

   ```bash
   pnpm --filter @harness-engineering/core exec vitest run tests/parallelization/plan.test.ts
   ```

3. **Implement `classifyFiring` and re-express `deriveFiring`.** In `packages/core/src/parallelization/plan.ts`, add the `FiringRationale` interface directly above the current `deriveFiring` (before the `/** Basic Phase-1 firing derivation... */` comment), and replace the existing `deriveFiring` function body (plan.ts:161-178) with the classifier plus a thin wrapper:

   ```ts
   /** A firing decision paired with its standardized, deterministic rationale. */
   export interface FiringRationale {
     firing: FiringDecision;
     /** Human-readable "why" phrase consumed by narrate(). Never empty. */
     reason: string;
   }

   /**
    * Full risk-tiered firing policy (Decision 2), keyed off BOTH conflict
    * severity and analysisLevel. Returns the decision AND a standardized
    * rationale phrase. Decision order matches the Phase-1 deriveFiring so
    * existing behavior is preserved and now locked by the truth table.
    *
    *   high severity              -> serialize (sequential)
    *   waveSize < minWaveSize      -> serialize (too few to parallelize)
    *   medium severity            -> confirm  (one confirmation)
    *   analysisLevel 'file-only'  -> confirm  (transitive conflicts unknown)
    *   none/low + graph-expanded  -> auto-dispatch
    */
   export function classifyFiring(
     severity: WaveSeverity,
     waveSize: number,
     minWaveSize: number,
     analysisLevel: 'graph-expanded' | 'file-only'
   ): FiringRationale {
     if (severity === 'high') {
       return {
         firing: 'serialize',
         reason: 'high-severity conflicts predicted — running these tasks sequentially',
       };
     }
     if (waveSize < minWaveSize) {
       return {
         firing: 'serialize',
         reason: `only ${waveSize} independent task(s), below minimum wave size ${minWaveSize} — running serially`,
       };
     }
     if (severity === 'medium') {
       return {
         firing: 'confirm',
         reason: 'medium-severity conflicts predicted — one confirmation before dispatch',
       };
     }
     if (analysisLevel === 'file-only') {
       return {
         firing: 'confirm',
         reason:
           'graph unavailable (file-only analysis) — transitive conflicts unknown, one confirmation before dispatch',
       };
     }
     return {
       firing: 'auto-dispatch',
       reason: `${waveSize} independent tasks, ${
         severity === 'none' ? 'no' : severity
       } conflict severity, graph-expanded analysis — dispatching in parallel`,
     };
   }

   /**
    * Firing decision only — thin wrapper preserving the Phase-1 signature.
    * Delegates to classifyFiring so decision logic lives in exactly one place.
    */
   export function deriveFiring(
     severity: WaveSeverity,
     waveSize: number,
     minWaveSize: number,
     analysisLevel: 'graph-expanded' | 'file-only'
   ): FiringDecision {
     return classifyFiring(severity, waveSize, minWaveSize, analysisLevel).firing;
   }
   ```

4. **Run the tests — observe pass** (new truth table green; the 5 existing `deriveFiring` tests still green):

   ```bash
   pnpm --filter @harness-engineering/core exec vitest run tests/parallelization/plan.test.ts
   ```

5. **Typecheck:** `pnpm --filter @harness-engineering/core typecheck`
6. **Run:** `node packages/cli/dist/bin/harness.js validate` — confirm zero NEW findings on `packages/core/src/parallelization/plan.ts` (the ~390 pre-existing roadmap/dashboard baseline findings are unrelated; do NOT commit any `.harness/arch/baselines.json` side-effect change — revert it if produced).
7. **Commit:** `feat(parallelization): add risk-tiered classifyFiring with rationale, lock firing truth table`

### Task 2: Rewrite `narrate` into the rich deterministic DAG summary

**Depends on:** Task 1 | **Files:** `packages/core/src/parallelization/plan.ts`, `packages/core/tests/parallelization/plan.test.ts`

1. **Write failing narration tests.** In `packages/core/tests/parallelization/plan.test.ts`, inside the existing `describe('planParallelization()', ...)` block, add:

   ```ts
   it('narrates a multi-wave DAG: names tasks, waits-on, and firing reason (Truth #4)', () => {
     // a is a root; b,c,d all depend on a (wave 2, size 3 => auto-dispatch);
     // e depends on b (wave 3). All clean + graph-expanded.
     const tasks = [
       { id: 'a', files: [] },
       { id: 'b', files: [], dependsOn: ['a'] },
       { id: 'c', files: [], dependsOn: ['a'] },
       { id: 'd', files: [], dependsOn: ['a'] },
       { id: 'e', files: [], dependsOn: ['b'] },
     ];
     const plan = planParallelization({
       tasks,
       conflicts: noConflicts(['a', 'b', 'c', 'd', 'e']),
     });
     const n = plan.narration;
     expect(n).toContain('Wave 1'); // legacy assertion preserved
     expect(n).toContain('[b, c, d]'); // names the wave-2 tasks
     expect(n).toMatch(/waits on[^\n]*a/); // wave 2 waits on a
     expect(n).toContain('auto-dispatch');
     expect(n).toContain('graph-expanded');
   });

   it('narration is deterministic across runs (Truth #5)', () => {
     const tasks = [
       { id: 'a', files: [] },
       { id: 'b', files: [], dependsOn: ['a'] },
       { id: 'c', files: [], dependsOn: ['a'] },
     ];
     const conflicts = noConflicts(['a', 'b', 'c']);
     const first = planParallelization({ tasks, conflicts }).narration;
     const second = planParallelization({ tasks, conflicts }).narration;
     expect(first).toBe(second);
   });

   it('narrates a serialized high-severity group with its reason', () => {
     const tasks = [
       { id: 'a', files: ['x.ts'] },
       { id: 'b', files: ['y.ts'] },
     ];
     const conflicts: ConflictPrediction = {
       ...noConflicts(['a', 'b']),
       conflicts: [
         { taskA: 'a', taskB: 'b', severity: 'high', reason: '', mitigation: '', overlaps: [] },
       ],
       groups: [['a', 'b']],
       summary: { high: 1, medium: 0, low: 0, regrouped: true },
     };
     const n = planParallelization({ tasks, conflicts }).narration;
     expect(n).toContain('Serialized');
     expect(n).toContain('a');
     expect(n).toContain('b');
   });

   it('narrates the file-only confirm rationale', () => {
     const tasks = [
       { id: 'a', files: [] },
       { id: 'b', files: [] },
       { id: 'c', files: [] },
     ];
     const conflicts: ConflictPrediction = {
       ...noConflicts(['a', 'b', 'c']),
       analysisLevel: 'file-only',
     };
     const n = planParallelization({ tasks, conflicts }).narration;
     expect(n).toContain('confirm');
     expect(n).toContain('file-only');
   });
   ```

2. **Run the tests — observe failure** (terse Phase-1 narration lacks `[b, c, d]`, `waits on`, `Serialized`, etc.):

   ```bash
   pnpm --filter @harness-engineering/core exec vitest run tests/parallelization/plan.test.ts
   ```

3. **Rewrite `narrate`.** Replace the current `narrate` (plan.ts:180-187) with the rich version that takes the parallel `reasons` array, `serialized`, `cyclic`, and the built `nodes` (for dependency edges):

   ```ts
   /**
    * Rich, deterministic DAG summary for announce-and-proceed — the reproducible
    * version of a hand-written "Phase 1 blocks 2&3, they're disjoint, dispatching
    * 2∥3; Phase 4 integrates". Per wave: names the tasks, the upstream tasks it
    * waits on (from the built DAG), and the firing decision with its reason.
    *
    * `reasons[i]` is the rationale for `waves[i]` (parallel arrays). Derived
    * purely from sorted inputs, so output is deterministic.
    */
   export function narrate(
     waves: readonly ParallelizationWave[],
     reasons: readonly string[],
     serialized: readonly string[],
     cyclic: readonly string[],
     nodes: readonly GraphNode[]
   ): string {
     const depMap = new Map<string, readonly string[]>();
     for (const node of nodes) depMap.set(node.id, node.dependsOn);

     const lines: string[] = [
       `Parallelization: ${waves.length} wave(s), ${serialized.length} serialized, ${cyclic.length} cyclic.`,
     ];

     waves.forEach((w, i) => {
       const waveSet = new Set(w.tasks);
       const blocking = [...new Set(w.tasks.flatMap((t) => depMap.get(t) ?? []))]
         .filter((id) => !waveSet.has(id))
         .sort();
       const waitClause = blocking.length
         ? `waits on ${blocking.join(', ')}`
         : 'no upstream dependencies (root wave)';
       lines.push(
         `Wave ${i + 1} [${w.tasks.join(', ')}]: ${waitClause}; ${w.firing}: ${reasons[i] ?? ''}.`
       );
     });

     if (serialized.length > 0) {
       lines.push(
         `Serialized (run sequentially): [${serialized.join(
           ', '
         )}] — high-severity conflict members or dependency-cycle members.`
       );
     }
     if (cyclic.length > 0) {
       lines.push(
         `Cyclic (blocked): [${cyclic.join(', ')}] — dependency cycle; resolve before scheduling.`
       );
     }

     return lines.join('\n');
   }
   ```

4. **Update the `planParallelization` call site.** In `planParallelization` (plan.ts:213-244), collect a parallel `reasons` array while building waves, use `classifyFiring` (so decision + reason come from one call), and pass `nodes` + `reasons` to `narrate`. Replace the `const waves = rawWaves...` block and the final `return`:

   ```ts
   const reasons: string[] = [];
   const waves: ParallelizationWave[] = rawWaves
     .map((taskIds) => taskIds.filter((id) => !serializedSet.has(id)))
     .filter((taskIds) => taskIds.length > 0)
     .map((taskIds) => {
       const severity = waveSeverity(taskIds, conflicts);
       const { firing, reason } = classifyFiring(
         severity,
         taskIds.length,
         minWaveSize,
         conflicts.analysisLevel
       );
       reasons.push(reason);
       return { tasks: taskIds, severity, firing, analysisLevel: conflicts.analysisLevel };
     });

   return {
     waves,
     serialized,
     cyclic,
     narration: narrate(waves, reasons, serialized, cyclic, nodes),
   };
   ```

5. **Run the tests — observe pass** (new narration tests green; the existing `toContain('Wave 1')` and all disjointness/determinism tests still green):

   ```bash
   pnpm --filter @harness-engineering/core exec vitest run tests/parallelization/plan.test.ts
   ```

6. **Typecheck:** `pnpm --filter @harness-engineering/core typecheck`
7. **Run:** `node packages/cli/dist/bin/harness.js validate` — zero NEW findings on `plan.ts`; revert any `baselines.json` side effect.
8. **Commit:** `feat(parallelization): rich deterministic narration threading DAG edges and firing reasons`

### Task 3: Verify full suites, barrel, and MCP boundary unchanged

**Depends on:** Task 2 | **Files:** none (verification only) | **Category:** integration

1. **Full core suite** (proves no Phase-1 invariant weakened):

   ```bash
   pnpm --filter @harness-engineering/core test
   ```

   Expect the full core suite green (Phase-1 baseline was 3525 passed | 1 skipped; new tests add to that).

2. **Full CLI suite** (proves the MCP tool still serializes `plan.narration` fine — it treats narration as opaque):

   ```bash
   pnpm --filter @harness-engineering/cli test
   ```

   Expect green (Phase-1 baseline 4356 passed). No CLI edit was made.

3. **Barrel check** (classifyFiring/FiringRationale are intentionally NOT barreled, mirroring deriveFiring/narrate):

   ```bash
   node scripts/generate-core-barrel.mjs --check
   ```

   Expect "Core barrel is up to date." If it reports drift, STOP — the Phase-2 intent is no public-surface change; do not regenerate the barrel to add these symbols.

4. **Final validate:** `node packages/cli/dist/bin/harness.js validate` — confirm no NEW findings attributable to the two touched files; leave the pre-existing baseline (roadmap planned-without-spec rows, dashboard design tokens) untouched; revert any `packages/*/.harness/arch/baselines.json` side effect.
5. **Commit** (only if any non-source verification artifact legitimately changed; otherwise skip — this task normally produces no diff): `test(parallelization): confirm Phase-2 firing/narration suites green` — but prefer NO empty commit.

## Sequencing & Parallelism

Strictly sequential: Task 2 consumes `classifyFiring` from Task 1; Task 3 verifies both. No parallelizable tasks (single file of production code). No checkpoints — Phase 2 is pure module logic with no human-verify/decision/action gates (autopilot wiring and its confirm-prompt UX belong to Phase 3).

## Change Specifications (delta vs Phase 1)

- [ADDED] `FiringRationale` interface and `classifyFiring(severity, waveSize, minWaveSize, analysisLevel): FiringRationale` — module-exported, not barreled.
- [MODIFIED] `deriveFiring` — now a thin wrapper delegating to `classifyFiring(...).firing`; signature and behavior unchanged (all 5 existing tests pass).
- [MODIFIED] `narrate` — signature `(waves, cyclic)` → `(waves, reasons, serialized, cyclic, nodes)`; output upgraded from a one-line template to a multi-line DAG summary (tasks, waits-on, firing + reason, serialized/cyclic sections). Internal function; no external callers.
- [MODIFIED] `planParallelization` — collects a parallel `reasons[]` via `classifyFiring` and passes `nodes` + `reasons` to `narrate`. Public signature and `ParallelizationPlan` shape unchanged.
- [UNCHANGED] `ParallelizationWave`/`ParallelizationPlan` public types, the core barrel, `packages/types` plan-task schema, and the `plan_parallelization` MCP tool + its schema.
