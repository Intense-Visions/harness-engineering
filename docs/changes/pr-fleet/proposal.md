# pr-fleet — autonomous PR-queue triage, review-assist, and land

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (the `land` stage of the family conveyor)
**Keywords:** fleet, orchestration, pr-queue, triage, review-assist, land, merge-gate, roadmap-pilot, code-review, worktree, artifact-verification, batch-review

## Overview

Clearing the open-PR queue is the mirror-image slog of building a backlog. Every open pull request must be hand-triaged (is CI green on all platforms? is it reviewed? does it still merge cleanly? is it stale, superseded, or already resolved?), then review-assisted (run the review, address the mechanical findings, heal the flaky check), and finally landed — one at a time, with a human present at each merge button. For a queue of dozens of PRs the human's attention is again the bottleneck, not the machinery.

`pr-fleet` is the terminal **land** stage of the `-fleet` family conveyor: `issue-fleet` (intake) then `adr-fleet` (decide) then `roadmap-fleet` (build) then **pr-fleet** (land), with `cicd-fleet`, `test-fleet`, and `cleanup-fleet` working quality queues alongside. It is the **structural twin of `roadmap-fleet`**: both fan out over a work-queue with a concurrency governor and independent verification, then hand to a human. The difference is the queue and the terminal act. `roadmap-fleet` consumes a backlog and stops at **merge-ready PRs it never merges**. `pr-fleet` consumes the **open-PR queue** and is the stage that actually **lands** PRs — but the final merge decision stays with a human, and no unreviewed work is ever silently auto-merged.

### Goals

- Turn an open-PR queue of N pull requests into a triaged, review-assisted, land-ready batch, and land exactly the PRs a human explicitly approved — with a single up-front human touchpoint that carries the merge decision.
- Dogfood the real per-item review pipeline (`harness-code-review`) — never rubber-stamp a PR or invent an approval.
- Make land-readiness auditable: every landed PR is independently verified to be CI-green across all platforms, to carry a review verdict, and to have been human-approved to land — never on a subagent's self-report.
- Keep the final merge decision with a human; never silently auto-merge unreviewed work.

### Non-goals (YAGNI)

- Silent auto-merge of any PR the human did not explicitly approve to land.
- Building or fixing the feature the PR implements — that is `roadmap-fleet` / the per-item pipeline; `pr-fleet` assists review and lands, it does not re-open the build.
- Replacing `harness-code-review` — the review pipeline is composed, not reimplemented.
- Deterministic workflow-engine execution — named as a future upgrade (per ADR 0087); v1 is model-driven fan-out.
- Merge-conflict resolution requiring design judgment — a PR that needs a human to resolve semantic conflicts is triaged as blocked and reported, not force-resolved.

## Decisions made

1. **Family-shared spine, extracted as a documented contract — not a code library.** `pr-fleet` and `roadmap-fleet` share the same five-phase spine (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), the concurrency governor (default 2, max ~3 — the machine-storm limit), the artifact + all-OS-CI verification discipline, the worktree fan-out with its `.claude/`-nested push-path caveat, and the never-silent-merge invariant. This genuinely-shared, stage-agnostic scaffolding is captured **once** in a new reference doc, `docs/reference/fleet-family.md` (the "-fleet spine"), which every family member cites — mirroring how ADR 0088 is already the canonical statement of the interaction model that members reference rather than restate. The scaffolding is **documented, not physically extracted into a runtime library or base skill**: skills are self-contained `SKILL.md` prose that must validate and run standalone in adopter projects, so factoring shared prose into an imported module is both impossible under the skill format and the over-engineering the family charter warns against. Rationale: the family already established (ADR 0088) that shared design is stated once in a referenced document; a reference doc extends that proven pattern to the whole spine and lets the remaining five siblings build on it rather than copy-paste, at zero framework cost. **(This decision — documented contract vs physical library — is parked as a fork for the human because it commits all five remaining siblings; see Escalation.)**

2. **Triage taxonomy for the open-PR queue.** SELECT classifies each open PR into one of six land-readiness buckets, computed from `gh pr view` / `gh pr checks` signals: **land-ready** (CI green all-OS, review clean/approved, mergeable, no conflicts); **needs-review-assist** (CI green but no review verdict or unaddressed findings); **needs-heal** (CI red, conflicts, or stale base needing a rebase); **blocked** (draft/WIP, depends on another unlanded PR, or an external blocker); **superseded / already-resolved** (closed elsewhere, or a newer PR replaces it → flag for closure, not land); **stale** (no activity past a threshold → flag for human triage). Rationale: the queue is heterogeneous, and the terminal act differs per bucket — only land-ready (after assist) PRs are landable; the rest are healed, reported, or closed.

3. **Review-assist means run the real review, address the mechanical, never fabricate approval.** DISPATCH fans out worktree-isolated subagents that run `harness-code-review` against each PR's diff, push fix commits for **mechanical** findings (lint, format, import order, safe review-bot suggestions) and re-run CI, and record a review verdict. It **never** posts a human approval, never resolves semantic review disagreements by guessing, and never merges. Rationale: the review pipeline is the per-item quality gate; assisting is accelerating it to a verdict, not manufacturing the verdict.

4. **The human merge gate sits in CONFIRM as an explicit per-PR land authorization; the fleet lands only what was approved and independently verified.** CONFIRM presents the triaged queue and the human explicitly checks **which PRs to land** (a batch merge-authorization), answers any forks, and sets concurrency. The terminal LAND phase then merges **exactly** the PRs that were both human-approved in CONFIRM **and** independently verified in VERIFY (CI green all-OS + review verdict present + mergeable) — using the repo's configured merge method and honoring branch protection. No PR is ever merged that the human did not explicitly approve, and no unreviewed PR is auto-merged. Rationale: this is the operational meaning of "pr-fleet lands, but the final merge decision stays with a human" — the merge authority is a human act captured up front, the fleet is the executor of that authorization, and verification stands between approval and the actual merge. **(Exactly where this gate sits — CONFIRM batch-authorization vs a post-verify second touchpoint vs GitHub-native auto-merge-on-green — is parked as a fork for the human; see Escalation.)**

5. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood the real per-item skills (here: `harness-code-review`); verify adherence by artifact and all-OS CI green before any terminal action; never silently auto-merge. A `-fleet` fans out across many independent items into many outcomes for one batch review — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/pr-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) are symlinks to the claude-code source, exactly as `roadmap-fleet` ships. The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc and ADRs by name/title, not by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate the open-PR queue via `gh pr list --state open`. Triage each PR into the six-bucket taxonomy (Decision 2) using `gh pr view` / `gh pr checks` mergeability, CI, and review signals. Cross-check for superseded/already-resolved PRs. Score and order the landable candidates by land-priority, reusing `roadmap-pilot`-style impact scoring for principled ordering rather than ad-hoc ranking.
2. **CONFIRM.** Present the triaged queue to the human in a single round: land-ready and needs-assist PRs with their triage verdicts, superseded/stale PRs flagged for closure, known decision forks as multiple-choice questions, and the proposed concurrency. The human **checks which PRs to land** (the merge authorization — Decision 4), answers forks, approves/trims. This is the only guaranteed human touchpoint and the seat of the merge decision.
3. **DISPATCH.** For each PR needing assist or heal, spawn a worktree-isolated subagent that runs the real `harness-code-review` (autonomous mode), pushes fix commits for mechanical findings, and re-runs CI — never merging, never fabricating approval. Cap concurrency at the governor (~2–3). An unforeseen fork (e.g. a review finding that needs a design call) parks that one PR and reports it; the batch continues.
4. **VERIFY.** For each PR proposed to land, independently confirm — never by subagent self-report — that CI is green on all three OS plus the enforce and harness checks, that a review verdict exists, and that the PR is mergeable (no conflicts, base current). A PR missing any of these is not landable and is reported, not landed.
5. **LAND + REPORT.** Merge **only** the PRs that are both human-approved (CONFIRM) and independently verified (VERIFY), via `gh pr merge` with the repo's merge method, honoring branch protection. Emit a one-row-per-PR batch summary (PR link, triage bucket, verdict, assist actions taken, land result or reason-not-landed, parked forks). Close superseded/already-resolved PRs with a comment citing the superseding/resolving PR. Never merge an unapproved or unverified PR.

### Key seams and data

- **PrCandidate** record: PR number/url, title, author, triage bucket, CI status (per-OS), review verdict, mergeability, supersededBy (if any), landApproved (set in CONFIRM), assist actions taken, parked forks.
- **Reuses:** `roadmap-pilot`-style scoring for land-ordering; `harness-code-review` as the per-PR review gate; the subagent worktree-isolation primitive for fan-out; `gh` for all PR/CI operations.
- **Concurrency governor** at ~2–3 (shared spine) to avoid the compound-load failure mode.
- **Push/heal path:** assist subagents that push fix commits from a `.claude/`-nested worktree hit the same pre-push `check-docs` self-exclusion caveat; they push via the GitHub API or a non-`.claude` worktree. Never `--no-verify`.

### File layout

`agents/skills/claude-code/pr-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants under `agents/skills/{codex,cursor,gemini-cli}/pr-fleet`; generated plugin command files (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`); a regenerated `docs/reference/skills-catalog.md`; the new shared `docs/reference/fleet-family.md`; a new ADR for the land-stage human-merge-gate decision.

## Integration Points

- **Entry Points.** A new skill `pr-fleet`, invocable as `/harness:pr-fleet`, via the `run_skill` MCP tool, and via `harness skill run pr-fleet`. No new MCP tool is required in v1 (it orchestrates existing skills/tools + `gh`).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; platform-variant symlinks; plugin-artifact regeneration (`harness generate-slash-commands`); `skills-catalog.md` regeneration (`harness generate`).
- **Documentation Updates.** The skills catalog; the new `docs/reference/fleet-family.md` shared-spine reference (cited by `roadmap-fleet` and the remaining siblings); a short note in the family epic.
- **Architectural Decisions.** One decision rises to a standalone ADR: the **land-stage human-merge-gate model** (Decision 4 — where the merge authority sits for the terminal fleet stage, and why the fleet executes an up-front human authorization rather than auto-merging on green). It is the terminal-stage complement to ADR 0087 (fan-out) and ADR 0088 (interaction model). The shared-spine extraction (Decision 1) is documented in the reference doc rather than a new ADR, since it restates and consolidates already-accepted family decisions.
- **Knowledge Impact.** The land-stage pattern — human-authorized batch landing with independent pre-merge verification standing between approval and merge — enters the knowledge graph, related to `harness-code-review`, `roadmap-fleet`, and the merge-gate ADR.

## Success Criteria

- Given a confirmed set of N human-approved PRs, `pr-fleet` lands exactly those that pass independent verification (CI green all-OS + review verdict + mergeable), and reports every PR it did not land with the reason.
- There is exactly one up-front human decision round, and it carries the merge authorization; no per-PR interactive pauses except a genuinely-new fork parked to its own PR.
- The skill **never** merges a PR the human did not explicitly approve in CONFIRM, and **never** auto-merges an unreviewed PR.
- Every landed PR was independently verified — never landed on a subagent self-report.
- Superseded / already-resolved PRs are closed with comments citing the superseding/resolving PR, not landed.
- It degrades gracefully: missing `gh` auth, an un-mergeable PR, or a single PR's failed assist is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- `harness skill validate pr-fleet` passes; generated docs are regenerated; the skill ships with all-OS CI green.

## Implementation Order

1. **Phase 1 — Shared spine + SELECT + CONFIRM.** Write `docs/reference/fleet-family.md` (the extracted spine); author SELECT (queue enumeration + six-bucket triage + supersede cross-check + land-ordering) and the single-round CONFIRM surface carrying the merge authorization.
2. **Phase 2 — DISPATCH.** The worktree review-assist fan-out briefing (run `harness-code-review`, push mechanical fixes, re-run CI, never merge), the concurrency governor, and fork-parking.
3. **Phase 3 — VERIFY + LAND + REPORT.** Independent per-PR verification, the human-authorized land executor, the batch report, and superseded-PR closure.
4. **Phase 4 — Skill polish.** Domain-specific `## Rationalizations to Reject`, `harness skill validate pr-fleet`, docs regeneration, family cross-links, and the land-stage merge-gate ADR.
