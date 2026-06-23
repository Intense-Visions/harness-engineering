# Plan: outcome-eval Phase 4 — Graph persistence

**Date:** 2026-06-22 | **Spec:** docs/changes/outcome-eval/proposal.md (Implementation Order, Phase 4) | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** medium

## Goal

`OutcomeEvaluator.persistOutcome()` writes exactly one `execution_outcome` node per `evaluate()` call via the existing `ExecutionOutcomeConnector`, mapping the `OutcomeVerdict` + `OutcomeEvalInput` to an `ExecutionOutcome`, so `effectiveness/scorer.ts` can consume the node unchanged — without breaking the Phase 3 degrade-safe contract (a graph-write failure must never throw at the blocking gate).

## Observable Truths (Acceptance Criteria)

Maps to Success Criterion 6: _"Each `evaluate()` call writes exactly one `execution_outcome` node via `ExecutionOutcomeConnector`, consumable by `effectiveness/scorer.ts` (integration-tested)."_

1. **Event-driven.** When `evaluate()` completes on any path (no-section short-circuit, provider success, degraded), the system shall write exactly one node of type `execution_outcome` to the GraphStore. Verified by `store.findNodes({ type: 'execution_outcome' })` having length 1 after each call across all three paths.
2. **Ubiquitous.** The system shall map the verdict to the connector's binary `result` field: `SATISFIED → 'success'`; `NOT_SATISFIED → 'failure'`; `INCONCLUSIVE → 'failure'` with `agentPersona` and `affectedSystemNodeIds` omitted so the scorer's traversal naturally ignores it.
3. **Ubiquitous.** The persisted node's metadata shall carry the verdict-specific signal: the true 3-valued `verdict`, `confidence`, `judgedAgainst`, and `linkedSpecId` set to the spec path (`input.specPath`). Verified by reading `node.metadata`.
4. **Unwanted (degrade-safe).** If the connector's `ingest()` throws (graph-write failure), then the system shall not propagate the error out of `evaluate()` — the verdict is returned unchanged and the error is swallowed-and-logged. Verified by a test injecting a throwing connector/store and asserting `evaluate()` resolves with the expected verdict.
5. **Ubiquitous (scorer consumability).** The persisted node shall round-trip through `computePersonaEffectiveness`, `detectBlindSpots`, and `recommendPersona` without error, and — when a persona-attributed outcome linked to a seeded system node is also present — those functions shall return it. Verified in an integration test using a real in-memory `GraphStore`.
6. `harness validate` passes; the module stays within the `intelligence → graph` layer rule (no new cross-layer imports; `GraphStore` and `ExecutionOutcomeConnector` are both in-package/graph already).

## Decisions made (resolving spec uncertainties from source)

- **D1 — Spec linkage needs NO additive connector change.** The spec (line 139-141, 172-173) flags that linking a verdict to its SPEC node "is an additive extension to the connector if not already supported." Reading `outcome/connector.ts:24-41`: the connector stores `linkedSpecId` as node **metadata** and creates `outcome_of` edges only to `affectedSystemNodeIds`. There is no SPEC-node edge today, and none is required for Criterion 6 (the scorer never traverses spec edges). The **minimal approach** is to reuse the existing `linkedSpecId` metadata field, setting it to `input.specPath`. No connector edit. The `source: 'outcome-eval'` discriminator mentioned in spec line 172-173 is carried as additional metadata; see D4.
- **D2 — INCONCLUSIVE is persisted but scorer-neutral.** `ExecutionOutcome.result` is strictly `'success' | 'failure'` (`outcome/types.ts:16`). The scorer's `gatherOutcomes` (`effectiveness/scorer.ts:57-71`) counts a node ONLY when it has a non-empty `agentPersona` AND at least one `outcome_of` edge. INCONCLUSIVE maps `result → 'failure'` for type-validity but **omits** `agentPersona` and `affectedSystemNodeIds`, so the scorer ignores it. This satisfies "exactly one node written" (Criterion 6 / Truth 1) without letting missing-input verdicts punish effectiveness baselines (consistent with spec line 137-138).
- **D3 — Persist failures are swallowed-and-logged, never surfaced.** Per the design constraint and the Phase 3 never-block-on-noise contract: a graph-write error must not turn an advisory verdict into a thrown exception at the blocking gate. `persistOutcome` wraps the `ingest()` call in try/catch, logs via the existing logging convention (or a no-throw `console.warn` with no secrets — match the package convention found in Task 1), and returns. The verdict is already computed before persistence (`finish()` order in `evaluator.ts:117-120` calls persist then returns the same verdict object), so swallowing keeps `evaluate()` total.
- **D4 — Affected systems and persona are absent from `OutcomeEvalInput` in v1.** `OutcomeEvalInput` (`types.ts:18-27`) carries only `specPath/diff/testOutput/specSection` — no persona, no affected-system node IDs. So v1 persists with `affectedSystemNodeIds: []` and no `agentPersona`. The node is well-formed and queryable; persona/system attribution arrives in Phase 5 (orchestrator wiring), out of scope here. The integration test (Task 5) therefore proves consumability two ways: (a) the evaluator-written node round-trips through the scorer functions without error; (b) a separately-seeded persona-attributed outcome linked to a system node IS surfaced by the scorer — proving the scorer reads the same node shape the connector writes.

## Uncertainties

- [ASSUMPTION] The `intelligence` package has a logging convention for swallowed errors (e.g., a `logger` util or `console.warn`). Task 1 inspects to confirm; if none exists, use `console.warn` with a non-secret message. If wrong, only Task 2's log line changes.
- [DEFERRABLE] The `execution_outcome` node `id` format. The spec/connector convention is `outcome:<issueId>:<attempt>` (`outcome/types.ts:9`). v1 has no issueId; use a deterministic `outcome:outcome-eval:<sha-of-specPath>:<timestamp>` or similar. Final id scheme finalized in Task 2; does not affect task structure.
- [DEFERRABLE] Whether `linkedSpecId` should be the raw `specPath` or a normalized spec-node id. v1 uses `input.specPath` (metadata only, no edge); normalization is a Phase 5 concern.

## File Map

- MODIFY `packages/intelligence/src/outcome-eval/evaluator.ts` (fill `persistOutcome` body; add a private `toExecutionOutcome` mapper; import `ExecutionOutcomeConnector` + `ExecutionOutcome` type)
- MODIFY `packages/intelligence/tests/outcome-eval/evaluator.test.ts` (add persistence + degrade-safe-persist unit tests)
- CREATE `packages/intelligence/tests/outcome-eval/persistence.integration.test.ts` (real GraphStore + scorer round-trip)

No new exports are required from `index.ts` (the mapper and persist are private). No connector edit (D1).

## Skeleton

_Skeleton not produced — task count (6) is below the standard-mode threshold (8). Proceeding to full tasks._

## Tasks

### Task 1: Confirm logging convention and connector/scorer contract (read-only spike)

**Depends on:** none | **Files:** none (read-only)

1. Read `packages/intelligence/src/outcome-eval/evaluator.ts` (already imports `GraphStore`; confirm current `persistOutcome` body at lines ~157-161).
2. Grep the `intelligence` package `src/` for an existing logging convention for swallowed/non-fatal errors:
   - Run: `rg -n "console\.(warn|error)|logger\.|createLogger" packages/intelligence/src --glob '!**/*.test.ts' | head -20`
3. Confirm the connector contract from source (already read during planning, re-confirm before coding):
   - `ExecutionOutcomeConnector` constructor takes `(store: GraphStore)`; `ingest(outcome: ExecutionOutcome): OutcomeIngestResult` is synchronous (`packages/intelligence/src/outcome/connector.ts:18-57`).
   - `ExecutionOutcome` required fields: `id, issueId, identifier, result, retryCount, failureReasons, durationMs, linkedSpecId, affectedSystemNodeIds, timestamp` (`packages/intelligence/src/outcome/types.ts:8-38`); optional `agentPersona, taskType`.
   - Scorer counts a node only with non-empty `agentPersona` + an `outcome_of` edge (`packages/intelligence/src/effectiveness/scorer.ts:57-71`).
4. Record the chosen log mechanism for Task 2 (a `logger` util if one exists, else `console.warn`). No file changes; no commit.

_Outcome: confirmed mechanism + confirmed connector signature. This is the "read the real API" required first step — no assumptions carried forward._

### Task 2: Implement `persistOutcome` + `toExecutionOutcome` mapper (no tests yet — done TDD in Task 3/4)

> Implementation written test-first: Task 3 adds the unit test that this task makes pass. Per the harness no-write-without-failing-test rule, **do Task 3 step 1-2 (write failing test) before Task 2's code lands**, OR combine: write the Task 3 test first, observe red, then apply this task's code, observe green. The plan orders them 3-before-2 in execution; they are listed here implementation-adjacent for clarity.

**Depends on:** Task 1, Task 3 (failing test exists) | **Files:** `packages/intelligence/src/outcome-eval/evaluator.ts`

1. Add imports near the top of `evaluator.ts`:
   ```ts
   import { ExecutionOutcomeConnector } from '../outcome/connector.js';
   import type { ExecutionOutcome } from '../outcome/types.js';
   ```
2. Add a private mapper method to the `OutcomeEvaluator` class:
   ```ts
   /**
    * Map an OutcomeVerdict + OutcomeEvalInput to the connector's ExecutionOutcome.
    * - result: SATISFIED -> 'success'; otherwise 'failure'. INCONCLUSIVE is
    *   'failure' for type-validity but omits agentPersona/affected systems so
    *   the effectiveness scorer ignores it (see plan D2).
    * - linkedSpecId: input.specPath (metadata only; no spec edge — plan D1).
    * - affectedSystemNodeIds: [] in v1 (not available from OutcomeEvalInput — D4).
    */
   private toExecutionOutcome(verdict: OutcomeVerdict, input: OutcomeEvalInput): ExecutionOutcome {
     const timestamp = new Date().toISOString();
     return {
       id: `outcome:outcome-eval:${timestamp}`,
       issueId: 'outcome-eval',
       identifier: `outcome-eval:${input.specPath}`,
       result: verdict.verdict === 'SATISFIED' ? 'success' : 'failure',
       retryCount: 0,
       failureReasons: verdict.unmetCriteria,
       durationMs: 0,
       linkedSpecId: input.specPath,
       affectedSystemNodeIds: [],
       timestamp,
       taskType: 'feature',
     };
   }
   ```
   Carry the verdict-specific signal as metadata via the connector's pass-through: the connector only writes the `ExecutionOutcome` fields it knows, so to record `verdict`/`confidence`/`judgedAgainst` we extend the connector's accepted metadata. **The connector already writes `linkedSpecId` and all listed fields; `verdict`, `confidence`, and `judgedAgainst` are NOT fields on `ExecutionOutcome`.** Therefore record them through the available channels: `result` (binary), `linkedSpecId` (spec path), and `failureReasons` (unmetCriteria). If `verdict`/`confidence`/`judgedAgainst` must be queryable as metadata, this requires an ADDITIVE connector change — see Task 2a. **Decision: do Task 2a (minimal additive metadata pass-through) so the verdict-specific signal is durable, per spec line 27-28 "verdicts compound."**
3. Replace the `persistOutcome` body:
   ```ts
   private async persistOutcome(verdict: OutcomeVerdict, input: OutcomeEvalInput): Promise<void> {
     try {
       const connector = new ExecutionOutcomeConnector(this.store);
       connector.ingest(this.toExecutionOutcome(verdict, input));
     } catch (err) {
       // Swallow-and-log: a graph-write failure must never break the
       // degrade-safe contract by throwing at the blocking gate (plan D3).
       // No secrets/stack frames in the message.
       console.warn('[outcome-eval] execution_outcome persistence failed; verdict unaffected.');
       void err;
     }
   }
   ```
   (Replace `console.warn` with the logger confirmed in Task 1 if one exists.)
4. Run: `harness validate`
5. Commit: `feat(outcome-eval): persist execution_outcome node via ExecutionOutcomeConnector`

### Task 2a: Additive connector extension — pass through verdict-specific metadata

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/outcome/types.ts`, `packages/intelligence/src/outcome/connector.ts`, `packages/intelligence/tests/outcome/connector.test.ts` | **Category:** integration

> Minimal additive change (spec line 139-141, 172-173). Keeps backward compatibility: new field is optional, existing callers unaffected.

1. **Write failing test first.** In `packages/intelligence/tests/outcome/connector.test.ts`, add:
   ```ts
   it('records optional extra metadata when provided (additive, backward-compatible)', () => {
     const store = new GraphStore();
     const connector = new ExecutionOutcomeConnector(store);
     connector.ingest(
       makeOutcome({
         metadata: {
           verdict: 'NOT_SATISFIED',
           confidence: 'high',
           judgedAgainst: 'success-criteria',
           source: 'outcome-eval',
         },
       })
     );
     const node = store.getNode('outcome:issue-1:1');
     expect(node!.metadata.verdict).toBe('NOT_SATISFIED');
     expect(node!.metadata.confidence).toBe('high');
     expect(node!.metadata.judgedAgainst).toBe('success-criteria');
     expect(node!.metadata.source).toBe('outcome-eval');
   });
   it('omits extra metadata key set entirely when not provided', () => {
     const store = new GraphStore();
     new ExecutionOutcomeConnector(store).ingest(makeOutcome());
     const node = store.getNode('outcome:issue-1:1');
     expect(node!.metadata.verdict).toBeUndefined();
   });
   ```
2. Run: `npx vitest run packages/intelligence/tests/outcome/connector.test.ts` — observe failure (type error / undefined metadata).
3. In `packages/intelligence/src/outcome/types.ts`, add an optional field to `ExecutionOutcome`:
   ```ts
   /**
    * Optional caller-supplied metadata merged into the node's metadata.
    * Used by judgment sources (e.g. outcome-eval) to record verdict-specific
    * signal — verdict, confidence, judgedAgainst, source — without bloating the
    * core ExecutionOutcome contract. Reserved keys (id/result/etc.) are not
    * overridable.
    */
   metadata?: Record<string, unknown>;
   ```
4. In `packages/intelligence/src/outcome/connector.ts`, merge the extra metadata FIRST so the explicit core fields always win (no override of reserved keys):
   ```ts
   metadata: {
     ...(outcome.metadata ?? {}),
     issueId: outcome.issueId,
     identifier: outcome.identifier,
     result: outcome.result,
     retryCount: outcome.retryCount,
     failureReasons: outcome.failureReasons,
     durationMs: outcome.durationMs,
     linkedSpecId: outcome.linkedSpecId,
     timestamp: outcome.timestamp,
     ...(outcome.agentPersona !== undefined && { agentPersona: outcome.agentPersona }),
     ...(outcome.taskType !== undefined && { taskType: outcome.taskType }),
   },
   ```
5. Run: `npx vitest run packages/intelligence/tests/outcome/connector.test.ts` — observe pass (including the existing 9 tests, unchanged).
6. Run: `harness validate`
7. Commit: `feat(outcome): additive metadata pass-through on ExecutionOutcomeConnector`

> After Task 2a lands, update Task 2's `toExecutionOutcome` to set `metadata: { verdict: verdict.verdict, confidence: verdict.confidence, judgedAgainst: verdict.judgedAgainst, source: 'outcome-eval' }`. The Task 3 unit test asserts these metadata keys on the persisted node.

### Task 3: Unit test — one node per evaluate(), correct metadata, all three paths (TDD red→green for Task 2)

**Depends on:** Task 2a | **Files:** `packages/intelligence/tests/outcome-eval/evaluator.test.ts`

1. Add a new `describe('OutcomeEvaluator — persistence (Criterion 6)')` block. Use the existing `makeProvider`, `writeSpec`, `SPEC_WITH_CRITERIA`, `SPEC_NO_SECTION` helpers already in the file.
2. Add tests (write BEFORE Task 2's code; run to observe failure against the current no-op `persistOutcome`):

   ```ts
   it('writes exactly one execution_outcome node on the provider-success path', async () => {
     const p = writeSpec(SPEC_WITH_CRITERIA);
     const store = new GraphStore();
     const { provider } = makeProvider({
       verdict: 'NOT_SATISFIED',
       confidence: 'high',
       rationale: 'returns 200 unmet',
       unmetCriteria: ['returns 200'],
     } satisfies LlmVerdict);
     await new OutcomeEvaluator(provider, store).evaluate({
       specPath: p,
       diff: 'd',
       testOutput: 't',
     });
     const nodes = store.findNodes({ type: 'execution_outcome' });
     expect(nodes).toHaveLength(1);
     expect(nodes[0].metadata.result).toBe('failure'); // NOT_SATISFIED -> failure
     expect(nodes[0].metadata.verdict).toBe('NOT_SATISFIED');
     expect(nodes[0].metadata.confidence).toBe('high');
     expect(nodes[0].metadata.judgedAgainst).toBe('success-criteria');
     expect(nodes[0].metadata.source).toBe('outcome-eval');
     expect(nodes[0].metadata.linkedSpecId).toBe(p);
   });

   it('maps SATISFIED -> success', async () => {
     const p = writeSpec(SPEC_WITH_CRITERIA);
     const store = new GraphStore();
     const { provider } = makeProvider({
       verdict: 'SATISFIED',
       confidence: 'medium',
       rationale: 'ok',
       unmetCriteria: [],
     } satisfies LlmVerdict);
     await new OutcomeEvaluator(provider, store).evaluate({
       specPath: p,
       diff: 'd',
       testOutput: 't',
     });
     expect(store.findNodes({ type: 'execution_outcome' })[0].metadata.result).toBe('success');
   });

   it('writes exactly one node on the no-section short-circuit path (INCONCLUSIVE)', async () => {
     const p = writeSpec(SPEC_NO_SECTION);
     const store = new GraphStore();
     const { provider, analyzeSpy } = makeProvider({});
     await new OutcomeEvaluator(provider, store).evaluate({
       specPath: p,
       diff: 'd',
       testOutput: 't',
     });
     expect(analyzeSpy).not.toHaveBeenCalled();
     const nodes = store.findNodes({ type: 'execution_outcome' });
     expect(nodes).toHaveLength(1);
     expect(nodes[0].metadata.verdict).toBe('INCONCLUSIVE');
     expect(nodes[0].metadata.agentPersona).toBeUndefined(); // scorer-neutral (D2)
   });

   it('writes exactly one node on the degraded provider-rejection path', async () => {
     const p = writeSpec(SPEC_WITH_CRITERIA);
     const store = new GraphStore();
     const { provider } = makeRejectingProvider('429');
     await new OutcomeEvaluator(provider, store).evaluate({
       specPath: p,
       diff: 'd',
       testOutput: 't',
     });
     expect(store.findNodes({ type: 'execution_outcome' })).toHaveLength(1);
   });
   ```

3. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe these new tests FAIL (current `persistOutcome` is a no-op; node count is 0).
4. Apply Task 2 + Task 2a code (if not already applied), then re-run — observe PASS. Confirm the pre-existing Phase 3 tests in this file still pass unchanged.
5. Run: `harness validate`
6. Commit: `test(outcome-eval): assert one execution_outcome node per evaluate across all paths`

### Task 4: Unit test — persist failure does NOT throw (degrade-safe, Criterion 3 ∩ D3)

**Depends on:** Task 3 | **Files:** `packages/intelligence/tests/outcome-eval/evaluator.test.ts`

1. Add a test that injects a store whose `addNode` throws (the connector calls `store.addNode` first), and asserts `evaluate()` still resolves with the computed verdict:
   ```ts
   it('swallows a graph-write failure; verdict is returned unchanged (D3)', async () => {
     const p = writeSpec(SPEC_WITH_CRITERIA);
     const throwingStore = new GraphStore();
     vi.spyOn(throwingStore, 'addNode').mockImplementation(() => {
       throw new Error('disk full while writing graph');
     });
     const { provider } = makeProvider({
       verdict: 'NOT_SATISFIED',
       confidence: 'high',
       rationale: 'unmet',
       unmetCriteria: ['returns 200'],
     } satisfies LlmVerdict);
     const v = await new OutcomeEvaluator(provider, throwingStore).evaluate({
       specPath: p,
       diff: 'd',
       testOutput: 't',
     });
     // evaluate() must NOT throw; the blocking verdict survives intact.
     expect(v.verdict).toBe('NOT_SATISFIED');
     expect(v.authority).toBe('blocking');
     expect(throwingStore.findNodes({ type: 'execution_outcome' })).toHaveLength(0);
   });
   ```
2. Run: `npx vitest run packages/intelligence/tests/outcome-eval/evaluator.test.ts` — observe PASS (Task 2's try/catch makes this green; if it fails, the catch is missing).
3. Run: `harness validate`
4. Commit: `test(outcome-eval): persist failure never throws at the blocking gate`

### Task 5: Integration test — real GraphStore + effectiveness/scorer round-trip (Criterion 6)

**Depends on:** Task 3, Task 4 | **Files:** `packages/intelligence/tests/outcome-eval/persistence.integration.test.ts` (CREATE)

1. Create the file. Mirror the connector/scorer test construction pattern (`new GraphStore()`; seed system nodes with `store.addNode({ id, type:'module', name, metadata:{} })`):

   ```ts
   import { describe, it, expect } from 'vitest';
   import { mkdtempSync, writeFileSync } from 'node:fs';
   import { tmpdir } from 'node:os';
   import { join } from 'node:path';
   import { GraphStore } from '@harness-engineering/graph';
   import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
   import {
     computePersonaEffectiveness,
     detectBlindSpots,
     recommendPersona,
   } from '../../src/effectiveness/scorer.js';
   import { OutcomeEvaluator } from '../../src/outcome-eval/evaluator.js';
   import type {
     AnalysisProvider,
     AnalysisRequest,
     AnalysisResponse,
   } from '../../src/analysis-provider/interface.js';
   import type { LlmVerdict } from '../../src/outcome-eval/prompts.js';

   function provider(payload: LlmVerdict): AnalysisProvider {
     return {
       async analyze<T>(req: AnalysisRequest): Promise<AnalysisResponse<T>> {
         return {
           result: payload as unknown as T,
           tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
           model: req.model ?? 'stub',
           latencyMs: 0,
         };
       },
     };
   }
   function writeSpec(body: string): string {
     const dir = mkdtempSync(join(tmpdir(), 'oe-int-'));
     const p = join(dir, 'spec.md');
     writeFileSync(p, body);
     return p;
   }
   const SPEC = ['# Spec', '## Success Criteria', '1. The endpoint returns 200.', ''].join('\n');
   ```

2. **Truth 1 + 3 (evaluator-written node is well-formed and findable):**
   ```ts
   it('evaluate() writes a scorer-shaped execution_outcome node into a real GraphStore', async () => {
     const store = new GraphStore();
     const p = writeSpec(SPEC);
     await new OutcomeEvaluator(
       provider({
         verdict: 'NOT_SATISFIED',
         confidence: 'high',
         rationale: 'unmet',
         unmetCriteria: ['returns 200'],
       }),
       store
     ).evaluate({ specPath: p, diff: 'd', testOutput: 't' });
     const nodes = store.findNodes({ type: 'execution_outcome' });
     expect(nodes).toHaveLength(1);
     expect(nodes[0].metadata.result).toBe('failure');
     // The scorer can traverse the store without throwing on the evaluator node.
     expect(() => computePersonaEffectiveness(store)).not.toThrow();
     expect(() => detectBlindSpots(store)).not.toThrow();
     expect(() => recommendPersona(store, { systemNodeIds: ['module:api'] })).not.toThrow();
     // v1: no persona/affected systems on the evaluator node -> not counted (D4).
     expect(computePersonaEffectiveness(store)).toEqual([]);
   });
   ```
3. **Truth 5 (scorer reads the exact node shape the connector writes):** prove the scorer surfaces a persona-attributed outcome of the same `execution_outcome` shape, seeded via the same connector path:
   ```ts
   it('scorer surfaces a persona-attributed execution_outcome linked to a seeded system node', () => {
     const store = new GraphStore();
     store.addNode({ id: 'module:api', type: 'module', name: 'api', metadata: {} });
     const connector = new ExecutionOutcomeConnector(store);
     connector.ingest({
       id: 'outcome:seed:1',
       issueId: 'seed',
       identifier: 'SEED-1',
       result: 'failure',
       retryCount: 0,
       failureReasons: ['returns 200 unmet'],
       durationMs: 0,
       linkedSpecId: '/spec.md',
       affectedSystemNodeIds: ['module:api'],
       timestamp: '2026-06-22T00:00:00Z',
       agentPersona: 'task-executor',
       metadata: { verdict: 'NOT_SATISFIED', confidence: 'high', source: 'outcome-eval' },
     });
     const scores = computePersonaEffectiveness(store);
     expect(scores).toHaveLength(1);
     expect(scores[0].persona).toBe('task-executor');
     expect(scores[0].systemNodeId).toBe('module:api');
     expect(scores[0].failures).toBe(1);
   });
   ```
4. Run: `npx vitest run packages/intelligence/tests/outcome-eval/persistence.integration.test.ts` — observe PASS.
5. Run: `harness validate` and `harness check-deps` (a new test imports across `outcome-eval`/`outcome`/`effectiveness`/`graph` — confirm no layer violation; all are within `intelligence` + `graph`).
6. Commit: `test(outcome-eval): integration test — persisted node consumable by effectiveness scorer`

### Task 6: Full module test sweep + barrel/wiring check

**Depends on:** Task 5 | **Files:** none (verification) | **Category:** integration

1. Run the full intelligence test suite to confirm no regression in `outcome/`, `effectiveness/`, or `outcome-eval/`:
   - `npx vitest run packages/intelligence/tests/outcome packages/intelligence/tests/effectiveness packages/intelligence/tests/outcome-eval`
2. Confirm `packages/intelligence/src/outcome-eval/index.ts` needs NO change (mapper + persist are private; no new public surface). If `harness validate` reports a stale barrel, regenerate per the package convention and re-commit.
3. Run: `harness validate` (expect the same pre-existing failures noted at plan time — the cli circular-dep and graph test design-token warnings — and NO new failures attributable to this phase).
4. Run: `harness check-deps`.
5. If any file changed in steps 2-4, commit: `chore(outcome-eval): finalize Phase 4 graph-persistence wiring`. Otherwise no commit.

## Sequencing & dependencies

- Execution order: **Task 1 → Task 2a → Task 3 (write failing test) → Task 2 (make green) → Task 4 → Task 5 → Task 6.**
- Task 2 and Task 3 are a single TDD unit: write Task 3's failing test, then apply Task 2's code. They are listed separately for reviewability; the executor must observe red before green.
- Task 2a (additive connector metadata) is a prerequisite for Task 2's mapper and Task 3's metadata assertions — do it first.
- No parallelism: all tasks touch the same two-to-three files.

## Estimated time

6 tasks (Task 2a counted) × ~3-4 min = ~24 min.

## Notes for the executor

- **Pre-existing `harness validate` failures** (recorded at plan time): cli circular dependencies (`drift/catalog`, `craft/llm`) and graph-test hardcoded-color design-token warnings. These are unrelated to Phase 4 — do not attempt to fix them; only ensure no NEW failures are introduced.
- The verdict object is computed before `persistOutcome` runs (`finish()` in `evaluator.ts:117-120`), so swallowing a persist error cannot alter the returned verdict — this is the structural guarantee behind D3.
- Do NOT plan or implement Phase 5 (skill wrapper, orchestrator step 6.5, ADRs). Out of scope.
