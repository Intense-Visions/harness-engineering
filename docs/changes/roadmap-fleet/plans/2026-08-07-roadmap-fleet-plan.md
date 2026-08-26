# Plan: roadmap-fleet skill

**Date:** 2026-08-07 · **Spec:** `docs/changes/roadmap-fleet/proposal.md` · **Tasks:** 19 · **Time:** ~85 min · **Integration Tier:** large

## Goal

Author the `roadmap-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) that turns a confirmed batch of backlog candidates into up to N verified, merge-ready PRs through a five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT loop, plus its two governing ADRs, platform symlinks, and regenerated docs.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate roadmap-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist).
2. `agents/skills/claude-code/roadmap-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative), `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Examples`.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the three universal filler rows) — the parity validator passes.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects).
5. `agents/skills/{codex,cursor,gemini-cli}/roadmap-fleet` each resolve as symlinks to `../claude-code/roadmap-fleet`.
6. `pnpm generate:plugin:check` exits 0 (generated plugin artifacts are consistent with the new skill; no write-mode generate:plugin was run in the worktree).
7. `docs/reference/skills-catalog.md` is regenerated (`pnpm run generate-docs`) and lists `roadmap-fleet`.
8. Two ADRs exist: `docs/knowledge/decisions/0087-subagent-fanout-vs-workflow-primitive.md` and `docs/knowledge/decisions/0088-front-load-park-unforeseen-interaction-model.md`, each with the repo ADR frontmatter + Context/Decision/Consequences/Alternatives Considered/References.
9. A short `-fleet` family docs section exists with cross-links to the two ADRs and to the family conveyor position (build stage).
10. `pnpm format:check` reports no formatting diffs for the created/edited files.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli`. There is **no** `agents/skills/antigravity/` source dir — `antigravity` exists only as a `generate:plugin` target. The spec's "codex/cursor/gemini/antigravity" symlink list is therefore satisfied by three source symlinks; antigravity coverage flows through plugin generation, not a skill symlink. Flagged as a concern.
- [ASSUMPTION] Next free ADR numbers are 0087 and 0088 (highest existing is 0086). If a concurrent branch claims them, renumber per ADR-0022 convention.
- [DEFERRABLE] Exact wording of per-phase prose and example transcripts — finalized during authoring, does not change task structure.
- [DEFERRABLE] `skill.yaml` `tier` value — Tier 2 (orchestrator, mirrors harness-audit) assumed; confirm during validate.

## File Map

- CREATE `agents/skills/claude-code/roadmap-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/roadmap-fleet/SKILL.md`
- CREATE `agents/skills/codex/roadmap-fleet` (symlink → `../claude-code/roadmap-fleet`)
- CREATE `agents/skills/cursor/roadmap-fleet` (symlink → `../claude-code/roadmap-fleet`)
- CREATE `agents/skills/gemini-cli/roadmap-fleet` (symlink → `../claude-code/roadmap-fleet`)
- CREATE `docs/knowledge/decisions/0087-subagent-fanout-vs-workflow-primitive.md`
- CREATE `docs/knowledge/decisions/0088-front-load-park-unforeseen-interaction-model.md`
- MODIFY `docs/reference/skills-catalog.md` (regenerated — do not hand-edit)
- MODIFY (or CREATE) a `-fleet` family docs section — `docs/guides/features-overview.md` (append a `-fleet` family subsection) and/or a short family page under `docs/guides/`
- MODIFY generated plugin artifacts only via `generate:plugin:check` verification (no write-mode run in the worktree)

## Skeleton

1. Foundation — skill dir, `skill.yaml`, SKILL heading + When to Use (~2 tasks, ~9 min)
2. Phase 1 SELECT + CONFIRM prose (~2 tasks, ~10 min)
3. Phase 2 DISPATCH prose (~1 task, ~6 min)
4. Phase 3 VERIFY + REPORT prose (~2 tasks, ~10 min)
5. Phase 4 discipline — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Examples + test scenarios (~4 tasks, ~20 min)
6. Registration + regen — validate, symlinks, plugin:check, catalog regen, family docs (~5 tasks, ~18 min)
7. ADRs + final sweep — 2 ADRs, prettier/format:check/validate sweep (~3 tasks, ~12 min)

**Estimated total:** 19 tasks, ~85 minutes.

_Skeleton approved: pending — thorough rigor requires sign-off before expansion. `[checkpoint:decision]`_

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. There is no code-level TDD; the verification equivalents are `harness skill validate roadmap-fleet` (schema + section parity), the Phase 5B mental test scenarios embedded in SKILL.md, `pnpm generate:plugin:check`, and `pnpm format:check`. Every authoring task's acceptance check names the concrete gate that proves it.
- **Never run write-mode `pnpm generate:plugin` in this worktree** — it is destructive here. Use `pnpm generate:plugin:check` only.
- **Never `--no-verify`.** Worktrees nested under `.claude/` break the local `check-docs` push gate (self-excludes → scans zero files); if a push is later needed, use a non-`.claude` throwaway worktree or the GitHub API. Not in scope for this authoring plan.
- **No internal roadmap/PR/issue numbers** anywhere in `SKILL.md` or `skill.yaml` — the skill ships to adopter projects.
- Reference shapes: `agents/skills/claude-code/harness-audit/{SKILL.md,skill.yaml}` (orchestrator fan-out precedent) and `agents/skills/claude-code/harness-skill-authoring/SKILL.md` (required-section rules).

## Tasks

### Task 1: Scaffold skill directory and author `skill.yaml`

**Depends on:** none · **Files:** `agents/skills/claude-code/roadmap-fleet/skill.yaml`

Create the directory `agents/skills/claude-code/roadmap-fleet/` and author `skill.yaml` modeled on `harness-audit/skill.yaml`. Required fields:

- `name: roadmap-fleet` (must match dir), `version: '1.0.0'`, one-line `description` (no internal numbers).
- `stability`, `cognitive_mode: systematic-orchestrator`, `triggers: [manual]`.
- `platforms: [claude-code, codex, cursor, gemini-cli]`.
- `tools: [Bash, Read, Glob, Grep]` (plus any MCP tool names it orchestrates, e.g. `manage_roadmap`, `run_skill` if the schema lists them — confirm against harness-audit shape).
- `cli.command: harness skill run roadmap-fleet` with args (e.g. `--concurrency`, `--report-only`, `--dry-run` as applicable).
- `mcp.tool: run_skill` / `input.skill: roadmap-fleet`.
- `type: rigid`, `tier: 2`.
- `phases:` five entries — `select`, `confirm`, `dispatch`, `verify`, `report` (all `required: true`), each with a one-line description.
- `state: { persistent: false, files: [] }`.
- `depends_on: [harness-roadmap-pilot, harness-brainstorming, harness-autopilot, harness-code-review]` (verify each exists as a skill dir).
- `capabilities` block mirroring harness-audit.

**Acceptance:** YAML parses; `name` equals directory name; every `depends_on` entry resolves to an existing `agents/skills/claude-code/<name>/` dir.

### Task 2: SKILL.md heading, summary, When to Use, and inputs/Flags

**Depends on:** Task 1 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Author the top of SKILL.md: `# Roadmap Fleet`, a one-sentence `>` summary, `## When to Use` (positive: batch of independent backlog candidates needing autonomous build + bulk review; negative: single item → use brainstorming/autopilot directly; landing PRs → pr-fleet; convergence on one target → a pipeline, not a fleet), and an optional `## Flags`/inputs subsection documenting concurrency cap (~2–3), report-only, and the propose-and-confirm batch.

**Acceptance:** `## When to Use` present with both positive and negative bullets; no internal numbers.

### Task 3: Process — Iron Law + Phase 1 SELECT

**Depends on:** Task 2 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `## Process`, an `### Iron Law` (e.g. "Every PR ships only after independent artifact + all-OS-CI verification; the fleet never auto-merges and never trusts subagent self-report"), then `### Phase 1: SELECT`. SELECT prose must instruct: enumerate open external issues via `gh` and unblocked roadmap shards via `manage_roadmap`; cross-check each candidate against merged/open PRs; mark already-resolved items for closure (not rebuild); score and order via `roadmap-pilot`'s impact scoring; define the **Candidate** record (source, id, title, score, cross-check result / resolving PR, already-resolved flag, detected decision forks).

**Acceptance:** Phase 1 names `gh`, `manage_roadmap`, `roadmap-pilot` scoring, and the Candidate record fields.

### Task 4: Process — Phase 2 CONFIRM (single up-front gate)

**Depends on:** Task 3 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `### Phase 2: CONFIRM`. Prose: present the ranked batch in one round — already-resolved items flagged for closure, known decision forks as multiple-choice questions, proposed concurrency stated; human approves or trims; this is the only guaranteed human touchpoint before review; answered forks are fed into DISPATCH briefs. Emphasize front-load + propose-and-confirm (Decisions 1 and 3). Mark the confirmation as `[checkpoint:human-verify]` within the skill's own flow.

**Acceptance:** Phase 2 states "single/only up-front human touchpoint" and describes fork answering + concurrency proposal in the same gate.

### Task 5: Process — Phase 3 DISPATCH (worktree fan-out, governor, fork-parking)

**Depends on:** Task 4 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `### Phase 3: DISPATCH`. Prose: for each confirmed item spawn a worktree-isolated subagent briefed to run the **real** `harness-brainstorming` then `harness-autopilot` (autonomous mode) for that one item; feed answered forks into the brief; cap concurrency at ~2–3 (the machine-storm limit); if an item hits an **unforeseen** fork it **parks and reports** without blocking the batch (Decision 1 park-unforeseen). Include the push-path caveat: subagents must not push from a `.claude/`-nested worktree (breaks `check-docs`); use GitHub API or a non-`.claude` throwaway worktree; never `--no-verify`.

**Acceptance:** Phase 3 names real brainstorming+autopilot dogfood, the ~2–3 concurrency governor, fork-parking, and the push-path caveat.

### Task 6: Process — Phase 4 VERIFY (independent, never self-report)

**Depends on:** Task 5 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `### Phase 4: VERIFY`. Prose: for each returned branch, independently confirm (never by subagent self-report) that the plan artifact `docs/changes/<slug>/plans/` and an autopilot-state exist, and that CI is green on all three OS plus the project's required checks. An item lacking a plan artifact did not run the real pipeline → reject or retry. This encodes the "verify adherence by artifact" hard invariant (Decision 5).

**Acceptance:** Phase 4 requires both the `plans/` artifact and autopilot-state, all-three-OS + enforce + harness CI, and explicitly forbids self-report.

### Task 7: Process — Phase 5 REPORT (batch summary + already-resolved closure)

**Depends on:** Task 6 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `### Phase 5: REPORT`. Prose: emit a batch summary table (one row per item — PR link, verdict, assumptions-made note, any parked forks) for bulk human review; close already-resolved issues with accurate comments citing the resolving PR; never merge. Reinforce the per-PR "assumptions made" note requirement (Decision 1) and graceful degradation (missing roadmap / missing gh auth / single failed item → reported, batch continues).

**Acceptance:** Phase 5 defines the one-row-per-item report with assumptions note, already-resolved closure with resolving-PR citation, and "never merge".

### Task 8: `## Harness Integration` + `## Success Criteria`

**Depends on:** Task 7 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `## Harness Integration` (list every harness/CLI/MCP touchpoint: `manage_roadmap`, `roadmap-pilot` scoring, `run_skill`/`harness skill run` for subagent pipelines, `gh` for issues/PRs, `harness skill validate` for authoring) and `## Success Criteria` (mirror the spec's Success Criteria as observable, verifiable bullets — N candidates → up to N verified PRs, exactly one up-front round, assumptions note on every PR, resolved items closed not rebuilt, never auto-merge, graceful degradation, validate passes + docs regenerated + all-OS CI green).

**Acceptance:** Both sections present; each success criterion is observable/verifiable.

### Task 9: `## Gates` + `## Escalation` (rigid-required)

**Depends on:** Task 8 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `## Gates` (hard stops with consequences: no PR is "merge-ready" without a verified plan artifact + all-OS-CI green; never auto-merge a feature PR; concurrency must not exceed the cap; a subagent self-report is never accepted as verification) and `## Escalation` (symptom→cause→report for: missing roadmap, missing `gh` auth, a subagent that produced no plan artifact, an item that parks on an unforeseen fork, CI red on a subset of OS).

**Acceptance:** Both sections present with concrete conditions/consequences; `harness skill validate` will require these for `type: rigid`.

### Task 10: `## Rationalizations to Reject` (domain-specific, parity-enforced)

**Depends on:** Task 9 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Author 4–6 domain-specific rows (`| Rationalization | Reality |`). Examples of the domain shortcuts to reject: "The subagent said its pipeline ran, so it did" → verify the `plans/` artifact independently; "CI is green on Linux, ship it" → all three OS plus enforce and harness must be green; "This item's fork is small, I'll just guess and keep going" → unforeseen forks park and report, they do not get silently guessed mid-flight; "I'll hand-implement this one item, it's faster than the pipeline" → dogfood the real per-item skills, no short-cut; "The batch is ready, I'll merge them to save the human a step" → never auto-merge, the human lands the batch. Do NOT include the three universal filler rows.

**Acceptance:** 3–8 domain rows, none matching the universal filler; parity validator passes.

### Task 11: `## Examples` + `## Red Flags` + Phase 5B test scenarios

**Depends on:** Task 10 · **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

Add `## Examples` (at least one end-to-end walkthrough: ~6 candidates enumerated, one flagged already-resolved and closed, two forks answered in CONFIRM, DISPATCH at concurrency 2, one item parks on an unforeseen fork, VERIFY rejects one item lacking a plan artifact, REPORT emits the table). Optionally add `## Red Flags`. Append a Phase 5B test-scenarios block: one scenario each triggering a Gate (self-report accepted → halt), a Rationalization (hand-implement one item → rejected), and the park-unforeseen path.

**Acceptance:** At least one full example with realistic paths/commands and no internal numbers; test-scenarios block present.

### Task 12: Validate the skill — `harness skill validate roadmap-fleet` EXIT 0

**Depends on:** Task 11 · **Files:** `agents/skills/claude-code/roadmap-fleet/{SKILL.md,skill.yaml}` · **Category:** integration · `[checkpoint:human-verify]`

Run `harness skill validate roadmap-fleet`. Fix any errors (missing section, name mismatch, invalid trigger/tool, missing dependency, rigid sections absent). Re-run until EXIT 0. Then grep the skill body to confirm zero internal roadmap/PR/issue numbers.

**Acceptance:** `harness skill validate roadmap-fleet` exits 0; grep for internal numbers returns nothing.

### Task 13: Platform-variant symlinks (codex, cursor, gemini-cli)

**Depends on:** Task 12 · **Files:** `agents/skills/{codex,cursor,gemini-cli}/roadmap-fleet` · **Category:** integration

Create three relative symlinks, each `roadmap-fleet -> ../claude-code/roadmap-fleet` (mirrors `harness-workflow-audit`). There is no `agents/skills/antigravity/` source dir — antigravity is covered by the plugin generator target, not a skill symlink (flag in handoff concerns).

**Acceptance:** `ls -la` shows three symlinks resolving to the claude-code source; `harness skill validate roadmap-fleet` still exits 0.

### Task 14: Verify generated plugin artifacts — `pnpm generate:plugin:check` EXIT 0

**Depends on:** Task 13 · **Files:** generated plugin artifacts (verify-only) · **Category:** integration

Run `pnpm generate:plugin:check` (checks all targets: claude, cursor, gemini, codex, antigravity). Do NOT run write-mode `pnpm generate:plugin` in this worktree. If check fails because the new skill is absent from committed generated output, note it: the write-mode regeneration must be run outside the `.claude/`-nested worktree (a non-`.claude` clone), then re-verified with `:check`.

**Acceptance:** `pnpm generate:plugin:check` exits 0, or the failure is documented with the out-of-worktree regeneration follow-up.

### Task 15: Regenerate skills catalog — `pnpm run generate-docs`

**Depends on:** Task 13 · **Files:** `docs/reference/skills-catalog.md` · **Category:** integration

Run `pnpm run generate-docs` (`node scripts/generate-docs.mjs`), which rewrites the auto-generated `docs/reference/skills-catalog.md`. Do not hand-edit the catalog. Confirm `roadmap-fleet` now appears with its tier and description.

**Acceptance:** `docs/reference/skills-catalog.md` diff shows `roadmap-fleet` added; file header AUTO-GENERATED banner intact.

### Task 16: `-fleet` family docs section + cross-links

**Depends on:** Task 15 · **Files:** `docs/guides/features-overview.md` (append `-fleet` family subsection; or a short dedicated family page) · **Category:** integration

Write a short section describing the `-fleet` family (autonomous fan-out over a work-queue with batch human review) and the conveyor `issue-fleet → adr-fleet → roadmap-fleet (build) → pr-fleet`, placing `roadmap-fleet` as the build stage. Cross-link to both new ADRs (Tasks 17–18) and note the family shares the front-load/park-unforeseen interaction model.

**Acceptance:** Family section renders; links to `0087` and `0088` ADRs resolve; no internal numbers in adopter-facing prose.

### Task 17: ADR 0087 — subagent fan-out vs the Workflow primitive

**Depends on:** Task 12 · **Files:** `docs/knowledge/decisions/0087-subagent-fanout-vs-workflow-primitive.md`

Author the ADR in the repo format (frontmatter: `number: 0087`, `title`, `date: 2026-08-07`, `status: accepted`, `tier: large`, `source: docs/changes/roadmap-fleet/proposal.md`; body: Context / Decision / Consequences (positive, negative, reversibility) / Alternatives Considered / References). Decision: model-driven subagent worktree fan-out in v1; name the `Workflow` primitive as the future deterministic/resumable upgrade (heavier to author, less portable). Cite reuse of `roadmap-pilot` scoring and the worktree-isolation primitive. Reference `harness-audit` as fan-out prior art.

**Acceptance:** File parses with valid frontmatter; `number` is 0087 and unused; sections present; no internal PR/issue numbers.

### Task 18: ADR 0088 — front-load / park-unforeseen interaction model

**Depends on:** Task 12 · **Files:** `docs/knowledge/decisions/0088-front-load-park-unforeseen-interaction-model.md`

Author the ADR (frontmatter `number: 0088`, same date/status/source). Decision: front-load every known decision fork into one batched confirm round; run autonomously on recommended-option defaults thereafter; an unforeseen mid-flight fork parks that one item and reports without blocking the batch; each PR carries an "assumptions made" note. State that this is the **canonical** statement of the model, shared across the `-fleet` family — other members reference this ADR rather than restating it. Reference ADR-0087 as companion.

**Acceptance:** File parses with valid frontmatter; `number` is 0088 and unused; states it is the shared canonical model; no internal numbers.

### Task 19: Final sweep — prettier format + format:check + re-validate

**Depends on:** Tasks 14, 15, 16, 17, 18 · **Files:** all created/edited files · **Category:** integration · `[checkpoint:human-verify]`

Run `pnpm format` (prettier --write) on the new/edited Markdown, then `pnpm format:check` to confirm clean. Re-run `harness skill validate roadmap-fleet` (EXIT 0) and `pnpm generate:plugin:check` (EXIT 0) as a final gate. Present the shippable skill + ADRs + regenerated catalog for human review.

**Acceptance:** `pnpm format:check` clean; `harness skill validate roadmap-fleet` EXIT 0; `pnpm generate:plugin:check` EXIT 0; skills-catalog contains `roadmap-fleet`.

## Dependency Order Summary

- Foundation: T1 → T2
- SKILL.md body (sequential, same file): T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11
- Validate gate: T11 → T12
- Post-validate parallelizable: T13 (symlinks), T17 (ADR 0087), T18 (ADR 0088) all depend only on T12; T14 depends on T13; T15 depends on T13; T16 depends on T15 + references T17/T18
- Final: T19 depends on T14, T15, T16, T17, T18

## Verification Checklist (whole plan)

- `harness skill validate roadmap-fleet` → EXIT 0
- `pnpm generate:plugin:check` → EXIT 0 (no write-mode generate:plugin run in worktree)
- `pnpm run generate-docs` → `skills-catalog.md` regenerated with `roadmap-fleet`
- `pnpm format:check` → clean
- Grep skill body → zero internal roadmap/PR/issue numbers
- Three platform symlinks resolve to the claude-code source
- ADRs 0087 + 0088 present with valid frontmatter and correct numbering
