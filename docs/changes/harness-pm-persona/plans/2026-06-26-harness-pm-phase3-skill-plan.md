# Plan: Harness PM — Phase 3 (acceptance-eval skill)

**Date:** 2026-06-26 | **Spec:** docs/changes/harness-pm-persona/proposal.md (§ Technical design → "Skill"; § Implementation order → "Phase 3") | **Tasks:** 6 | **Time:** ~22 min | **Integration Tier:** medium

## Goal

Author the `acceptance-eval` skill (claude-code source) and mechanically propagate it to the cursor / codex / gemini-cli platform directories plus the derived plugin/slash-command artifacts, so the Phase-1 `AcceptanceEvaluator` / Phase-2 `mcp__harness__acceptance_eval` tool become an invokable skill that HALTs before merge on a blocking verdict and otherwise reports advisory findings.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/acceptance-eval/` contains `SKILL.md` (starts with `# `, rigid sections present) and `skill.yaml` (`tier: 2`, `type: rigid`, `platforms` lists all four clients, `mcp.tool: acceptance_eval`). [spec SC1]
2. The same two files exist byte-identically in `agents/skills/{cursor,codex,gemini-cli}/acceptance-eval/`. [spec SC1, parity]
3. The skill flow documents: resolve the spec section → invoke `mcp__harness__acceptance_eval` / `AcceptanceEvaluator` → render the verdict (`measurability`, `confidence`, `judgedAgainst`, `rationale`, `criteriaFindings`, `coverageFindings`) → **HALT before merge** iff `measurability === 'NOT_MEASURABLE' && confidence === 'high'`; otherwise report advisory findings and proceed. Authority is stated to be TS-derived (matching `deriveAcceptanceAuthority`) and never asserted by the model. [spec SC6, D3]
4. `vitest run tests/platform-parity.test.ts` passes (every skill in every platform; identical files; **equal counts across all four platforms** — 758 each after this change).
5. `vitest run tests/structure.test.ts` and `tests/references.test.ts` pass (required rigid sections: `## Gates` + `## Escalation` + the five behavioral sections; `skill.yaml` validates against `SkillMetadataSchema`).
6. `pnpm generate:plugin:check` passes (no plugin-artifact drift) — i.e. `.claude-plugin/commands/acceptance-eval.md`, `.cursor-plugin/commands/acceptance-eval.md`, and `.gemini-extension/commands/acceptance-eval.md` are generated and committed.
7. `harness validate` passes.

## File Map

- CREATE `agents/skills/claude-code/acceptance-eval/skill.yaml`
- CREATE `agents/skills/claude-code/acceptance-eval/SKILL.md`
- CREATE `agents/skills/cursor/acceptance-eval/skill.yaml` (copy of claude-code)
- CREATE `agents/skills/cursor/acceptance-eval/SKILL.md` (copy of claude-code)
- CREATE `agents/skills/codex/acceptance-eval/skill.yaml` (copy)
- CREATE `agents/skills/codex/acceptance-eval/SKILL.md` (copy)
- CREATE `agents/skills/gemini-cli/acceptance-eval/skill.yaml` (copy)
- CREATE `agents/skills/gemini-cli/acceptance-eval/SKILL.md` (copy)
- GENERATED (via `pnpm generate:plugin:all`; **do not hand-edit**): `.claude-plugin/commands/acceptance-eval.md`, `.cursor-plugin/commands/acceptance-eval.md`, `.gemini-extension/commands/acceptance-eval.md`, and any agents/hooks deltas

## Skeleton

_Not produced — task count (6) is below the standard-rigor threshold (8)._

## Notes on methodology

A skill is a content artifact (markdown + yaml), not executable code, so classic write-test-first TDD does not apply. The "tests" are the **existing catalog suites** that auto-discover every skill: `tests/structure.test.ts` (sections + schema), `tests/platform-parity.test.ts` (identical files + equal counts), `tests/references.test.ts` (schema + links). Each task that produces a skill file runs the relevant suite as its verification step. No new test files are authored.

## Tasks

### Task 1: Author the claude-code `skill.yaml`

**Depends on:** none | **Files:** `agents/skills/claude-code/acceptance-eval/skill.yaml`

1. Create `agents/skills/claude-code/acceptance-eval/skill.yaml` with exactly:

```yaml
name: acceptance-eval
version: '0.1.0'
description: >-
  Pre-execution LLM-judgment skill: does a spec carry measurable, testable,
  complete acceptance criteria before work begins? Resolves the spec's
  acceptance section, critiques observability / testability / completeness
  (advisory), flags user-visible behaviors with no covering test (advisory),
  and emits a confidence-rated AcceptanceVerdict
  (MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE). Authority is derived in
  TypeScript, never from the LLM: a high-confidence NOT_MEASURABLE blocks
  merge; every other verdict is advisory. The upstream twin of the
  outcome-eval ship gate.
stability: draft
cognitive_mode: constructive-architect
triggers:
  - manual
  - on_pr
platforms:
  - claude-code
  - cursor
  - codex
  - gemini-cli
tools:
  - Bash
  - Read
  - Glob
  - Grep
mcp:
  tool: acceptance_eval
  # specPath is the only required input. testGlobs/testContent are the (b)
  # coverage evidence: omitting them degrades coverage findings to
  # advisory-empty but NEVER affects the (c) measurability gate.
  input:
    specPath: 'string (required) — absolute or repo-relative path to the spec markdown to evaluate'
    testGlobs: 'string[] (optional) — globs locating test files that evidence (b) coverage; omission degrades coverage findings to advisory-empty, never the (c) gate'
    testContent: 'string (optional) — pre-read test snippets as (b) coverage evidence; an alternative to testGlobs'
    model: 'string (optional) — model override for the acceptance-eval LLM call'
type: rigid
tier: 2
phases:
  - name: resolve
    description: Resolve the judgment section (Success Criteria -> User-Visible Behavior -> Overview), recorded in judgedAgainst
    required: true
  - name: gather
    description: Locate test evidence for (b) coverage via testGlobs/testContent; optional — omission degrades coverage findings, never the (c) gate
    required: false
  - name: judge
    description: Invoke AcceptanceEvaluator; the LLM returns measurability/confidence/criteriaFindings/coverageFindings/rationale; authority is derived in TS via deriveAcceptanceAuthority
    required: true
  - name: gate
    description: Render the verdict; on a blocking verdict (NOT_MEASURABLE + high confidence) HALT before merge
    required: true
state:
  persistent: false
```

Note: `mcp.input` intentionally omits `path` — the Phase-2 tool has no graph persistence (per Phase-2 handoff). `platforms` lists all four per the Phase-3 spec text (this deliberately diverges from `outcome-eval`, which lists only `claude-code`; both are schema-valid — see Concerns). 2. Run: `node packages/cli/dist/bin/harness.js validate` (or `harness validate`). 3. Commit: `feat(acceptance-eval): add acceptance-eval skill.yaml (claude-code)`

### Task 2: Author the claude-code `SKILL.md` `[checkpoint:human-verify]`

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/acceptance-eval/SKILL.md`

Mirror `agents/skills/claude-code/outcome-eval/SKILL.md` in structure and tone. Create `agents/skills/claude-code/acceptance-eval/SKILL.md` with exactly:

```markdown
# Acceptance Eval

> Pre-execution LLM-judgment: does this spec carry measurable, testable, complete acceptance criteria before work begins? Resolves the spec's acceptance section, critiques observability / testability / completeness (advisory `criteriaFindings`), flags user-visible behaviors with no covering test (advisory `coverageFindings`), and emits a confidence-rated `AcceptanceVerdict` (`MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE`) with a rationale. Merge authority is derived in TypeScript, never trusted from the LLM: a high-confidence `NOT_MEASURABLE` blocks merge; every other verdict is advisory. The upstream twin of the `outcome-eval` ship gate — it keeps the downstream gate fed with judgable specs.

## When to Use

- On every spec entering the repo under `docs/changes/**` — triggered `on_pr` (and `manual`) — before execution begins.
- When you need a durable, structured answer to "can this spec's success be objectively judged later?"
- NOT for judging whether an implementation satisfied its spec post-execution (use `outcome-eval`, the downstream twin).
- NOT for authoring acceptance criteria — `acceptance-eval` reviews; humans own the thinking layer. It never writes the criteria it judges.
- NOT for rule-based floors (lint/architecture/entropy) or other craft ceilings — those run elsewhere.
- NOT when no judgable spec section exists — the verdict degrades to INCONCLUSIVE/advisory and never blocks.

## Process

### Phase 1: RESOLVE — Find the judgment section

The evaluator resolves the section internally via the fallback chain `## Success Criteria` -> `## User-Visible Behavior` -> `## Overview` (reusing `outcome-eval`'s resolver, not a fork), recording the match in `judgedAgainst`. No manual action — pass `specPath` and let `AcceptanceEvaluator` resolve. If no section is judgable, the verdict is INCONCLUSIVE/advisory.

### Phase 2: GATHER — Locate test evidence for coverage (optional)

For responsibility (b), supply test evidence so the judge can flag user-visible behaviors with no covering test: pass `testGlobs` (globs the tool reads) or `testContent` (snippets you already read). This evidence is optional: omitting it degrades `coverageFindings` to advisory-empty but NEVER affects the (c) measurability gate. Gather it when the spec describes user-visible behavior.

### Phase 3: JUDGE — Invoke the evaluator

1. Invoke the MCP tool `mcp__harness__acceptance_eval` with `{ specPath }` plus optional `{ testGlobs | testContent, model }`. The tool constructs `AcceptanceEvaluator` cli-side and returns the verdict; the supported v1 provider is the anthropic analysis provider (`ANTHROPIC_API_KEY`).
2. The LLM returns ONLY `measurability / confidence / criteriaFindings / coverageFindings / rationale`. `authority` is computed in TypeScript from `(measurability, confidence)` via `deriveAcceptanceAuthority` and is never read from the LLM — do not attempt to override it. The tool returns the verdict exactly as the evaluator derives it.
3. The call is degrade-safe: provider failure (incl. no `ANTHROPIC_API_KEY`), empty test evidence, or a missing judgable section yields INCONCLUSIVE/low/advisory. It never throws and never blocks.

### Phase 4: GATE — Render and (conditionally) halt

1. Render the verdict: `measurability`, `confidence`, `judgedAgainst`, `rationale`, `criteriaFindings` (a, advisory), and `coverageFindings` (b, advisory).
2. Authority rule (must match `deriveAcceptanceAuthority`): authority is `blocking` **iff** `measurability === 'NOT_MEASURABLE' && confidence === 'high'`; every other combination — including all `INCONCLUSIVE` and `MEASURABLE` cases, and all `medium`/`low` `NOT_MEASURABLE` — is `advisory`.
3. **On a blocking verdict: HALT before merge.** Report the missing measurable criteria and stop; the spec must not merge. Resolution requires a human adding measurable success criteria and re-running `acceptance-eval`.
4. On an advisory verdict: report the `criteriaFindings` and `coverageFindings` for human attention and proceed. Advisory findings do not stop the workflow.

## Harness Integration

- **`mcp__harness__acceptance_eval`** — MCP tool (the invocation surface). Inputs: `specPath` (required), `testGlobs` / `testContent` (optional (b) evidence), `model` (optional). The handler builds the cli `AnalysisProvider`, constructs `AcceptanceEvaluator`, and returns the `AcceptanceVerdict` with `authority` exactly as derived in TypeScript. (No graph persistence in v1 — the seam is documented in the tool header.)
- **Evaluator surface:** `AcceptanceEvaluator`, `deriveAcceptanceAuthority`, `acceptanceVerdictSchema`, `AcceptanceVerdict` are exported from `@harness-engineering/intelligence`. The section resolver is imported from `outcome-eval`, not duplicated.
- **Provider path (v1 supported):** the anthropic analysis provider (`ANTHROPIC_API_KEY`). When no provider is configured the call degrades to INCONCLUSIVE/advisory.
- **Relationship to `outcome-eval`:** `acceptance-eval` is the upstream twin. It guards spec measurability before execution; `outcome-eval` judges implementation satisfaction after. The same "authority is never read from the LLM" discipline spans both ends of the lifecycle.

## Known Limitations

- **Coverage findings (b) are heuristic and advisory.** Without `testGlobs`/`testContent` they are advisory-empty; even with evidence they are LLM-judgment over the behavior section plus located tests, not a graph-backed coverage map (deferred — see spec Decision D4). Heuristic misses are low-harm because (b) never blocks.
- **The (c) gate blocks only on high-confidence NOT_MEASURABLE.** A spec with weak-but-present criteria yields an advisory verdict, not a block — intentional, to avoid taste-blocks-merge false positives.
- **openai-compatible strict mode** is not the v1 path; the supported provider is anthropic/claude-cli.

## Success Criteria

See `docs/changes/harness-pm-persona/proposal.md` for the full criteria. This skill satisfies SC1 (skill exists, `tier: 2`, `type: rigid`, four-client artifacts), SC6 (blocking halt on high-confidence NOT_MEASURABLE; advisory-and-proceed otherwise), and SC7 (emits advisory `criteriaFindings` / `coverageFindings`).

## Examples

### Example: NOT_MEASURABLE with high confidence (blocks)

**Input:** a spec whose only "success criteria" are "the feature works well" and "users are happy" — no observable, testable assertions.

**Verdict:**

\`\`\`
measurability: NOT_MEASURABLE
confidence: high
judgedAgainst: success-criteria
authority: blocking
criteriaFindings:

- "No observable assertion: 'works well' / 'users are happy' cannot be tested."
  rationale: "The success section contains only subjective statements; nothing can be judged at outcome time."
  \`\`\`

**Action:** HALT before merge. Report the missing measurable criteria; the spec must not merge until a human adds them.

### Example: measurable criteria (advisory, proceeds)

**Input:** a spec whose Success Criteria list concrete, testable assertions; one user-visible behavior lacks an obvious covering test.

**Verdict:** `measurability: MEASURABLE confidence: high authority: advisory`, with one `coverageFindings` entry surfaced for review. The workflow proceeds.

## Gates

- **Authority is never read from the LLM.** The verdict's `authority` is always `deriveAcceptanceAuthority(measurability, confidence)` computed in TypeScript. If you find yourself letting the model assert blocking/advisory, STOP — that defeats the entire purpose of this gate.
- **Block only on high-confidence NOT_MEASURABLE.** `authority === 'blocking'` iff `measurability === 'NOT_MEASURABLE' && confidence === 'high'`. Every other combination is advisory. Do not halt on an advisory verdict.
- **Never author criteria.** `acceptance-eval` reviews specs; it does not write the acceptance criteria it judges. Humans own the thinking layer.
- **Never block on infrastructure noise.** A provider failure, an unparseable response, or a missing spec section must resolve to INCONCLUSIVE/advisory, never a thrown error or a block. The evaluator enforces this; do not reintroduce a hard failure in the wrapper.

## Escalation

- **Blocking verdict the author disputes:** the resolution is for a human to add measurable success criteria (or fix the section the resolver judged) and re-run `acceptance-eval` — not to override the gate.
- **Repeated INCONCLUSIVE on a real spec:** usually means no judgable section exists. Confirm the spec has a Success Criteria / User-Visible Behavior / Overview section.
- **No `ANTHROPIC_API_KEY` configured:** every verdict degrades to INCONCLUSIVE/advisory and nothing blocks. Surface this to the human — the gate is effectively disabled until a provider is configured.
- **Verdict seems wrong (false positive/negative):** capture the spec section and verdict and route to the maintainers; do not loosen the conservative-confidence prompt ad hoc.
```

(The fenced verdict blocks inside the Examples section use escaped backticks so the surrounding plan renders; in the actual `SKILL.md` they are ordinary triple-backtick code fences.)

1. After writing, verify the file starts with `# ` and contains `## Gates` and `## Escalation` (rigid requirement) plus `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`.
2. Run: `pnpm --filter @harness-engineering/skills exec vitest run tests/structure.test.ts` (or from `agents/skills/`: `vitest run tests/structure.test.ts`). Observe the new skill's section + schema cases pass.
3. **[checkpoint:human-verify]** Show the rendered `SKILL.md` and the `skill.yaml`. Wait for confirmation that tone, the authority-derived-in-TS framing, and the HALT-before-merge rule are correct **before** propagating to the other three platforms (a mistake here propagates four ways and into generated artifacts).
4. Run: `harness validate`.
5. Commit: `feat(acceptance-eval): add acceptance-eval SKILL.md (claude-code)`

### Task 3: Propagate the skill to cursor / codex / gemini-cli

**Depends on:** Task 2 | **Files:** `agents/skills/{cursor,codex,gemini-cli}/acceptance-eval/{SKILL.md,skill.yaml}` | **Category:** integration

1. Create the three target dirs and copy both files byte-for-byte:

```bash
for p in cursor codex gemini-cli; do
  mkdir -p "agents/skills/$p/acceptance-eval"
  cp agents/skills/claude-code/acceptance-eval/SKILL.md  "agents/skills/$p/acceptance-eval/SKILL.md"
  cp agents/skills/claude-code/acceptance-eval/skill.yaml "agents/skills/$p/acceptance-eval/skill.yaml"
done
```

2. Run the parity suite from `agents/skills/`: `vitest run tests/platform-parity.test.ts`. Observe: "every skill exists in all platforms", "skill files are identical across platforms", and "all platforms have the same number of skills" (758 each) all pass.
3. Run: `harness validate`.
4. Commit: `feat(acceptance-eval): propagate skill to cursor/codex/gemini-cli`

### Task 4: Generate plugin / slash-command artifacts

**Depends on:** Task 3 | **Files:** `.claude-plugin/commands/acceptance-eval.md`, `.cursor-plugin/commands/acceptance-eval.md`, `.gemini-extension/commands/acceptance-eval.md` (+ any agents/hooks deltas) | **Category:** integration

1. Confirm `packages/cli/dist/bin/harness.js` exists (the generator and the pre-commit hook need it). If missing, run `pnpm turbo build --filter=@harness-engineering/cli...` first.
2. Regenerate all derived plugin artifacts: `pnpm generate:plugin:all`.
3. Verify no drift: `pnpm generate:plugin:check` (this is what CI runs at ci.yml:76 — it must exit 0).
4. Confirm the new slash-command artifacts were produced:

```bash
ls .claude-plugin/commands/acceptance-eval.md \
   .cursor-plugin/commands/acceptance-eval.md \
   .gemini-extension/commands/acceptance-eval.md
```

(Note: `.codex-plugin` has no `commands/` dir — codex surfaces skills via AGENTS.md, which is regenerated by the Phase-4 persona step; absence of a codex command file here is expected.) 5. Stage the artifacts: `git add .claude-plugin .cursor-plugin .gemini-extension .codex-plugin`. 6. Run: `harness validate`. 7. Commit: `chore(acceptance-eval): regenerate plugin/slash-command artifacts`. If the pre-commit hook reformats or re-generates anything, re-run `git add` on the four plugin dirs and re-commit.

### Task 5: Full skill-catalog verification

**Depends on:** Task 4 | **Files:** none (verification only) | **Category:** integration

1. From `agents/skills/`, run the full catalog suite: `vitest run tests/structure.test.ts tests/platform-parity.test.ts tests/references.test.ts`. All pass.
2. Run the package script `pnpm test:platform-parity` from the repo root (this is the exact command CI runs at ci.yml:99).
3. Run `pnpm generate:plugin:check` once more (CI ci.yml:76) — exit 0.
4. Run: `harness validate`.
5. No commit (verification task); if any check fails, return to the relevant task.

### Task 6: Update phase handoff and session summary

**Depends on:** Task 5 | **Files:** `.harness/sessions/changes--harness-pm-persona--proposal/handoff.json` | **Category:** integration

1. Overwrite the session handoff with the Phase-3 result: `fromSkill: harness-execution`, `phase: "Phase 3 — skill (acceptance-eval)"`, `status: complete`, the four-platform file list, the generated-artifact list, `pending: [Phase 4: persona, Phase 5: docs/ADR]`, and the Concerns below.
2. Commit: `chore(acceptance-eval): record Phase 3 handoff`.

## Concerns (carry into execution + Phase 4/5)

- **No hardcoded skill-count test to bump.** `platform-parity.test.ts` compares platform counts to each other dynamically (currently 757 → 758 each); there is no `toBe(757)`-style assertion anywhere. This is unlike Phase 2, where the MCP-tool count was hardcoded in three places. The only count obligation is that **all four platform dirs stay equal** — copy to all four or parity fails.
- **`platforms` field diverges from `outcome-eval`.** This plan lists all four clients in `skill.yaml` (per the Phase-3 spec text), whereas `outcome-eval/skill.yaml` lists only `claude-code`. Both are schema-valid (`SkillMetadataSchema.platforms` is just an enum array; no test cross-checks the field against the on-disk dirs). Flagged in case a reviewer wants strict sibling parity — if so, set `platforms: [claude-code]` and re-copy.
- **Plugin-artifact drift is CI-enforced.** `pnpm generate:plugin:check` (ci.yml:76) fails on any drift; the pre-commit hook auto-regens + re-stages when `agents/skills/` is staged. Always commit the regenerated `.claude-plugin/.cursor-plugin/.gemini-extension/.codex-plugin` together with the skill, and re-add if the hook rewrites them.
- **Worktree/build hazards.** The pre-commit hook invokes `packages/cli/dist/bin/harness.js`; a `pnpm install` wipes `dist/` → `MODULE_NOT_FOUND` until `pnpm turbo build`. Concurrent automation can reset this worktree's HEAD or delete it, wiping uncommitted work. Commit after every task; if the worktree collapses, stage only these paths in the main checkout.
- **Codex has no slash-command artifact.** Codex surfaces skills through `AGENTS.md`, regenerated by the Phase-4 persona step (`harness generate-agent-definitions`). The skill alone produces no `.codex-plugin/commands/` entry — expected, not a miss.
- **Tier registry = the yaml field.** `tier: 2` in `skill.yaml` is the entire tier assignment; there is no separate tier index/registry file to edit.

```

```
