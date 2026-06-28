# Plan: harness-pm Persona — Phase 5 (Docs & ADR)

**Date:** 2026-06-26 | **Spec:** docs/changes/harness-pm-persona/proposal.md (Integration Points → Documentation Updates + Architectural Decisions; "Phase 5") | **Tasks:** 11 | **Time:** ~40 min | **Integration Tier:** large

## Goal

Land the documentation, ADR, spec-drift, and carry-forward polish for the harness-pm persona / acceptance-eval feature so the in-progress spec closes out with an accurate AGENTS.md, a recorded D3 decision, a reciprocal outcome-eval cross-reference, a drift-free proposal, and committed Phase 1-4 plan artifacts.

## Observable Truths (Acceptance Criteria)

1. AGENTS.md states "**16 personas**" at line 19 and line 109; the line-109 parenthetical enumerates all 16 persona slugs including `harness-pm`.
2. `docs/knowledge/decisions/0048-<slug>.md` exists with valid frontmatter (`number: 0048`, `tier: large`, `source: docs/changes/harness-pm-persona/proposal.md`) and Context/Decision/Consequences/Related sections recording D3 ("TS-derived authority extended to a pre-execution gate").
3. `agents/skills/*/outcome-eval/SKILL.md` (all 4 clients, byte-identical) contains a one-line note pointing to `acceptance-eval` as its **upstream** twin; regenerated plugin command artifacts reflect it.
4. `docs/changes/harness-pm-persona/proposal.md` no longer lists `path?` as an `acceptance_eval` MCP tool parameter (~line 114).
5. `packages/intelligence/tests/acceptance-eval/prompts.test.ts` asserts an (a) criteria-quality keyword (`/criteria|testable|observable/`); `packages/intelligence/tests/acceptance-eval/exports.test.ts` asserts `buildAcceptanceUserPrompt` + `ACCEPTANCE_EVAL_SYSTEM_PROMPT` resolve from `src/index.js`. Both files pass `vitest`.
6. `packages/intelligence/src/acceptance-eval/types.ts` carries a one-line (a)/(b)/(c) legend comment.
7. `packages/cli/src/mcp/tools/acceptance-eval.ts`: straight apostrophe at line ~47, header comment says `deriveAcceptanceAuthority` (line ~7-8), and the `testGlobs` schema description notes absolute globs are recommended.
8. `agents/skills/*/acceptance-eval/SKILL.md` (all 4 clients) findings example renders `criteriaFindings`/`coverageFindings` as `{target, message}` objects, not flat strings; regenerated plugin artifacts reflect it.
9. `pnpm generate:plugin:check` passes (artifacts in sync across `.claude-plugin`, `.cursor-plugin`, `.codex-plugin`); `references.test.ts` and `check-docs` pass.
10. Phase 1-4 plan files under `docs/changes/harness-pm-persona/plans/*.md` are committed to git, along with this plan and the ADR.
11. `harness validate` passes.

## Grounding (verified facts)

- **TRUE persona count = 16.** `agents/personas/*.yaml` = 16 files; `harness-pm.yaml` already present. AGENTS.md is stale at "12 personas" in two places.
- **AGENTS.md lines to fix:**
  - **Line 19** — "...dashboard, orchestrator), 741 skills (...), **12 personas**, 19 templates..." → `16 personas`.
  - **Line 109** — "`personas/ # 12 personas (architecture-enforcer, code-reviewer, codebase-health-analyst, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, performance-guardian, planner, security-reviewer, task-executor, verifier)`" → `16 personas (` + all 16 slugs. The current list omits `adversarial-reviewer`, `frontend-races-reviewer`, `harness-pm`, `typescript-strict-reviewer`.
  - No other persona-count phrasing in AGENTS.md (other persona mentions at 248/249/446/487/648 are descriptive, not counts).
  - The proposal's own "15 → 16" text is **correct** (15 was the real prior count; AGENTS.md just never updated from an earlier batch). Do NOT touch proposal persona counts.
- **ADR location/format:** `docs/knowledge/decisions/NNNN-<slug>.md`, 4-digit zero-padded; highest existing = `0047` → **next = 0048**. Frontmatter: `number, title, date, status, tier, source` (+ optional `supersedes`). Required sections: Context, Decision, Consequences (+ optional Related). Mirror `0038-execution-outcome-provenance-from-judgment.md` (the outcome-eval ADR).
- **Platform parity:** acceptance-eval and outcome-eval SKILL.md are byte-identical across all 4 client dirs (`claude-code`, `cursor`, `codex`, `gemini-cli`). Editing any SKILL.md requires identical edits in all 4 + `pnpm generate:plugin:all`. Tracked plugin artifacts: `.claude-plugin/commands/`, `.cursor-plugin/commands/`, `.codex-plugin/commands/` (gemini output not git-tracked). CI runs `generate:plugin:check`.
- **Doc-lint:** `agents/skills/tests/references.test.ts` validates `skill.yaml` schema (not SKILL.md prose) — prose edits are safe; still run it. `packages/cli/tests/commands/check-docs.test.ts` exists — run it.
- **Export names confirmed:** `src/index.ts` exports `ACCEPTANCE_EVAL_SYSTEM_PROMPT` and `buildUserPrompt as buildAcceptanceUserPrompt` (line 92-93). The carry-forward name `buildAcceptanceUserPrompt` is the barrel alias; the per-module name is `buildUserPrompt`.
- **Finding shape confirmed:** `types.ts` `Finding = { target: string; message: string }`. SKILL.md example currently shows flat strings (lines 67-68).
- **Build dependency:** `scripts/generate-plugin.mjs` uses `execFileSync`; run `pnpm build` (turbo) before plugin regen to avoid stale-dist MODULE_NOT_FOUND (known repo hazard after pnpm install).

## File Map

- MODIFY AGENTS.md (lines 19, 109)
- MODIFY docs/changes/harness-pm-persona/proposal.md (~line 114: remove `path?`)
- CREATE docs/knowledge/decisions/0048-acceptance-eval-ts-derived-authority-pre-execution-gate.md
- CREATE .changeset/harness-pm-phase5-polish.md
- MODIFY packages/intelligence/src/acceptance-eval/types.ts (legend comment)
- MODIFY packages/intelligence/tests/acceptance-eval/prompts.test.ts (criteria keyword assertion)
- MODIFY packages/intelligence/tests/acceptance-eval/exports.test.ts (barrel prompt-symbol assertions)
- MODIFY packages/cli/src/mcp/tools/acceptance-eval.ts (apostrophe, header, schema desc)
- MODIFY agents/skills/{claude-code,cursor,codex,gemini-cli}/acceptance-eval/SKILL.md (findings example object shape)
- MODIFY agents/skills/{claude-code,cursor,codex,gemini-cli}/outcome-eval/SKILL.md (upstream cross-ref note)
- MODIFY (regenerated) .claude-plugin/commands/{acceptance,outcome}-eval.md, .cursor-plugin/commands/_, .codex-plugin/commands/_
- COMMIT docs/changes/harness-pm-persona/plans/2026-06-26-harness-pm-phase{1,3,4}-\*.md (currently untracked)

## Skeleton (standard rigor, 11 tasks ≥ 8 → skeleton produced)

1. Docs & decisions: AGENTS.md count fix, proposal drift, ADR 0048 (~3 tasks, ~12 min)
2. Carry-forward code/test polish: changeset, types legend, intelligence tests, MCP tool (~4 tasks, ~14 min)
3. Skill cross-refs + parity regen: acceptance-eval findings, outcome-eval upstream note, build+regen+check (~3 tasks, ~12 min)
4. Commit plan artifacts (~1 task, ~2 min)

_Skeleton approved: pending human review of full plan._

## Tasks

### Task 1: Fix AGENTS.md persona count and list

**Depends on:** none | **Files:** AGENTS.md | **Category:** integration

1. Edit line 19: change `12 personas` → `16 personas`.
2. Edit line 109: change `12 personas (` and replace the parenthetical with all 16 slugs alphabetically:
   `16 personas (adversarial-reviewer, architecture-enforcer, code-reviewer, codebase-health-analyst, documentation-maintainer, entropy-cleaner, frontend-races-reviewer, graph-maintainer, harness-pm, parallel-coordinator, performance-guardian, planner, security-reviewer, task-executor, typescript-strict-reviewer, verifier)`
3. Run: `harness validate`
4. Commit: `docs(harness-pm): correct AGENTS.md persona count to 16 and add harness-pm`

### Task 2: Remove `path?` drift from proposal MCP tool subsection

**Depends on:** none | **Files:** docs/changes/harness-pm-persona/proposal.md

1. At ~line 114 ("### MCP tool" subsection), the params list reads `model?`, `path?` (project root for graph persistence, matching ...). Remove `path?` and its trailing parenthetical so only `model?` remains. The tool intentionally has no `path?` (decision C1 — no graph persistence in v1; the deferred seam is documented in the tool header).
2. Run: `harness validate`
3. Commit: `docs(harness-pm): drop stale path? from acceptance_eval MCP tool spec (C1)`

### Task 3: Write ADR 0048 recording D3

**Depends on:** none | **Files:** docs/knowledge/decisions/0048-acceptance-eval-ts-derived-authority-pre-execution-gate.md

1. Create the file mirroring `0038`'s frontmatter + section structure:

```markdown
---
number: 0048
title: TS-derived authority extended to a pre-execution acceptance gate
date: 2026-06-26
status: accepted
tier: large
source: docs/changes/harness-pm-persona/proposal.md
---

## Context

outcome-eval established that a judgment skill's merge `authority` is computed in
TypeScript from `(verdict, confidence)` and NEVER read from the LLM (ADR 0037,
tiered confidence-to-authority). acceptance-eval introduces the same discipline
at the OTHER end of the lifecycle — a PRE-execution gate over spec measurability,
before any work begins. The question (D3): should a pre-execution gate inherit
the TS-derived-authority contract, or may the LLM assert blocking/advisory for a
spec it just judged?

## Decision

acceptance-eval derives `authority` in TypeScript via `deriveAcceptanceAuthority(measurability, confidence)`,
identical in spirit to outcome-eval's `deriveAuthority`. The LLM returns only
`measurability / confidence / criteriaFindings / coverageFindings / rationale`;
`authority` is omitted from `acceptanceVerdictSchema` and computed after parse.
The gate is `blocking` IFF `measurability === 'NOT_MEASURABLE' && confidence === 'high'`;
every other combination (all INCONCLUSIVE, all MEASURABLE, all medium/low
NOT_MEASURABLE) is `advisory`. Provider failure / missing section / empty
evidence degrade to INCONCLUSIVE/low/advisory and never block.

## Consequences

**Positive:** one authority-derivation contract now spans both ends of the
lifecycle (acceptance before, outcome after); the gate cannot be talked out of
blocking by a model. Conservative confidence avoids taste-blocks-merge false
positives.

**Negative:** the pre-execution gate can only block on high-confidence
NOT_MEASURABLE; weak-but-present criteria pass as advisory by design.

**Neutral:** acceptance-eval reuses outcome-eval's `Confidence`/`JudgedAgainst`/
`Authority` types and section resolver rather than forking them.

## Related

- ADR 0037: tiered confidence-to-authority
- ADR 0038: execution_outcome provenance from a judgment skill
- [`docs/changes/harness-pm-persona/proposal.md`](../../changes/harness-pm-persona/proposal.md) Decision D3
- `packages/intelligence/src/acceptance-eval/authority.ts`, `packages/cli/src/mcp/tools/acceptance-eval.ts`
```

2. Run: `harness validate`
3. Commit: `docs(harness-pm): add ADR 0048 — TS-derived authority pre-execution gate`

### Task 4: Create patch changeset for cli + intelligence polish

**Depends on:** none | **Files:** .changeset/harness-pm-phase5-polish.md

1. Create the changeset (the MCP tool `description`/schema text is published surface; pre-commit enforces changesets on package source changes):

```markdown
---
'@harness-engineering/cli': patch
'@harness-engineering/intelligence': patch
---

acceptance-eval polish: clarify acceptance_eval MCP tool docs (straight quotes,
deriveAcceptanceAuthority reference, absolute-glob guidance), add an (a)/(b)/(c)
legend to the verdict types, and harden acceptance-eval prompt/export tests.
```

2. Run: `harness validate`
3. Commit: `chore(changeset): acceptance-eval phase5 polish (cli+intelligence patch)`

### Task 5: Add (a)/(b)/(c) legend comment to acceptance-eval types

**Depends on:** Task 4 | **Files:** packages/intelligence/src/acceptance-eval/types.ts

1. Add a one-line legend comment directly above `export type Measurability` (after the module docblock):
   `// Legend: (a) criteria quality · (b) test coverage · (c) measurability gate.`
2. Run: `pnpm --filter @harness-engineering/intelligence build` (typecheck-only change; ensure no parse break).
3. Run: `harness validate`
4. Commit: `docs(intelligence): add (a)/(b)/(c) legend to acceptance-eval types`

### Task 6: Harden acceptance-eval prompt + export tests

**Depends on:** Task 4 | **Files:** packages/intelligence/tests/acceptance-eval/prompts.test.ts, packages/intelligence/tests/acceptance-eval/exports.test.ts

1. In `prompts.test.ts`, inside the `'names the three responsibilities'` test, add an (a) criteria-quality keyword assertion:
   `expect(p).toMatch(/criteria|testable|observable/);`
2. In `exports.test.ts`, extend the imports from `'../../src/index.js'` to include `ACCEPTANCE_EVAL_SYSTEM_PROMPT` and `buildAcceptanceUserPrompt` (the barrel alias for `buildUserPrompt`), and add a test:
   ```ts
   it('re-exports the prompt builder and system prompt from the barrel', () => {
     expect(typeof buildAcceptanceUserPrompt).toBe('function');
     expect(typeof ACCEPTANCE_EVAL_SYSTEM_PROMPT).toBe('string');
     expect(ACCEPTANCE_EVAL_SYSTEM_PROMPT.length).toBeGreaterThan(0);
   });
   ```
3. Run: `npx vitest run packages/intelligence/tests/acceptance-eval/prompts.test.ts packages/intelligence/tests/acceptance-eval/exports.test.ts` — observe pass.
4. Run: `harness validate`
5. Commit: `test(intelligence): assert acceptance-eval criteria keyword and barrel prompt exports`

### Task 7: Fix acceptance_eval MCP tool docs

**Depends on:** Task 4 | **Files:** packages/cli/src/mcp/tools/acceptance-eval.ts

1. Line ~47: replace the curly apostrophe in `the spec’s` with a straight quote `the spec's`.
2. Line ~7-8: change header comment `(evaluate -> deriveAuthority)` → `(evaluate -> deriveAcceptanceAuthority)`.
3. In the `testGlobs` property `description` (lines ~65-67), append: ` Absolute globs are recommended; relative globs resolve against the MCP server cwd.`
4. Run: `pnpm --filter @harness-engineering/cli build`
5. Run: `npx vitest run packages/cli/tests/mcp` (confirm no MCP tool test regressions) and `harness validate`
6. Commit: `docs(cli): fix acceptance_eval MCP tool comments and testGlobs guidance`

### Task 8: Reflect Finding object shape in acceptance-eval SKILL.md (4 clients)

**Depends on:** none | **Files:** agents/skills/{claude-code,cursor,codex,gemini-cli}/acceptance-eval/SKILL.md

1. In the "NOT_MEASURABLE" example (lines ~67-68), change the flat-string `criteriaFindings` entry to the `{target, message}` object shape, e.g.:
   ```
   criteriaFindings:
     - { target: "'works well' / 'users are happy'", message: "No observable assertion — cannot be tested." }
   ```
2. In the measurable example prose (~line 78), ensure the `coverageFindings` entry is described as a `{target, message}` object (one covering-test gap), not a bare string.
3. Apply the **identical** edit to all 4 client files. Verify identity:
   `for c in cursor codex gemini-cli; do diff agents/skills/claude-code/acceptance-eval/SKILL.md agents/skills/$c/acceptance-eval/SKILL.md && echo "$c IDENTICAL"; done`
4. Run: `harness validate`
5. Commit: `docs(skills): show acceptance-eval findings as {target,message} objects (4 clients)`

### Task 9: Add upstream cross-ref to outcome-eval SKILL.md (4 clients)

**Depends on:** none | **Files:** agents/skills/{claude-code,cursor,codex,gemini-cli}/outcome-eval/SKILL.md

1. In the "Harness Integration" (or "Relationship") section of `outcome-eval/SKILL.md`, add a one-line reciprocal note:
   `- **Relationship to \`acceptance-eval\`:\*\* \`acceptance-eval\` is the upstream twin — it gates spec measurability before execution; \`outcome-eval\` judges implementation satisfaction after. The "authority is never read from the LLM" discipline spans both.`
   (acceptance-eval already points downstream; this adds the missing upstream pointer.)
2. Apply the **identical** edit to all 4 client files. Verify identity with the same diff loop.
3. Run: `harness validate`
4. Commit: `docs(skills): cross-reference acceptance-eval as outcome-eval upstream twin (4 clients)`

### Task 10: Build, regenerate plugin artifacts, verify parity + doc-lint

**Depends on:** Task 8, Task 9 | **Files:** .claude-plugin/commands/_, .cursor-plugin/commands/_, .codex-plugin/commands/\* | **Category:** integration

[checkpoint:human-verify]

1. Run: `pnpm build` (turbo — ensures dist is current before plugin regen; avoids stale-dist MODULE_NOT_FOUND).
2. Run: `pnpm generate:plugin:all`.
3. Run: `pnpm generate:plugin:check` — must report in-sync.
4. Run: `npx vitest run agents/skills/tests/references.test.ts packages/cli/tests/commands/check-docs.test.ts`.
5. Run: `harness validate`.
6. **Show the regenerated plugin artifact diff to the human** and confirm only acceptance-eval/outcome-eval command files changed (no unintended persona/skill artifact churn from concurrent automation).
7. Commit: `chore(plugin): regenerate command artifacts for acceptance/outcome-eval skill edits`

### Task 11: Commit Phase 1-4 plan artifacts and this plan + ADR

**Depends on:** Task 1-10 | **Files:** docs/changes/harness-pm-persona/plans/\*.md

1. Stage the currently-untracked plan files and this plan:
   `git add docs/changes/harness-pm-persona/plans/2026-06-26-harness-pm-phase1-intelligence-core-plan.md docs/changes/harness-pm-persona/plans/2026-06-26-harness-pm-phase3-skill-plan.md docs/changes/harness-pm-persona/plans/2026-06-26-harness-pm-phase4-persona-plan.md docs/changes/harness-pm-persona/plans/2026-06-26-harness-pm-phase5-docs-adr-plan.md`
   (The ADR from Task 3 is already committed.)
2. Run: `harness validate`
3. Commit: `docs(harness-pm): commit phase 1-5 plan artifacts`

## Sequencing Notes

- Tasks 1, 2, 3 (docs/ADR) and 8, 9 (skill edits) have no inter-dependencies and could be done in any order; ADR Task 3 should commit before Task 11 only because Task 11 finalizes the paper trail.
- Tasks 5, 6, 7 depend on Task 4 (changeset) only so package-source commits don't trip the changeset pre-commit hook.
- Task 10 must follow Tasks 8 and 9 (it regenerates artifacts from those SKILL.md edits).

## Uncertainties

- [ASSUMPTION] The changeset pre-commit hook fires on `packages/cli` + `packages/intelligence` source edits; Task 4 front-loads one changeset. If the hook does not require it for comment/test-only changes, Task 4 is harmless.
- [DEFERRABLE] Exact wording of the ADR title slug and the cross-ref sentence — finalize during execution.
- [ASSUMPTION] gemini-cli plugin output is not git-tracked (only `.claude-plugin`/`.cursor-plugin`/`.codex-plugin` are); `generate:plugin:check` is authoritative on what must be committed.
