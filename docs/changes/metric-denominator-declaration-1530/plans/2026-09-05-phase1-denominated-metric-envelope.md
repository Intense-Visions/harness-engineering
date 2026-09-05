# Plan — Metrics must declare their denominator (slice 1)

Issue [#1530](https://github.com/Intense-Visions/harness-engineering/issues/1530) · spec `docs/changes/metric-denominator-declaration-1530/proposal.md` · base `5cd661d74` · branch `feat/metric-denominator-declaration-1530`.

Route: `feature` → `harness-brainstorming` → `harness-autopilot`, autonomous. Fork F4 pre-answered by the human as **(c) every metric-emitting surface in the repo**; splitting authorized, narrowing not.

## Phase 1 — The envelope and the mechanism

**Complexity:** medium. Pure, no IO, no new entry point.

| #   | Task                                                                                                                                                                                                                                                                                | Files                                                              | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| 1.1 | Define the `DenominatedMetric` envelope with three bases and a required `MetricPopulation`.                                                                                                                                                                                         | `packages/types/src/metric.ts`, `packages/types/src/index.ts`      | —          |
| 1.2 | `denominate()` — the constructor. Throws `MetricContractError` on a blank population/metric id, a non-finite numerator, or a negative denominator. Derives `basis` from the denominator alone, so `value` is `null` for `abstained`/`unknown` regardless of what the caller passed. | `packages/core/src/metrics/denominate.ts`                          | 1.1        |
| 1.3 | `census()` and `unknownPopulation()` — the two recurring shapes (population-is-the-measurement, and size-could-not-be-established).                                                                                                                                                 | `packages/core/src/metrics/denominate.ts`                          | 1.2        |
| 1.4 | `verdictForMetrics()` — pass / abstain / unknown. Empty set does not converge; abstention outranks unknown.                                                                                                                                                                         | `packages/core/src/metrics/verdict.ts`                             | 1.2        |
| 1.5 | `formatMetric()` / `formatMetricValue()` / `formatMetricBlock()` — a value cannot be rendered apart from its population; an abstention renders as `—`.                                                                                                                              | `packages/core/src/metrics/render.ts`                              | 1.2        |
| 1.6 | Module barrel; regenerate the core barrel.                                                                                                                                                                                                                                          | `packages/core/src/metrics/index.ts`, `packages/core/src/index.ts` | 1.2–1.5    |
| 1.7 | Tests: the emit contract, the abstention rule, the zero-vs-unknown distinction, the verdict, the renderer.                                                                                                                                                                          | `packages/core/tests/metrics/{denominate,verdict,render}.test.ts`  | 1.6        |

**Checkpoint 1:** `pnpm turbo build --filter=@harness-engineering/core` clean; `vitest run tests/metrics` green. — _reached: 47 tests passing._

## Phase 2 — Generalize the existing hand-rolled pattern

**Complexity:** low. Behavior-preserving by construction; the pre-existing suite is the oracle.

| #   | Task                                                                                                                                                                                                                                        | Files                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 2.1 | Express `harness roadmap sync`'s two examined populations as denominated censuses.                                                                                                                                                          | `packages/cli/src/commands/roadmap/sync-verdict.ts` |
| 2.2 | Derive the verdict from `verdictForMetrics`; map `abstained → ExitCode.ZERO_DENOMINATOR`, `unknown → ExitCode.ERROR`. Keep the command-specific "what to go and look at" wording, which is domain knowledge the shared layer does not have. |                                                     |

**Checkpoint 2:** all pre-existing `sync.test.ts` + `sync-wiring.test.ts` assertions pass **unmodified**. — _reached: 31/31 green, zero test edits._ This is the evidence that the shared rule reproduces the hand-rolled one rather than approximating it.

## Phase 3 — Adopt the worst green-on-empty sites

**Complexity:** medium. Deliberate, test-visible behavior changes.

| #   | Task                                                                                                                                  | Files                                                                                                        | Behavior change                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 3.1 | `patternCoverage()`; `scoreWithCoverage()` returns `number \| null`.                                                                  | `packages/core/src/harness-strength/scoring.ts`                                                              | `applicable <= 0` was returning the raw score — 100/100 tier `solid` for a mode where no pattern applied. Now `null`. |
| 3.2 | `AuditResult.score` nullable; a null score tiers `incomplete` (not `theatre` — that would be a verdict on a repo we never looked at). | `packages/core/src/harness-strength/{types,auditor}.ts`                                                      |                                                                                                                       |
| 3.3 | Render the abstention instead of a fabricated `0/100` or `100/100`.                                                                   | `packages/cli/src/commands/check-harness-strength.ts`                                                        | Closes the gap where the score printed unconditionally while the coverage line was suppressed.                        |
| 3.4 | `conformance` nullable + `abstained` flag; `valid` no longer vacuously true.                                                          | `packages/core/src/validation/{file-structure,types}.ts`                                                     | `totalRequired === 0 ? 100 : …` reported 100% conformance and `valid: true` for a project with nothing required.      |
| 3.5 | Surface the abstention as its own state with an explicit `ABSTAINED:` message rather than an unexplained `fail`.                      | `packages/cli/src/mcp/tools/validate.ts`                                                                     |                                                                                                                       |
| 3.6 | Update the two tests that pinned the old behavior, each with a comment naming the bug they were asserting.                            | `partial-coverage-score.1761.test.ts`, `tests/validation/file-structure.test.ts`                             |                                                                                                                       |
| 3.7 | Adoption regression tests.                                                                                                            | `packages/core/tests/metrics/adoption.test.ts`, `packages/cli/tests/commands/check-harness-strength.test.ts` |                                                                                                                       |

**Checkpoint 3:** core + CLI build clean; affected suites green.

## Phase 4 — Census, convention, ledger

| #   | Task                                                                                                          | Files                                             |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 4.1 | The convention and the five observed failure classes as a review checklist.                                   | `docs/conventions/metric-denominators.md`         |
| 4.2 | The full 262-site inventory as a tiered burn-down ledger, with every deferred surface named by file and line. | `docs/conventions/metric-denominator-ledger.md`   |
| 4.3 | Changeset, provenance, reference-doc regeneration.                                                            | `.changeset/`, `docs/changes/.../provenance.json` |

## Deliberately not in this slice

- The remaining ~255 emission sites (tranches 2–5 of the ledger).
- The `require-metric-denominator` lint rule — a grep-based gate over 262 sites would be noisy enough to get switched off; it is worth adding once the tranches have burnt down.
- A CI check asserting the ledger matches reality — same reason.
- Dashboard renderers (tranche 4), which is where the adopter-facing "hover to see the population" goal lands.
