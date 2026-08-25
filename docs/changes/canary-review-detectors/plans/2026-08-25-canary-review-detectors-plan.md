# Plan: Auto-wire canary's deterministic test detectors at REVIEW / FINAL_REVIEW

**Date:** 2026-08-25
**Issue:** #1482
**Phase:** 1 of 1
**Estimated tasks:** 5

## Goal

When canary is present, harness autopilot's `REVIEW` and `FINAL_REVIEW` stages
run canary's deterministic test detectors (`canary-savant`, `canary-blackhawk`,
`canary-katana`, `canary-cassandra`) **alongside** `harness-code-reviewer`
(never replacing it), reusing the merged `skillHooks` dispatch/context path.
Zero user config required — the detectors are an additional default injected
when canary is detected. A project's explicit `skillHooks` config still applies
on top. When canary is absent, behavior is byte-for-byte today's (no regression).

## Background / grounding

- `skillHooks` framework landed on `origin/main`:
  - `packages/core/src/hooks/skill-lifecycle.ts` — `resolveSkillHooks`,
    `defaultBlocking`, `NormalizedHook`, `SkillHooksConfigHolder`.
  - `packages/core/src/hooks/hook-context.ts` — hook input-context contract.
  - `agents/skills/claude-code/harness-autopilot/SKILL.md` documents the
    dispatch pattern and the hard-halt / false-green invariant.
- Canary presence detection already exists: the `canary_probe` MCP tool
  (`packages/cli/src/mcp/tools/canary.ts`) returns `{ status: "available" |
"degraded" }`, backed by `CanaryAdapter.probe()`
  (`packages/intelligence/src/adapters/canary.ts`). `status === "available"`
  is "canary present".
- The four deterministic detector skill names come from issue #1482:
  - `canary-savant` — order dependence / shared-state leakage
  - `canary-blackhawk` — temporal dependence (wall-clock, timezone, DST, Feb 29)
  - `canary-katana` — tests deleted or newly skipped by a change
  - `canary-cassandra` — vacuous tests / assertions that cannot fail

## Observable Truths (Acceptance Criteria)

1. When canary is present, `resolveCanaryReviewHooks(true, "after:REVIEW")`
   returns one blocking `skill` hook per canary deterministic detector, in the
   documented order.
2. When canary is present, `resolveCanaryReviewHooks(true, "after:FINAL_REVIEW")`
   returns the same detectors as blocking `skill` hooks (FINAL_REVIEW tokenizes
   to a REVIEW moment, so `defaultBlocking` = true).
3. When canary is absent, `resolveCanaryReviewHooks(false, ...)` returns `[]`.
4. For any non-review event (e.g. `before:EXECUTE`, `after:VERIFY`),
   `resolveCanaryReviewHooks(true, event)` returns `[]` — detectors wire only at
   REVIEW / FINAL_REVIEW.
5. `resolveReviewHooksWithCanary(config, "harness-autopilot", event, { canaryPresent })`
   returns the project's configured hooks (from `resolveSkillHooks`) followed by
   the canary detector defaults, preserving configured order first.
6. When a project already declares one of the detectors as an explicit `skill`
   hook at the same event, `resolveReviewHooksWithCanary` does NOT emit a
   duplicate (the configured entry wins; the canary default for that name is
   dropped). Non-detector configured hooks are untouched.
7. When canary is absent, `resolveReviewHooksWithCanary` returns exactly
   `resolveSkillHooks(...)` — no regression.
8. New symbols are exported from `@harness-engineering/core` (through the
   `hooks` barrel).
9. `harness-autopilot/SKILL.md` documents the canary auto-wiring at REVIEW and
   FINAL_REVIEW: additive alongside `harness-code-reviewer`, the undispatchable-
   detector-when-present hard halt, and the denominator report.
10. Plugin command mirrors regenerate cleanly (`pnpm run generate:plugin:check`
    passes).
11. `npx vitest run packages/core/tests/hooks/` passes.
12. `harness validate` / typecheck / lint pass; CI green on all OS.

## File Map

- CREATE `packages/core/src/hooks/canary-review-hooks.ts` — the pure resolver:
  `CANARY_REVIEW_DETECTORS`, `CANARY_REVIEW_EVENTS`, `resolveCanaryReviewHooks`,
  `resolveReviewHooksWithCanary`.
- MODIFY `packages/core/src/hooks/index.ts` — re-export the new symbols (flows
  to the core barrel via `export * from './hooks'`).
- CREATE `packages/core/tests/hooks/canary-review-hooks.test.ts` — unit tests
  for every acceptance truth above.
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` — document the
  canary auto-wiring in the Lifecycle-skill-hooks section, the REVIEW section,
  and the FINAL_REVIEW section (additive, hard-halt on undispatchable detector
  when canary present, denominator report).
- REGENERATE plugin command mirrors (`pnpm run generate:plugin`).

## Tasks

### Task 1: Author the pure resolver module

Add `packages/core/src/hooks/canary-review-hooks.ts`. Reuse `resolveSkillHooks`
and `defaultBlocking` from `./skill-lifecycle` and the `NormalizedHook` type. The
module is pure and IO-free (canary presence is passed in by the caller, mirroring
`skill-lifecycle.ts`'s IO-free contract). Dedup configured-vs-default by skill
name so an explicit project hook wins.

### Task 2: Export from the hooks barrel

Re-export the new symbols in `packages/core/src/hooks/index.ts`. Verify the core
barrel picks them up (the barrel does `export * from './hooks'`, so no allowlist
change is needed — confirm `pnpm run generate:core-barrel` is a no-op / clean).

### Task 3: Tests

Add `packages/core/tests/hooks/canary-review-hooks.test.ts` covering acceptance
truths 1-7 (present/absent, event gating, order, dedup, no-regression).

### Task 4: SKILL.md documentation + mirror regeneration

Document the canary auto-wiring in `harness-autopilot/SKILL.md`. Then run
`pnpm run generate:plugin` and commit the regenerated mirrors so
`generate:plugin:check` passes.

### Task 5: Validate + review

Build the CLI, run the hook tests + typecheck + `harness validate`, run the
harness-code-reviewer over the diff, address blocking findings, then ship a
merge-ready PR closing #1482.

## Semantics preserved

- Canary detectors run **additively** at REVIEW / FINAL_REVIEW; findings feed
  the same review aggregation as `harness-code-reviewer` (per-skill key in
  `phase-{N}-review.json`).
- Canary present + a named detector cannot be dispatched ⇒ HARD HALT
  (false-green protection) — the same class the `skillHooks` resolver already
  enforces for an unresolvable skill hook. The consuming SKILL.md owns the halt;
  the resolver just emits the hooks.
- Canary absent ⇒ today's exact behavior, no regression.
- A project's explicit `skillHooks` still applies on top; canary auto-wiring is
  an additional default when canary is present.
