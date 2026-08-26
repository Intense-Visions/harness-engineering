# cleanup-fleet — autonomous entropy/hotspot remediation sweep

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (a quality-queue member working alongside the core conveyor)
**Keywords:** fleet, orchestration, batch, entropy, hotspot, churn, codebase-cleanup, remediation, fan-out, worktree, batch-review

## Overview

Working an entropy/hotspot backlog down by hand is a per-target attention slog. A codebase accumulates dead code, drift, and structural risk in its highest-churn corners; each hotspot must be found, its remediation scoped, driven through `harness-codebase-cleanup` to convergence, and turned into a reviewable PR — one target at a time, with a human present throughout. For a codebase with dozens of risk hotspots this does not scale; the human's attention, not the machinery, is the bottleneck.

`cleanup-fleet` inverts the model. It enumerates the entropy/hotspot backlog by composing the existing detection skills, ranks the targets by remediation value, confirms the batch with the human once, fans out worktree-isolated subagents that each run the **real** per-target cleanup pipeline, independently verifies each result by convergence artifact + all-OS CI, and hands the human a batch of scoped **cleanup PRs to review in bulk** — moving the human from "remediate every hotspot" to "confirm the batch once, review the PRs once."

It is a **quality-queue** member of the `-fleet` family — it does not sit on the core intake → decide → build → land spine, but works the entropy/hotspot queue alongside it (as `cicd-fleet` works CI-red runs and `test-fleet` works coverage gaps). It composes the existing entropy/hotspot skills rather than reimplementing detection, and it never auto-merges: remediation touches the codebase's highest-risk areas, which is precisely where a silently-merged bad change hides.

### Goals

- Turn an entropy/hotspot backlog of N targets into up to N scoped, verified, merge-ready cleanup PRs with a single up-front human touchpoint plus one batch review.
- Dogfood the real per-target pipeline (`harness-codebase-cleanup`) — never hand-remediate or short-cut it.
- Make adherence auditable: every PR is independently verified to have run the real pipeline (the cleanup **converged** — a re-scan is clean) and to be CI-green across all platforms.
- Compose the existing detection skills (`harness-hotspot-detector`, `cleanup-dead-code`, `harness-dependency-health`, `detect_entropy`, churn analysis) for the queue — reimplement none of them.
- Never auto-merge; the human lands the batch (optionally via `pr-fleet`).

### Non-goals (YAGNI)

- Auto-merging cleanup PRs.
- Reimplementing entropy/hotspot detection — the queue is built by composing existing skills.
- Applying risky structural refactors autonomously — those park for human decision (see the safe-vs-risky boundary).
- Landing PRs — that is `pr-fleet`.
- Suppressing or ignoring findings as a substitute for remediation.
- Building a physical shared `-fleet` library — the shared contract is documented in `docs/reference/fleet-family.md`, not extracted into code.

## Decisions made

1. **Build on the documented family spine; define only the stage-specific parts.** `cleanup-fleet` reuses the shared five-phase skeleton (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its `.claude/`-nested push caveat, and the never-silent-merge invariant — all stated once in `docs/reference/fleet-family.md`. The `SKILL.md` cites that page rather than restating it, and defines only what is `cleanup-fleet`'s own: its queue, its triage taxonomy, its per-target pipeline, its terminal act, and its domain-specific rationalizations. Rationale: the family already confirmed a documented contract (not a physical shared library); a new member's job is to build on the spine, not re-copy sibling prose.

2. **Queue: the entropy/hotspot backlog, built by composing existing detectors.** SELECT enumerates remediation targets by running the existing skills and folding their outputs into a single ranked target set: `harness-hotspot-detector` (co-change + churn → structural risk), `cleanup-dead-code` (dead exports, commented-out code, orphaned dependencies), `harness-dependency-health` (graph metrics — coupling, centrality, dependents), `detect_entropy` (drift/entropy findings), and a git-churn pass. Rationale: detection already exists and is battle-tested; a fleet's value is orchestration and batch review, not a second detection engine. Missing any one source degrades to the others rather than aborting.

3. **Triage: rank by composite remediation value; scope one coherent target per PR.** Targets are ordered by a composite of **churn × structural risk × entropy-finding density** — the highest-risk areas that also carry remediable findings come first — reusing `roadmap-pilot`-style impact scoring for the ordering so selection is principled and reproducible rather than ad-hoc. A **target** is one coherent hotspot cluster or one entropy finding-group; unrelated cleanups are never bundled into one PR, so each PR's blast radius stays legible and independently revertible. Rationale: cleanup review only works when the reviewer can hold one target's diff in their head and revert it in isolation.

4. **Safe-vs-risky remediation boundary — auto-apply the safe class, park the risky class.** `cleanup-fleet` auto-applies only the **safe** remediation class via `harness-codebase-cleanup --fix`: dead-export / dead-code removal, commented-out-code removal, orphaned-dependency removal, import-ordering, and forbidden-import replacement. The **risky** class — structural refactor of a high-churn hotspot, splitting a god-module, or any change that alters a public API or observable behavior — is never applied autonomously; it parks as an unforeseen fork and is reported with a recommendation for the human. Rationale: high churn means high risk; the safe class is mechanically reversible and low-stakes, while a risky structural rewrite in the busiest file is exactly the change a bulk review would rubber-stamp and a revert could not cleanly undo.

5. **Per-target pipeline: the real `harness-codebase-cleanup`, run to convergence.** Each DISPATCH subagent runs the real `harness-codebase-cleanup` (per-target, `--fix` convergence mode) for its one target — it does not hand-edit and does not short-cut. The convergence artifact the cleanup necessarily leaves behind (findings resolved, a clean re-scan) is what VERIFY checks for. Rationale: dogfooding the real skill is what makes the fleet's guarantee auditable — a hand-remediated target leaves no convergence trace and fails VERIFY.

6. **Verification: convergence artifact + all-OS CI green — never a self-report.** For cleanup, the stage-specific artifact is the `harness-codebase-cleanup` **convergence record**: the findings the target opened with are resolved and a re-scan of the target is clean. VERIFY independently confirms that record plus all-OS CI green (green on one OS is not green) before any PR is called merge-ready. A partial cleanup that did not converge, or one whose re-scan still reports findings, is rejected or retried — regardless of what the subagent reported. Rationale: "I cleaned it up and CI is green" is a claim; convergence + CI is the evidence.

7. **Terminal act: batch cleanup PRs for human review — never merge.** The fleet's product is a batch of scoped, verified cleanup PRs plus a one-row-per-target summary carrying each target's assumptions-made note and any parked risky-remediation fork. It never auto-merges. Rationale: remediation lands in the highest-risk corners of the codebase; the human review the whole model is built around is non-negotiable here.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/cleanup-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini, antigravity) are generated. The skill body carries no internal roadmap/PR/issue numbers — the family spine and ADRs are cited by title only, so the shipped skill reads correctly in any adopter project.

### The loop — five phases (stage-specific detail only; the skeleton is the family spine)

1. **SELECT.** Enumerate the entropy/hotspot backlog by composing `harness-hotspot-detector`, `cleanup-dead-code`, `harness-dependency-health`, `detect_entropy`, and a churn pass; fold their outputs into remediation targets (one coherent hotspot cluster / finding-group each). Cross-check each target against merged/open PRs so an area already cleaned is flagged, not re-remediated. Score by composite churn × structural risk × finding density and order highest-value first.
2. **CONFIRM.** Present the ranked targets in one round: each target's finding summary and safe-vs-risky classification, any risky remediations flagged as they will park, already-cleaned targets flagged for drop, and the proposed concurrency. The human approves or trims once. Only guaranteed touchpoint before review.
3. **DISPATCH.** For each confirmed target, spawn a worktree-isolated subagent briefed to run the real `harness-codebase-cleanup --fix` for that one target. Cap concurrency at the governor (default 2, max ~3). A target that turns out to need a risky structural change parks and reports; the batch continues.
4. **VERIFY.** For each returned branch, independently confirm — never by subagent self-report — that the cleanup **converged** (opening findings resolved, target re-scan clean) and that CI is green on all three OS plus the project's required checks. A branch whose re-scan still shows findings did not converge and is rejected or retried.
5. **REPORT.** Emit a one-row-per-target batch summary (PR link, verdict, findings-resolved count, assumptions-made note, any parked risky-remediation fork) for bulk human review. Close/annotate already-cleaned targets accurately. Never merge.

### Key seams and data

- **Target** record: source detector(s), id/slug, area (files/module), finding summary, safety class (`safe` | `risky`), composite score, cross-check result (already-cleaned flag + resolving PR if any), and any detected risky-remediation fork.
- **Reuses:** the four detection skills + `detect_entropy` for the queue; `roadmap-pilot`-style scoring for ordering; the subagent worktree-isolation primitive for fan-out; `harness-codebase-cleanup` as the per-target pipeline; `gh` for PR operations and cross-check.
- **Concurrency governor** at 2 (default), max ~3 — the shared machine-storm limit.

### Integration Points

- **Entry Points** — A new claude-code skill `cleanup-fleet` (`harness skill run cleanup-fleet`) and its MCP `run_skill` mapping. No new CLI command, MCP tool, or route.
- **Registrations Required** — Skill discovery regeneration: `harness generate` regenerates the plugin command directories, the skills-catalog, and platform variants. The generated shared catalog files (`skills-catalog.md`, plugin command dirs) are shared artifacts that drift as sibling `-fleet` skills land.
- **Documentation Updates** — Add `cleanup-fleet`'s row to the Members table in `docs/reference/fleet-family.md` is already present (the queue/pipeline/terminal entry); no other doc edits required beyond the generated catalog.
- **Architectural Decisions** — None new. `cleanup-fleet` consumes the already-ratified family ADRs by title: _Subagent worktree fan-out (vs the Workflow primitive) for -fleet execution_, _The front-load / park-unforeseen interaction model for the -fleet family_. No standalone ADR — this is a family member built on a settled contract, not a new decision.
- **Knowledge Impact** — Reinforces the `-fleet` family concept in the graph: a quality-queue member composing existing detectors, distinct from the core-spine build/land members.

## Success Criteria

- Given a confirmed batch of N remediation targets, the fleet produces **up to N** cleanup PRs, each with a verified convergence record (re-scan clean) and green CI across all three OS plus enforce and harness.
- There is **exactly one** up-front human decision round; no per-target interactive pauses except a genuinely-risky remediation parked to its own target.
- Every emitted PR carries an **"assumptions made"** note (ranking basis, remediation scope, safe-vs-risky calls taken).
- Risky structural remediations are **parked and reported**, never auto-applied.
- Already-cleaned targets are **dropped/annotated, not re-remediated**.
- The skill **never auto-merges** a cleanup PR.
- It **degrades gracefully**: a missing detector source or a single target's non-converging cleanup is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No target is marked merge-ready on a subagent self-report — every verdict is backed by an independently-checked convergence record + CI.
- `harness skill validate cleanup-fleet` passes; the shipped body carries no internal roadmap/PR/issue numbers.

## Implementation order

1. Author `SKILL.md` + `skill.yaml` for `cleanup-fleet` (compose detectors; define queue, triage, per-target pipeline, terminal act, rationalizations; cite the family spine + ADRs by title).
2. Validate authoring (`harness skill validate cleanup-fleet`).
3. Regenerate integrations (`harness generate`) and commit the regenerated shared catalog + platform variants.
4. Verify generate/docs checks pass; open the PR.
