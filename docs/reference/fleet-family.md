# The `-fleet` family spine

> The genuinely-shared, stage-agnostic scaffolding every `-fleet` skill builds on. This is a reader aid and a sibling-onboarding anchor — not an include. Each `-fleet` `SKILL.md` remains self-contained (it must validate and run standalone in adopter projects); this page states the common contract once so members build on it rather than copy-paste, and so a new member's author knows what is shared versus what is theirs to define.

## What a `-fleet` is

A `-fleet` skill autonomously works down a **queue of like items** by fanning out isolated pipelines, then hands the human a **batch to review or authorize** — never a per-item slog. The technique unifies the family the way LLM-judgment critique unifies the `-craft` family.

A `-fleet` is **distinct from a convergence _pipeline_** (`docs-pipeline`, `codebase-cleanup`, …), which loops on **one** target until it converges. A `-fleet` fans out across **many** independent items into **many** outcomes for a single bulk human decision.

## The conveyor

`ideate-fleet` (ideate) → `issue-fleet` (intake) → `adr-fleet` (decide) → `roadmap-fleet` (build) → `pr-fleet` (land); `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, and `craft-fleet` work quality queues alongside. Each member owns one stage's queue and terminal act; the spine below is common to all.

## The shared five-phase spine

Every member runs the same skeleton. Only the queue, the per-item pipeline, and the terminal act differ.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
                    Phase 5: <terminal> <-- Phase 4: VERIFY
```

| Phase       | Stage-agnostic purpose                                                                      |
| ----------- | ------------------------------------------------------------------------------------------- |
| 1. SELECT   | Enumerate the stage's queue, cross-check against what is already resolved, score and order  |
| 2. CONFIRM  | One up-front human round: approve/trim the batch, answer known forks, set concurrency       |
| 3. DISPATCH | Worktree-isolated subagents each run the **real** per-item pipeline for one item            |
| 4. VERIFY   | Independent artifact + all-OS-CI confirmation — never a subagent's self-report              |
| 5. terminal | The member's terminal act (REPORT for build, LAND for land, …) over only the verified items |

## Shared design decisions (canonical statements)

- **Interaction model — front-load, autonomous-default, park-unforeseen.** Known decision forks are surfaced in one up-front CONFIRM round with recommended defaults; everything else runs autonomously; a genuinely-unforeseen mid-flight fork **parks that one item and reports it** without blocking the batch. Each outcome carries an "assumptions made" / "assist actions" note so batch review is grounded. The canonical statement is **ADR 0088** — members reference it rather than restate it.
- **Execution architecture — pilot-scored selection, subagent worktree fan-out.** Reuse `roadmap-pilot`-style impact scoring to pick and order the batch; execute via worktree-isolated subagents that each run the real per-item pipeline. The `Workflow` primitive is named as a future deterministic/resumable upgrade. The canonical statement is **ADR 0087**.
- **Input contract — propose-and-confirm once.** The fleet enumerates and cross-checks the queue, then presents one ranked batch (already-resolved/superseded items flagged for closure, forks called out, concurrency proposed). The human approves or trims once; it is autonomous from there.

## Hard invariants (every member)

1. **Dogfood the real per-item skills.** Never hand-implement or short-cut the per-item pipeline — the artifacts it leaves behind are what VERIFY checks for.
2. **Verify adherence by artifact + all-OS CI green** before any terminal action. For build-shaped members the artifact is a plan directory plus an autopilot-state; for review/land-shaped members it is a recorded review verdict plus the PR's CI signal. Green on one OS is not green. A member that **emits no code and opens no PR** has no CI subject: it records all-OS CI as **not applicable** rather than dropping it silently, and substitutes a second independent check that carries the same evidentiary weight (`ideate-fleet` re-derives every ranking from the artifact's own inputs). Recording the not-applicable is what keeps the invariant honest — a skipped check and an inapplicable one must not look alike.
3. **A self-report is never verification.** "Pipeline ran, CI green" is a claim the orchestrator independently checks, never accepts.
4. **Never silently merge or ship unreviewed work.** The fleet's product is a reviewable/authorized batch. `roadmap-fleet` never merges at all; `pr-fleet` lands only what a human authorized up front and verification cleared. No member auto-merges unreviewed work.

## The concurrency governor (machine-storm cap)

Cap concurrent subagents at **2 (default), max ~3**. Beyond roughly three concurrent build/assist agents the compound load produces flaky failures indistinguishable from real ones; a stormed batch is slower once re-runs are counted. Never raise the cap to "go faster."

## The worktree push-path caveat

A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Subagents push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

## What each member defines for itself

The spine above is shared. Each member's own `SKILL.md` defines:

- **Its queue** — what SELECT enumerates (open issues, pending ADRs, backlog shards, the open-PR queue, CI-red runs, coverage gaps, entropy hotspots, risk-ranked standing-code areas, craft-skill judgment findings).
- **Its per-item pipeline** — the real skill DISPATCH runs per item (`brainstorming`→`autopilot` for build, `code-review` for land, etc.).
- **Its triage/scoring specifics** — any stage-specific taxonomy (e.g. `pr-fleet`'s land-readiness buckets).
- **Its terminal act** — REPORT (build), LAND-with-human-authorization (land), batch sign-off (decide), etc.
- **Its domain-specific `## Rationalizations to Reject`** — the wrong shortcuts specific to that stage.

## Members

| Member           | Stage  | Queue                                           | Per-item pipeline                                                                         | Terminal act                                |
| ---------------- | ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ideate-fleet`   | ideate | strategy themes / opportunity areas             | `harness-ideate`                                                                          | curated ranked shortlist (files nothing)    |
| `issue-fleet`    | intake | open-issue backlog                              | triage / dedup / cross-check                                                              | ranked, deduped, resolved-closed queue      |
| `adr-fleet`      | decide | pending architectural decisions                 | `architecture-advisor`                                                                    | batch ADR sign-off                          |
| `roadmap-fleet`  | build  | backlog (issues + roadmap shards)               | `brainstorming` → `autopilot`                                                             | REPORT (merge-ready PRs; never merges)      |
| `pr-fleet`       | land   | open-PR queue                                   | `code-review` (review-assist)                                                             | LAND (human-authorized) + REPORT            |
| `cicd-fleet`     | —      | CI/CD-red / flaky-test runs                     | deflake / heal                                                                            | REPORT                                      |
| `test-fleet`     | —      | test-coverage gaps                              | `test-advisor` → `tdd` / `test-craft`                                                     | test PRs                                    |
| `security-fleet` | —      | evidence-gated security findings + supply chain | `security-scan` / `supply-chain-audit` / `security-craft` → `brainstorming` → `autopilot` | fix PRs + filed evidence packets            |
| `cleanup-fleet`  | —      | entropy / hotspot backlog                       | `codebase-cleanup` (per-target)                                                           | remediation PRs                             |
| `bug-fleet`      | —      | latent-defect risk (standing code)              | review machinery → `tdd` (repro) → `debugging` (fix)                                      | tiered: fix PRs + filed issues              |
| `craft-fleet`    | —      | craft-skill findings (LLM-judgment quality)     | eleven `-craft` skills (critique) → `refactoring` (elevation)                             | tiered: elevation PRs + filed roadmap items |

## The conductor tier

Above the members sits one skill that is **not** a member: `fleet-command`, the **conductor**. It coordinates the fleets themselves rather than fanning out over an item-queue, which makes it **Tier 3** of Skills → Pipelines → Fleets → Conductor. It is the family capstone and is built last by construction, since it composes members that must already exist.

**Why it is not named `-fleet`.** A member fans out over a queue of like items into many outcomes; the conductor's queue is other orchestrators. It reuses the spine's five phase **names** deliberately — a conductor with a private vocabulary would be harder to reason about standing next to the members it runs — with **one substitution: at that tier SELECT enumerates fleets and DISPATCH dispatches fleet lanes**, where a member's SELECT enumerates items and its DISPATCH dispatches item subagents. Naming it `-fleet` would collapse exactly the tier distinction it exists to create.

**The five properties it adds on top of the spine:**

1. **One global leaf-slot budget** across every fleet in flight — never the sum of the per-fleet governors above. Slots are consumed by the leaf subagents a member's DISPATCH fans out, so a member in a cheap phase holds no slot, and no single fleet is allocated more than **2** of the pool (the family's per-fleet _default_, not its ceiling). The budget is imposed through a named seam: every lane is dispatched with `--concurrency <allocated>`, and a lane launched without it reverts to the member's own single-fleet default.
2. **A derived hybrid DAG** — a CI **trust gate** first, then ideation, then intake with the independent quality sweeps parallel alongside, then decide, then build, with the land stage terminal. Run order is derived from the dependency shape, never hand-picked, and no wave contains a dependency edge. The CI wave is a trust gate rather than a repair: `cicd-fleet` hands back **unmerged** remediation PRs, so an untrustworthy signal is surfaced as a fork at the run-plan gate and its remediation pays off on the _next_ run.
3. **Cross-fleet deconfliction** over four collision classes (generated artifacts, allocated sequences, same-region source edits, duplicate filings), each resolved with the cheapest sufficient mechanism, and degrading to a no-op when a class is eliminated upstream rather than becoming a stale playbook. Duplicate filings are the class **no single member can see**, which is why dedup belongs to this tier.
4. **Member gates batched by wave and never answered** — and never fired outside their wave: queue probing uses each member's **gate-free** path only, so a member with no such path is recorded as queue-depth-unknown rather than probed through a path that would raise its gate early.
5. **Lane verification from emitted artifacts rather than self-report**, with the evidence graded honestly — nothing-merged is a verified check, while staying within allocation is a dispatch-time-enforced property recorded as an assumption, since no artifact records peak concurrency. It **never merges**: its merge-order plan is advice attached to its report.

Four of the five are restated as the conductor's Iron Law — **GLOBAL BUDGET, DERIVED ORDER, UNTOUCHED GATES, NEVER MERGE**. Deconfliction is the one that is a _product_ rather than a prohibition, which is why it is a property of the tier without being a clause of the law.

The authority model behind those five — coordinator plus global governor, never dictator — is **referenced here, not restated**: see ADR 0091 below.

## References

- **ADR 0087** — Subagent worktree fan-out (vs the Workflow primitive) for `-fleet` execution.
- **ADR 0088** — The front-load / park-unforeseen interaction model for the `-fleet` family.
- **ADR 0089** — The `pr-fleet` land-stage human-merge-gate model.
- **ADR 0090** — The `adr-fleet` decide-stage batch-sign-off-gate model.
- **ADR 0091** — The `fleet-command` conductor-tier authority model (coordinator + global governor above the members).
