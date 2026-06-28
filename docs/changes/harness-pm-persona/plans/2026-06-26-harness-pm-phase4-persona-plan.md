# Plan: harness-pm Persona (Phase 4)

**Date:** 2026-06-26 | **Spec:** docs/changes/harness-pm-persona/proposal.md (Technical design → Persona; Phase 4) | **Tasks:** 2 | **Time:** ~9 min | **Integration Tier:** medium

## Goal

Add the `harness-pm` persona (the upstream twin of `outcome-eval`, backed by the
already-shipped `acceptance-eval` skill) and emit its agent definition across the
clients, so the persona loads against `PersonaSchema` and the committed plugin
agent artifacts stay in sync.

## Observable Truths (Acceptance Criteria)

1. `agents/personas/harness-pm.yaml` exists, is `version: 2`, name `Harness PM`,
   `skills: [acceptance-eval]`, and loads without error (no schema rejection from
   `PersonaSchema` in `packages/cli/src/persona/schema.ts`).
2. `node packages/cli/dist/bin/harness.js generate-agent-definitions --platforms claude-code,gemini-cli,cursor,codex --dry-run`
   reports `harness-harness-pm` as added/present for all four platforms (success
   criterion #5).
3. `packages/cli/tests/persona/builtins.test.ts` passes asserting **16** built-in
   personas (was 15).
4. `packages/cli/tests/commands/generate-agent-definitions.test.ts` passes
   asserting **16** generated agent files (was 15).
5. Committed plugin agent artifacts exist and are drift-free:
   `.claude-plugin/agents/harness-harness-pm.md` and
   `.cursor-plugin/agents/harness-harness-pm.md`; `pnpm generate:plugin:check`
   exits 0.
6. `harness validate` introduces no new failures beyond the pre-existing
   dashboard-CSS / drift-circular-dep issues.

## File Map

- CREATE `agents/personas/harness-pm.yaml`
- MODIFY `packages/cli/tests/persona/builtins.test.ts` (count 15 → 16, comment)
- MODIFY `packages/cli/tests/commands/generate-agent-definitions.test.ts` (count 15 → 16, comment)
- CREATE (generated) `.claude-plugin/agents/harness-harness-pm.md`
- CREATE (generated) `.cursor-plugin/agents/harness-harness-pm.md`
- MODIFY (generated, if manifest references agents) `.claude-plugin/*`, `.cursor-plugin/*` derived files captured by `git add .claude-plugin .cursor-plugin`

## Skeleton

Not produced — task count (2) is below the standard-rigor threshold (8).

## Background (grounding evidence)

- **Two generation systems.** `harness generate-agent-definitions` writes per-platform
  output to `agents/agents/<platform>` by default (uncommitted; dir does not exist).
  The **committed** persona agents are produced by `scripts/generate-plugin.mjs`
  (`pnpm generate:plugin:*`), which internally invokes `generate-agent-definitions`
  into a staging dir and copies results into `<plugin>/agents`
  (`scripts/generate-plugin.mjs:154-201`).
- **Only claude + cursor emit persona agents.** `agentPlatform` is set for
  `claude-code` and `cursor` and `undefined` for gemini/codex
  (`scripts/lib/plugin-config.mjs:19,35,55,75`). Gemini/codex surface personas as
  commands, not agent files — so "all four clients" is verified via
  `generate-agent-definitions --platforms ...,cursor,codex` (criterion #5) while
  committed agent files exist only under `.claude-plugin/agents/` and
  `.cursor-plugin/agents/`.
- **Agent filename is double-prefixed.** Generator computes
  `name = "harness-" + toKebabCase(persona.name)`
  (`packages/cli/src/agent-definitions/generator.ts:55-56`); `"Harness PM"` →
  `harness-harness-pm.md`. Expected, matches convention (cf. `harness-code-reviewer.md`).
- **Pre-commit hook will NOT auto-regenerate for a persona change.** The hook only
  regenerates plugin artifacts when staged paths match
  `^(agents/skills/|scripts/(generate-plugin|lib/plugin-config))` (`.husky/pre-commit`).
  A new file under `agents/personas/` does not match, so the executor MUST regenerate
  and stage plugin artifacts manually (Task 2).
- **Count assertions that break:** `builtins.test.ts:32-33` (`toBe(15)` + "= 15"
  comment) and `generate-agent-definitions.test.ts:96-97` (`toBe(15)` + comment).
- **AGENTS.md persona-count text** ("12 personas", AGENTS.md:19,109 — already stale
  vs 15) is **Phase 5 scope** per the spec; do NOT edit it in this plan.

## Tasks

### Task 1: Add harness-pm persona and fix count assertions

**Depends on:** none | **Files:** `agents/personas/harness-pm.yaml`, `packages/cli/tests/persona/builtins.test.ts`, `packages/cli/tests/commands/generate-agent-definitions.test.ts`

TDD red-green: bump the count assertions first (they go red against the current 15
personas), then add the persona to turn them green.

1. Edit `packages/cli/tests/persona/builtins.test.ts`: change the comment on the
   line beginning `// 12 core personas + 3 conditional review subagents` to read
   `// 12 core personas + 3 conditional review subagents + harness-pm = 16` and
   change `expect(result.value.length).toBe(15);` to
   `expect(result.value.length).toBe(16);`.
2. Edit `packages/cli/tests/commands/generate-agent-definitions.test.ts`: change
   the comment `// 12 core personas + 3 conditional review subagents = 15 agent files`
   to `// 12 core personas + 3 conditional review subagents + harness-pm = 16 agent files`
   and change `expect(results[0]!.added.length).toBe(15);` to
   `expect(results[0]!.added.length).toBe(16);`.
3. Run (observe RED — only 15 personas exist):
   `pnpm --filter @harness-engineering/cli test -- builtins generate-agent-definitions`
   (or `npx vitest run packages/cli/tests/persona/builtins.test.ts packages/cli/tests/commands/generate-agent-definitions.test.ts` from `packages/cli`).
4. Create `agents/personas/harness-pm.yaml` with EXACTLY this content (verbatim
   from the spec's Persona subsection):

   ```yaml
   version: 2
   name: Harness PM
   description: Owns acceptance-criteria and eval-coverage quality for specs
   role: >
     Owns acceptance-criteria and eval-coverage quality. Reviews every spec for
     measurable, testable, complete success criteria; flags user-visible behaviors
     with no covering test; blocks specs that ship with no measurable criteria.
     The upstream twin of the outcome-eval ship gate.
   skills:
     - acceptance-eval
   steps:
     - command: validate
       when: always
     - skill: acceptance-eval
       when: on_pr
       output: auto
     - skill: acceptance-eval
       when: manual
       output: auto
   triggers:
     - event: on_pr
       conditions:
         paths:
           - 'docs/changes/**'
     - event: manual
   config:
     severity: error
     autoFix: false
     timeout: 600000
   outputs:
     agents-md: true
     ci-workflow: true
     runtime-config: true
   ```

5. Verify it loads/validates against `PersonaSchema`:
   `node packages/cli/dist/bin/harness.js persona list` — confirm `Harness PM`
   appears (a schema-invalid persona would error or be omitted).
6. Run the same tests (observe GREEN):
   `npx vitest run packages/cli/tests/persona/builtins.test.ts packages/cli/tests/commands/generate-agent-definitions.test.ts`
   (from `packages/cli`).
7. Run: `node packages/cli/dist/bin/harness.js validate` (confirm no NEW failures
   vs the known pre-existing dashboard-CSS / drift-circular-dep issues).
8. Commit: `feat(persona): add harness-pm persona`
   (stage `agents/personas/harness-pm.yaml` and the two test files).

### Task 2: Regenerate and commit plugin agent artifacts

**Depends on:** Task 1 | **Files:** `.claude-plugin/agents/harness-harness-pm.md`, `.cursor-plugin/agents/harness-harness-pm.md` (+ any derived files under `.claude-plugin`/`.cursor-plugin`) | **Category:** integration

`[checkpoint:human-verify]` — after regeneration, confirm only the new
`harness-harness-pm` agent (and any deterministic manifest entry) changed, with no
unexpected churn across the other 15 agents.

1. Verify all-four-client emission (success criterion #5):
   `node packages/cli/dist/bin/harness.js generate-agent-definitions --platforms claude-code,gemini-cli,cursor,codex --dry-run`
   — confirm `harness-harness-pm` is reported (added) for each listed platform.
2. Regenerate committed plugin artifacts (the pre-commit hook will NOT do this for
   a persona-only change): `pnpm generate:plugin:all`.
3. Confirm new files exist:
   `ls .claude-plugin/agents/harness-harness-pm.md .cursor-plugin/agents/harness-harness-pm.md`.
4. Verify no drift remains: `pnpm generate:plugin:check` (must exit 0).
5. `[checkpoint:human-verify]` Review `git status --short .claude-plugin .cursor-plugin`
   and `git diff` — expect the two new agent files plus only deterministic manifest
   updates; pause for confirmation before staging.
6. Stage: `git add .claude-plugin .cursor-plugin`.
7. Run: `node packages/cli/dist/bin/harness.js validate` (no new failures).
8. Commit: `chore(persona): regenerate plugin agent artifacts for harness-pm`.

## Sequencing

- Task 1 (persona + test counts) before Task 2 (artifact regeneration depends on
  the persona existing). No parallelism (2 dependent tasks).

## Out of scope (deferred to Phase 5 per spec)

- `AGENTS.md` persona list + persona-count text updates.
- `outcome-eval` cross-link to its upstream twin.
- ADR recording D3.

## Concerns

1. **Manual plugin regen required.** `.husky/pre-commit` only auto-regenerates
   plugin artifacts when `agents/skills/` or `scripts/(generate-plugin|lib/plugin-config)`
   is staged. A persona-only change does not trigger it; Task 2 must regenerate and
   stage `.claude-plugin` + `.cursor-plugin` manually or CI `generate:plugin:check`
   will fail.
2. **Two count tests break** and must move 15 → 16 (`builtins.test.ts`,
   `generate-agent-definitions.test.ts`).
3. **Gemini/codex have no committed agent files** (`agentPlatform: undefined`);
   "all four clients" is verified via the `generate-agent-definitions` dry-run,
   not via committed `.gemini-extension`/`.codex-plugin` agents.
4. **Pre-existing `validate`/`check-deps` failures** (dashboard CSS tokens, drift &
   craft LLM circular deps) are unrelated to this phase and pre-date the branch.
