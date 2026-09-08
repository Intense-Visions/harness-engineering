# Plan — extract `reportSemanticRegression` out of `runCheckMode`

- **Spec:** `docs/changes/comprehend-runcheckmode-altitude/proposal.md`
- **Issue:** #1743 (CODE-R003, craft-fleet `code-craft` finding, runId `0b56dbcd-7703-4b4e-aea9-4cdce91fe07c`)
- **Base SHA:** `418f5e188`
- **Route:** feature (harness-brainstorming → harness-autopilot)
- **Character:** behaviour-preserving refactor. Every task below is verified against the
  "no observable change" invariant, not against new behaviour.

## Task graph

| #   | Task                                                                                                                                                                                                                                                                                                                                         | Files                                          | Depends on | Checkpoint                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Add `SemanticRegressionReport` interface and `reportSemanticRegression(since, context, deps, log = logger)` immediately above `runCheckMode`. Move the `--since` body verbatim; rewrite `logger.x` → `log.x`; carry the ADR 0109 §4 / ADR 0116 §4 rationale comment onto the new function.                                                   | `packages/cli/src/commands/comprehend.ts`      | —          | Function compiles; `runCheckMode` still contains the old block (not yet removed) is NOT acceptable — T1 and T2 land together.                           |
| T2  | Replace the `--since` block in `runCheckMode` with the destructured call; keep `const context = opts.context ?? 'main'` and the `ok` computation in place and in order.                                                                                                                                                                      | `packages/cli/src/commands/comprehend.ts`      | T1         | `runCheckMode` signature unchanged; `git diff` shows no edit to the `ciMode`, `runComprehendCheck`, stale-reporting, `refresh` or `process.exit` lines. |
| T3  | Add `import type { RefReadDeps }` to the existing `../comprehension/regression` import group.                                                                                                                                                                                                                                                | `packages/cli/src/commands/comprehend.ts`      | T1         | Typecheck clean; no new import statement (extends the existing one).                                                                                    |
| T4  | Add `describe('reportSemanticRegression — the --since gate contract')` to the co-located unit test, with a `makeDeps()` helper building an in-memory `RefReadDeps` and a `makeLog()` returning `vi.fn()` spies. Five cases: unreadable base; unreadable HEAD; `pr` with committed-semantic addition; `main` with a regression; `main` clean. | `packages/cli/src/commands/comprehend.test.ts` | T2         | Each case asserts BOTH the returned pair and the logger channel used. No git, no disk, no `process.exit`.                                               |
| T5  | Build + verify.                                                                                                                                                                                                                                                                                                                              | —                                              | T4         | See Verification.                                                                                                                                       |

## Verification (each must pass before commit)

1. `pnpm turbo build` (Node 22) — required by the pre-commit architecture hook, and `packages/cli`
   is the touched package.
2. `pnpm --filter @harness-engineering/cli exec tsc --noEmit` (or the package's typecheck script).
3. `pnpm --filter @harness-engineering/cli exec vitest run src/commands/comprehend.test.ts tests/comprehension`
   — the pre-existing files must pass **unmodified** apart from T4's additive block.
4. `pnpm --filter @harness-engineering/cli exec vitest run tests/e2e/comprehend-boundary.e2e.test.ts tests/comprehension/comprehend-e2e.test.ts tests/comprehension/comprehend-smoke.e2e.test.ts`
   — the observable-CLI-behaviour backstop.
5. `git diff --stat` shows exactly two files: `comprehend.ts` and `comprehend.test.ts` (plus the
   `docs/changes/**` artifacts).
6. `pnpm run format:check` clean; **no** `pnpm run generate-docs` delta (a delta means the CLI
   surface changed ⇒ overreach ⇒ revert).

## Rollback

Single commit, two source files, no schema or barrel change. `git revert` restores `418f5e188`
behaviour exactly.

## Risks

| Risk                                                                                                                                                                                                                               | Mitigation                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Silent behaviour change in the unreadable-ref branch (the one path with no pre-existing test coverage anywhere in the repo — `grep -rn "since" --include="*.test.ts"` over `tests/comprehension` and `tests/e2e` returns nothing). | T4 pins it explicitly, including that the detector is never invoked once a ref is unreadable.           |
| Scope creep into neighbouring `runCheckMode` concerns (`ciMode`, refresh main-pass).                                                                                                                                               | T2's checkpoint is a `git diff` assertion that those lines are untouched. One finding, one item.        |
| Drift in `docs/reference/cli-commands.md` blocking pre-push.                                                                                                                                                                       | Verification step 6 — a delta is treated as evidence of overreach, not as something to regenerate past. |
