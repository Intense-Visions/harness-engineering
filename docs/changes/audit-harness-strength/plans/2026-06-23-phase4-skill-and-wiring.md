# Plan: audit-harness-strength — Phase 4 (Skill and Wiring)

**Date:** 2026-06-23 | **Spec:** `docs/changes/audit-harness-strength/proposal.md` (§"Integration Points", Implementation Order Phase 4) | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** large

## Goal

Surface the (already-built and verified) `harness check-harness-strength` engine as an invocable, discoverable, documented skill: author `harness-audit-harness-strength` (SKILL.md + skill.yaml across all four platform dirs), regenerate slash commands and reference docs, wire it into AGENTS.md, and capture decision D1 as a standalone ADR.

## Scope Boundary

This plan covers Phase 4 ONLY. It does NOT include Phase 5 (dogfood verification / toolkit-mode run against this repo / fixture-lock). The core engine (Phases 1-2: `packages/core/src/harness-strength/`) and the CLI command (Phase 3: `packages/cli/src/commands/check-harness-strength.ts`, registered in `_registry.ts:107`) are DONE and verified — this plan does not modify them.

## Observable Truths (Acceptance Criteria)

1. **The system shall** expose a skill directory `agents/skills/claude-code/harness-audit-harness-strength/` containing `SKILL.md` and `skill.yaml`, byte-identical copies of which also exist under `agents/skills/{cursor,codex,gemini-cli}/harness-audit-harness-strength/` (matching the sibling convention proven for `detect-design-drift` and `harness-security-scan`).
2. **When** `harness skill validate` runs, it shall pass with zero errors for the new skill (skill.yaml has all required fields; SKILL.md has all required rigid-skill sections; `name` matches dir name; referenced tools exist).
3. **The system shall** render `SKILL.md` as a RIGID skill orchestrating the CLI command (not reimplementing detection), with phases SCAN -> DETECT -> SCORE/REPORT, documenting all 7 STRENGTH patterns (STRENGTH-001..007), with `## When to Use`, `## Process`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Success Criteria`, `## Evidence Requirements`, `## Harness Integration`, `## Examples` sections.
4. **When** `harness generate-slash-commands` runs after the skill is authored, the skill shall appear as a generated slash command (tier-2 skills are registered as slash commands per `docs/reference/skills-catalog.md` header).
5. **When** the CLI is built (`pnpm build`) and `harness generate-docs` runs, `docs/reference/cli-commands.md` shall contain a `### \`harness check-harness-strength\``entry and`docs/reference/skills-catalog.md`shall contain the`harness-audit-harness-strength` skill under Tier 2.
6. **The system shall** list `check-harness-strength` in the `_Validation & Checks:_` family in `AGENTS.md:435`, alphabetically between `check-docs` and `check-perf`.
7. **The system shall** contain a standalone ADR `docs/knowledge/decisions/0039-self-audit-skills-mechanically-enforced.md` capturing decision D1, referencing (not restating) the canonical D1 in the spec.
8. `harness validate` passes after all changes.
9. The existing `packages/cli/tests/integration/skill-catalog-consistency.test.ts` still passes (it is scoped to `initialize-harness-project` only — the new skill must not break it).

## File Map

```
CREATE agents/skills/claude-code/harness-audit-harness-strength/skill.yaml
CREATE agents/skills/claude-code/harness-audit-harness-strength/SKILL.md
CREATE agents/skills/cursor/harness-audit-harness-strength/skill.yaml         (copy)
CREATE agents/skills/cursor/harness-audit-harness-strength/SKILL.md           (copy)
CREATE agents/skills/codex/harness-audit-harness-strength/skill.yaml          (copy)
CREATE agents/skills/codex/harness-audit-harness-strength/SKILL.md            (copy)
CREATE agents/skills/gemini-cli/harness-audit-harness-strength/skill.yaml     (copy)
CREATE agents/skills/gemini-cli/harness-audit-harness-strength/SKILL.md       (copy)
CREATE docs/knowledge/decisions/0039-self-audit-skills-mechanically-enforced.md
MODIFY AGENTS.md (line ~435, check-* family list)
REGEN  agents/commands/** (via harness generate-slash-commands — do not hand-edit)
REGEN  docs/reference/cli-commands.md (via harness generate-docs — do not hand-edit)
REGEN  docs/reference/skills-catalog.md (via harness generate-docs — do not hand-edit)
```

## Skeleton

1. Author the skill (yaml + md) in claude-code dir, validate (~3 tasks, ~16 min)
2. Propagate to sibling platform dirs (~1 task, ~3 min)
3. Documentation + AGENTS.md + ADR (~2 tasks, ~10 min)
4. Regeneration + final validation (~3 tasks, ~9 min)

**Estimated total:** 9 tasks, ~38 min. _Skeleton approved: pending (standard rigor, 9 tasks >= 8 — present for approval before expansion)._

## Reference Inputs (verified during planning)

- **Template skills (mirror these):** `agents/skills/claude-code/harness-security-scan/SKILL.md` (rigid mechanical-scan skill that orchestrates a core scanner via CLI), `agents/skills/claude-code/detect-design-drift/SKILL.md` (rigid SCAN/APPLY/REPORT-phase verifier).
- **skill.yaml templates:** `agents/skills/claude-code/harness-security-scan/skill.yaml` (tier 2, type rigid, 4 platforms, tools Bash/Read/Glob/Grep, `cli.command`, `mcp.tool: run_skill`), `agents/skills/claude-code/detect-design-drift/skill.yaml` (cognitive_mode constructive-architect, phases list).
- **Authoring conventions:** `agents/skills/claude-code/harness-skill-authoring/SKILL.md` — Phase 5 lists required SKILL.md sections; rigid skills require `## Gates` and `## Escalation`.
- **ADR template:** `docs/knowledge/decisions/0034-review-depth-calibration-as-phase-3-5.md` — frontmatter (`number`, `title`, `date`, `status`, `tier`, `source`) + sections Context / Decision / Consequences / Alternatives considered / Implementation. Next free number: **0039**.
- **Rule metadata (verified from implemented rules, for SKILL.md pattern table):**
  | ID | gearPiece | Default severity |
  | --- | --- | --- |
  | STRENGTH-001 | `blocking-gate` | error |
  | STRENGTH-002 | `regression-baseline` | error |
  | STRENGTH-003 | `skip-discipline` | warning |
  | STRENGTH-004 | `architecture-thresholds` | error |
  | STRENGTH-005 | `tier-default` | warning |
  | STRENGTH-006 | `review-gate` | error |
  | STRENGTH-007 | `snapshot-honesty` | error |
- **Command CLI surface (verified `harness check-harness-strength --help` registered via `_registry.ts:107`):** options `--mode`, `--toolkit`/`--adopter`, `--severity <error|warning|info>` (default warning), `--report-only`, `--json`.

## Environment Preamble (run before every Bash task)

```bash
source ~/.nvm/nvm.sh && nvm use 22
```

Node 22 is required (default Node breaks `better-sqlite3` native ABI). Use the PATH binary `harness <cmd>` or `node packages/cli/dist/bin/harness.js <cmd>`. **`node packages/cli/dist/index.js` is a no-op — do not use it.**

---

## Tasks

### Task 1: Author `skill.yaml` for harness-audit-harness-strength

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-audit-harness-strength/skill.yaml`

1. Create `agents/skills/claude-code/harness-audit-harness-strength/skill.yaml` mirroring `harness-security-scan/skill.yaml` structure with these exact values:

```yaml
name: harness-audit-harness-strength
version: '0.1.0'
description: Mechanically audit a project's own harness setup against the seven STRENGTH failure patterns; reports per-pattern findings, a 0-100 strength score, and a tier label (solid/at-risk/theatre). Orchestrates harness check-harness-strength; never reimplements detection.
stability: draft
cognitive_mode: constructive-architect
triggers:
  - manual
  - on_milestone
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools:
  - Bash
  - Read
  - Grep
  - Glob
cli:
  command: harness skill run harness-audit-harness-strength
  args:
    - name: path
      description: Project root path
      required: false
    - name: mode
      description: 'adopter (default) or toolkit (auto-detected in a harness-distribution repo)'
      required: false
    - name: severity
      description: Minimum severity threshold (error, warning, info)
      required: false
    - name: report-only
      description: Soften exit to 0 even when error-severity findings exist
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-audit-harness-strength
    path: string
type: rigid
tier: 2
phases:
  - name: scan
    description: Resolve mode and run harness check-harness-strength against the target repo
    required: true
  - name: detect
    description: Interpret the 7 STRENGTH pattern findings with file-line evidence
    required: true
  - name: score_report
    description: Surface the 0-100 score, tier label, and per-pattern remediation
    required: true
state:
  persistent: false
  files: []
depends_on: []
```

2. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness skill validate` — observe it passes the yaml schema for the new skill (SKILL.md may fail until Task 2; that is expected — note the yaml-specific errors are clear).
3. Commit: `feat(audit-harness-strength): add skill.yaml metadata`

### Task 2: Author `SKILL.md` (rigid, SCAN->DETECT->SCORE/REPORT)

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/harness-audit-harness-strength/SKILL.md`

Create `agents/skills/claude-code/harness-audit-harness-strength/SKILL.md` mirroring the rigor of `harness-security-scan/SKILL.md` and `detect-design-drift/SKILL.md`. The skill ORCHESTRATES the command — it must not describe reimplementing detection logic. Required sections (validated by `harness skill validate` for rigid skills): `## When to Use`, `## Process` (with the three phases), `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Success Criteria`, `## Evidence Requirements`, `## Harness Integration`, `## Examples`. Author with this content (expand prose to match sibling depth):

1. Title + one-line blockquote: `# Harness Audit: Harness Strength` / `> Mechanically audit whether a project's harness is load-bearing. Orchestrates the deterministic check-harness-strength engine; interprets results. Not a deep/AI review.`
2. `## When to Use` — positive: on a milestone gate, when adding the audit as a required CI check, when validating a harness-distribution repo before shipping templates downstream. Negative: NOT for deep security review (use harness-security-review), NOT for design drift (use detect-design-drift), NOT for reimplementing pattern detection (the engine owns that).
3. `## Process` with three phases:
   - **Phase 1: SCAN — Run the engine.** Resolve project root. Resolve mode (explicit `--toolkit`/`--adopter`; else auto-detect toolkit when both `templates/` and `agents/skills/` exist; else adopter). Invoke `harness check-harness-strength [--mode <m>] [--severity <s>] [--report-only] --json` via Bash. Do NOT inspect config files by hand — the engine reads them once.
   - **Phase 2: DETECT — Interpret findings.** Map each finding to its STRENGTH pattern. Include this verbatim pattern table (the 7 patterns with gearPiece + default severity from the Reference Inputs table above, plus the one-line pattern description from spec §"Severity defaults"):
     | ID | Gear piece | Pattern | Default |
     | --- | --- | --- | --- |
     | STRENGTH-001 | blocking-gate | Hook documented "never blocks"/"always exits 0" in an active profile | error |
     | STRENGTH-002 | regression-baseline | Pre-commit auto-updates baselines/thresholds on regression | error |
     | STRENGTH-003 | skip-discipline | `--skip` list > 2 categories without inline justification | warning |
     | STRENGTH-004 | architecture-thresholds | `layers` defined but `architecture.thresholds` empty/absent | error |
     | STRENGTH-005 | tier-default | Init/config defaults to lowest tier (`basic`) | warning |
     | STRENGTH-006 | review-gate | Baseline-update PR auto-approved without independent review | error |
     | STRENGTH-007 | snapshot-honesty | `passed:true` in health snapshot whose `signals[]` names that check | error |
   - **Phase 3: SCORE/REPORT.** Surface the 0-100 score, tier label (`solid >= 85`, `at-risk 50-84`, `theatre < 50`), per-pattern breakdown, and the engine's remediation strings. Report format block mirroring harness-security-scan's report block.
4. `## Gates` — Error-severity findings are blocking (exit non-zero) unless `--report-only`. No reimplementation: the skill must run the command, never hand-grep configs. "Not evaluable" (absent input) is NOT a pass — surface it as-is.
5. `## Escalation` — false positives: document via config severity override `audit.harnessStrength.severities`, not by suppressing. Engine missing a known weakness: file a new StrengthRule (engine work, out of skill scope).
6. `## Rationalizations to Reject` — Universal three (from sibling skills) + domain table: "The config looks fine when I read it" -> the engine exists because manual reading misses these; run it. "It only warns, not errors, so it is fine" -> warns-but-doesn't-stop IS STRENGTH-001 — the recursion item; do not normalize it. "I'll re-grep the hooks myself to double-check" -> reimplementing detection violates D1; trust and interpret the engine output.
7. `## Success Criteria` — engine ran and produced score+tier+findings; findings interpreted against the 7-pattern table; exit code reflects pass/fail; no manual config inspection substituted for the engine.
8. `## Evidence Requirements` — copy the four-bullet block + `[UNVERIFIED]` rule from `harness-security-scan/SKILL.md:64-75`.
9. `## Harness Integration` — `harness check-harness-strength` (the command this skill runs), `HarnessStrengthAuditor` (core class from `@harness-engineering/core`), `harness.config.json` -> `audit.harnessStrength.severities` (severity overrides), cross-link to `docs/standard/article-failure-patterns.md` (note: downstream item, may not exist yet).
10. `## Examples` — at least: a clean toolkit-mode run (PASS, score ~100, solid) and a findings run (FAIL, lists STRENGTH-001 + STRENGTH-004 with file:line + remediation), mirroring harness-security-scan's two examples.
11. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness skill validate` — observe zero errors for `harness-audit-harness-strength`.
12. Commit: `feat(audit-harness-strength): add rigid SKILL.md orchestrating the engine`

### Task 3: Add skill test scenarios block to SKILL.md

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-audit-harness-strength/SKILL.md`

1. Per harness-skill-authoring Phase 5B, append a `## Skill Test Scenarios` comment block at the end of SKILL.md with three scenarios: (1) Red Flag — agent about to hand-grep `.husky/pre-commit` instead of running the engine; (2) Rationalization — "it only warns, not errors, so it is fine"; (3) Gate — an error-severity STRENGTH-001 finding present without `--report-only`, agent must not report PASS.
2. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness skill validate` — still passes.
3. Commit: `docs(audit-harness-strength): add skill test scenarios`

### Task 4: Propagate skill to cursor/codex/gemini-cli platform dirs

**Depends on:** Task 3 | **Files:** `agents/skills/{cursor,codex,gemini-cli}/harness-audit-harness-strength/{skill.yaml,SKILL.md}`

Sibling skills (`detect-design-drift`, `harness-security-scan`) keep byte-identical `skill.yaml` and `SKILL.md` copies in all four platform dirs (verified during planning). Replicate that convention.

1. Create the three sibling dirs and copy both files verbatim from the claude-code dir. Use Node (cross-platform; avoid `cp -r` per platform-parity test) or the Write tool to duplicate. Example Bash (acceptable here — file copy, not a committed script):

```bash
source ~/.nvm/nvm.sh && nvm use 22
node -e "const fs=require('fs');const s='agents/skills/claude-code/harness-audit-harness-strength';for(const p of ['cursor','codex','gemini-cli']){const d='agents/skills/'+p+'/harness-audit-harness-strength';fs.mkdirSync(d,{recursive:true});for(const f of ['skill.yaml','SKILL.md'])fs.copyFileSync(s+'/'+f,d+'/'+f);}"
```

2. Verify identical: `for p in cursor codex gemini-cli; do diff agents/skills/claude-code/harness-audit-harness-strength/SKILL.md agents/skills/$p/harness-audit-harness-strength/SKILL.md && echo "$p ok"; done`
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness skill validate` — all four pass.
4. Commit: `feat(audit-harness-strength): propagate skill to cursor/codex/gemini-cli`

### Task 5: Write the D1 ADR

**Depends on:** none (parallelizable with Tasks 1-4) | **Files:** `docs/knowledge/decisions/0039-self-audit-skills-mechanically-enforced.md`

1. Create `docs/knowledge/decisions/0039-self-audit-skills-mechanically-enforced.md` mirroring `0034-...md` format:
   - Frontmatter: `number: 0039`, `title: Self-audit skills must be mechanically enforced, not prose`, `date: 2026-06-23`, `status: accepted`, `tier: medium`, `source: docs/changes/audit-harness-strength/proposal.md`.
   - `## Context` — a prose-only self-audit fails its own STRENGTH-001 ("warns but doesn't stop" / "self-audit-as-marketing"). Reference the spec's canonical D1 and the v5.0 roadmap distinction; do NOT restate D1 at length — link to `docs/changes/audit-harness-strength/proposal.md` decision D1.
   - `## Decision` — Self-audit skills are implemented as a deterministic core engine + CLI command; the SKILL.md orchestrates and interprets, never reimplements detection. Sets the precedent for future audit skills. Matches `STRATEGY.md#our-approach` (constraints-as-code over prompts-and-conventions).
   - `## Consequences` — Positive: the recursion item survives being pointed at itself; patterns are unit-testable. Negative: more upfront engineering than a prose skill; the engine and skill must stay in sync (mitigated: SKILL.md has no detection logic to drift).
   - `## Alternatives considered` — Prose-only SKILL.md (rejected: fails STRENGTH-001). Engine without a skill (rejected: not discoverable/invocable by agents).
   - `## Implementation` — `packages/core/src/harness-strength/` (auditor, rules, scoring); `packages/cli/src/commands/check-harness-strength.ts`; `agents/skills/claude-code/harness-audit-harness-strength/`.
2. Commit: `docs(decisions): add ADR 0039 self-audit skills mechanically enforced`

### Task 6: Wire check-harness-strength into AGENTS.md check-\* family

**Depends on:** none (parallelizable) | **Files:** `AGENTS.md`

1. Edit `AGENTS.md` line ~435, the `_Validation & Checks:_` line. Insert `check-harness-strength` alphabetically between `check-docs` and `check-perf`. Current: `... \`check-design\`, \`check-docs\`, \`check-perf\`, ...`->`... \`check-design\`, \`check-docs\`, \`check-harness-strength\`, \`check-perf\`, ...`. (Alphabetical: docs < harness-strength < perf, since 'h' < 'p'.)
2. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
3. Commit: `docs(agents): list check-harness-strength in validation family`

### Task 7: Build the CLI so regen picks up the new command

**Depends on:** none (must run before Task 8) | **Files:** none (build artifacts only)

The new command is registered in source but NOT in `packages/cli/dist/index.js` (verified during planning: `grep -c check-harness-strength dist/index.js` = 0). `scripts/generate-docs.mjs` imports the built dist (`packages/cli/dist/index.js:39`), so `cli-commands.md` regen will MISS the command unless the CLI is rebuilt first.

1. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm build` (or the package-scoped build for `@harness-engineering/cli`).
2. Verify: `grep -c "check-harness-strength" packages/cli/dist/index.js` returns >= 1.
3. No commit (dist is build output; follow repo convention — if dist is gitignored, nothing to commit; if tracked, commit `chore(cli): rebuild dist with check-harness-strength`).

### Task 8: Regenerate slash commands and reference docs

**Depends on:** Task 4, Task 7 | **Files:** `agents/commands/**`, `docs/reference/cli-commands.md`, `docs/reference/skills-catalog.md` (all regenerated — do not hand-edit)

1. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness generate-slash-commands` (default platforms claude-code,gemini-cli; add `--platforms claude-code,gemini-cli,cursor,codex` if siblings need command artifacts — confirm against how sibling skills' commands are generated; use `--dry-run` first to preview).
2. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm run generate-docs` — regenerates `docs/reference/skills-catalog.md` (from skill.yaml) and `docs/reference/cli-commands.md` (from built dist).
3. Verify: `grep -c "harness-audit-harness-strength" docs/reference/skills-catalog.md` >= 1 AND `grep -c "check-harness-strength" docs/reference/cli-commands.md` >= 1.
4. Note: `harness generate-agent-definitions` generates from PERSONAS, not skills (verified: command help says "from personas"). It is a no-op for this skill addition unless a persona references the skill. SKIP it unless verification in step 3 reveals an agent-definition dependency.
5. Commit: `chore(audit-harness-strength): regenerate slash commands and reference docs`

### Task 9: Final validation

**Depends on:** Tasks 1-8 | **Files:** none

1. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness skill validate` — all four skill copies pass.
2. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && pnpm vitest run packages/cli/tests/integration/skill-catalog-consistency.test.ts` — still green (it is scoped to initialize-harness-project; the new skill must not break it).
4. **[checkpoint:human-verify]** Show: `harness check-harness-strength --json` output, the generated skills-catalog entry, the cli-commands entry, and the ADR. Confirm Phase 4 wiring is complete and Phase 5 (dogfood verification / fixture-lock) is correctly deferred.
5. **Pre-commit note:** the pre-commit hook auto-mutates `docs/roadmap.md` and `packages/cli/.harness/arch/baselines.json` — leave those unstaged; do not include them in Phase 4 commits.

---

## Sequencing & Parallelism

- Tasks 1 -> 2 -> 3 -> 4 are strictly sequential (yaml before md before scenarios before copy).
- Tasks 5 (ADR) and 6 (AGENTS.md) are independent — parallelizable with the 1-4 chain.
- Task 7 (build) must precede Task 8 (regen) — this is the load-bearing ordering finding.
- Task 8 depends on both Task 4 (skill copies present) and Task 7 (built dist).
- Task 9 is the final gate.

## Uncertainties

- [ASSUMPTION] `harness generate-slash-commands` default platforms (claude-code,gemini-cli) are sufficient for tier-2 invocability; cursor/codex command artifacts may need `--platforms` expansion. Task 8 step 1 uses `--dry-run` to confirm before writing. If wrong, only Task 8's flag changes.
- [ASSUMPTION] `pnpm build` is the correct full build; if only the CLI package needs building, a scoped `pnpm --filter @harness-engineering/cli build` suffices. Either satisfies Task 7's verification.
- [DEFERRABLE] Exact prose depth of SKILL.md sections — gated by `harness skill validate` (presence) and human review at checkpoint, not by an exact string match.
- [DEFERRABLE] Whether `docs/standard/article-failure-patterns.md` cross-link in Harness Integration should be a live link or a "(forthcoming)" note — it is a downstream blocked item; note it as forthcoming.

## Concerns (carried to handoff)

1. **Build-before-regen ordering is load-bearing.** `generate-docs.mjs` imports `packages/cli/dist/index.js`; `check-harness-strength` is NOT in the current dist. If the executor runs `generate-docs` before `pnpm build`, `cli-commands.md` silently omits the command (the script catches the error and prints "CLI reference skipped" — easy to miss). Task 7 exists to prevent this.
2. **No master skill catalog requires manual registration.** `docs/reference/skills-catalog.md` is fully generated from `skill.yaml` files in `agents/skills/claude-code/` — no hand-maintained index. The `skill-catalog-consistency.test.ts` is scoped only to `initialize-harness-project`, so the new skill does not need an entry there and will not break it. Confirmed during planning.
3. **`generate-agent-definitions` is likely a no-op** for a skill addition — it generates from personas, not skills. The spec names it under "Registrations required" but the actual invocability path is `generate-slash-commands` + `generate-docs`. Task 8 step 4 documents this; verify no persona references the skill.
4. **Cross-platform skill copies are a convention, not test-enforced.** The `platform-parity.test.ts` checks shell-script portability, not per-skill platform-dir parity. Copies are kept byte-identical by hand (no sync script exists). Task 4 replicates the convention to match siblings; if the team prefers claude-code-only (skill.yaml `platforms` would then list only `claude-code`), Task 4 can be dropped — flag at review.
5. **ADR number collision risk.** 0039 is free at planning time; if a parallel branch claims it, bump to the next free number.
