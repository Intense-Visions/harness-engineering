# test-fleet — autonomous test-coverage backlog sweep

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (a quality-queue member that works alongside the core conveyor)
**Keywords:** fleet, orchestration, test-coverage, coverage-gaps, critical-paths, test-authoring, tdd, test-craft, test-advisor, roadmap-pilot, worktree, artifact-verification, batch-review

## Overview

Closing a test-coverage backlog by hand is the same attention slog the other `-fleet` members attack, in the quality domain. Every under-covered area must be found (which modules and critical paths lack behavior-covering tests?), then have tests authored for it through the real authoring flow, then be run green across every platform, then shipped as a reviewable PR — one area at a time, with a human present at each step. For a codebase with dozens of coverage gaps the human's attention is the bottleneck, not the machinery.

`test-fleet` is a **quality-queue** member of the `-fleet` family. It works alongside the core conveyor (`issue-fleet` intake → `adr-fleet` decide → `roadmap-fleet` build → `pr-fleet` land), sweeping the **test-coverage backlog**: it enumerates under-covered areas and uncovered critical paths, fans out worktree-isolated subagents that each author tests for one area via the **real** test-authoring flow, independently verifies each result, and hands back a **batch of green test PRs for human review** — never auto-merging. It is the **structural twin of `roadmap-fleet`** in that both fan out over a work-queue and stop at reviewable PRs they never merge; the difference is the queue (coverage gaps, not backlog items), the per-item pipeline (test authoring, not feature build), and the shape of the verification artifact (authored tests + a coverage delta, not a plan directory).

### Goals

- Turn a test-coverage backlog of N under-covered areas into a batch of green, reviewable test PRs, with a single up-front human touchpoint (approve/trim the ranked target list, answer known forks, set concurrency).
- Dogfood the real per-item test-authoring flow (`harness-tdd` then `test-craft`, composing `harness-test-advisor` for gap selection) — never hand-write coverage-theater tests to bump a number.
- Make each test PR's adherence auditable: every emitted PR is independently verified to add behavior-asserting **test** files, to improve the target's coverage, and to be CI-green across all platforms — never on a subagent's self-report.
- Keep the ship decision with a human: test-fleet produces reviewable test PRs and never auto-merges.

### Non-goals (YAGNI)

- Auto-merging any test PR — test PRs are always for human review (the family never-silent-merge invariant).
- Authoring a single test on request — that is `harness-tdd` / a single-test author (e.g. a canary test-author); a fleet's overhead only pays off across a backlog of gaps.
- Fixing the code under test — test-fleet authors tests that characterize existing behavior; if a gap reveals a bug, it parks that target and reports it (a bug fix is `roadmap-fleet` / the build pipeline, not a coverage sweep).
- Chasing a coverage-percentage target with assertion-free tests — coverage theater is explicitly rejected; a "covered" line must be exercised by a test that asserts behavior.
- Deterministic workflow-engine execution — named as a future upgrade (per the fan-out ADR); v1 is model-driven fan-out.

## Decisions made

1. **Family-shared spine, cited from the documented contract — not re-extracted, not a code library.** `test-fleet` builds on the same five-phase spine (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), concurrency governor (default 2, max ~3 — the machine-storm cap), artifact + all-OS-CI verification discipline, worktree fan-out with its `.claude/`-nested push-path caveat, and never-silent-merge invariant that the family captures once in `docs/reference/fleet-family.md`. The `SKILL.md` **cites** that reference and states only test-fleet's stage-specific parts; it does not restate the spine and does not introduce a physical shared library (the documented-contract decision is already settled for the family — skills are self-contained prose that must validate and run standalone in adopter projects). Rationale: this is the proven family pattern; a new member extends it at zero framework cost.

2. **The queue is the test-coverage backlog: under-covered areas + uncovered critical paths.** SELECT enumerates coverage gaps by composing `harness-test-advisor`'s project-wide coverage audit ("what's untested?") together with the graph's critical paths. Each gap (a module/file, or an uncovered critical path) becomes a candidate **target**. "Covered" means exercised by at least one test that **asserts behavior** — not merely imported or executed for line credit; an uncovered critical path is a critical path with no behavior-asserting test. Rationale: the coverage audit already exists as a composable skill, and critical-path weighting focuses the sweep on the areas whose failure would hurt most.

3. **Rank targets by (criticality × coverage-deficit), reusing roadmap-pilot-style impact scoring.** Do not rank ad-hoc. Uncovered critical paths rank highest; a large deficit on a low-criticality util ranks low. Cross-check each target against in-flight test PRs (a target already being covered elsewhere is dropped) and recently-merged coverage (an already-covered target is not re-swept). Rationale: principled, reproducible ordering so the batch spends the concurrency budget on the highest-value gaps first.

4. **The per-item pipeline is the real test-authoring flow: `harness-tdd` then `test-craft`.** DISPATCH fans out one worktree-isolated subagent per target, briefed to author behavior-covering tests for its one target via `harness-tdd`, then raise their quality via `test-craft` (contract-vs-implementation, assertion strength, no brittle coupling). Where a project ships a dedicated test-authoring plugin (e.g. canary), the subagent may compose it, but the hard dependency is the harness authoring flow so the skill runs standalone in any adopter project. The subagent **never** hand-writes coverage-theater tests and never edits the code under test to make a test pass. Rationale: the authored tests plus their quality critique are the artifacts VERIFY checks for; dogfooding the real flow is what makes the batch trustworthy.

5. **The terminal act is a batch of green test PRs for human review — one per target, or sensibly grouped — never auto-merged.** Each verified target becomes a reviewable PR. Small, cohesive targets in the same module cluster may be **grouped** into one PR so review stays tractable, capped so no PR is unreviewably large; large targets get their own PR. Rationale: the fleet's product is a reviewable batch; grouping trades PR count against review-sized diffs, and the ship decision stays human.

6. **Verification is authoring-shaped: added behavior-asserting test files + a coverage delta + all-OS CI green.** test-fleet is the first **authoring-shaped** family member, so its stage-specific artifact differs from the build-shaped (plan directory + autopilot-state) and land-shaped (review verdict + PR CI) members. For each returned target the orchestrator independently confirms — never by self-report — that the branch actually adds/changes **test** files (a target with no added test did not run the authoring flow → reject/retry), that the target's coverage **improved** (a re-audit delta, guarding against assertion-free coverage theater), and that CI is green on **all** operating systems including the full test suite (the new tests pass everywhere and break nothing existing). Rationale: this is the authoring analogue of the family's "verify by artifact, never self-report" discipline; the artifact is the tests and the coverage they add.

7. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood the real per-item skills (here: `harness-tdd` / `test-craft`); verify adherence by artifact + all-OS CI green before any terminal action; a self-report is never verification; never silently merge. A `-fleet` fans out across many independent items into many outcomes for one batch review — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/test-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) are symlinks to the claude-code source, exactly as `roadmap-fleet` and `pr-fleet` ship. The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc and the family ADRs by name/title, not by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate coverage gaps by composing `harness-test-advisor`'s coverage audit plus the graph's critical paths. Classify each target's cross-check status (novel / already-covered / in-progress-elsewhere). Score and order surviving targets by (criticality × coverage-deficit) via roadmap-pilot-style impact scoring. Detect known decision forks (e.g. "characterize current behavior as-is, or is this target expected to change soon?").
2. **CONFIRM.** Present the ranked target list in one round: already-covered/in-flight targets flagged for drop, known forks as multiple-choice questions with recommended defaults, the proposed grouping of small targets into PRs, and the proposed concurrency. The human approves/trims once and answers the forks. Only guaranteed human touchpoint before PR review.
3. **DISPATCH.** One worktree-isolated subagent per confirmed target runs the real `harness-tdd` then `test-craft` authoring flow for its one target, records an "assumptions made" note (e.g. behavior characterized as-is), and pushes a branch. Cap concurrency at the governor (2, max ~3). A genuinely-unforeseen fork (e.g. the gap exposes a probable bug) **parks that one target and reports it**; the batch continues.
4. **VERIFY.** For each returned target, independently confirm — never by self-report — added behavior-asserting **test** files on the branch, an improved coverage delta for the target (test-advisor re-audit), and all-OS CI green including the full suite. Classify verified / rejected / retry.
5. **REPORT.** Emit a one-row-per-target batch summary (target, verdict, PR link, coverage delta, assumptions made, parked forks) for bulk human review. Close/annotate already-covered targets accurately. Never merge.

### Key seams and data

- **CoverageTarget** record: id (module/file/critical-path), title, criticality, coverageDeficit, score, crossCheck (`novel` | `already-covered` | `in-progress-elsewhere`), groupWith (PR-grouping hint), forks, and — after DISPATCH — branch, addedTestFiles, coverageDelta, assumptions, parkedForks.
- **Reuses:** `harness-test-advisor` (coverage audit + uncovered critical paths, SELECT + VERIFY re-audit); `roadmap-pilot`-style scoring (target ordering); `harness-tdd` + `test-craft` (the per-item authoring flow); the subagent worktree-isolation primitive for fan-out; `gh` for PR operations.
- **Concurrency governor** at 2 (max ~3) — the shared machine-storm cap.
- **Push path:** authoring subagents in a `.claude/`-nested worktree hit the pre-push `check-docs` self-exclusion caveat; they push via the GitHub API or a non-`.claude` worktree. Never `--no-verify`.

### File layout

`agents/skills/claude-code/test-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants under `agents/skills/{codex,cursor,gemini-cli}/test-fleet`; regenerated plugin command files (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`); a regenerated `docs/reference/skills-catalog.md`. No new shared reference doc (it already exists) and no new ADR (see below).

## Integration Points

- **Entry Points.** A new skill `test-fleet`, invocable as `/harness:test-fleet`, via the `run_skill` MCP tool, and via `harness skill run test-fleet`. No new MCP tool is required in v1 (it orchestrates existing skills/tools + `gh`).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; platform-variant symlinks; plugin-artifact regeneration; `skills-catalog.md` regeneration (`harness generate`).
- **Documentation Updates.** The skills catalog. The shared `docs/reference/fleet-family.md` already lists `test-fleet` in its members table and requires no edit.
- **Architectural Decisions.** **No new ADR.** test-fleet's family-level design is already fixed by the fan-out ADR (subagent worktree fan-out) and the interaction-model ADR (front-load / park-unforeseen), both cited by title, and by the documented family spine. Its stage-specific choices (coverage-gap queue, authoring-shaped verification artifact, PR grouping) are member-local and are recorded here and in the SKILL.md rather than elevated to a family-committing ADR. **(Recorded as an assumption; see Assumptions in the PR.)**
- **Knowledge Impact.** The authoring-shaped fleet pattern — verify a coverage sweep by added behavior-asserting tests plus a coverage delta, not a plan or a review verdict — enters the knowledge graph, related to `harness-test-advisor`, `harness-tdd`, `test-craft`, and `roadmap-fleet`.

## Success Criteria

- Given a confirmed batch of N coverage targets, the fleet produces **up to N** test PRs (some grouped), each independently verified to add behavior-asserting test files, improve the target's coverage, and be CI-green across all platforms.
- There is **exactly one** up-front human decision round; no per-target interactive pauses except a genuinely-new fork parked to its own target.
- Every emitted PR carries an "assumptions made" note (e.g. behavior characterized as-is) and its coverage delta.
- Coverage-theater tests (assertion-free, import-only) are rejected — a "covered" target must gain a behavior-asserting test.
- Already-covered / in-flight targets are **dropped or annotated, not re-swept**.
- The skill **never** auto-merges a test PR.
- It **degrades gracefully**: a missing coverage tool, a single target's failed authoring, or a gap that exposes a bug is reported/parked while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No target is marked merge-ready on a subagent self-report — every verdict is backed by independently-checked test-file + coverage-delta + CI evidence.
- `harness skill validate test-fleet` passes; generated docs are regenerated; the skill ships with all-OS CI green.

## Implementation Order

1. **Phase 1 — Foundation + SELECT + CONFIRM.** Skill dir, `skill.yaml`, SKILL heading + When to Use + Flags; author SELECT (coverage-gap enumeration via test-advisor + critical paths, cross-check, criticality×deficit ordering) and the single-round CONFIRM surface (target list, drops, forks, grouping, concurrency).
2. **Phase 2 — DISPATCH.** The worktree authoring fan-out briefing (run `harness-tdd` then `test-craft`, never coverage-theater, never edit code-under-test), the concurrency governor, and fork-parking.
3. **Phase 3 — VERIFY + REPORT.** The authoring-shaped independent verification (added test files + coverage delta + all-OS CI), the batch report with coverage deltas, and already-covered annotation.
4. **Phase 4 — Skill polish.** Domain-specific `## Rationalizations to Reject`, `harness skill validate test-fleet`, docs regeneration, and family cross-links.
