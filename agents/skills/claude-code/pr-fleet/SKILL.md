# PR Fleet

> Autonomous PR-queue land orchestrator — triage the open-PR queue, confirm with the human in one up-front round that carries the merge decision, fan out worktree-isolated subagents that each run the **real** review-assist pipeline, independently verify every PR by all-OS CI and a review verdict, and land **only** the PRs the human authorized. The fleet never silently auto-merges unreviewed work and never trusts a subagent's self-report.

Clearing the open-PR queue is the mirror-image slog of building a backlog. Every open pull request has to be hand-triaged — is CI green on all platforms, is it reviewed, does it still merge cleanly, is it stale or superseded — then review-assisted, and finally landed one at a time with a human at each merge button. For a queue of dozens the human's attention is the bottleneck, not the machinery. `pr-fleet` is the terminal **land** stage of the `-fleet` family conveyor (intake → decide → build → **land**) and the structural twin of `roadmap-fleet`: both fan out over a work-queue with a concurrency governor and independent verification, then hand to a human. The difference is the queue and the terminal act — `roadmap-fleet` produces merge-ready PRs and never merges; `pr-fleet` consumes the open-PR queue and is the stage that actually **lands** PRs, while the final merge decision stays with a human. The shared, stage-agnostic scaffolding both skills build on is documented in the `-fleet` family spine reference (`docs/reference/fleet-family.md`).

## When to Use

- A queue of open pull requests needs autonomous triage, review-assist, and landing with one bulk human decision instead of per-PR babysitting
- Clearing accumulated PR-queue pressure where landing each PR by hand does not scale
- Turning a heterogeneous open-PR queue into a set of landed PRs plus a clear report of what could not be landed and why
- When the PRs are largely independent — each lands on its own and does not require another to merge first
- NOT for a single PR — review it and merge it directly; a fleet's overhead only pays off across a queue
- NOT for building or fixing the feature a PR implements — that is `roadmap-fleet` / the per-item pipeline; `pr-fleet` assists review and lands, it does not re-open the build
- NOT for merge conflicts that need design judgment — a PR needing a human to resolve semantic conflicts is triaged blocked and reported, never force-resolved
- NOT for converging one PR to done through repeated review rounds — that is a **pipeline** (it loops on one target), not a fleet (which fans out across many independent PRs)

## Flags

| Flag            | Effect                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `--concurrency` | Cap concurrent review-assist subagents (default 2, max recommended 3 — the machine-storm cap) |
| `--report-only` | Enumerate and triage the queue and present the ranked batch; do not dispatch, verify, or land |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out and landing                                  |

## Process

### Iron Law

**A PR is landed only after the human authorized it up front AND independent all-OS-CI + review-verdict + mergeability verification passed. The fleet never silently auto-merges, and never accepts a subagent's self-report as proof a PR is land-ready.**

The merge decision is a human act. The fleet may execute a land, but only for a PR the human explicitly checked to land in CONFIRM and that independent verification then confirmed is green, reviewed, and mergeable. A subagent that reports "reviewed, CI green, ready to merge" has told you what it believes, not what is true — the only evidence is the CI signal on the PR and a recorded review verdict, checked by the orchestrator itself. Landing an unapproved PR, or an unverified one, or one on a self-report, is a gate violation.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
                Phase 5: LAND + REPORT <-- Phase 4: VERIFY
```

| Phase            | Purpose                                                                        | Exit Condition                                                           |
| ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1. SELECT        | Enumerate the open-PR queue, triage each PR, cross-check, order                | Triaged `PrCandidate[]` with land-readiness buckets and detected forks   |
| 2. CONFIRM       | One up-front human round that carries the per-PR **merge authorization**       | Human-checked land set, answered forks, agreed concurrency               |
| 3. DISPATCH      | Worktree-isolated subagents run the real review-assist pipeline                | Every assist PR returned a review verdict + CI re-run, parked, or failed |
| 4. VERIFY        | Independent all-OS-CI + review-verdict + mergeability check, never self-report | Each PR marked land-ready / not-land-ready / retry                       |
| 5. LAND + REPORT | Merge only approved + verified PRs; summarize; close superseded PRs            | Approved+verified PRs landed; report delivered; superseded PRs closed    |

The five-phase spine, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its push-path caveat, and the never-silent-merge invariant are the family-shared scaffolding — stated once in `docs/reference/fleet-family.md`. This skill states only what is specific to the **land** stage: the PR-queue triage taxonomy, review-assist, and the human merge gate.

### Phase 1: SELECT — Enumerate, Triage, Cross-Check, Order

1. **Enumerate the open-PR queue.** List open PRs via `gh pr list --state open`. Missing `gh` auth degrades to reporting the gap rather than aborting — with no queue access there is nothing to land.

2. **Triage each PR into the land-readiness taxonomy.** Compute each PR's bucket from `gh pr view` / `gh pr checks` mergeability, CI, and review signals:
   - **land-ready** — CI green on all OS, review clean/approved, mergeable, no conflicts.
   - **needs-review-assist** — CI green but no review verdict yet, or review findings unaddressed.
   - **needs-heal** — CI red, merge conflicts, or a stale base needing a rebase.
   - **blocked** — draft/WIP, depends on another unlanded PR, or an external blocker.
   - **superseded / already-resolved** — closed elsewhere, or a newer PR replaces it → flag for closure, not land.
   - **stale** — no activity past the queue's threshold → flag for human triage.

3. **Cross-check for supersession.** For every candidate, check whether a newer merged or open PR already delivers its change. A superseded PR is **flagged for closure with a citation**, never landed and never re-reviewed from scratch.

4. **Order landable candidates by land-priority.** Do not rank ad-hoc. Reuse `harness-roadmap-pilot`-style impact scoring so ordering is principled and reproducible; order highest-impact-to-land first.

5. **Detect decision forks up front.** Scan each PR's discussion/diff for genuine ambiguity a lander would otherwise have to guess (e.g. "squash or merge-commit for this PR?", "does this need the changelog entry before landing?"). Surface these _known_ forks in CONFIRM; do not answer them here.

6. **Build the `PrCandidate` record** for each PR:

   ```
   PrCandidate {
     number,            // PR number / url
     title,
     author,
     bucket,            // "land-ready" | "needs-review-assist" | "needs-heal" | "blocked" | "superseded" | "stale"
     ciStatus,          // per-OS CI signal
     reviewVerdict,     // present | absent | findings-open
     mergeable,         // boolean (no conflicts, base current)
     supersededBy,      // set when bucket = superseded
     landApproved,      // set in CONFIRM (human merge authorization)
     forks,             // detected known decision forks (may be empty)
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate That Carries the Merge Decision `[checkpoint:human-verify]`

1. **Present the triaged queue in one round.** This is the **only guaranteed human touchpoint** and the **seat of the merge decision** — everything downstream runs autonomously. Present, together, in a single surface:
   - The triaged PRs, ordered by land-priority, each with its bucket and CI/review/mergeability status.
   - Superseded / stale PRs **flagged for closure** with their superseding PR — the human confirms closing; the fleet never lands them.
   - Every detected known decision fork as a **multiple-choice question** with a recommended default.
   - The **proposed concurrency** (default 2, capped at ~3).

2. **The human explicitly checks which PRs to land.** This checked set is the **merge authorization** — the human's merge decision, captured once for the batch. The human may also trim, answer forks, and confirm closures in this same gate. A PR the human does not check is never landed, no matter how green it is.

3. **From here it is autonomous.** After this gate the fleet does not pause per-PR. The only thing that re-surfaces before the report is an _unforeseen_ fork that parks a single PR (see DISPATCH) — and even that does not block the batch. Under `--dry-run` the skill stops at the end of this phase.

### Phase 3: DISPATCH — Worktree Review-Assist Fan-Out With a Concurrency Governor

1. **One worktree-isolated subagent per PR that needs assist or heal.** Each subagent is briefed to run the **real** `harness-code-review` against its one PR's diff, push fix commits for **mechanical** findings (lint, format, import order, safe review-bot suggestions), re-run CI, and record a review verdict. It does **not** merge, does **not** post a human approval, and does **not** resolve semantic review disagreements by guessing. Feed answered forks from CONFIRM into the brief so the subagent never re-asks a settled question. `land-ready` PRs skip assist and go straight to VERIFY.

2. **Cap concurrency at the governor (default 2, max ~3).** This is the machine-storm limit shared across the family: beyond roughly three concurrent subagents the compound load produces flaky failures indistinguishable from real ones. Never exceed the confirmed concurrency to "go faster" — a stormed batch is slower once you account for re-runs.

3. **Park unforeseen forks; never guess mid-flight.** A subagent runs autonomously on recommended-option defaults for anything routine. But if a PR hits a genuinely **unforeseen** decision fork — a review finding that needs a design call, a conflict needing human judgment — that PR **parks and reports** the fork instead of guessing. Parking is per-PR: the rest of the batch continues uninterrupted. The parked fork appears in the report for the human.

4. **Record an "assist actions" note per PR.** Each subagent records the recommended-option defaults it took and the mechanical fixes it pushed, so the eventual report shows exactly what the fleet touched — batch review is only trustworthy when the reviewer can see what was changed.

5. **Push-path caveat.** A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Subagents push fix commits via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the land depends on.

**Worker handoff — return the canonical `FleetHandoffRecord`.** When a worker finishes its PR it hands the orchestrator exactly one `FleetHandoffRecord` (from `@harness-engineering/types`) — the ONE bounded envelope every `-fleet` member emits, so `fleet-command` parses any fleet's worker output uniformly instead of special-casing an ad hoc per-worker report shape. The record carries `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, an `evidence[]` of verifiable pointers (branch, PR, artifact path, CI check — exactly the references VERIFY re-checks), `next_steps[]`, and, for any non-`done` status, a `blocker`. The orchestrator validates it with `validateFleetHandoffRecord`; a malformed or unknown-keyed record is rejected, never silently misread. See the canonical handoff record in `docs/reference/fleet-family.md`.

### Phase 4: VERIFY — Independent Land-Readiness Confirmation, Never Self-Report

1. **Never accept a subagent's self-report as verification.** "Reviewed, CI green, ready to merge" is a claim to be checked, not a result. For each PR proposed to land, the orchestrator independently confirms the evidence itself.

2. **Require all-OS CI green — and base-fresh (spine clause; the fourth mechanical condition).** Confirm the PR's CI is green on **all target operating systems** plus the project's required checks (`gh pr checks` / `gh run list`). Green on one OS is not green. A subset-red PR is not land-ready — it is reported, and the batch continues. `pr-fleet` is the only member that merges, so it is the only place a **stale** green is _directly_ exploitable: green counts toward land-ready only when it ran against **current `main`** — the SHA the CI ran against is up to date with the base tip, **or** branch protection enforces strict / up-to-date-before-merge, **or** the PR is merged-forward and re-run before landing. With `required_status_checks.strict` `false` (the GitHub default), `mergeStateStatus: CLEAN` does **not** imply freshness, so green against a base that `main` has moved past leaves the PR **not** land-ready on that evidence: it is **degraded** and reported with the stale tested base SHA vs current `main`, to be merged-forward and re-run. SELECT reads `required_status_checks.strict` and, when `false`, labels every candidate's CI **provisional** through CONFIRM so the authorizing human sees "green" is qualified. See `docs/reference/fleet-family.md` § _Base freshness_ (`classifyBaseFreshness`).

3. **Require a review verdict and mergeability.** Confirm a review verdict exists (from the assist pipeline or an existing human review) and that the PR is mergeable — no conflicts, base current. A PR with an open review finding or a conflict is not land-ready.

4. **Require the human land-authorization.** Confirm the PR was checked to land in CONFIRM. A PR that is green, reviewed, and mergeable but **not** human-approved is **not** landed — it is reported as verified-but-unauthorized.

5. **Classify each PR** as `land-ready` (approved + all-OS CI green + review verdict + mergeable), `not-land-ready` (missing any of these), or `retry` (transient CI failure, retried at most once). No PR is landed without passing every check.

### Phase 5: LAND + REPORT — Human-Authorized Landing, Superseded Closure, Never Silent-Merge

1. **Land only the approved + verified PRs.** Merge each PR that is both human-approved (CONFIRM) and independently verified (VERIFY), via `gh pr merge` using the repo's configured merge method and honoring branch protection. Land nothing else. If branch protection blocks a merge (e.g. a required human review is still missing), report it as not-landed with the reason — never route around protection.

2. **Emit a one-row-per-PR batch summary** for the human:

   | PR  | Bucket | Verdict | Assist actions | Land result | Parked forks |
   | --- | ------ | ------- | -------------- | ----------- | ------------ |

   Every landed PR's row carries its link, the assist-actions note from DISPATCH, and the land result. Not-landed PRs are listed with the reason (subset-red CGI, unauthorized, un-mergeable, parked fork).

3. **Close superseded / already-resolved PRs accurately.** For each PR flagged superseded in SELECT and confirmed in CONFIRM, close it with a comment **citing the superseding/resolving PR** — never a bare close, and never a re-review.

4. **Never silently auto-merge.** Every land traces to an explicit human authorization plus independent verification. A PR the human did not check, or that verification did not clear, is reported — not merged. Auto-merging unreviewed work is out of scope by design.

5. **Degrade gracefully.** Missing `gh` auth, an un-mergeable PR, or a single PR's failed assist results in that PR being **reported** while the rest of the batch proceeds. One bad PR never sinks the batch.

## Harness Integration

- **`harness skill run pr-fleet`** — Run the full five-phase land pipeline.
- **`harness-roadmap-pilot`** — Its impact scoring is reused in SELECT to order landable PRs by land-priority.
- **`harness-code-review`** — The real per-PR review pipeline each assist subagent runs in DISPATCH; the fleet composes it and never reimplements review.
- **`gh`** — Enumerate open PRs and read CI/review/mergeability signals (SELECT/VERIFY), push assist commits, land approved+verified PRs (`gh pr merge`), and close superseded PRs with citations (LAND).
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (five-phase skeleton, governor, verification discipline, worktree fan-out, never-silent-merge).
- **`harness skill validate pr-fleet`** — The authoring-time gate for this skill's own structure and schema.

## Success Criteria

- Given a confirmed set of N human-approved PRs, the fleet lands exactly those that pass independent verification (CI green all-OS + review verdict + mergeable), and reports every PR it did not land with the reason.
- There is **exactly one** up-front human decision round, and it carries the merge authorization; no per-PR interactive pauses except a genuinely-new fork parked to its own PR.
- The fleet **never** merges a PR the human did not explicitly approve, and **never** auto-merges unreviewed work.
- No PR is landed on a subagent self-report — every land is backed by independently-checked CI + review + mergeability evidence.
- Superseded / already-resolved PRs are **closed with citations, not landed**.
- Review-assist runs the real `harness-code-review` and pushes only mechanical fixes — it never fabricates an approval or guesses a semantic finding.
- It **degrades gracefully**: missing `gh` auth, an un-mergeable PR, or a single PR's failed assist is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).

## Gates

- **No land without an explicit human authorization.** A PR not checked to land in CONFIRM is never merged, regardless of CI or review state. Landing an unauthorized PR = gate violation.
- **No land without all-OS CI green plus a review verdict plus mergeability.** Green on a subset of operating systems (or with enforce/harness red), a missing review verdict, or an unresolved conflict means not-land-ready. Report it; do not land it.
- **Never silently auto-merge.** The fleet lands only what the human authorized and verification cleared. Auto-merging unreviewed work, or routing around branch protection, = gate violation.
- **A self-report is never verification.** Accepting "reviewed, CI green" without independently checking CI, the review verdict, and mergeability = gate violation. Re-verify independently.
- **Review-assist never fabricates approval.** Pushing mechanical fixes is assist; posting a human approval or guessing a semantic review finding is not. The review verdict must come from the real pipeline, never invented to clear the gate.
- **Never exceed the concurrency governor.** More than ~3 concurrent subagents is the machine-storm zone; do not raise the cap to "go faster."
- **Never `--no-verify`.** No subagent bypasses the pre-push gates; a `.claude/`-nested worktree pushes via the GitHub API or a non-nested worktree instead.

## Escalation

- **Missing `gh` auth:** with no queue access there is nothing to land — stop and report the gap rather than guessing at PR state.
- **A PR parks on an unforeseen fork:** surface the fork (with the PR's context and the recommended default) in the report for the human; do not guess and land. The parked PR is the only one affected.
- **CI red on a subset of OS:** report the PR not-land-ready with the failing OS/check named; never land it. Do not average a mixed CI result into "mostly green".
- **Branch protection blocks a merge:** report the PR not-landed with the specific unmet requirement (e.g. "required human review missing"); never route around protection to force the land.
- **A PR needs a semantic conflict or design-level review finding resolved:** triage it blocked and report it; the resolution needs a human — the fleet does not force-resolve it.
- **The queue appears coupled (one PR must land before another can merge):** land them in dependency order or, if the coupling needs human sequencing, report it; fan-out assumes independence.

## Rationalizations to Reject

| Rationalization                                                                            | Reality                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The subagent reported it reviewed the PR and CI is green, so it's safe to land"           | A self-report is a claim, not evidence. Independently confirm all-OS CI, a recorded review verdict, and mergeability before landing — or the PR is not land-ready. |
| "This PR is green and reviewed — I'll land it even though the human didn't check it"       | The merge decision is the human's. A PR not checked to land in CONFIRM is never merged, no matter how ready it looks. Report it as verified-but-unauthorized.      |
| "CI is green on Linux, land it"                                                            | Green on one OS is not green. Landing requires all target operating systems plus enforce and harness. A subset-red PR is reported not-land-ready, not landed.      |
| "There's no review on this PR, but it looks fine — I'll approve it and merge"              | Review-assist runs the real pipeline to a verdict; it never fabricates an approval. A missing review verdict means not-land-ready, not a rubber stamp.             |
| "This merge conflict is small — I'll resolve it however seems right and land"              | Semantic conflicts need human judgment. Force-resolving one buries an unreviewed decision in a landed PR. Triage it blocked and report it.                         |
| "Branch protection is blocking the merge — I'll merge with admin to keep the batch moving" | Never route around protection. Report the PR not-landed with the unmet requirement; protection is part of the human merge decision, not an obstacle to it.         |
| "This PR looks new to me — no need to check whether a newer PR already superseded it"      | Cross-check every PR for supersession. Landing a superseded PR creates a conflicting duplicate; superseded PRs are closed with a citation, not landed.             |
| "Bumping concurrency to six will clear the queue sooner"                                   | Beyond ~3 concurrent subagents is the machine-storm zone — compound load produces flaky failures that cost more in re-runs than the extra parallelism saves.       |

## Red Flags

| Flag                                                                       | Corrective Action                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "I'll land it based on the subagent's summary"                             | STOP. Independently check all-OS CI, the review verdict, and mergeability. A summary is not a verification.       |
| "It's green and reviewed, I'll merge even though the human didn't pick it" | STOP. The human authorizes each land in CONFIRM. Unauthorized PRs are reported, never merged.                     |
| "No review here, but I'll approve and land it"                             | STOP. Review-assist runs the real review to a verdict; it never invents an approval. No verdict → not land-ready. |
| "The pre-push gate is failing in this worktree — I'll `--no-verify`"       | STOP. Never bypass. Push via the GitHub API or a non-`.claude` worktree; the gate is part of the verification.    |
| "Admin-merge past branch protection to finish the batch"                   | STOP. Never route around protection. Report the PR not-landed with the unmet requirement.                         |

## Examples

### Example: A seven-PR open queue

```
$ harness skill run pr-fleet --concurrency 2

Phase 1: SELECT
  Enumerated: 7 open PRs (gh pr list).
  Triage:
    - #A "cache headers"       -> land-ready (CI green all-OS, approved, mergeable)
    - #B "retry policy"        -> needs-review-assist (CI green, no review verdict)
    - #C "token refresh"       -> needs-heal (CI red on windows, stale base)
    - #D "audit log v2"        -> superseded by a newer merged PR -> flag for closure
    - #E "docs typo"           -> land-ready
    - #F "big refactor"        -> blocked (draft/WIP)
    - #G "rate-limit headers"  -> needs-review-assist
  Ordered landable candidates by land-priority via roadmap-pilot scoring.
  Detected forks: 1 — "#B: squash or merge-commit?"

Phase 2: CONFIRM  [checkpoint:human-verify]
  Triaged queue presented. #D flagged for closure (superseded).
  Human checks to LAND: #A, #B, #E, #G  (the merge authorization).
  Human answers fork: #B -> squash. Concurrency confirmed: 2.

Phase 3: DISPATCH (governor = 2)
  #B, #G -> review-assist subagents run harness-code-review, push format/lint fixes, re-run CI.
  #A, #E -> land-ready, skip assist.
  #G hits an UNFORESEEN fork (a review finding needs a design call)
    -> parks and reports; the others continue.

Phase 4: VERIFY (independent — no self-report)
  #A: CI green all 3 OS + enforce + harness, review verdict present, mergeable, authorized -> land-ready
  #B: assist pushed fixes, CI green all 3 OS, review verdict present, mergeable, authorized -> land-ready
  #E: green, reviewed, mergeable, authorized -> land-ready
  #G: parked in DISPATCH -> not-land-ready (fork awaits human)

Phase 5: LAND + REPORT
  | PR | Bucket        | Verdict      | Assist actions        | Land result | Parked forks          |
  | -- | ------------- | ------------ | --------------------- | ----------- | --------------------- |
  | #A | land-ready    | land-ready   | —                     | LANDED      | —                     |
  | #B | needs-assist  | land-ready   | pushed format+lint    | LANDED      | —                     |
  | #E | land-ready    | land-ready   | —                     | LANDED      | —                     |
  | #G | needs-assist  | not-land-ready | ran review           | not landed  | design finding        |
  Closed #D as superseded, citing the superseding PR.
  Landed 3 human-authorized + verified PRs. Never merged an unauthorized or unverified PR.
```

### Example: Refusing to land an unauthorized green PR

A PR is CI-green on all platforms, carries an approving review, and is perfectly mergeable — but the human did not check it to land in CONFIRM. VERIFY marks it verified-but-unauthorized. Per the Iron Law it is **not landed**; it appears in the report as land-ready-but-not-authorized for the human to pick up next time. The merge decision was never the fleet's to make.

## Test Scenarios

### Scenario 1: Gate — landing an unauthorized PR

VERIFY finds a PR green on all OS, reviewed, and mergeable, but it was not checked to land in CONFIRM. Expected: the "no land without an explicit human authorization" Gate halts the merge; the PR is reported verified-but-unauthorized, not landed. Landing it because it "looks ready" is the failure this scenario guards against.

### Scenario 2: Rationalization — fabricating a review to clear the gate

An assist subagent finds a PR with no review verdict and reasons "it looks fine, I'll approve it and land." Expected: rejected by the "review-assist never fabricates approval" gate — the verdict must come from the real `harness-code-review` pipeline. A missing verdict means not-land-ready, never a rubber stamp.

### Scenario 3: Park-unforeseen — a design-level review finding mid-flight

An assist subagent hits a review finding that needs a design call (not a mechanical fix). Expected: the PR **parks and reports** the finding rather than guessing a resolution and landing; the parked fork appears in the report for the human; the other in-flight PRs continue uninterrupted. Silently resolving the finding and landing is the failure this scenario guards against.

### Scenario 4: Self-report — accepting "CI green" without checking

A subagent reports "reviewed, CI green, ready to merge." Expected: the "a self-report is never verification" gate requires the orchestrator to independently confirm all-OS CI, the review verdict, and mergeability via `gh` before landing. Landing on the report alone is the failure this scenario guards against.
