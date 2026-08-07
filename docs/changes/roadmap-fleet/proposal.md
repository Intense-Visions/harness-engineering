# roadmap-fleet — autonomous batch orchestration over a work backlog

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (the `build` stage of the family conveyor)
**Keywords:** fleet, orchestration, batch, roadmap-pilot, autopilot, fan-out, worktree, artifact-verification, batch-review

## Overview

Building a large backlog through the harness pipeline is a per-item interactive slog: each roadmap item or external issue must be hand-driven through `harness-brainstorming` then `harness-autopilot`, one at a time, with the human present at every clarifying question, spec sign-off, and autopilot decision point. For dozens of items this does not scale — the human's attention is the bottleneck, not the machinery.

`roadmap-fleet` inverts the model. It takes a **batch** of candidates, runs the **real** per-item pipeline autonomously and in isolation for each, verifies the result, and hands the human a set of **merge-ready PRs to review in bulk** — moving the human's involvement from "drive every item" to "confirm the batch once, review the PRs once." It is the **build** stage of the `-fleet` family conveyor: `issue-fleet` (intake) then `adr-fleet` (decide) then **roadmap-fleet** (build) then `pr-fleet` (land).

The pattern is not hypothetical — it was executed by hand across roughly ten candidates in a single session, producing verified merge-ready PRs. `roadmap-fleet` codifies that proven loop as a skill.

### Goals

- Turn a backlog of N candidates into up to N verified, merge-ready PRs with a single up-front human touchpoint plus one batch PR review.
- Dogfood the real per-item pipeline — never hand-implement or short-cut it.
- Make adherence auditable: every PR is independently verified to have run the real pipeline (a plan artifact exists) and to be CI-green across all platforms.
- Never auto-merge; the human lands the batch (optionally via `pr-fleet`).

### Non-goals (YAGNI)

- Auto-merging feature PRs.
- Replacing or short-cutting `harness-brainstorming` / `harness-autopilot`.
- Landing PRs — that is `pr-fleet`.
- Deterministic workflow-engine execution — named as a future upgrade; v1 is model-driven fan-out.
- Building product features itself; `roadmap-fleet` only orchestrates.

## Decisions made

1. **Interaction model: front-load, autonomous-default, park-unforeseen — with a per-PR assumptions note.** A triage pass surfaces every *known* decision fork up front in one batched round; everything else runs fully autonomously on recommended-option defaults; an *unforeseen* mid-flight fork parks that one item and reports it, without blocking the batch. Each PR carries an "assumptions made" note so batch review is grounded. Rationale: this is exactly what kept rework low in the reference run — front-loading the genuinely-ambiguous items prevented wrong-guess churn, while the rest flowed to merge-ready PRs, and no single item's fork ever stalled the batch.

2. **Execution architecture: pilot-scored selection, sub-agent worktree fan-out for execution.** Reuse `roadmap-pilot`'s impact-scoring to pick and order the batch (rather than ad-hoc ranking); execute via worktree-isolated sub-agents that each run the real per-item pipeline. Concurrency is capped at ~2–3 (the machine-storm limit observed in the reference run). Rationale: sub-agent fan-out is what actually delivered; grafting on the roadmap system's own scoring makes selection principled. The `Workflow` primitive is the theoretically-cleaner deterministic/resumable answer and is named as a future upgrade, but it is heavier to author and less portable than a skill that instructs the agent to fan out.

3. **Input contract: propose-and-confirm the ranked batch once.** The fleet enumerates candidates (open external issues plus unblocked roadmap shards), cross-checks each against merged/open PRs, scores them, and presents one ranked batch: already-resolved items flagged for closure, decision forks called out, proposed concurrency stated. The human approves or trims once; it is autonomous from there. Rationale: this unifies the single up-front touchpoint — batch confirmation and decision-fork answering happen in the same gate, and stale-issue triage is surfaced rather than acted on blindly.

4. **Naming and family.** `roadmap-fleet` is the build member of the `-fleet` family — skills unified by one technique (autonomous fan-out over a work-queue with batch human review), analogous to how the `-craft` family is unified by LLM-judgment critique. The family conveyor is `issue-fleet` then `adr-fleet` then `roadmap-fleet` then `pr-fleet`, with `cicd-fleet`, `test-fleet`, and `cleanup-fleet` working quality queues alongside.

5. **Hard invariants (shared with the family).** Dogfood the real per-item skills; verify adherence by artifact (a `plans/` directory plus an autopilot-state) and all-OS CI green before "merge-ready"; never auto-merge feature PRs. A `-fleet` is distinct from a convergence *pipeline* (which loops on one target) — it fans out across many independent items into many PRs.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/roadmap-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini, antigravity) are symlinks to the claude-code source. The skill body carries no internal roadmap/PR/issue numbers.

### The loop — five phases

1. **SELECT.** Enumerate candidates: open external issues (via `gh`) and unblocked roadmap shards (via `manage_roadmap`). Cross-check each against merged/open PRs; mark already-resolved items for closure rather than rebuild. Score and order via `roadmap-pilot`'s impact scoring.
2. **CONFIRM.** Present the ranked batch to the human in a single round: already-resolved items flagged for closure, known decision forks as multiple-choice questions, the proposed concurrency. The human approves or trims. This is the only guaranteed human touchpoint before review.
3. **DISPATCH.** For each confirmed item, spawn a worktree-isolated sub-agent briefed to run the real `harness-brainstorming` then `harness-autopilot` (autonomous mode) for that one item. Feed answered forks into the brief. Cap concurrency at ~2–3. If an item hits an unforeseen fork, that item parks and reports; the batch continues.
4. **VERIFY.** For each returned branch, independently confirm — never by sub-agent self-report — that the plan artifact (`docs/changes/<slug>/plans/`) and an autopilot-state exist, and that CI is green on all three OS plus the enforce and harness checks. An item lacking a plan artifact did not run the pipeline and is rejected or retried.
5. **REPORT.** Emit a batch summary — one row per item (PR link, verdict, assumptions-made note, any parked forks) — for bulk human review. Close already-resolved issues with accurate comments citing the resolving PR. Never merge.

### Key seams and data

- **Candidate** record: source (issue or shard), id, title, score, cross-check result (resolving PR if any, already-resolved flag), and detected decision forks.
- **Reuses:** `roadmap-pilot` scoring; the sub-agent worktree-isolation primitive for fan-out; `gh` for issue/PR operations; the code-review phase inside autopilot as the per-item quality gate.
- **Concurrency governor** at ~2–3 to avoid the compound-load failure mode.
- **Push path:** worktrees created under a `.claude/`-nested path break the local pre-push `check-docs` gate (it self-excludes, scanning zero files); sub-agents push via the GitHub API or a non-`.claude` throwaway worktree. Never `--no-verify`.

### File layout

`agents/skills/claude-code/roadmap-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants; generated plugin command files; a regenerated `docs/reference/skills-catalog.md`.

## Integration Points

- **Entry Points.** A new skill `roadmap-fleet`, invocable as `/harness:roadmap-fleet`, via the `run_skill` MCP tool, and via the skill CLI. No new MCP tool is required in v1 (it orchestrates existing skills/tools).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; plugin-artifact regeneration; `skills-catalog.md` regeneration; platform-variant symlinks.
- **Documentation Updates.** The skills catalog; a short section describing the `-fleet` family and `roadmap-fleet`'s place in it; a link from the family epic.
- **Architectural Decisions.** Two decisions rise to standalone ADRs: *sub-agent fan-out versus the Workflow primitive* (why model-driven fan-out in v1, Workflow as a future upgrade), and the *front-load / park-unforeseen interaction model* (shared across the family — the canonical statement belongs in one ADR the other members reference).
- **Knowledge Impact.** The fleet pattern — autonomous fan-out orchestration over a work-queue with deferred batch review — enters the knowledge graph as a reusable concept, with relationships to `roadmap-pilot`, `harness-autopilot`, and the downstream `pr-fleet`.

## Success Criteria

- Given a confirmed batch of N candidates, `roadmap-fleet` produces up to N PRs, each with a verified plan artifact and green CI across all three OS plus enforce and harness.
- There is exactly one up-front human decision round; no per-item interactive pauses except a genuinely-new fork parked to its own item.
- Every emitted PR carries an "assumptions made" note.
- Already-resolved candidates are closed with accurate comments, not rebuilt.
- The skill never auto-merges a feature PR.
- It degrades gracefully: a missing roadmap, missing `gh` auth, or a single item's failed pipeline results in that item being reported while the batch continues.
- `harness skill validate` passes for the new skill; generated docs are regenerated; the skill is shippable with all-OS CI green.

## Implementation Order

1. **Phase 1 — SELECT + CONFIRM.** Candidate enumeration (issues + shards), cross-check against merged/open PRs, `roadmap-pilot` scoring, and the single-round confirm surface.
2. **Phase 2 — DISPATCH.** The worktree fan-out briefing, the concurrency governor, and fork-parking.
3. **Phase 3 — VERIFY + REPORT.** Independent artifact/CI verification, the batch report, and already-resolved closure.
4. **Phase 4 — Skill polish.** Domain-specific `## Rationalizations to Reject`, `harness skill validate`, docs regeneration, family cross-links, and the two ADRs.
