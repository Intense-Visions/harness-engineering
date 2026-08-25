---
title: SKILL.md Instruction-Density Check
issue: 1404
status: planned
keywords:
  - skill-authoring
  - instruction-density
  - context-budget
  - packing-level
  - harness-validate
  - progressive-disclosure
---

# SKILL.md Instruction-Density Check

> Advisory instruction-count estimate per loaded packing level, surfaced non-blocking in
> `harness validate`, confirming the repo's progressive-disclosure packing keeps each
> loaded level under the instruction-follow budget HumanLayer's RPI→CRISPY postmortem
> identified. Adapted from HumanLayer [HORTHY-2]; see
> `docs/research/dex-horthy-humanlayer-comparison-analysis.md`.

## Overview

HumanLayer's public RPI→CRISPY postmortem (`docs/research/dex-horthy-humanlayer-comparison-analysis.md:37-44,96-100`)
names a concrete failure: planning prompts that exceeded a **~150-200 instruction-follow
budget** frontier models reliably honor were the specific break that forced a full
workflow rebuild. `harness-autopilot` and `harness-brainstorming` SKILL.md bodies run
300-470+ lines each. The progressive-disclosure packing already implemented in
`run_skill` (`packages/core/src/context/section-parser.ts:79-108` `extractLevel`, cumulative
levels 1-5 by H2 heading; `packages/core/src/context/progressive-loader.ts`) is promising
evidence this repo does **not** share RPI's failure mode — but it has never been confirmed
with a measured instruction count the way HumanLayer did after getting burned.

This change adds a **heuristic imperative-instruction count per context-budget packing
level**, surfaced **advisory (non-blocking)** in `harness validate`, plus a short authoring
guidance note in `harness-skill-authoring`.

### Goals

- Measure instruction density per loaded packing level, not per whole file — because
  progressive disclosure is the mitigation being validated.
- Warn (never block) when a level's imperative-instruction count exceeds a documented
  budget in the ~150-200 range.
- Give skill authors a rule of thumb for keeping each level under budget.

### Non-goals (YAGNI)

- No NLP/LLM parsing of instructions — a cheap regex/line heuristic is sufficient and
  deterministic.
- No blocking gate. This repo's own autopilot/brainstorming skills are large by design;
  the check MUST stay advisory so `harness validate` still exits 0 here.
- No auto-fix / refactoring of over-budget skills.

## Decisions made

1. **Metric = imperative instructions per packing level.** Count (a) numbered steps
   (`1.`, `2.` list markers), (b) imperative-verb bullets (`-`/`*` bullets whose first
   word is an imperative verb), and (c) MUST / SHALL / REQUIRED directive lines. NOT raw
   lines. _Rationale:_ the HumanLayer budget is about instructions a model must follow,
   not text volume; raw line count over-counts prose/tables/code.

2. **Count per cumulative packing level (1-5), not whole file.** Reuse
   `extractLevel(content, level)` (`section-parser.ts:79`) which already returns the exact
   cumulative content `run_skill` loads at each level. Level 5 is the full body.
   _Rationale:_ progressive disclosure is precisely the mitigation under test — the
   question is "does any _loaded_ level exceed budget," and the answer differs per level.

3. **Default budget = 175, configurable.** Warn when a level's instruction count exceeds
   `175` (the midpoint of HumanLayer's ~150-200 range). Overridable via
   `skills.instructionBudget` in `harness.config.json`. _Rationale:_ a concrete documented
   default in the identified range; cheap to make configurable since the skills config
   object is already `.passthrough()`.

4. **Advisory (warning severity) in `harness validate`.** The finding is pushed at
   `warning` severity so it is reported but never flips `result.valid` — `harness validate`
   still exits 0. _Rationale:_ the repo's own large skills would otherwise turn CI red; the
   value is visibility, not enforcement.

5. **Additive check registration (overlap with #1425).** The check is wired as one
   additive block in `validate.ts` plus a colocated audit helper under
   `packages/cli/src/mcp/tools/`, mirroring how `detect-drift` / `audit-anatomy` /
   `audit-brand` are already composed. No shared check-registry refactor. _Rationale:_
   concurrent lane #1425 also touches `harness validate` as a colocated additive call, so
   both lanes append and a both-add merge is trivial.

## Technical design

### Core (pure, testable) — `packages/core/src/context/instruction-density.ts`

```ts
export const DEFAULT_INSTRUCTION_BUDGET = 175;

/** Count imperative instructions in a block of markdown. */
export function countImperativeInstructions(markdown: string): number;

export interface LevelInstructionDensity {
  level: LoadingLevel; // 1..5
  sections: number; // sections loaded at this level
  instructionCount: number; // imperative instructions in the cumulative content
  overBudget: boolean; // instructionCount > budget
}

export interface SkillInstructionDensityReport {
  budget: number;
  levels: LevelInstructionDensity[];
  maxLevelOverBudget: LevelInstructionDensity | null; // highest over-budget level, else null
}

export function analyzeSkillInstructionDensity(
  content: string,
  budget = DEFAULT_INSTRUCTION_BUDGET
): SkillInstructionDensityReport;
```

`analyzeSkillInstructionDensity` iterates levels 1-5, calls `extractLevel(content, level)`
(re-uses existing packing authority), strips the injected `<!-- context-budget: ... -->`
marker, runs `countImperativeInstructions`, and flags `overBudget`.

`countImperativeInstructions` heuristic (deterministic, no dependencies):

- Numbered step: line matches `^\s*\d+[.)]\s+`.
- Imperative-verb bullet: line matches `^\s*[-*]\s+` AND first word is in a curated
  imperative-verb set (Run, Call, Read, Write, Add, Check, Verify, Ensure, Use, Set,
  Create, Do, Stop, Ask, Emit, Commit, Skip, Continue, Cite, Apply, Present, Wait, Fix,
  Remove, Update, Derive, Branch, Surface, Record, Reject, Avoid, Prefer, Never, Always,
  … capitalized or lowercase).
- Directive line: line contains a `\bMUST\b` / `\bSHALL\b` / `\bREQUIRED\b` token
  (case-sensitive on the SCREAMING form to avoid prose false positives).
- Fenced code blocks (```) are excluded so example snippets don't inflate the count.

Exported through the `context` star-barrel via `packages/core/src/context/index.ts`
(module already whitelisted in `scripts/generate-core-barrel.mjs`; no allowlist edit).

### CLI audit helper — `packages/cli/src/mcp/tools/instruction-density.ts`

`runInstructionDensityAudit({ path, budget? })`:

- Walks the project for `SKILL.md` files (skipping `node_modules`, `.git`, `dist`,
  `coverage`), **deduplicating by `fs.realpathSync`** so the cursor/codex/gemini-cli skill
  mirrors (symlinks to `claude-code`) collapse to a single physical file.
- For each, reads content and runs `analyzeSkillInstructionDensity`.
- Returns findings only for skills with a `maxLevelOverBudget`, one finding per skill,
  message naming the level, its count, the budget, and section count.

### validate.ts wiring (one additive block)

- Add `instructionDensity?: boolean` to `ValidateResult.checks`.
- After the brand-compliance block, resolve `config.skills?.instructionBudget` (falling
  back to `DEFAULT_INSTRUCTION_BUDGET`), call `runInstructionDensityAudit`, set
  `result.checks.instructionDensity = true`, and push each finding at `severity: 'warning'`
  with `ruleId: 'SKILL-DENSITY'`. Never set `result.valid = false`. Wrap in try/catch that
  degrades to a single warning (mirroring the other audits).

### Config schema

Add optional `instructionBudget: z.number().int().positive().optional()` to the `skills`
config object in `packages/cli/src/config/schema.ts` (object is `.passthrough()`, so this
is additive and forward-compatible).

## Integration points

- **Entry Points:** New core export (`analyzeSkillInstructionDensity` et al. via the
  `context` barrel); new colocated CLI audit helper; one new advisory check inside the
  existing `harness validate` command. New config field `skills.instructionBudget`.
- **Registrations Required:** `context` module is already a star-export — running
  `pnpm run generate:core-barrel` regenerates the barrel; no allowlist edit. New validate
  check → `pnpm run generate-docs` for reference-docs freshness. `harness-skill-authoring`
  SKILL.md edit → `pnpm run generate:plugin` to refresh plugin command mirrors (must pass
  `generate:plugin:check`).
- **Documentation Updates:** Short guidance note in
  `agents/skills/claude-code/harness-skill-authoring/SKILL.md` (the "Instruction density"
  budget + how it's estimated per packing level). Reference docs regenerated for the new
  validate check.
- **Architectural Decisions:** None rise to a standalone ADR — this is an additive
  advisory check that reuses existing packing authority.
- **Knowledge Impact:** Concept "instruction-density budget per packing level" as an
  authoring constraint; ties `context-budget packing level` to the HumanLayer
  instruction-follow ceiling.

## Success criteria

1. `analyzeSkillInstructionDensity` returns a per-level (1-5) instruction count for a
   SKILL.md, using `extractLevel` for cumulative packing content (unit-tested).
2. `countImperativeInstructions` counts numbered steps + imperative bullets + MUST/SHALL/
   REQUIRED directives and excludes fenced code and plain prose (unit-tested with a fixture
   whose count is known).
3. The default budget is `175`, documented, and overridable via `skills.instructionBudget`.
4. `harness validate` emits the density findings at `warning` severity and **still exits 0
   on this repo** (verified by running it), even though this repo's own large skills may
   trip the warning.
5. The SKILL.md audit deduplicates symlinked skill mirrors (no double-counting).
6. `harness-skill-authoring` SKILL.md gains a short instruction-density guidance note; the
   plugin mirror regenerates and `generate:plugin:check` passes.

## Implementation order

1. Core: `instruction-density.ts` + unit tests; export via `context/index.ts`; regenerate
   barrel.
2. Config: add `skills.instructionBudget` to schema.
3. CLI: `mcp/tools/instruction-density.ts` audit helper + tests.
4. validate.ts: additive advisory block; wire config budget.
5. Guidance note in `harness-skill-authoring` SKILL.md; regenerate plugin mirrors + docs.
6. Build CLI, run `harness validate` (confirm exit 0), typecheck, tests, changeset.
