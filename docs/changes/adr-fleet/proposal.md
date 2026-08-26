# adr-fleet — batch-drive pending architectural decisions to ADRs

**Status:** Draft · **Tier:** Large · **Type:** rigid skill (orchestrator)
**Family:** `-fleet` (the `decide` stage of the family conveyor)
**Keywords:** fleet, orchestration, pending-decisions, adr, architecture-advisor, batch-signoff, never-auto-accept, roadmap-pilot, worktree, artifact-verification, batch-review

## Overview

Working down a backlog of undocumented architectural decisions is the same attention slog the family exists to remove — one stage earlier than building. Every pending decision has to be found (which specs name a decision with no ADR? which issues are blocked on an architecture call? which parked forks were never written up?), then driven through the advisor pipeline (research the codebase, surface the trade-offs, draft the record), and finally signed off — one decision at a time, with a human present at every clarifying question and every "is this the decision?" gate. For a backlog of dozens of pending decisions the human's attention is the bottleneck, not the machinery.

`adr-fleet` is the **decide** stage of the `-fleet` family conveyor: `issue-fleet` (intake) then **adr-fleet** (decide) then `roadmap-fleet` (build) then `pr-fleet` (land), with `cicd-fleet`, `test-fleet`, and `cleanup-fleet` working quality queues alongside. It sweeps the backlog of pending architectural decisions, fans out worktree-isolated subagents that each run the **real** `harness-architecture-advisor` pipeline to draft one ADR under `docs/knowledge/decisions/`, independently verifies each drafted ADR is a well-formed record (never a subagent's self-report), and hands the human **one batch sign-off pass** over the drafted ADRs. It **never auto-accepts** a decision — a drafted ADR stays `proposed` until a human accepts it. The shared, stage-agnostic scaffolding both this and its siblings build on is documented once in the `-fleet` family spine reference (`docs/reference/fleet-family.md`).

### Goals

- Turn a backlog of N pending architectural decisions into N drafted, well-formed ADRs and drive them to a **single up-front batch sign-off**, moving the human from "drive every decision" to "confirm the batch once, sign off the ADRs once."
- Dogfood the real per-item decide pipeline (`harness-architecture-advisor`) — the fleet drafts records through the audited advisor flow, it does not hand-write ADRs.
- Make decide-readiness auditable: every drafted ADR is independently verified to be a well-formed record (required frontmatter + Context/Decision/Consequences, a unique sequential number, `status: proposed`) on a CI-green branch — never on a subagent's self-report.
- Keep the accept decision with a human: the fleet drafts to `proposed`; only a human sign-off flips an ADR to `accepted`. Never auto-accept.

### Non-goals (YAGNI)

- Auto-accepting any decision the human did not sign off — a drafted ADR is never marked `accepted` by the fleet.
- Building or implementing the decision the ADR records — that is `roadmap-fleet` / the per-item build pipeline downstream; `adr-fleet` decides and documents, it does not implement.
- Replacing `harness-architecture-advisor` — the advisor pipeline is composed, not reimplemented.
- Deterministic workflow-engine execution — named as a future upgrade (per ADR 0087); v1 is model-driven fan-out.
- Deciding a genuinely-contested trade-off by the fleet's own judgment — a decision whose options need a human call parks and is reported, never resolved by guessing.

## Decisions made

1. **Family-shared spine, cited as a documented contract — not re-extracted.** `adr-fleet` builds on the same five-phase spine (SELECT → CONFIRM → DISPATCH → VERIFY → terminal), the concurrency governor (default 2, max ~3 — the machine-storm limit), the artifact + all-OS-CI verification discipline, the worktree fan-out with its `.claude/`-nested push-path caveat, and the never-silent invariant that are already stated once in `docs/reference/fleet-family.md` and its referenced ADRs (0087 fan-out, 0088 interaction model). This SKILL cites that contract and defines **only** its stage-specific parts. No physical shared library is created — skills are self-contained `SKILL.md` prose that must validate and run standalone in adopter projects, so the shared scaffolding stays a documented contract, exactly as the family charter and the earlier siblings established.

2. **The queue is the pending-architectural-decision backlog, enumerated by a wide net.** SELECT enumerates pending decisions from several sources and lets the ranker judge, mirroring the family's wide-net discovery discipline: (a) **undocumented decision points** — specs/proposals under `docs/changes/*/proposal.md` whose "Decisions made" / "Architectural Decisions" section names a decision with no matching ADR in `docs/knowledge/decisions/`; (b) **decision-blocked work** — open issues / roadmap items tagged as needing an architectural decision (e.g. a `needs-adr` label) or that reference an ADR number that does not exist yet; (c) **parked forks** — decision forks explicitly parked by prior fleet runs (roadmap-fleet / pr-fleet REPORT rows) that were never written up. Each candidate is cross-checked against existing ADRs so an already-decided point is flagged resolved, not re-drafted.

3. **The per-item pipeline is the real `harness-architecture-advisor`, adapted to autonomous fan-out.** DISPATCH fans out worktree-isolated subagents that each run the real advisor flow (ANALYZE the codebase → PROPOSE options with trade-offs → DOCUMENT the chosen option as an ADR). The advisor's interactive DISCOVER questions are **front-loaded into CONFIRM as the batch's known decision forks** (the family interaction model, ADR 0088): the human answers each decision's key trade-off question once, up front, and those answers are fed into the subagent's brief so it never re-asks. A genuinely-**unforeseen** question — one not surfaced in CONFIRM whose answer materially changes the decision — **parks that one item and reports it**; the batch continues. The subagent drafts, it never accepts.

4. **The draft ADR is written to the canonical decisions directory as `status: proposed`; numbers are pre-allocated by the orchestrator.** Each subagent writes a real ADR file to `docs/knowledge/decisions/NNNN-<slug>.md` with the repo's required frontmatter and Context/Decision/Consequences sections, carrying `status: proposed` — the explicit never-auto-accept marker distinguishing a fleet draft from an accepted decision. To avoid the scan-and-increment number collision when N subagents draft concurrently, the **orchestrator pre-allocates a contiguous block of sequential ADR numbers in SELECT** (one per confirmed item) and passes each subagent its assigned number in the DISPATCH brief. Drafting real files in the canonical location makes the batch reviewable as ordinary ADR diffs in the PR. **(Whether the draft lives in `docs/knowledge/decisions/` as a new `proposed` status vs a staging directory promoted only on sign-off commits the repo's ADR status vocabulary — parked as a fork for the human; see Escalation.)**

5. **The terminal act is a single human batch sign-off; the fleet never auto-accepts.** SIGN-OFF presents every verified drafted ADR to the human in **one** review pass. The human accepts or rejects each ADR; accepted ADRs have their `status` flipped `proposed` → `accepted`, rejected ones are removed or sent back with the reason. The fleet **executes** the status flip only for ADRs the human explicitly accepted — it never originates the accept decision, and it never flips an ADR to `accepted` on its own judgment or because "the draft looks right." This is the decide-stage complement to the land-stage merge gate (ADR 0089): the decision authority is a human act captured in one pass, the fleet is the executor of that authorization, and independent verification stands between drafting and sign-off. **(Whether sign-off is per-ADR accept/reject in one pass vs a single all-or-nothing batch acceptance is settled as per-ADR; the deeper gate-seat question is recorded in the decide-stage ADR.)**

6. **Hard invariants (shared with the family, per `docs/reference/fleet-family.md`).** Dogfood the real per-item skill (here: `harness-architecture-advisor`); verify adherence by artifact + all-OS CI green before the terminal action; never silently accept. A `-fleet` fans out across many independent decisions into many drafted ADRs for one batch sign-off — distinct from a convergence _pipeline_ that loops on one target.

## Technical design

### Skill shape

A claude-code rigid skill at `agents/skills/claude-code/adr-fleet/` (`SKILL.md` plus `skill.yaml`), orchestrator-tier, with a domain-specific `## Rationalizations to Reject`. Platform variants (codex, cursor, gemini-cli) are symlinks to the claude-code source, exactly as `roadmap-fleet` and `pr-fleet` ship. The skill body carries **no** internal roadmap/PR/issue numbers (it runs in adopter projects) and cites the shared spine doc and ADRs by name/title, not by tracking number.

### The loop — five phases

1. **SELECT.** Enumerate the pending-decision queue from the three sources (Decision 2). Cross-check each candidate against existing ADRs in `docs/knowledge/decisions/` — an already-decided point is flagged resolved, not re-drafted. Score and order the candidates by impact, reusing `roadmap-pilot`-style scoring rather than ad-hoc ranking. Pre-allocate a contiguous block of ADR numbers (Decision 3), one per candidate.
2. **CONFIRM.** Present the ranked pending-decision batch to the human in a single round: the candidates with scores, already-decided points flagged for closure, each decision's key trade-off question (the advisor's DISCOVER question) as a multiple-choice fork with a recommended default, and the proposed concurrency. The human approves/trims the batch, answers the forks, and sets concurrency. This is the only guaranteed human touchpoint before sign-off.
3. **DISPATCH.** For each confirmed decision, spawn a worktree-isolated subagent that runs the real `harness-architecture-advisor` (ANALYZE → PROPOSE → DOCUMENT), fed the fork answers from CONFIRM and its pre-allocated ADR number, and drafts `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed`. Cap concurrency at the governor (~2–3). An unforeseen question parks that one item and reports it; the batch continues. Record an "assumptions made" note per item.
4. **VERIFY.** For each returned drafted ADR, independently confirm — never by subagent self-report — that a well-formed ADR file exists on the branch (required frontmatter with a unique sequential number and `status: proposed`, plus Context/Decision/Consequences sections), and that the pushed branch's CI is green on all three OS plus the project's required checks. A missing or malformed draft means the advisor pipeline did not run as required — reject or retry, never sign-off-ready.
5. **SIGN-OFF + REPORT.** Present every verified drafted ADR to the human in one batch pass. Flip `status: proposed` → `accepted` for **only** the ADRs the human explicitly accepts; remove or send back rejected ones with the reason. Emit a one-row-per-decision batch summary (decision, ADR number/link, verdict, assumptions made, parked forks, sign-off result). Close already-decided candidates with a comment citing the existing ADR. Never auto-accept.

### Key seams and data

- **DecisionCandidate** record: source (`undocumented-decision-point` | `decision-blocked-work` | `parked-fork`), id (spec path / issue ref / prior-run row), title, score, crossCheck (`novel` | `already-decided`), existingAdr (set when already-decided), allocatedAdrNumber, forks (the advisor DISCOVER question(s)), assumptionsMade, parkedForks, draftStatus (`proposed` | `accepted` | `rejected`).
- **Reuses:** `roadmap-pilot`-style scoring for impact ordering; `harness-architecture-advisor` as the per-item decide pipeline; the subagent worktree-isolation primitive for fan-out; the repo ADR convention (frontmatter, sequential NNNN numbering, Context/Decision/Consequences) from `docs/knowledge/decisions/README.md`.
- **Concurrency governor** at ~2–3 (shared spine) to avoid the compound-load failure mode.
- **Push path:** subagents that push a drafted ADR from a `.claude/`-nested worktree hit the same pre-push `check-docs` self-exclusion caveat; they push via the GitHub API or a non-`.claude` worktree. Never `--no-verify`.

### File layout

`agents/skills/claude-code/adr-fleet/{SKILL.md,skill.yaml}`; symlinked platform variants under `agents/skills/{codex,cursor,gemini-cli}/adr-fleet`; generated plugin command files (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`); a regenerated `docs/reference/skills-catalog.md`; a new ADR for the decide-stage batch-sign-off gate decision; a one-line reference-addition to `docs/reference/fleet-family.md`.

## Integration Points

- **Entry Points.** A new skill `adr-fleet`, invocable as `/harness:adr-fleet`, via the `run_skill` MCP tool, and via `harness skill run adr-fleet`. No new MCP tool is required in v1 (it orchestrates existing skills/tools + `gh` + the ADR convention).
- **Registrations Required.** Skill tier assignment in `skill.yaml`; platform-variant symlinks; plugin-artifact regeneration (`harness generate`); `skills-catalog.md` regeneration.
- **Documentation Updates.** The skills catalog; a reference-addition to `docs/reference/fleet-family.md` (adding the decide-stage ADR to its references list — the spine already anticipates `adr-fleet` in its conveyor and members table).
- **Architectural Decisions.** One decision rises to a standalone ADR: the **decide-stage batch-sign-off gate model** (Decision 4 — where the accept authority sits for the decide stage, why the fleet drafts to `proposed` and executes a single up-front human sign-off rather than auto-accepting a draft). It is the decide-stage complement to ADR 0087 (fan-out), ADR 0088 (interaction model), and ADR 0089 (land-stage merge gate).
- **Knowledge Impact.** The decide-stage pattern — human-authorized batch sign-off with independent pre-accept verification standing between drafting and acceptance — enters the knowledge graph, related to `harness-architecture-advisor`, `roadmap-fleet`/`pr-fleet`, and the sign-off ADR.

## Success Criteria

- Given a confirmed batch of N pending decisions, `adr-fleet` produces **up to N** drafted ADRs, each independently verified to be a well-formed record (required frontmatter + Context/Decision/Consequences, a unique sequential number, `status: proposed`) on a CI-green branch across all three OS plus enforce and harness.
- There is **exactly one** up-front human decision round (CONFIRM) plus one terminal sign-off pass; no per-decision interactive pauses except a genuinely-new question parked to its own item.
- The fleet **never** flips an ADR to `accepted` without an explicit human sign-off, and **never** auto-accepts a draft.
- Every drafted ADR was produced by the real `harness-architecture-advisor` pipeline — never hand-written to skip the advisor, and never marked verified on a subagent self-report.
- Already-decided candidates are **flagged and closed citing the existing ADR, not re-drafted**.
- It **degrades gracefully**: a missing queue source, missing `gh` auth, or a single item's failed draft is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- `harness skill validate adr-fleet` passes; generated docs are regenerated; the skill ships with all-OS CI green.

## Implementation Order

1. **Phase 1 — SELECT + CONFIRM.** Author SELECT (three-source pending-decision enumeration + existing-ADR cross-check + impact ordering + ADR-number pre-allocation) and the single-round CONFIRM surface carrying the fork answers, batch approval, and concurrency.
2. **Phase 2 — DISPATCH.** The worktree advisor-drafting fan-out briefing (run `harness-architecture-advisor`, draft to `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed`, feed fork answers + allocated number), the concurrency governor, fork-parking, and the assumptions-made note.
3. **Phase 3 — VERIFY + SIGN-OFF + REPORT.** Independent per-ADR artifact verification, the batch sign-off pass with the human-authorized `proposed`→`accepted` flip, the batch report, and already-decided closure.
4. **Phase 4 — Skill polish.** Domain-specific `## Rationalizations to Reject`, `harness skill validate adr-fleet`, docs regeneration, family cross-links, and the decide-stage batch-sign-off ADR.
