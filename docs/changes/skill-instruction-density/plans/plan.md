---
title: Plan — SKILL.md Instruction-Density Check
issue: 1404
spec: docs/changes/skill-instruction-density/proposal.md
---

# Plan: SKILL.md Instruction-Density Check

Derived from `docs/changes/skill-instruction-density/proposal.md`. Locked decision: heuristic
imperative-instruction count per context-budget packing level, advisory (non-blocking) in
`harness validate`, plus a `harness-skill-authoring` guidance note.

## Task breakdown

### T1 — Core density module (pure)

- **File:** `packages/core/src/context/instruction-density.ts`
- `countImperativeInstructions(markdown)` — numbered steps + imperative-verb bullets +
  `MUST`/`SHALL`/`REQUIRED` directives; excludes fenced code and prose.
- `analyzeSkillInstructionDensity(content, budget=175)` — reuse `extractLevel` for each
  cumulative level 1-5; return per-level counts + `maxLevelOverBudget`.
- Export `DEFAULT_INSTRUCTION_BUDGET = 175`.
- Wire exports through `packages/core/src/context/index.ts` (star-barrel — no allowlist edit).
- **Tests:** `packages/core/tests/context/instruction-density.test.ts`.

### T2 — Config knob

- Add optional `skills.instructionBudget` (`z.number().int().positive().optional()`) to
  `packages/cli/src/config/schema.ts`.

### T3 — CLI audit helper (colocated, additive)

- **File:** `packages/cli/src/mcp/tools/instruction-density.ts`
- `runInstructionDensityAudit({ path, budget? })` — walk for `SKILL.md`, dedup by
  `realpathSync` (collapse symlinked skill mirrors), skip `node_modules`/`.git`/`dist`,
  return one finding per over-budget skill.
- **Tests:** `packages/cli/src/mcp/tools/instruction-density.test.ts`.

### T4 — validate wiring (one additive block)

- `packages/cli/src/commands/validate.ts`: add `instructionDensity?` to `checks`, import the
  helper, push each finding at `severity: 'warning'` with `ruleId: 'SKILL-DENSITY'`. Never
  flip `result.valid`. try/catch degrade-to-warning. Read `config.skills.instructionBudget`.

### T5 — Authoring guidance

- `agents/skills/claude-code/harness-skill-authoring/SKILL.md`: instruction-density note in
  Phase 4 (Write Process) + Phase 5 (Validate). Regenerate plugin mirrors
  (`generate:plugin` all targets); `generate:plugin:check` must pass.

## Ordering / dependencies

T1 → (T2, T3 depend on T1) → T4 (depends on T2, T3) → T5 (independent) → build/verify.

## Verification

1. `pnpm --filter @harness-engineering/core exec vitest run tests/context/instruction-density.test.ts`
2. `pnpm --filter @harness-engineering/cli exec vitest run src/mcp/tools/instruction-density.test.ts`
3. Typecheck core + cli.
4. Build CLI, run `harness validate` on this repo → confirm `instructionDensity` check runs
   and adds **no** error-level issues (advisory stays advisory; exit code unchanged by this
   change).
5. `generate:plugin:check` passes.

## Checkpoints

- After T1: core tests green.
- After T4: `harness validate` shows the advisory check with zero error contributions.
- After T5: plugin mirrors regenerated and check-clean.
