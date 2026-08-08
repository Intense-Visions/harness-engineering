# issue-fleet — autonomous intake/triage of the open-issue backlog

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (the `intake` stage — entry point of the family conveyor)
**Keywords:** fleet, orchestration, issue-backlog, intake, triage, label, dedup, route, prioritize, roadmap-pilot, worktree, artifact-verification, batch-review

## Overview

An open-issue backlog is the raw, unsorted mouth of the SDLC pipeline. Before any downstream fleet can build, decide, or land, every open issue has to be hand-triaged: is it labeled by type and area, is it a duplicate of an issue already filed, which downstream stage should own it (a decision to make, a feature to build, a red run to heal), and how urgent is it relative to the rest? For a backlog of dozens of issues this sorting is pure attention tax — the human reads each issue, cross-checks it against the others, applies labels, closes the duplicates, and mentally ranks the survivors, all before the first line of real work begins.

`issue-fleet` is the **intake** stage of the `-fleet` family conveyor and its **entry point**: `issue-fleet` (intake) then `adr-fleet` (decide) then `roadmap-fleet` (build) then `pr-fleet` (land), with `cicd-fleet`, `test-fleet`, and `cleanup-fleet` working quality queues alongside. It is a **sibling of `roadmap-fleet` and `pr-fleet`**: all three fan out over a work-queue with a concurrency governor, front-load one human decision round, verify independently rather than trust a self-report, and hand the human a reviewable batch — never a per-item slog. The difference is the queue and the terminal act. `issue-fleet` consumes the **open-issue backlog** and its terminal act is a **clean, ranked, deduped, routed queue** that the downstream fleets consume — it produces no code and merges nothing. The shared, stage-agnostic scaffolding all three build on is documented once in `docs/reference/fleet-family.md`.

### Goals

- Turn an open-issue backlog of N issues into a triaged queue — each survivor labeled by type/area, duplicates closed with citations, each issue routed to the downstream fleet that should own it, and the survivors ranked by impact — with a single up-front human touchpoint that carries the destructive-close authorization.
- Dogfood a real, auditable per-item triage: every applied label, dedup close, and route traces to signals in the issue itself, never a guess.
- Make triage verdicts auditable: every mutation issue-fleet applies is independently re-derived from the issue's own signals before it is applied — never on a subagent's self-report.
- Keep destructive actions (closing an issue as a duplicate) behind an explicit up-front human authorization; never silently close an issue.

### Non-goals (YAGNI)

- Building, speccing, or fixing anything an issue describes — that is the downstream fleets (`adr-fleet`, `roadmap-fleet`, `pr-fleet`); `issue-fleet` sorts the queue, it does not work it.
- Silent closing of any issue the human did not authorize closing in CONFIRM.
- Authoring new taxonomy/labels from scratch — issue-fleet applies the project's existing label vocabulary; inventing a new label scheme is a separate concern.
- Deterministic workflow-engine execution — named as a future upgrade (per ADR 0087); v1 is model-driven fan-out.
- Resolving genuinely-ambiguous routing (an issue that plausibly belongs to two downstream stages, or whose type a maintainer must judge) — that issue is parked and reported, never force-routed.

## Decisions made

1. **Family-shared spine, cited as a documented contract — not re-extracted.** `issue-fleet` shares the same five-phase spine (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), the concurrency governor (default 2, max ~3 — the machine-storm limit), the independent-verification-not-self-report discipline, the worktree fan-out with its `.claude/`-nested push-path caveat, and the never-silent invariant with `roadmap-fleet` and `pr-fleet`. That genuinely-shared, stage-agnostic scaffolding already lives once in `docs/reference/fleet-family.md`, established when the family spine was extracted; this skill **cites** it and defines only its own intake-stage parts. Rationale: the family already settled (and the human confirmed) that the shared spine is a documented contract every member references rather than a physically-extracted runtime library — skills must validate and run standalone in adopter projects, so factoring shared prose into an imported module is both impossible under the skill format and the over-engineering the family charter warns against. issue-fleet introduces no new cross-cutting decision, so it adds no new ADR — it builds on ADR 0087 (fan-out) and ADR 0088 (interaction model).

2. **Triage taxonomy for the open-issue backlog — label, dedup, route, prioritize.** SELECT/DISPATCH classify each open issue along four axes computed from the issue's own signals (title, body, existing labels, linked references):
   - **label** — assign the project's existing type/area labels (e.g. `bug`, `enhancement`/`feature`, `documentation`, `question`) from the issue's content; never invent new labels.
   - **dedup** — detect whether the issue restates an already-open issue (or one already resolved by a merged PR). A duplicate is **flagged for closure with a citation** of the canonical issue/PR — never a bare close, never a downstream build.
   - **route** — assign each surviving issue to the downstream fleet that should own it: a decision-shaped issue → `adr-fleet`; a build-shaped feature/enhancement → `roadmap-fleet`; a CI-red / flaky-run issue → `cicd-fleet`; a coverage gap → `test-fleet`; an entropy/hotspot issue → `cleanup-fleet`. An issue that plausibly fits two stages is a **fork**, surfaced in CONFIRM or parked, never force-routed.
   - **prioritize** — order the surviving, routed issues by impact, reusing `roadmap-pilot`-style impact scoring so the ranking is principled and reproducible rather than ad-hoc.

   Rationale: the queue is heterogeneous and each downstream fleet needs a _clean_ slice — labeled so it is filterable, deduped so no two fleets build the same thing, routed so each issue reaches the right stage, and ranked so the highest-impact work surfaces first.

3. **DISPATCH fans out concurrency-governed triage subagents; worktree isolation degrades to queue-slice partitioning for the read-mostly intake stage.** issue-fleet's per-item pipeline is _triage_, which produces issue-metadata mutations (labels, routes, dedup closes) via `gh`, not code. It therefore needs no git worktree per item — the worktree isolation the spine mandates for the code-mutating build/land members degrades here to **queue-slice partitioning**: each triage subagent owns a disjoint slice of the backlog, and the concurrency governor still caps parallel triage agents at 2 (max ~3). Dedup, which needs a cross-issue view, runs against a shared read-only snapshot of the full open-issue list so slice-partitioned agents still detect duplicates across slices. Rationale: honoring the _intent_ of the spine (bounded, isolated, governed fan-out) without inventing code worktrees that a read-mostly stage does not need.

4. **The human authorization gate sits in CONFIRM and carries the destructive-close decision; issue-fleet applies only what was authorized and independently verified.** CONFIRM presents the triaged queue — proposed labels, the duplicates flagged for closure with their canonical citation, the per-issue routes, the ranked order, and any routing forks. The human explicitly authorizes **which duplicates to close** (the destructive action), answers forks, and sets concurrency. Non-destructive mutations (applying labels, recording routes, emitting the ranked queue) proceed autonomously after CONFIRM; **closing a duplicate issue happens only for an issue the human authorized closing AND that VERIFY independently confirmed is a genuine duplicate with a real canonical citation**. Rationale: this mirrors the family's never-silent invariant (`pr-fleet` never merges an unauthorized PR; `issue-fleet` never closes an unauthorized issue) — the irreversible act is a human decision captured up front, and verification stands between the authorization and the close.

5. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood a real per-item triage grounded in the issue's own signals; verify every mutation by re-deriving it from those signals (the intake analog of the build member's plan-artifact check and the land member's CI check) — never a subagent self-report — before applying it; never silently close an issue. A `-fleet` fans out across many independent items for one batch decision — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/issue-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier (`tier: 2`, `cognitive_mode: systematic-orchestrator`), with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) are symlinks to the claude-code source, exactly as `roadmap-fleet` and `pr-fleet` ship. The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc and ADRs by name/title, not by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate the open-issue backlog via `gh issue list --state open`. Extract each issue's signals (title, body, existing labels, linked refs) and compute an initial triage along the four axes (Decision 2). Take a shared read-only snapshot of the full open-issue list for cross-slice dedup. Detect routing forks up front. Missing `gh` auth degrades to reporting the gap rather than aborting — with no queue there is nothing to triage.
2. **CONFIRM.** Present the triaged queue in one round: proposed labels, duplicates flagged for closure with canonical citations, per-issue routes, the ranked order, routing forks as multiple-choice questions with recommended defaults, and the proposed concurrency. The human authorizes the duplicate closes (the destructive action — Decision 4), answers forks, approves/trims. This is the only guaranteed human touchpoint.
3. **DISPATCH.** Partition the backlog into disjoint slices and fan out concurrency-governed triage subagents (Decision 3), each finalizing label/dedup/route/prioritize for its slice against the shared dedup snapshot. Cap concurrency at the governor (~2–3). A genuinely-unforeseen routing fork parks that one issue and reports it; the rest of the batch continues.
4. **VERIFY.** For every mutation proposed — each label, each dedup close, each route — independently re-derive it from the issue's own signals, never by subagent self-report. A proposed label with no supporting signal, a dedup close whose citation does not actually match, or a route with no basis is rejected and reported, not applied. Confirm each authorized-to-close duplicate is a genuine duplicate with a real canonical citation before it is eligible to close.
5. **HANDOFF + REPORT.** Apply the verified non-destructive mutations (labels, routes), close **only** the duplicates that were both human-authorized (CONFIRM) and independently verified (VERIFY) — each with a comment citing the canonical issue/PR — and emit the terminal artifact: the clean, ranked, deduped, routed queue, grouped by downstream fleet, that the downstream fleets consume. Emit a one-row-per-issue batch summary (issue link, labels applied, dedup verdict, route, rank, parked forks). Never close an unauthorized or unverified issue.

### Key seams and data

- **IssueCandidate** record: issue number/url, title, extracted signals, proposed labels, dedup verdict (`novel` | `duplicate-of`), `canonicalRef` (set when duplicate), route (downstream fleet), impact score/rank, `closeAuthorized` (set in CONFIRM), and detected routing forks.
- **Reuses:** `roadmap-pilot`-style scoring for the prioritize axis; the subagent fan-out primitive for slice-partitioned triage; `gh` for all issue enumeration, labeling, and closing.
- **Concurrency governor** at ~2–3 (shared spine) to avoid the compound-load failure mode.
- **Terminal artifact:** the ranked, routed, deduped queue (grouped by downstream fleet) — the contract the next fleet in the conveyor reads.

### File layout

`agents/skills/claude-code/issue-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants under `agents/skills/{codex,cursor,gemini-cli}/issue-fleet`; generated plugin command files (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via `harness generate`; a regenerated `docs/reference/skills-catalog.md`. No new shared spine doc (it already exists) and no new ADR (issue-fleet introduces no new cross-cutting decision).

## Integration Points

- **Entry Points.** A new skill `issue-fleet`, invocable as `/harness:issue-fleet`, via the `run_skill` MCP tool, and via `harness skill run issue-fleet`. No new MCP tool is required in v1 (it orchestrates `gh` + existing scoring).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; platform-variant symlinks; plugin-artifact + agent-definition regeneration (`harness generate`); `skills-catalog.md` regeneration.
- **Documentation Updates.** The skills catalog; a one-line cross-reference to `docs/reference/fleet-family.md` (already the family anchor — issue-fleet is listed there as the intake member). No edit to the spine doc's contract is required.
- **Architectural Decisions.** **None new.** issue-fleet builds on the already-accepted family ADRs — ADR 0087 (subagent worktree fan-out) and ADR 0088 (front-load / park-unforeseen interaction model). Its stage-specific decisions (triage taxonomy, dedup heuristic, routing rules, queue-slice degradation of worktree isolation) are recorded in this spec's **Decisions made** and do not rise to standalone ADRs — they neither cross-cut the family nor commit sibling members.
- **Knowledge Impact.** The intake-stage pattern — signal-grounded triage with independent per-mutation verification and a human-authorized destructive-close gate, emitting a ranked/routed queue for downstream fleets — enters the knowledge graph, related to `roadmap-fleet`, `pr-fleet`, and the family ADRs.

## Success Criteria

- Given a backlog of N open issues, `issue-fleet` emits a ranked, deduped, routed queue grouped by downstream fleet, and applies exactly the labels/routes that independent verification confirmed are grounded in each issue's signals.
- There is **exactly one** up-front human decision round, and it carries the destructive-close authorization; no per-issue interactive pauses except a genuinely-new routing fork parked to its own issue.
- The skill **never** closes an issue the human did not authorize in CONFIRM, and **never** closes an issue that verification did not confirm is a genuine duplicate with a real citation.
- Every applied mutation was independently re-derived from the issue's own signals — never applied on a subagent self-report.
- Duplicate issues are **closed with a comment citing the canonical issue/PR, not silently**; non-duplicate issues are never closed.
- It **degrades gracefully**: missing `gh` auth, an un-scoreable issue, or a single slice's failed triage is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- `harness skill validate issue-fleet` passes; generated docs are regenerated; the skill ships with all-OS CI green.

## Implementation Order

1. **Phase 1 — Foundation + SELECT + CONFIRM.** The skill dir, `skill.yaml`, SKILL heading + When to Use + Flags; author SELECT (backlog enumeration + four-axis triage + dedup snapshot + fork detection) and the single-round CONFIRM surface carrying the destructive-close authorization.
2. **Phase 2 — DISPATCH.** The queue-slice triage fan-out briefing (finalize label/dedup/route/prioritize against the shared dedup snapshot), the concurrency governor, and fork-parking.
3. **Phase 3 — VERIFY + HANDOFF + REPORT.** Independent per-mutation re-derivation, the human-authorized dedup-close executor, the ranked/routed terminal queue artifact, and the batch report.
4. **Phase 4 — Skill polish + registration.** Domain-specific `## Rationalizations to Reject`, Red Flags, Examples, Test Scenarios; `harness skill validate issue-fleet`; symlinks; `harness generate`; catalog regeneration; family cross-links.
