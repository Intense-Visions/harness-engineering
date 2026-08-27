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

## Item-type routing (build-shaped members)

A build-shaped member (one whose per-item pipeline authors and lands a change — `roadmap-fleet`, `security-fleet`) must route each item to the pipeline its **type** needs, not force every item through one hardcoded chain. A bug does not need a spec, it needs a diagnosis; forcing it through the design-first pipeline gives it ceremony it does not need and then stalls in `harness-autopilot`, which has no `## Implementation Order` to parse. The canonical statement of this routing policy is **ADR 0103** — members reference it rather than restate it.

**Three routes.** The classifier maps each item to exactly one:

| Route          | Item is…                                                             | Pipeline DISPATCH runs                      |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| **bug**        | something broken with a known / investigable root cause (diagnostic) | `harness-debugging`                         |
| **spec-ready** | already carrying an approved spec (design is settled)                | `harness-autopilot`                         |
| **feature**    | a new capability needing design, or genuinely ambiguous              | `harness-brainstorming → harness-autopilot` |

The other two `harness-router` scopes (`quick-fix → tdd`, `guided-change → planning`) are **not** part of the fleet map: they presuppose an interactive human loop the autonomous members do not have.

**Classification — metadata first, rubric fallback (first match wins):**

1. **Explicit metadata** — a GH issue label (`bug`/`defect` → bug; `feature`/`enhancement` → feature) or a roadmap shard's kind/type field.
2. **Spec presence** — an approved spec already linked (roadmap `spec:` non-null or a `proposal.md`) → **spec-ready**; brainstorming would re-litigate a settled decision.
3. **Rubric fallback** — apply `harness-router`'s scope rubric by judgment over the item text: diagnostic signals (broken, slow, failing, regression, error, crash) → **bug**; construction signals (build, add, design, new, support for) → **feature**; genuine ambiguity → **feature** (the safe default — brainstorming can still decide an item needs no design, whereas debugging cannot invent one).

**Placement on the spine.** Classify at **SELECT** (attach the `route` and the `routeSignal` that fired to each item record); surface it in the **CONFIRM** batch as an **overridable** decision (a new fork class — the human may re-route any item before fan-out); execute the routed pipeline in **DISPATCH**; and check **route-dependent** artifacts in **VERIFY**:

| Route      | VERIFY artifact                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| bug        | committed `provenance.json` with `stages=[debugging]` **and** a committed reproducing test (fails-before/passes-after) — **not** a `plans/` directory |
| spec-ready | a `plans/` directory + `provenance.json` whose `stages` include `autopilot`                                                                           |
| feature    | a `plans/` directory + `provenance.json` whose `stages` include `brainstorming`, `autopilot`                                                          |

A route-blind VERIFY that always demanded a `plans/` directory would reject every correctly-debugged item; making it route-aware is what keeps the "no artifact ⇒ hand-patch ⇒ reject" invariant honest across all three routes.

## The worker handoff record (canonical)

Every member's DISPATCH fans out worktree-isolated **workers** that each complete one item and hand a structured report back to the orchestrator (and, under `fleet-command`, up to the conductor). Historically each member invented its own ad hoc report shape, which forced `fleet-command` to special-case every fleet's worker output. The family standard removes that: **every worker, in every member, emits ONE canonical bounded handoff record**, and the orchestrator (and the conductor) parses any fleet's worker output uniformly.

- **The type is `FleetHandoffRecord`**, exported from `@harness-engineering/types` (`FleetHandoffRecordSchema` is its zod schema). It is the single source of truth for the shape, so it cannot drift between the worker that emits it and the orchestrator that parses it.
- **Its fields** are a fixed, documented, bounded set: `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, `evidence[]` (verifiable pointers — a `{ kind, ref, note? }` naming a branch, PR, artifact path, SHA, or CI check, which is exactly what VERIFY re-checks rather than trusting the worker's prose), `next_steps[]`, an optional `blocker`, and an optional envelope version `v`. Domain payloads a member already carries (e.g. `bug-fleet`'s `Candidate`, `ideate-fleet`'s candidate record) live **inside** the record's `summary`/`evidence`/`next_steps` — the envelope wraps them, it does not replace them.
- **It is bounded.** `.strict()` rejects unknown keys (a member cannot smuggle an ad hoc field back in), required fields are non-empty, and a cross-field invariant requires any non-`done` status to carry a non-empty `blocker` (`FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES`). A malformed record is **rejected, never silently misread**.
- **Emitters and consumers.** Each member's worker **emits** the record at the end of DISPATCH. The orchestrator (and `fleet-command`) **consumes** it by validating with `validateFleetHandoffRecord` (non-throwing, returns a discriminated `SCHEMA` / `BLOCKER_REQUIRED` error) or `parseFleetHandoffRecord` (throwing). A worker that cannot produce a well-formed handoff record for its item did not run the family standard.

This record is modeled on a Ralph-loop bounded structured report (the normalized report passed from one continuing round to the next), and mirrors the package's existing `plan-task.ts` / `maintenance-findings.ts` shared-type + validator pattern.

## Hard invariants (every member)

1. **Dogfood the real per-item skills.** Never hand-implement or short-cut the per-item pipeline — the artifacts it leaves behind are what VERIFY checks for.
2. **Verify adherence by artifact + all-OS CI green** before any terminal action. For build-shaped members the artifact is a plan directory plus an autopilot-state; for review/land-shaped members it is a recorded review verdict plus the PR's CI signal. Green on one OS is not green. **Green against a stale base is not verified either** — a CI conclusion is evidence only about the base it ran against; see _Base freshness_ below. A member that **emits no code and opens no PR** has no CI subject: it records all-OS CI as **not applicable** rather than dropping it silently, and substitutes a second independent check that carries the same evidentiary weight (`ideate-fleet` re-derives every ranking from the artifact's own inputs). Recording the not-applicable is what keeps the invariant honest — a skipped check and an inapplicable one must not look alike.
3. **A self-report is never verification.** "Pipeline ran, CI green" is a claim the orchestrator independently checks, never accepts.
4. **Never silently merge or ship unreviewed work.** The fleet's product is a reviewable/authorized batch. `roadmap-fleet` never merges at all; `pr-fleet` lands only what a human authorized up front and verification cleared. No member auto-merges unreviewed work.
5. **Every worker emits the canonical `FleetHandoffRecord`.** A worker hands back the ONE bounded handoff envelope from `@harness-engineering/types` (see _The worker handoff record (canonical)_ above), never an ad hoc per-member report shape, and the orchestrator validates it with `validateFleetHandoffRecord` before trusting it — so `fleet-command` parses any fleet's worker output uniformly.

## Base freshness (a CI conclusion is evidence only about the base it ran against)

Invariant 2 requires all-OS CI green. That is necessary but not sufficient, because a CI conclusion carries a hidden coordinate the members historically dropped: **_when_ was it gathered, and against which base?** A PR whose green CI never once ran against the base it is about to merge into satisfies every other condition the spine states — and can still break the default branch the moment it lands. This is not hypothetical: it put a cross-client tenancy hole into a downstream repo's `main` during a `pr-fleet` run, where two individually-correct PRs were never executed together until both were already merged.

```
CI is green   ≠   this change is safe on today's main
```

The two readings of "green" collapse into one precisely when GitHub's `required_status_checks.strict` is `false` — **the default, not an exotic setting**. With `strict: false`, GitHub reports `mergeStateStatus: CLEAN` for a branch hours behind its base, so the field most likely to be read as "safe to merge" is silent on exactly this. And "a self-report is never verification" does not save a member here: the orchestrator _did_ independently gather the CI conclusion via `gh` — the evidence was real, independently gathered, and stale.

**The clause.** A green CI conclusion counts as **verified** / merge-ready only when it ran against the **current** base:

- the branch is rebased onto (or already up to date with) current `main` — the base the CI ran against has **not** moved since; **or**
- branch protection enforces **strict / up-to-date-before-merge** (`required_status_checks.strict === true`), so GitHub itself refuses to land a branch behind its base.

Otherwise — the base moved past the tested SHA since the green was gathered — the conclusion is **stale**, and the item's verdict is **downgraded to `degraded`, not trusted as verified**. The report names the **stale tested base SHA vs current `main`** so the human authorizing the batch sees that "green" is qualified. A degraded item is refreshed (rebase/merge-forward and re-run) before it can authorize an irreversible act; it is never silently promoted to verified.

**Where it binds.** `pr-fleet` is the only member that merges, so it is the only place the gap is _directly_ exploitable — there it is a fourth mechanical VERIFY condition alongside CI / verdict / mergeability, and SELECT reads `required_status_checks.strict` and labels every candidate's CI **provisional** through CONFIRM when it is `false`. But **every member that reports "verified" from a CI conclusion inherits the reasoning error**, and `fleet-command`'s CI trust gate consumes those verdicts to judge a whole run — so the clause lives here in the spine and each member references it in its Phase 4 VERIFY. Members that emit no code and derive no verdict from a CI conclusion (`ideate-fleet`, `issue-fleet`) record it **not-applicable**, the same honesty invariant 2 already demands.

**Mechanically checkable.** `classifyBaseFreshness` (exported from `@harness-engineering/core`) turns the tested base SHA, current base tip, whether the base advanced since the test, and whether strict protection is enforced into a `{ trust: 'verified' | 'degraded', fresh, reason }` verdict — so the clause is enforceable in code, not only prose. The caller derives its inputs from `gh pr view --json` + `gh api` / branch protection.

## The concurrency governor (machine-storm cap)

Cap concurrent subagents at **2 (default), max ~3**. Beyond roughly three concurrent build/assist agents the compound load produces flaky failures indistinguishable from real ones; a stormed batch is slower once re-runs are counted. Never raise the cap to "go faster."

## Cross-run claim lease (ID-based members)

The concurrency governor above bounds a single _invocation_. It says nothing about a **second run on another clone** enumerating the same backlog at the same time — the family's one un-covered collision. The **cross-run claim lease** closes exactly the `SELECT → PR-open` window for the ID-based members (`roadmap-fleet`, `issue-fleet`, `pr-fleet`), whose items already carry a GitHub-native id at SELECT. It is **advisory** — best-effort backlog auto-partitioning, never an exactly-once mutex; that trade-off (soft reservation over a true-CAS git-ref lock) is deliberate and is recorded in the family claim-lease ADR (**ADR 0105**).

**The claim record.** A claim is one GitHub issue/PR comment: an HTML marker line `<!-- harness-fleet-claim -->` followed by a fenced JSON block carrying `{ v, owner, runId, fleet, item, claimedAt, leaseSeconds }`. The shape is the `FleetClaim` type in `@harness-engineering/types`; the pure render/parse/TTL primitives — `buildClaimBody`, `parseClaimComment`, `isLeaseLive`, plus `CLAIM_LABEL` (`fleet:claimed`), `DEFAULT_LEASE_SECONDS` (720), `HEARTBEAT_SECONDS` (240) — live in `@harness-engineering/core` (`fleet/claims`). All `gh` I/O stays in the member's orchestration layer; the core module is pure and offline.

**Lifecycle — SELECT → CLAIM → HEARTBEAT → RELEASE.**

| Step      | What the member does                                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SELECT    | Enumerate candidates as today, plus fetch `--label fleet:claimed` items and their claim comments (piggybacks the existing enumeration — no extra `gh pr list`). Drop an item with an **open PR** (`in-progress-elsewhere`, the existing drop) **or** a **live lease written by another run** (`claimed-elsewhere`). A **stale** lease is ignored. |
| CLAIM     | On entering DISPATCH for an item, add the `fleet:claimed` label and post the claim comment. Re-read first: if a competing live claim appeared since SELECT, **yield the item** (soft reservation — skip and move on).                                                                                                                             |
| HEARTBEAT | While the worker builds, edit the claim comment every `HEARTBEAT_SECONDS`, bumping the server `updated_at` and extending the lease.                                                                                                                                                                                                               |
| RELEASE   | On PR-open, remove the `fleet:claimed` label (the comment stays as an audit trail). The **open PR is now the durable claim** and backstops the item via the existing open-PR drop.                                                                                                                                                                |

**Staleness = the server clock, not the writer's.** A lease is live while `serverUpdatedAt + leaseSeconds > now`, computed from the GitHub-server `updated_at` of the claim comment — never the writer-stamped `claimedAt`. This defeats cross-machine clock skew and lets a crashed run's lease self-heal: no heartbeat ⇒ the lease lapses at `updated_at + leaseSeconds` ⇒ the next run's SELECT reclaims it. A terminal non-`done` outcome with no PR also releases the label so the item is not stranded.

**Soft reservation, not a mutex.** Contention skips and moves on rather than blocking — concurrency becomes backlog auto-partitioning (the front-load / park-and-continue model, ADR 0088). **Reclaim tiebreak:** reclaiming a stale lease appends a _fresh_ claim comment; if two runs reclaim at once the earliest server-stamped comment wins, and the loser detects a competing live claim (runId mismatch) on its first heartbeat re-read and yields. Residual double-work is bounded to that sub-second race — by design never worse than today's uncoordinated behavior.

**Graceful degradation.** If `gh` auth is absent the member cannot scan the claim label; it **degrades to the open-PR cross-check only** and logs the degradation — it never aborts (matching each member's existing "missing `gh` auth degrades to the available source" posture). An escape hatch `--no-claim` disables the mechanism entirely; `--lease-seconds <n>` overrides the TTL.

Each ID-based member's `SKILL.md` **references this section** from its SELECT and DISPATCH steps rather than restating the mechanism.

## The per-leaf context-replay budget

The concurrency governor caps _how many_ leaves run at once; it says nothing about _how much context each leaf loads_. Measured local usage is overwhelmingly context **replay**, not generation — cache-read to output runs ≈ **298 : 1** (issue #1524). Because a fresh leaf's assembled context is re-read on every turn, the dominant cost term is `context_size × turns`, and **fan-out width multiplies it**: a fleet that fans out N leaves at an unbounded per-leaf context size multiplies the dominant cost term N times over. Efficiency work aimed at output tokens addresses ~0.3% of spend; the lever that matters is the per-leaf context load. This is the family's control for that lever, complementing context-surface-attribution (#1274, the always-loaded _static_ surface) by governing the _dynamic_ replay volume that dwarfs it.

**The contract — a hard ceiling, enforced fail-loud at DISPATCH.** Each leaf carries a **declared/estimated context load**; DISPATCH checks it against a per-leaf **budget** _before fanning the leaf out_. A leaf whose estimate exceeds the budget is **rejected visibly at dispatch time with a clear reason** — it never silently spends past the ceiling. This is the entire primitive: the budget is on the **assembled context size** (the number fan-out multiplies), not on cumulative replay.

**The primitives** are pure and offline (no fs, no network, no token-counting library — the caller supplies the estimate, the primitive decides), living in `@harness-engineering/core` (`fleet/context-budget`), with their shapes in `@harness-engineering/types` (`fleet-context-budget.ts`) — the same split as the claim lease:

| Symbol                                         | Role                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS` (200 000) | Sane default ceiling (~a full large context window); overridable via fleet config.                                                                                                                                  |
| `resolveContextBudget(override?)`              | Resolve the effective budget; a non-positive override is **rejected**, never silently disabling the ceiling.                                                                                                        |
| `enforceLeafContextBudget(estimate, budget)`   | The enforcement primitive → a discriminated `LeafBudgetVerdict`. Boundary (`estimate == budget`) is **in** budget.                                                                                                  |
| `assertLeafWithinBudget(estimate, budget)`     | **The fail-loud consult helper** a DISPATCH site calls: throws `ContextBudgetExceededError` (carrying the losing verdict) when over budget, returns `void` when within. This is what actually enforces the ceiling. |
| `formatBudgetFailure(verdict)`                 | The loud, human-readable rejection a member surfaces at DISPATCH (names item, estimate, budget, overage, top contributors).                                                                                         |
| `summarizeLeafSpend(estimate, budget, spend?)` | Build the per-leaf `LeafContextSpend` record recorded in the **lane provenance** so batch review sees each leaf's declared budget and whether it was in budget.                                                     |

**How DISPATCH consults it.** Before fanning out a leaf, a member computes the leaf's estimated context load and calls `assertLeafWithinBudget(estimate, budget)`. It resolves its effective budget from adopter config as `contextBudget.perFleet[fleet] ?? contextBudget.maxTokens`; when no budget is configured the consult is a no-op (**unlimited default** — byte-identical to no enforcement). The throw is caught at the DISPATCH site, which surfaces the loud reason and skips the leaf so it never spends.

**The live enforcement caller.** The executable orchestrator dispatch governor is the first live caller: `assertIssueWithinContextBudget(config, issue)` (`packages/orchestrator/src/core/context-budget-governor.ts`) is consulted inside the state machine's dispatch loop (`dispatchEligibleIssue` in `core/state-machine.ts`) **before** each leaf/agent is claimed. On an over-budget estimate it emits a loud `emitLog` error effect and skips dispatch — the over-budget leaf fails visibly and never spends. The budget is adopter configuration on the concurrency/governor surface: `agent.contextBudget = { maxTokens, perFleet? }` in `harness.orchestrator.md`. **Absent ⇒ unlimited**; only an explicit budget changes behavior.

**Provenance.** The per-leaf budget verdict (`budgetTokens`, `estimatedTokens`, `withinBudget`) is recorded in the lane provenance file. The measured post-hoc `cacheReadTokens` field is defined but filled only once the live-measurement wiring lands (the burn package already attributes cache-read per-lane via `agentId`).

**Deferred slices (tracked under #1524).** Batching queue items per leaf to amortise the load, routing leaf context through `code_outline` / `code_unfold` / `find_context_for` by default, and wiring the measured cache-read into provenance are follow-ups; this section states the **enforcement core** — the declared budget and the fail-loud-at-dispatch guarantee. A build-shaped member references this section from its DISPATCH step rather than restating the mechanism.

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

| Member           | Stage  | Queue                                           | Per-item pipeline                                                                                                                              | Terminal act                                |
| ---------------- | ------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `ideate-fleet`   | ideate | strategy themes / opportunity areas             | `harness-ideate`                                                                                                                               | curated ranked shortlist (files nothing)    |
| `issue-fleet`    | intake | open-issue backlog                              | triage / dedup / cross-check                                                                                                                   | ranked, deduped, resolved-closed queue      |
| `adr-fleet`      | decide | pending architectural decisions                 | `architecture-advisor`                                                                                                                         | batch ADR sign-off                          |
| `roadmap-fleet`  | build  | backlog (issues + roadmap shards)               | routed per §Item-type routing (`debugging` · `autopilot` · `brainstorming`→`autopilot`)                                                        | REPORT (merge-ready PRs; never merges)      |
| `pr-fleet`       | land   | open-PR queue                                   | `code-review` (review-assist)                                                                                                                  | LAND (human-authorized) + REPORT            |
| `cicd-fleet`     | —      | CI/CD-red / flaky-test runs                     | deflake / heal                                                                                                                                 | REPORT                                      |
| `test-fleet`     | —      | test-coverage gaps                              | `test-advisor` → `tdd` / `test-craft`                                                                                                          | test PRs                                    |
| `security-fleet` | —      | evidence-gated security findings + supply chain | `security-scan` / `supply-chain-audit` / `security-craft` → FIX tier routed per §Item-type routing (`debugging` · `brainstorming`→`autopilot`) | fix PRs + filed evidence packets            |
| `cleanup-fleet`  | —      | entropy / hotspot backlog                       | `codebase-cleanup` (per-target)                                                                                                                | remediation PRs                             |
| `bug-fleet`      | —      | latent-defect risk (standing code)              | review machinery → `tdd` (repro) → `debugging` (fix)                                                                                           | tiered: fix PRs + filed issues              |
| `craft-fleet`    | —      | craft-skill findings (LLM-judgment quality)     | eleven `-craft` skills (critique) → `refactoring` (elevation)                                                                                  | tiered: elevation PRs + filed roadmap items |

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
- **ADR 0103** — Item-type routing for build-shaped members (`roadmap-fleet`, `security-fleet` route bug/spec-ready/feature items to `debugging` / `autopilot` / `brainstorming`→`autopilot`).
- **ADR 0105** — Cross-run advisory work-claim lease for the ID-based members (soft-reservation GitHub-backed lease bridging the `SELECT → PR-open` window; why not an exactly-once CAS lock).
