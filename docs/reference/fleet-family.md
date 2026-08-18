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

## The worker handoff record (canonical)

Every member's DISPATCH fans out worktree-isolated **workers** that each complete one item and hand a structured report back to the orchestrator (and, under `fleet-command`, up to the conductor). Historically each member invented its own ad hoc report shape, which forced `fleet-command` to special-case every fleet's worker output. The family standard removes that: **every worker, in every member, emits ONE canonical bounded handoff record**, and the orchestrator (and the conductor) parses any fleet's worker output uniformly.

- **The type is `FleetHandoffRecord`**, exported from `@harness-engineering/types` (`FleetHandoffRecordSchema` is its zod schema). It is the single source of truth for the shape, so it cannot drift between the worker that emits it and the orchestrator that parses it.
- **Its fields** are a fixed, documented, bounded set: `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, `evidence[]` (verifiable pointers — a `{ kind, ref, note? }` naming a branch, PR, artifact path, SHA, or CI check, which is exactly what VERIFY re-checks rather than trusting the worker's prose), `next_steps[]`, an optional `blocker`, and an optional envelope version `v`. Domain payloads a member already carries (e.g. `bug-fleet`'s `Candidate`, `ideate-fleet`'s candidate record) live **inside** the record's `summary`/`evidence`/`next_steps` — the envelope wraps them, it does not replace them.
- **It is bounded.** `.strict()` rejects unknown keys (a member cannot smuggle an ad hoc field back in), required fields are non-empty, and a cross-field invariant requires any non-`done` status to carry a non-empty `blocker` (`FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES`). A malformed record is **rejected, never silently misread**.
- **Emitters and consumers.** Each member's worker **emits** the record at the end of DISPATCH. The orchestrator (and `fleet-command`) **consumes** it by validating with `validateFleetHandoffRecord` (non-throwing, returns a discriminated `SCHEMA` / `BLOCKER_REQUIRED` error) or `parseFleetHandoffRecord` (throwing). A worker that cannot produce a well-formed handoff record for its item did not run the family standard.

This record is modeled on a Ralph-loop bounded structured report (the normalized report passed from one continuing round to the next), and mirrors the package's existing `plan-task.ts` / `maintenance-findings.ts` shared-type + validator pattern.

## Hard invariants (every member)

1. **Dogfood the real per-item skills.** Never hand-implement or short-cut the per-item pipeline — the artifacts it leaves behind are what VERIFY checks for.
2. **Verify adherence by artifact + all-OS CI green** before any terminal action. For build-shaped members the artifact is a plan directory plus an autopilot-state; for review/land-shaped members it is a recorded review verdict plus the PR's CI signal. Green on one OS is not green. A member that **emits no code and opens no PR** has no CI subject: it records all-OS CI as **not applicable** rather than dropping it silently, and substitutes a second independent check that carries the same evidentiary weight (`ideate-fleet` re-derives every ranking from the artifact's own inputs). Recording the not-applicable is what keeps the invariant honest — a skipped check and an inapplicable one must not look alike.
3. **A self-report is never verification.** "Pipeline ran, CI green" is a claim the orchestrator independently checks, never accepts.
4. **Never silently merge or ship unreviewed work.** The fleet's product is a reviewable/authorized batch. `roadmap-fleet` never merges at all; `pr-fleet` lands only what a human authorized up front and verification cleared. No member auto-merges unreviewed work.
5. **Every worker emits the canonical `FleetHandoffRecord`.** A worker hands back the ONE bounded handoff envelope from `@harness-engineering/types` (see _The worker handoff record (canonical)_ above), never an ad hoc per-member report shape, and the orchestrator validates it with `validateFleetHandoffRecord` before trusting it — so `fleet-command` parses any fleet's worker output uniformly.

## The concurrency governor (machine-storm cap)

Cap concurrent subagents at **2 (default), max ~3**. Beyond roughly three concurrent build/assist agents the compound load produces flaky failures indistinguishable from real ones; a stormed batch is slower once re-runs are counted. Never raise the cap to "go faster."

## The worktree push-path caveat

A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Subagents push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

## Runtime preconditions

A conductor or a fan-out parent is the one actor able to inject a single bad environment assumption into every lane at once, so the runtime a lane inherits is part of the contract — not an implementation detail left to whoever launches it.

**Node 22 or newer is required.** The graph and state layers load a native `better-sqlite3` binding, and a mismatched Node ABI fails at load time rather than at install time. A lane that inherits the wrong interpreter fails in ways that look like flaky subagents.

**Pin the interpreter by absolute path — do not prepend a Node bin directory to `PATH` to obtain it.** A Node installation's `bin` directory is not only an interpreter directory: package managers place shims for globally-installed CLIs there too, and a `harness` shim among them can be years older than the one the operator intends to run. Prepending the directory silently substitutes that older CLI for every child process the run spawns. Pass the resolved absolute path to the interpreter (and, where a lane invokes the CLI, the resolved absolute path to the CLI) instead of mutating `PATH` and relying on implicit resolution order.

**Verify the toolchain before trusting any scan output.** Have SELECT record the resolved paths and the reported `harness --version`, and treat that record as part of the probe's evidence. A stale scanner does not error — it re-reports findings the workspace has already justified and suppressed, so its output is well-formed, confident, and wrong. Findings, queue depths, and any scheduling decision derived from them inherit that corruption silently. Recent CLI versions refuse to run findings-producing commands when they are sharply out of step with the workspace's declared `toolchain.cliVersion`, but that guard cannot fire inside a CLI old enough to predate it, which is exactly the case the pinning rule above exists to prevent.

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
