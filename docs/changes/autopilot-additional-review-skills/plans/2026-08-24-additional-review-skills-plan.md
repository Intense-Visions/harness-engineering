# Plan: autopilot project-declared additional review skills

**Date:** 2026-08-24 | **Spec:** docs/changes/autopilot-additional-review-skills/proposal.md | **Tasks:** 4 | **Time:** ~30 min | **Integration Tier:** low

## Goal

Add an optional `review.additionalSkills: string[]` field to the harness config
schema (validated, default `[]`) and wire `harness-autopilot` to dispatch each
declared skill as an extra reviewer at **both** `REVIEW` and `FINAL_REVIEW`,
alongside the mandatory `harness-code-reviewer`. Absent/empty config preserves
today's single-reviewer behavior.

## Observable Truths (Acceptance Criteria)

Mirrors proposal.md §Observable Truths (1–7): schema field validated + default
`[]`; empty/absent config = no regression; declared list round-trips; non-string
rejected; SKILL.md wires both states additively; unresolvable skill = failure not
skip; configuration.md documents the field.

## Change Specifications (deltas to existing behavior)

- **[MODIFIED]** `packages/cli/src/config/schema.ts` — add
  `additionalSkills: z.array(z.string().min(1)).default([])` to
  `ReviewConfigSchema`, with doc comment describing the additive, both-states,
  failure-not-skip semantics.
- **[ADDED]** `packages/cli/tests/config/review-additional-skills-schema.test.ts`
  — schema tests: default `[]`, list round-trips, coexists with `model_tiers`,
  absent block ⇒ `review` undefined, rejects non-string / empty-string.
- **[MODIFIED]** `agents/skills/claude-code/harness-autopilot/SKILL.md` — Persona
  Agents section gains an "Additional review skills" subsection; `REVIEW` and
  `FINAL_REVIEW` state definitions dispatch each `review.additionalSkills` entry
  after the baseline reviewer; false-green guard documented; Process summary line
  updated.
- **[ADDED]**
  `packages/cli/tests/integration/autopilot-additional-review-skills.test.ts` —
  prose-contract test: seam named, both states wire additionalSkills + keep
  baseline reviewer, failure-not-skip documented, baseline mandatory.
- **[MODIFIED]** `docs/reference/configuration.md` — ReviewConfig table + example
  gain `additionalSkills`.

## Task Breakdown (TDD)

1. **Schema (test-first).** Write `review-additional-skills-schema.test.ts`; add
   the `additionalSkills` field to `ReviewConfigSchema`. Run → green.
2. **SKILL.md wiring (contract-test-first).** Write
   `autopilot-additional-review-skills.test.ts`; edit the autopilot SKILL.md to
   document + wire the seam at both states. Run → green.
3. **Docs.** Update `configuration.md` (table + field subsection + example).
4. **Validate.** Rebuild CLI, regenerate plugin/docs artifacts, run cli test +
   typecheck, `harness validate`, changeset.

## Verification

- `pnpm --filter @harness-engineering/cli exec vitest run` over both new files.
- `pnpm turbo build` (dist fresh for pre-commit arch hook).
- `pnpm run generate-docs` if reference-docs freshness trips.
