# Plan: Phase 3 — outcome-eval `canaryRun?` additive input + signal + node metadata

**Date:** 2026-08-07 | **Spec:** `docs/changes/canary-results-ingest/proposal.md` | **Tasks:** 5 | **Time:** ~20 min | **Integration Tier:** large | **Depends on:** Phase 1 (adapter)

## Phase Overview

Extend outcome-eval with an **additive, optional** structured input `canaryRun?: CanaryRunOutcome` (gate `exitCode` + pass/fail/flaky/skipped counts), mirroring the `guardian?` pattern (#914) byte-for-byte:

- A pure `withCanaryRunSignal(verdict, canaryRun)` folds one deterministic line into the verdict rationale (parallel to `withGuardianSignal` in `evaluator.ts:22-31`).
- `toExecutionOutcome` stamps additive `canary*` metadata keys (`canaryGateExitCode`, `canaryFlaky`, `canaryPassed`, `canaryFailed`, `canarySkipped`) onto the `execution_outcome` node, guarded by the connector's `RESERVED_METADATA_KEYS` stripping (`outcome/connector.ts:17-42`).

**Iron invariants (mirror guardian):**

- Absent/empty `canaryRun` → verdict is **referentially identical** (byte-identical) to no-canary wiring. `withCanaryRunSignal(v, undefined) === v`.
- **Never** affects ship authority — `authority` stays TS-derived from `deriveAuthority(verdict, confidence)`. The signal only appends to `rationale` and adds node metadata.
- The `canary*` metadata keys are NOT in `RESERVED_METADATA_KEYS`, so they survive the connector's `stripReservedKeys` merge as genuinely-additive keys (same as guardian's `verdict`/`confidence`/`source`).

Grounding facts:

- `OutcomeEvalInput` (`packages/intelligence/src/outcome-eval/types.ts:20-45`) — `guardian?: GuardianAnalysis[]` is the exact additive-field precedent to copy.
- `withGuardianSignal` (`evaluator.ts:22-31`): returns `verdict` unchanged when input absent/empty; otherwise appends `\n\n${summary}` to `rationale`; never touches `authority`.
- `finish()` (`evaluator.ts:145-149`) applies the guardian signal uniformly across all verdict paths before `persistOutcome` — the canary signal folds in at the same seam.
- `toExecutionOutcome` metadata block (`evaluator.ts:216-233`) — additive keys guarded by `input.commit` conditional-spread; add `canary*` there.
- `RESERVED_METADATA_KEYS` (`outcome/connector.ts:17-33`) — `canary*` keys are absent → they pass through `stripReservedKeys`.
- Barrel: `outcome-eval/index.ts` re-exports types/functions; `intelligence/src/index.ts:74-84` re-exports the outcome-eval public surface.

## Observable Truths (Acceptance Criteria)

1. `OutcomeEvalInput.canaryRun?` exists as an optional field typed `CanaryRunOutcome` (`exitCode`, `passed`, `failed`, `flaky`, `skipped`).
2. `withCanaryRunSignal(verdict, undefined)` and `withCanaryRunSignal(verdict, emptyish)` return the **same reference** as the input verdict (byte-identical, no rationale change, no authority change).
3. `withCanaryRunSignal(verdict, canaryRun)` with a present run appends exactly one deterministic line to `rationale` and leaves `verdict`/`confidence`/`authority`/`unmetCriteria`/`judgedAgainst` untouched.
4. When `canaryRun` is present, the persisted `execution_outcome` node carries `canaryGateExitCode`/`canaryFlaky`/`canaryPassed`/`canaryFailed`/`canarySkipped` additive metadata; when absent, node metadata is byte-identical to today.
5. A full `evaluate()` run with `canaryRun` absent produces a verdict byte-identical (deep-equal) to the same run without the field — the additive-contract test.
6. Ship authority is unaffected by any `canaryRun` value (still `deriveAuthority(verdict, confidence)`).

## File Map

- MODIFY `packages/intelligence/src/outcome-eval/types.ts` (add `CanaryRunOutcome` + `canaryRun?` field)
- MODIFY `packages/intelligence/src/outcome-eval/evaluator.ts` (add `withCanaryRunSignal`; fold into `finish`; stamp `canary*` in `toExecutionOutcome`)
- MODIFY `packages/intelligence/src/outcome-eval/index.ts` (export `withCanaryRunSignal` + `CanaryRunOutcome`)
- MODIFY `packages/intelligence/src/index.ts` (re-export `withCanaryRunSignal` + `CanaryRunOutcome`)
- CREATE `packages/intelligence/src/outcome-eval/canary-signal.test.ts` (pure signal + additive-contract tests)
- CREATE `.changeset/outcome-eval-canary-run.md` (`@harness-engineering/intelligence` minor)
- OPTIONAL MODIFY `packages/cli/src/mcp/tools/outcome-eval.ts` (surface `canaryRun` on the MCP tool input — see Task 5)

## Tasks

### Task 1: Add `CanaryRunOutcome` type + `canaryRun?` field to `OutcomeEvalInput`

**Depends on:** none | **Files:** `packages/intelligence/src/outcome-eval/types.ts`

**Inputs:** Existing `OutcomeEvalInput` with the `guardian?` precedent (lines 37-45).

**Outputs / files touched:**

- MODIFY `types.ts` — add the structured outcome type + field (documented exactly like `guardian?`):
  ```ts
  /**
   * Structured outcome of a canary test run, folded additively into outcome-eval.
   * `exitCode` is canary's gate exit code (0 pass / 1 fail / 2 flaky / 3 error).
   * Absent leaves the verdict byte-identical to no canary wiring; never affects
   * ship authority (still TS-derived from verdict + confidence).
   */
  export interface CanaryRunOutcome {
    exitCode: number;
    passed?: number;
    failed?: number;
    flaky?: number;
    skipped?: number;
  }
  ```
  and inside `OutcomeEvalInput`, after `guardian?` (line 44):
  ```ts
  /**
   * Structured canary run outcome (gate exit code + counts). Absent/empty leaves
   * the verdict byte-identical to no canary wiring; when present, a deterministic
   * one-line signal is appended to the rationale and `canary*` metadata is stamped
   * onto the execution_outcome node. Never affects ship authority. Mirrors `guardian?`.
   */
  canaryRun?: CanaryRunOutcome;
  ```

**Implementation notes:** Keep the field optional (`exactOptionalPropertyTypes` safe). Do NOT reuse the graph/intelligence `CanaryRunRecord` shape here — `CanaryRunOutcome` is the minimal structured summary the judge needs (a caller derives it from a `CanaryRunRecord`). This keeps outcome-eval decoupled from the adapter's full record schema.

**Verification:**

```
npx tsc -p packages/intelligence/tsconfig.json --noEmit
```

### Task 2: Add pure `withCanaryRunSignal` (mirror `withGuardianSignal`)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/outcome-eval/evaluator.ts`, `packages/intelligence/src/outcome-eval/canary-signal.test.ts`

**Inputs:** `OutcomeVerdict`, `CanaryRunOutcome | undefined`. The `withGuardianSignal` reference (lines 22-31).

**Outputs / files touched:**

- MODIFY `evaluator.ts` — add beside `withGuardianSignal` (after line 31), importing `CanaryRunOutcome` from `./types.js`:

  ```ts
  /**
   * Fold a structured canary run outcome into a verdict's rationale as a single
   * deterministic line. Pure and total: an absent canaryRun returns the verdict
   * UNCHANGED (referentially identical), preserving the "no canary wiring"
   * contract byte-for-byte. Never touches `authority` — ship authority stays
   * TS-derived from (verdict, confidence). Mirrors withGuardianSignal (#914).
   */
  export function withCanaryRunSignal(
    verdict: OutcomeVerdict,
    canaryRun: CanaryRunOutcome | undefined
  ): OutcomeVerdict {
    if (!canaryRun) return verdict;
    const line = summarizeCanaryRun(canaryRun);
    if (!line) return verdict;
    const rationale = verdict.rationale ? `${verdict.rationale}\n\n${line}` : line;
    return { ...verdict, rationale };
  }

  /** Deterministic one-line summary; empty string when nothing meaningful to say. */
  function summarizeCanaryRun(run: CanaryRunOutcome): string {
    const parts = [`gate exit ${run.exitCode}`];
    if (run.passed !== undefined) parts.push(`${run.passed} passed`);
    if (run.failed !== undefined) parts.push(`${run.failed} failed`);
    if (run.flaky !== undefined) parts.push(`${run.flaky} flaky`);
    if (run.skipped !== undefined) parts.push(`${run.skipped} skipped`);
    return `Canary run: ${parts.join(', ')}.`;
  }
  ```

**Implementation notes:** Match `withGuardianSignal` semantics exactly — early-return the SAME reference when absent (Truth 2 asserts `===`). `summarizeCanaryRun` is deterministic and secret-free. Do NOT modify `authority`. Keep both functions `export`ed for unit-testability (guardian's is exported too).

**Verification:** Write `canary-signal.test.ts` first (TDD): (a) `withCanaryRunSignal(v, undefined) === v` (reference identity, Truth 2); (b) present run appends exactly one line, `verdict`/`confidence`/`authority`/`unmetCriteria`/`judgedAgainst` unchanged (Truth 3); (c) deterministic across calls; (d) `authority` never changes regardless of `exitCode` (Truth 6). Run:

```
npx vitest run packages/intelligence/src/outcome-eval/canary-signal.test.ts
```

### Task 3: Fold the signal into `finish()` + stamp `canary*` metadata in `toExecutionOutcome`

**Depends on:** Task 2 | **Files:** `packages/intelligence/src/outcome-eval/evaluator.ts`

**Inputs:** `finish()` (lines 145-149), `toExecutionOutcome` metadata block (lines 216-233).

**Outputs / files touched:**

- MODIFY `finish()` — apply the canary signal after the guardian signal so every verdict path surfaces it uniformly:
  ```ts
  private async finish(verdict: OutcomeVerdict, input: OutcomeEvalInput): Promise<OutcomeVerdict> {
    const withGuardian = withGuardianSignal(verdict, input.guardian);
    const withCanary = withCanaryRunSignal(withGuardian, input.canaryRun);
    await this.persistOutcome(withCanary, input);
    return withCanary;
  }
  ```
- MODIFY `toExecutionOutcome` metadata (lines 216-233) — add the additive `canary*` keys via a conditional spread mirroring the `commit` spread (line 232):
  ```ts
  ...(input.canaryRun !== undefined
    ? {
        canaryGateExitCode: input.canaryRun.exitCode,
        ...(input.canaryRun.passed !== undefined && { canaryPassed: input.canaryRun.passed }),
        ...(input.canaryRun.failed !== undefined && { canaryFailed: input.canaryRun.failed }),
        ...(input.canaryRun.flaky !== undefined && { canaryFlaky: input.canaryRun.flaky }),
        ...(input.canaryRun.skipped !== undefined && { canarySkipped: input.canaryRun.skipped }),
      }
    : {}),
  ```

**Implementation notes:** The `canary*` keys are NOT in `RESERVED_METADATA_KEYS` (`connector.ts:17-33`), so `stripReservedKeys` passes them through — verify by reading that set (none start with `canary`). Because both spreads are conditional on `input.canaryRun !== undefined`/`input.guardian`, an absent field emits ZERO extra metadata keys → node byte-identical to today (Truth 4). Do NOT add `canary*` to `RESERVED_METADATA_KEYS`. `authority` in metadata (line 229) remains the TS-derived copy.

**Verification (full-evaluate additive contract):** Extend `canary-signal.test.ts` (or a sibling evaluator test) with a stubbed `AnalysisProvider` + real `GraphStore`: run `evaluate(input)` and `evaluate({...input, canaryRun})`; assert (a) the no-canary verdict deep-equals a baseline run with the field entirely omitted (Truth 5); (b) the persisted node (query the store for the `execution_outcome` node) carries `canaryGateExitCode` etc. when present and lacks all `canary*` keys when absent (Truth 4). Run:

```
npx vitest run packages/intelligence/src/outcome-eval/canary-signal.test.ts
```

### Task 4: Export `withCanaryRunSignal` + `CanaryRunOutcome` from barrels

**Depends on:** Task 3 | **Files:** `packages/intelligence/src/outcome-eval/index.ts`, `packages/intelligence/src/index.ts`

**Inputs:** New public function + type.

**Outputs / files touched:**

- MODIFY `outcome-eval/index.ts` — add `CanaryRunOutcome` to the `export type { ... } from './types.js'` block (lines 2-9) and export the function from evaluator:
  ```ts
  export { OutcomeEvaluator, withCanaryRunSignal } from './evaluator.js';
  ```
  (Note: `withGuardianSignal` is currently NOT re-exported from this barrel — if the codebase convention is to keep signal folders internal, keep `withCanaryRunSignal` internal too and drop this export. Verify the guardian precedent; match it. If guardian's is unexported, the function stays module-local and Task 4's `index.ts` edits reduce to adding only the `CanaryRunOutcome` type.)
- MODIFY `intelligence/src/index.ts` — add `CanaryRunOutcome` to the outcome-eval `export type { ... }` block (lines 74-84); add `withCanaryRunSignal` to the value export (lines 66-73) only if the barrel above exports it.

**Implementation notes:** Consistency with the guardian precedent decides whether `withCanaryRunSignal` is public. The **type** `CanaryRunOutcome` MUST be exported regardless, since callers construct the `canaryRun` input. Confirm by grepping `withGuardianSignal` in the barrels before deciding.

**Verification:**

```
npx tsc -p packages/intelligence/tsconfig.json --noEmit
```

### Task 5: (Optional) surface `canaryRun` on the `outcome_eval` MCP tool + changeset + ADR (Phase 5 DoD fold-in)

**Depends on:** Task 4 | **Files:** `packages/cli/src/mcp/tools/outcome-eval.ts`, `.changeset/outcome-eval-canary-run.md`, `docs/knowledge/decisions/NNNN-canary-ndjson-acquisition.md`, `docs/knowledge/intelligence/canary-adapter.md`

**Inputs:** Extended `OutcomeEvalInput`.

**Outputs / files touched:**

- OPTIONAL MODIFY `outcome-eval.ts` — add an optional `canaryRun` property to `OutcomeEvalToolInput` + `outcomeEvalDefinition.inputSchema.properties`, and pass it through to `evaluator.evaluate({ ..., ...(canaryRun ? { canaryRun } : {}) })`. Keep it additive/optional so the tool schema stays backward-compatible. (If deferring the MCP surface, the intelligence-level contract is still complete; note the deferral.)
- CREATE `.changeset/outcome-eval-canary-run.md`:

  ```md
  ---
  '@harness-engineering/intelligence': minor
  ---

  outcome-eval: add optional additive `canaryRun` input (gate exit code + pass/fail/
  flaky/skipped counts). When present, a deterministic one-line signal is folded into
  the verdict rationale and `canary*` metadata is stamped onto the execution_outcome
  node; absent leaves the verdict byte-identical. Never affects TS-derived ship
  authority. Mirrors the `guardian?` additive pattern.
  ```

- CREATE `docs/knowledge/decisions/NNNN-canary-ndjson-acquisition.md` — the **D1 ADR** (medium tier): extends ADR-0039's boundary from "exec-only" to "exec + documented-artifact read", establishing the reusable precedent (any future tool whose stable contract is a file, not a CLI verb). Reference the two seams (`CanaryExec` + `CanaryReader`), both injectable + degrade-classified. Resolve `NNNN` to the next ADR number.
- MODIFY `docs/knowledge/intelligence/canary-adapter.md` — if not already done in Phase 1 Task 6, add the D1 decision + the outcome-eval `canaryRun` consumer.

**Implementation notes:** The D1 ADR is an Integration Points → Architectural Decisions requirement and MUST land before the PR merges; it is folded here as the last DoD item across the three phases (Phase 5). If Phase 1 authored a stub, complete it here. Do NOT create a pulse plan — pulse is deferred (D5).

**Verification:**

```
harness validate
harness skill validate   # only if any skill body changed
pnpm generate:plugin:check
npx prettier --check ".changeset/outcome-eval-canary-run.md" "docs/knowledge/decisions/"*canary* "docs/knowledge/intelligence/canary-adapter.md"
```

## Dependency Ordering

- Task 1 (type) → Task 2 (pure signal + tests) → Task 3 (fold into finish + node metadata) → Task 4 (barrels) → Task 5 (optional MCP surface + changeset + ADR).
- Linear. Task 5's MCP surfacing depends on Phase 1's adapter only insofar as a real caller derives `CanaryRunOutcome` from a `CanaryRunRecord`; the intelligence contract itself is self-contained.

## Verification / Definition of Done

- [ ] `npx vitest run packages/intelligence/src/outcome-eval/canary-signal.test.ts` — reference-identity on absent input (Truth 2), one-line append on present (Truth 3), authority invariant (Truth 6), full-evaluate byte-identical when absent (Truth 5), node `canary*` metadata when present / absent (Truth 4).
- [ ] `RESERVED_METADATA_KEYS` in `outcome/connector.ts` unchanged (no `canary*` key added there).
- [ ] `authority` never sourced from `canaryRun` — still `deriveAuthority(verdict, confidence)`.
- [ ] `npx tsc -p packages/intelligence/tsconfig.json --noEmit` (and `packages/cli` if Task 5 MCP surfacing done) clean.
- [ ] `harness validate` exit 0; `.harness/arch/baselines.json` byte-identical to origin/main.
- [ ] Changeset present (`@harness-engineering/intelligence` minor).
- [ ] **Cross-phase Phase 5 close-out:** D1 ADR authored; `docs/knowledge/intelligence/canary-adapter.md` + `docs/knowledge/graph/node-edge-taxonomy.md` updated; `docs/reference/mcp-tools.md` regenerated; `@harness-engineering/cli` minor changeset present; `format:check` clean. **No pulse plan created (D5 deferred).**
