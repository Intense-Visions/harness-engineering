# The `-fleet` family spine

> The genuinely-shared, stage-agnostic scaffolding every `-fleet` skill builds on. This is a reader aid and a sibling-onboarding anchor — not an include. Each `-fleet` `SKILL.md` remains self-contained (it must validate and run standalone in adopter projects); this page states the common contract once so members build on it rather than copy-paste, and so a new member's author knows what is shared versus what is theirs to define.

## What a `-fleet` is

A `-fleet` skill autonomously works down a **queue of like items** by fanning out isolated pipelines, then hands the human a **batch to review or authorize** — never a per-item slog. The technique unifies the family the way LLM-judgment critique unifies the `-craft` family.

A `-fleet` is **distinct from a convergence _pipeline_** (`docs-pipeline`, `codebase-cleanup`, …), which loops on **one** target until it converges. A `-fleet` fans out across **many** independent items into **many** outcomes for a single bulk human decision.

## The conveyor

`ideate-fleet` (ideate) → `issue-fleet` (intake) → `adr-fleet` (decide) → `roadmap-fleet` (build) → `pr-fleet` (land); `cicd-fleet`, `test-fleet`, `security-fleet`, `cleanup-fleet`, `bug-fleet`, `craft-fleet`, `perf-fleet`, and `docs-fleet` work quality queues alongside. Each member owns one stage's queue and terminal act; the spine below is common to all.

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

## `CONFLICTING` on driver-managed paths (GitHub cannot run merge drivers)

This repo routes its high-churn generated artifacts through custom merge drivers declared in `.gitattributes`:

| Paths                                                                                                                                                                      | Driver                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `.harness/**/baselines.json`, `**/.harness/**/baselines.json`, `coverage-baselines.json`, `benchmark-baselines.json`, `.harness/security/timeline.json`, `docs/roadmap.md` | `merge=ours`          |
| `.harness/comprehension/**/_module.md`                                                                                                                                     | `merge=comprehension` |

A driver exists only in a local checkout's git config: `git config merge.ours.driver true` and `git config merge.comprehension.driver 'harness comprehension-merge-driver %O %A %B %P'`, both set by `harness init`. GitHub's server-side merge has neither. A PR whose only conflicts are on these paths therefore shows `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` on GitHub while merging cleanly locally. In one `pr-fleet` run, all four `CONFLICTING` PRs in the queue merged locally with zero unresolved paths (#2042). On the PR page alone, that false red looks exactly like a real conflict.

**Telling a false red from a real conflict.** First confirm both drivers are registered in the checkout (`git config --get merge.ours.driver`, `git config --get merge.comprehension.driver`). Without them a local merge reproduces GitHub's false red, so the check would test nothing. Then, on the PR branch, run `git merge --no-commit origin/main` and list unresolved paths with `git diff --name-only --diff-filter=U`. An empty list means the red was the driver gap. Any listed path is a real conflict and goes back through the per-item pipeline.

**Heal.** Commit the merge-forward and push it. GitHub recomputes mergeability against the new head. For comprehension shards, the pre-commit hook and `harness comprehend --check` reconcile any residual source-staleness the merge leaves.

**The `merge=ours` trap: check before you heal.** `ours` keeps the **branch's** copy, which is not neutral when the branch's copy is the older one. Merging `origin/main` into a stale baseline-refresh branch keeps that branch's baseline and discards main's newer one. #2042 caught a merge-forward that would have reverted `.harness/arch/baselines.json` from a `13:16:06` refresh back to `13:07:32`. Before pushing a merge-forward, run `git diff origin/main -- <path>` on every `merge=ours` path it touched. If the branch's copy is older than main's, regenerate it on the merged tree, as the `.gitattributes` comment directs ("Regenerate after merge instead"), and do not keep it. A PR whose whole content is a stale baseline refresh is closed and regenerated on current `main`, not healed.

## Verification hazards (probes that report success without running)

Invariant 3 says a self-report is never verification. The hazards below are the cases where the _independent_ check is itself a self-report in disguise: it exits 0 and agrees with the claim whether or not the thing it checks happened. The common rule is to pair every check with a control that shows it can fail. A probe that has never been seen to fail has not been shown to test anything.

### An identity probe over two missing exports (#2062)

To prove a deprecated alias still resolves to its replacement, the obvious probe compares the two imports:

```js
const m = await import('<pkg entry>');
console.log('identical=', m.oldName === m.newName); // true when BOTH are undefined
```

`undefined === undefined` is `true`. If neither name is exported, the probe certifies the very surface it failed to find. Both barrel shapes in this repo can produce that `undefined`. `packages/core/src/index.ts` is generated, and part of it comes from the curated `SELECTIVE_EXPORTS` allowlist in `scripts/generate-core-barrel.mjs`, so an export added without an allowlist edit is silently absent. `packages/orchestrator/src/core/index.ts` is a hand-maintained named export list. Run against `packages/core/dist/index.mjs` with two names that do not exist, the probe prints `identical= true`. The existence check below prints `exists= false`.

- **Assert existence before identity.** Both names must pass `typeof m.name === 'function'` (or `'name' in m`) before `===` is consulted. Identity alone is never sufficient.
- **Show the probe failing.** Remove the export locally, confirm the probe goes red, then restore it.
- **Probe the built artifact,** through a real runtime import via the package's `exports` map, not a source-path import that may resolve through a barrel no consumer sees.

### An in-place edit that matched nothing (#2061)

macOS ships BSD `sed`, which does not support GNU's `\b` word-boundary escape. A substitution using it matches nothing, changes no bytes and **exits 0**. BSD `grep` _does_ honour `\b`, so re-grepping for the search pattern finds it and looks like confirmation. Reproduced on macOS 27 (`/usr/bin/sed`, `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`):

```
$ printf 'foo bar\n' > t.txt
$ sed -i '' 's/\bfoo\b/REPLACED/g' t.txt; echo "exit=$?"
exit=0
$ cat t.txt
foo bar
$ grep -c '\bfoo\b' t.txt
1
$ grep -c REPLACED t.txt
0
```

Every signal a lane would normally read says the edit succeeded, and the file is unchanged. `perl -pi -e 's/\bfoo\b/REPLACED/g' t.txt` on the same file produces `REPLACED bar`.

- **Verify an edit by its post-condition, never by re-matching the search pattern.** Check that `git diff --stat` is non-empty, or grep for the **replacement** text.
- **An edit command that exits 0 with an empty diff has failed.** Do not record it as applied.
- **Script word-boundary codemods** with `perl -pi -e` or a short `node` script, whose `\b` behaves the same on every platform, rather than `sed`.

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

**Graph-scoped leaf-context assembly (the default).** Reducing the context load itself — not just capping it — is what attacks the 298:1 replay cost at its root. A dispatched leaf therefore assembles its working context **graph-scoped by default**: every dispatched-leaf stage prompt carries a directive to retrieve existing code via `code_outline` / `code_unfold` / `find_context_for` first and read raw whole-file source **only for the specific region under edit**. The default is safe — the edit region still gets full source, so correctness is never traded for economy. The one place a leaf's prompt is built (`agent.retrievalMode` → `buildWorkflowContext` → `renderStagePrompt` → the shared stage-prompt templates in `packages/orchestrator/src/workflow/`) reads the mode, so the behavior cannot be set-but-never-read. The explicit **opt-out** is `agent.retrievalMode: 'raw'` in `harness.orchestrator.md`, which omits the directive and renders a prompt byte-identical to the pre-slice template. **Absent ⇒ `'graph-scoped'`** (the default; see `DEFAULT_RETRIEVAL_MODE`).

**Deferred slices (still tracked under #1524).** Wiring the measured cache-read into provenance (`cacheReadTokens`) and an A/B acceptance run proving the cache-read reduction at equal task success remain follow-ups; this section states the **enforcement core** (the declared budget and the fail-loud-at-dispatch guarantee) plus the **graph-scoped-by-default** assembly above. A build-shaped member references this section from its DISPATCH step rather than restating the mechanism.

**Per-leaf batching: #1524 keeps the token-cost half; its review-attention half is superseded.** Batching queue items per leaf to amortise the load was deferred here on **token-cost** grounds alone — the batching that matters to this section is the one that lowers `context_size × turns`, and that slice is still tracked under #1524. The other half of the same question — how many **work units** the queue is made of at all, and who pays each one's fixed ceremony cost — is a review-attention problem rather than a replay-economy one, and it is now answered mechanically and at a different seam by [§The clumping floor](#the-clumping-floor-work-unit-granularity), which groups like items into one work unit **before** anything is dispatched. Read the two together: #1524 is about what a leaf loads, clumping is about how many leaves there are.

## The global spend envelope (fleet-command)

The concurrency governor caps _how many_ leaves run at once and the per-leaf context budget caps _how much context each leaf loads_; neither caps _how much a whole coordinated run may spend_. A `--slots` cap is a **slot** cap, not a **spend** cap: a single `fleet-command` run at `--slots 2` can still burn millions of subagent tokens across ~7 lanes plus rebases. The budget governor (#1525) closes this for the **orchestrator engine** — but only inside its `state-machine.ts` `handleTick` code loop. The skill-driven fan-out has no such loop (an agent is the dispatcher), so it needs the same envelope wired at the DISPATCH contract. This is that control (issue #1600, companion to #1525 and #1524/#1596).

**The contract — a period spend envelope, consulted at DISPATCH, stops clean at a lane boundary.** `fleet-command` already owns the cross-fleet leaf-slot pool; it now also carries a token **spend envelope**, allocated per-fleet. Before scheduling each lane, the conductor **consults the envelope against observed spend** and, once the envelope is exhausted, **stops scheduling new lanes cleanly at the wave/lane boundary** — an in-flight lane is never interrupted mid-write, exactly like #1525. Absent an envelope the consult is a **no-op** (unbounded — byte-identical to the pre-#1600 world); only an explicit envelope changes behavior.

**One primitive, two paths.** The spend-vs-envelope decision is the SAME implementation the orchestrator engine consults — not a forked second governor. The pure, offline decision primitive lives in `@harness-engineering/core` (`fleet/spend-budget`), with its shapes in `@harness-engineering/types` (`fleet-spend-budget.ts`) — the same split as the claim lease and the context budget. The orchestrator's `budget-governor.ts` delegates its exhaustion predicates to it; the fleet-command dispatch path calls it through a concrete CLI callable. The primitive is **unit-agnostic**: the orchestrator supplies raw `tokenTotals`, the fleet path supplies burn's price-weighted `units` — each path stays internally consistent and the unit is stated at each call site.

| Primitive (`@harness-engineering/core`, `fleet/spend-budget`) | Contract                                                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isGlobalEnvelopeExhausted(spentTokens, envelopeTokens)`      | The one shared comparison: `spentTokens >= envelopeTokens`. A breach stops dispatch for EVERY fleet at the next lane boundary.                                               |
| `isFleetAllocationExhausted(fleetSpentTokens, allocation?)`   | A per-fleet sub-allocation breach skips only THAT fleet's lanes; `undefined` allocation ⇒ never fleet-exhausted.                                                             |
| `evaluateSpendEnvelope(observed, envelope?, fleetKey?)`       | The fleet-command DISPATCH consult helper → a discriminated `SpendEnvelopeVerdict` (`within` / `exhausted` / `unconfigured`). `undefined` envelope ⇒ `unconfigured` (no-op). |

**The concrete callable (how DISPATCH consults it).** The enforceable seam is **`harness fleet budget-check`** (`packages/cli/src/commands/fleet/budget-check.ts`). It reads the envelope from flags reusing the `agent.budget` shape (`--envelope <units>`, `--period`, `--fleet <name>` / `--fleet-envelope <units>`), reads **observed spend from burn's existing per-lane/per-fleet attribution** (#1270 — global from the week-to-date units, per-fleet from burn's per-skill units block; no new measurement pipeline), calls `evaluateSpendEnvelope`, and reports `within | exhausted | unconfigured` on stdout (`--json` for machine consumption). The exit code encodes the verdict — `0` within/unconfigured, `10` exhausted — so a skill/agent can branch. The conductor calls it at each lane boundary and stops scheduling new lanes when it reports `exhausted`. This is what makes the DISPATCH contract enforceable code rather than only prose.

**Dollars are derived (Refs #1525).** The envelope and observed spend are denominated in burn **units** — the portable, model-mix-agnostic metric enforcement runs on. When an adopter configures a burn `cost_price_table` (per-model USD per token — the same table the cost-per-PR report uses; no bundled provider pricing), `budget-check` also surfaces the signal in **dollars**: `buildSummary` reconciles the week's accrued spend to USD through that table and carries it on the summary's `cost` block, and the command renders/emits `spent`, `remaining`, and `envelope` in `$` (remaining/envelope derived from the week's own observed `$`/unit rate). Absent a table there is no dollar figure and the output is byte-identical — tokens stay the source of truth, `$` is purely derived.

**Provenance.** The envelope in force and the per-lane spend consulted are recorded in the run's assumptions-made / budget-accounting note, alongside the slot allocation (`--concurrency`) the lane was dispatched with.

## The clumping floor (work-unit granularity)

The concurrency governor caps _how many_ leaves run at once, the per-leaf context budget caps _how much context each leaf loads_, and the spend envelope caps _how much a whole run may spend_. None of them governs **how many work units the queue is made of in the first place** — and that is the term the family's overhead is actually linear in. Every item carries a **fixed ceremony cost**: an issue, a branch, a worktree, a 3-OS CI matrix, a review pass, a merge, and a baseline-refresh PR. That cost is **invariant to the size of the payload**: a one-line fix and a subsystem rewrite pay the same toll. Agents emit findings at a rate humans never did and the findings skew small, so as the emission rate rises and the payload shrinks the ratio inverts and the ceremony becomes the work. The measured shape of that, at the spec's **2026-11-10** count: 361 open issues, and **15 of the last 25 merged PRs** were `chore: refresh baselines after merge` — pure per-merge overhead carrying no payload at all. Both figures move with the backlog (re-measured 2026-11-11: 347 open, 16 of the last 25), so it is the **ratio** that is the evidence, not either number. The second-order effect is worse than the first, because a small item is _tractable_, so an agent with a choice picks it and a backlog of small items quietly crowds out the work that moves the project.

**The contract — one mechanical control, two clauses.** A finding **below the floor is acted on rather than filed**, and a set of **like findings becomes one work item rather than N**. The control is family-shared and binds at all three seams where findings become work — **creation** (findings grouped before filing), **intake** (`issue-fleet` gains a `clump` triage axis beside label / dedup / route / prioritize), and **execution** (one clump per lane, one PR per clump) — from a single implementation. It adds **no new human gate**: clumps ride the existing CONFIRM round, where the human approves or splits the whole clump set at once. Per-clump confirmation would reinstate the per-item slog the family exists to remove. The canonical statement is **ADR 0135** — members reference this section rather than restate the mechanism.

**The primitives** are pure and offline (no fs, no network, no clock — the caller normalizes its native record and the primitive decides), living in `@harness-engineering/core` (`fleet/clumping`), the same slot as the claim lease, the context budget and the spend envelope. Core knows nothing about findings, issues or PRs; each seam owns a small adapter and keeps the native record on an opaque `ref`.

| Symbol                             | Role                                                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClumpableItem`                    | The seam-neutral work candidate: `id`, `scope`, `kind`, `grade`, `weight`, `conflictKeys`, `ref?`.                                                                                                             |
| `Grade`                            | A **union**, not a scalar — `axes` (tier/impact/confidence), `severity`, or `ungraded`. The floor reads structure; `weight` orders only.                                                                       |
| `DEFAULT_CLUMP_POLICY`             | `maxPerClump` 12, `maxClumps` 20, `minToClump` 2, `floorResolution` `'act'`, `floorEnabled` true — matching `craft-fleet`'s existing caps. **Frozen**; `resolveClumpPolicy` hands back a fresh mutable object. |
| `resolveClumpPolicy(partial?)`     | Fill a partial policy from the defaults. Absent config ⇒ defaults, never an error.                                                                                                                             |
| `resolveFloor(item, ctx, policy?)` | The floor → a discriminated `FloorVerdict`. Below the floor it carries a `resolution` (`'act'` / `'file'`) and a `reason`.                                                                                     |
| `formClumps(items, policy?, ctx)`  | Formation → a `ClumpResult` carrying `clumps`, `floored`, `overCap`, `ungraded`, `solo`, `conflictSplits` and a `counts` block with one count per bucket.                                                      |

**The floor — the grouped axes rule, and why the grouping is the whole rule.** An `axes`-graded item is below the floor when `impact === 'small' && (tier === 'aspirational' || confidence === 'low')`; a `severity`-graded item when its severity is `suggestion`. The grouping is stated explicitly because the rule must **not** be read as `(small ∧ aspirational) ∨ low`: a `large`-impact, `low`-confidence finding is exactly the kind of observation worth filing, and the flattened reading would silently discard it. A floor that swallowed every low-confidence finding would look identical in output to a correct one, which is why `foundational` / `large` / `low` is pinned as the positive control rather than spot-checked.

**`floorResolution` is a ceiling, not an outcome.** It states the _most_ a sub-floor item may resolve to; the **touched-set precondition** narrows it. `'act'` requires every one of the item's `conflictKeys` to already be inside `ctx.touched` — fixing a small item in place is cheap precisely because the file is already open, while acting outside the in-flight diff is diff creep wearing a bias-for-action costume. Absent a touched set, or outside it, the resolution degrades to `'file'`. **A sub-floor item with no conflict keys also degrades to `'file'`**, by an explicit guard rather than by consequence: `every` over an empty array is vacuously true, so the plain reading hands the most permissive resolution to the item that justifies it least. You cannot act in place on a file you cannot name. The asymmetry with formation — where a keyless item _is_ vacuously disjoint and joins the first sub-clump — is deliberate: joining a clump claims no hunk and harms no one, while resolving to `'act'` authorizes a write.

**Ungraded is terminal: never floored _and_ never clumped.** An item with no gradable signal is set aside in its own `ungraded` bucket for human triage, exactly as `issue-fleet` routes an un-scoreable issue to an unranked group rather than inventing a score — a fabricated grade is a lie in the queue. Terminal rather than pass-through is mechanical, not stylistic: ranking and capping are **by weight**, so admitting a weightless item to grouping would require fabricating a weight, the precise thing the rule exists to forbid. It is also what makes the conservation law below well-formed, since a pass-through item would sit in two buckets at once. Both layers enforce it: `formClumps` diverts an ungraded item before consulting the floor, and `resolveFloor` independently returns `below: false` for one, so a seam that calls the floor directly gets the same answer.

**Grouping is `(scope × kind)` with a hard non-conflict precondition.** `scope` is the unit a reviewer holds in their head at once (a directory at the craft seam; a path signal, else `unscoped`, at intake); `kind` is the kind of judgment the item demands (a rubric family, a domain tag, a type label). That pair is what makes a clump reviewable rather than merely large — one judgment mode over one coherent scope. **No two members of one clump may require the same hunk**: within a group, members are ordered weight-desc (tiebreak `id` asc) and placed greedily into the first sub-clump with a disjoint key set, else a new one, and the number of splits is reported as `conflictSplits`. A group in which every member conflicts with every other correctly degenerates to N solo items. Graph-derived co-change affinity is **not** the key — affinity answers "do these change together", which is not the question a reviewer is asked. An `unscoped` item never co-clumps with a scoped one; inferring a scope that isn't there manufactures exactly the false affinity that makes a clump unreviewable. Both the group key and the clump id are **JSON-encoded, never joined**, because the encoding must be injective for arbitrary caller strings: a joined key let `{scope:'src/my api', kind:'CODE'}` collide with `{scope:'src/my', kind:'api CODE'}`, and since a clump reports the scope and kind of its first member, the forged item shipped under a scope and a kind that were not its own.

**The cap counts emitted work units, never findings.** `maxClumps` applies to clumps **plus** solos, ranked by weight — counting findings would let the cap be bypassed by scattering, one finding per scope. A group below `minToClump` stays as solo items, because a one-member clump is an item wearing extra ceremony. An over-cap unit is **flattened to its member items** before it is shed, since the buckets partition items rather than units; pushing a shed clump in as a unit would lose its members from the report, which is the silent drop this control exists to prevent.

**Two executable laws, both with positive controls.** **Conservation:** every input item appears exactly once across `clumps ∪ floored ∪ overCap ∪ ungraded ∪ solo`, checkable from the `counts` block alone (`input === clumped + floored + overCap + ungraded + solo`). `flooredAct` / `flooredFile` are a **sub-tally** of `floored` and deliberately do not participate in the sum — adding them would double-count every floored item and make the law unsatisfiable — and they exist because the act-versus-file split is the single most useful number in the report. **Determinism:** output is a function of the input _set_, not its order, including clump ids and member order. Each law carries its own refutation cases (a lost item, a double-placed item, a sub-tally that does not sum, a reversed input), because a conservation test that cannot fail is indistinguishable from one that passes. Nothing is ever silently discarded: **floored, over-cap, ungraded and solo are all counted and reported**, and zero clumps is a valid result — the control will not fabricate a clump so a sweep does not look wasted.

**The one-PR-per-clump contract.** One branch, one PR, **one commit per member**; the title names the clump (`fix(core): <kind> across <scope> (N items)`) and the body lists each member with its citation. That gives the reviewer the three properties that make bulk review tractable — one judgment mode, one coherent scope, and a granular trail. **VERIFY assigns one verdict per clump.** A member that fails verification is **dropped by reverting its own commit**, and the clump proceeds with the rest, recording the drop and its reason; the whole clump fails only when the post-drop remainder is empty or no longer builds. This is the rule that makes clumping safe to adopt at all: without it, bundling N items would make a single bad item N times as expensive as it is today, which is the opposite of the goal. Commit-per-member is what makes the drop a one-commit revert rather than a re-run of the lane. **`harness fleet clump-dispatch` is the callable both halves run through** — `--input <run.json>` emits one PR plan per clump with one commit per member and refuses an input carrying no `clumps` block (exit 14); `--verdict <outcomes.json>` settles the one verdict, exits 13 on a failed clump, and refuses a clump nobody reported outcomes for. The four lane-unit members are SKILL.md files and nothing schedules their lanes, so without a callable this contract would be prose nothing could be held to — the same reason `fleet budget-check` exists for the spend consult.

**Clumping is not dedup.** `issue-fleet` already dedups, and dedup removes restatements of **one** thing while clumping groups **distinct** things. The two axes are independent and both run; conflating them is the likeliest misreading.

**Adopter-portable, and switchable off.** Tunables are surfaced as a `clumping` block in `harness.config.json`; absent the block the defaults apply and no path errors — the same posture as `context-budget` and `spend-budget`. `floorEnabled` exists for the same reason `--no-claim` does: a mechanical control the operator cannot switch off is one they will work around instead.

**Current state (honest).** The **primitive** has shipped (`fleet/clumping`: types, floor, formation, the one-PR-per-clump plan and the D10 verdict, three executable laws, and a resolve check proving the barrel export is reachable rather than a silent no-op). All three **seam bindings** have shipped too: creation (21 craft emission sites plus the review comment set), intake (`harness fleet clump-issues` and the `issue-fleet` CONFIRM surface) and execution (`harness fleet clump-dispatch`, the lane-unit and D10 rules in the four build-shaped members, and `craft-fleet` SELECT reading `output.clumps` instead of re-folding findings). What is **not yet wired** is the `clumping` block in `harness.config.json` — until Phase 6 lands, the defaults are the only policy and an adopter cannot switch the floor off from config. Each seam phase gates on **WIRED** — non-zero live callers plus an integration test — never on EXISTS, because a module with zero callers is the set-but-never-read failure this family keeps rediscovering; the execution seam additionally gates on CONSUMPTION, because Phases 3 and 4 each proved emission while nothing read what they emitted.

## The lane isolation boundary (repo _and_ user-global state)

The fan-out gives each lane its own **git worktree** so lanes cannot collide, and it is that isolation guarantee which lets a fleet run N lanes concurrently _without reasoning about interference between them_. But a git worktree isolates exactly **one** thing: the repository working tree. It does **not** isolate the process's `$HOME`, its XDG dirs, or `~/.claude/`. A lane whose feature — or whose **verification run** — exercises a code path that writes **user-global state** writes straight through the worktree boundary to the operator's real, live state. (This is not hypothetical: a `roadmap-fleet` lane's `burn` verification once rewrote the operator's live `~/.claude/hud/state/summary.json`; see #1299.)

**Lane isolation therefore covers repo _and_ user-global state — the worktree alone is not the boundary.** A lane is isolated only when neither its execution nor its verification can reach the operator's real `~/.claude`. The worktree covers the repo; a **per-lane config-dir env override covers everything the worktree does not**, and the two together are "lane isolation."

- **Mechanism — a per-lane `CLAUDE_CONFIG_DIR`.** For the duration of a lane, redirect `~/.claude` into a sandbox under the lane's own worktree by setting `CLAUDE_CONFIG_DIR` in the environment the lane and its child processes inherit (`@harness-engineering/core`'s `buildLaneStateEnvOverride(worktreePath)` computes the value; the sandbox lives under the worktree's gitignored `.harness/lane-state/`). One generic override isolates **every** writer that honors it at once, rather than teaching each user-global writer about workspaces one at a time. Claude Code honors `CLAUDE_CONFIG_DIR` natively; the harness's own state-writers honor it too (e.g. `burn`'s `resolvePaths()` derives its HUD store from `CLAUDE_CONFIG_DIR` before falling back to `$HOME/.claude`).
- **The override must be in force for VERIFY as well as DISPATCH.** The incident's write came from a _verification_ run — the phase that exercises the built code against real writers is exactly where the boundary must hold.
- **A user-global writer that hardcodes `homedir()` instead of reading the override escapes the sandbox silently.** Closing the hole fully means holding writers to honoring `CLAUDE_CONFIG_DIR`; any writer that ignores it is a latent leak.

The canonical statement is **ADR 0098** — members reference it rather than restate it.

## The worktree push-path caveat

A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Subagents push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

**Hooks in a linked worktree inherit `GIT_DIR` but not `GIT_WORK_TREE` (#1841).** When you push from a linked worktree, git runs the hook with `GIT_DIR` set to the absolute per-worktree git dir (`<primary>/.git/worktrees/<name>`) and leaves `GIT_WORK_TREE` unset. Git then treats the **current directory** as the top of the working tree. From the worktree root that is correct by accident, so most hooks never notice. It breaks when the hook, or any tool it spawns, runs git from a different directory. From a subdirectory, `git rev-parse --show-toplevel` returns that subdirectory, and `git status` reports every tracked file as deleted and every file in the subdirectory as untracked. `git -C <another checkout>` compares that checkout's files against this worktree's index. Reproduced with git 2.54 and a `pre-push` hook in a linked worktree containing a `sub/` directory:

```
GIT_DIR=main/.git/worktrees/linked GIT_WORK_TREE=<unset>
cd sub:                      toplevel=linked/sub status=[ D root.txt  D sub/f  D sub/g  D sub/h ?? f ?? g ?? h ]
export GIT_WORK_TREE; cd sub: toplevel=linked     status=[]
unset GIT_DIR; cd sub:       toplevel=linked     status=[]
```

The same hook, pushed from the primary checkout, saw no `GIT_DIR` and reported clean from every directory. The failure therefore appears only in worktree fan-outs, where it reads as a real gate failure full of phantom modifications. That is exactly the pressure that makes `--no-verify` tempting. Fix it in the hook. Run `unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR` near the top so every child re-discovers its repo from its own cwd, as this repo's `.husky/pre-push` already does. Alternatively, export `GIT_WORK_TREE="$(git rev-parse --show-toplevel)"` before changing directory. A lane that meets phantom modifications from a gate whose hook lacks this guard parks and reports the cause. It does not bypass the gate.

## Gated lanes and the unchanged-worktree auto-clean

A gated lane runs in **two legs**. That is the only way a member's CONFIRM can both be presented verbatim and be batched with the rest of its wave into one human round (#1309):

```
leg 1: SELECT → CONFIRM surface → stop            (read-only; the conductor collects the surface)
       conductor batches the wave's surfaces → the human answers once
leg 2: resume with the relayed answer → DISPATCH → VERIFY → terminal act
```

**A resumed lane never answers its own CONFIRM.** A member's CONFIRM is written for a human who is present, and it carries recommended defaults. A resumed lane must not take those defaults in place of the human. Only the human's answer, as relayed by the conductor, counts. If the relayed answer is missing or does not cover a fork, the lane parks and reports the unanswered fork. The conductor states this rule in the resume message as an explicit instruction rather than leaving the lane to infer it.

Leg 1 stops with a clean tree, which is what exposes it to the auto-clean below.

A host-managed worktree is not guaranteed to outlive a stop. Claude Code's Agent tool, dispatched with `isolation: "worktree"`, **auto-cleans the worktree when the agent stops with no changes**: the directory, its `git worktree list` entry and its branch all go. A lane that parks at its member's CONFIRM gate hits that exactly, because it parks right after a read-only SELECT with a clean tree. When the conductor resumes it with the human's answer, the lane runs in the **parent's cwd, which is the shared checkout**, and nothing tells it that its isolation lapsed. This was reproduced deterministically (spawn, run read-only commands, stop, resume: the toplevel is now the shared checkout on `main`), and it cost eight lanes their worktrees across three conducted runs before anyone named the cause.

Any lane that will stop and be resumed therefore needs both of the following:

- **An explicit worktree that outlives the stop.** Create it yourself, outside any agent-config directory: `git worktree add ../<repo>-<lane> --detach origin/main`. Dispatch the lane into that path rather than relying on host isolation. A sibling path also clears the push-path caveat above. The conductor removes the worktree after VERIFY, never before.
- **A toplevel guard on every resume.** Before its first write after a resume, the lane checks `git rev-parse --show-toplevel` against the worktree it was assigned. On a mismatch it **parks and reports isolation-lost**. It does not continue, and it never treats the shared checkout as an acceptable substitute. This catches any other way of losing isolation, so a future host behavior fails loudly instead of writing into a peer's tree.

Leaf workers that run to completion without stopping are not exposed, and may keep host isolation.

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
| `perf-fleet`     | —      | measured perf-budget violations + regressions   | `perf` (measure before/after) → `debugging` / `refactoring` (fix)                                                                              | tiered: fix PRs + filed redesign issues     |
| `docs-fleet`     | —      | doc-drift / undocumented backlog                | `harness-docs-pipeline --fix` (per-area, to convergence)                                                                                       | scoped doc-fix PRs                          |

## The conductor tier

Above the members sits one skill that is **not** a member: `fleet-command`, the **conductor**. It coordinates the fleets themselves rather than fanning out over an item-queue, which makes it **Tier 3** of Skills → Pipelines → Fleets → Conductor. It is the family capstone and is built last by construction, since it composes members that must already exist.

**Why it is not named `-fleet`.** A member fans out over a queue of like items into many outcomes; the conductor's queue is other orchestrators. It reuses the spine's five phase **names** deliberately — a conductor with a private vocabulary would be harder to reason about standing next to the members it runs — with **one substitution: at that tier SELECT enumerates fleets and DISPATCH dispatches fleet lanes**, where a member's SELECT enumerates items and its DISPATCH dispatches item subagents. Naming it `-fleet` would collapse exactly the tier distinction it exists to create.

**The five properties it adds on top of the spine:**

1. **One global leaf-slot budget** across every fleet in flight — never the sum of the per-fleet governors above. Slots are consumed by the leaf subagents a member's DISPATCH fans out, so a member in a cheap phase holds no slot, and no single fleet is allocated more than **2** of the pool (the family's per-fleet _default_, not its ceiling). The budget is imposed through a named seam: every lane is dispatched with `--concurrency <allocated>`, and a lane launched without it reverts to the member's own single-fleet default. A slot cap bounds _how many_ lanes run at once, not _how much_ the run spends; the companion **global spend envelope** (§"The global spend envelope (fleet-command)", #1600) carries a per-period token budget on the same pool, consulted via `harness fleet budget-check` before each lane and stopping clean at a lane boundary when exhausted.
2. **A derived hybrid DAG** — a CI **trust gate** first, then ideation, then intake with the independent quality sweeps parallel alongside, then decide, then build, then an **exclusive** perf wave, with the land stage terminal. Run order is derived, never hand-picked, from **two** criteria, either one alone sufficient: a **dependency edge**, or an **evidence-fidelity exclusivity requirement** — a member whose evidence is a measurement, and therefore silently corrupted by co-scheduled load rather than visibly broken by it, takes a wave of its own even though no dependency edge explains it (ADR 0125). So no wave contains a dependency edge, and the exclusive wave admits only its named member. The CI wave is a trust gate rather than a repair: `cicd-fleet` hands back **unmerged** remediation PRs, so an untrustworthy signal is surfaced as a fork at the run-plan gate and its remediation pays off on the _next_ run.
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
- **ADR 0098** — The lane isolation boundary extends beyond the git worktree to user-global state, via a per-lane `CLAUDE_CONFIG_DIR` config-dir override.
- **ADR 0103** — Item-type routing for build-shaped members (`roadmap-fleet`, `security-fleet` route bug/spec-ready/feature items to `debugging` / `autopilot` / `brainstorming`→`autopilot`).
- **ADR 0105** — Cross-run advisory work-claim lease for the ID-based members (soft-reservation GitHub-backed lease bridging the `SELECT → PR-open` window; why not an exactly-once CAS lock).
- **ADR 0125** — Silently-corruptible evidence is a scheduling constraint: the exclusive wave, the second wave-boundary criterion alongside the dependency edge, and the first-non-admitting-wave deferral stop.
- **ADR 0135** — Clumping: one floor-and-group control bound at all three seams (creation, intake, execution), keyed on `(scope × kind)` with a non-conflict precondition; the `'act'` ceiling and its touched-set precondition; ungraded is terminal; one verdict per clump with a failing member reverted.
