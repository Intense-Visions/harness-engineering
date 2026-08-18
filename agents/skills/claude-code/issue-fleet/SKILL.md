# Issue Fleet

> Autonomous open-issue-backlog **intake** orchestrator — enumerate the open-issue queue, triage each issue (label, dedup, route, prioritize), confirm the destructive closes with the human in one up-front round, fan out concurrency-governed triage subagents over queue slices, independently re-derive every mutation from the issue's own signals, and hand the downstream fleets a clean, ranked, deduped, routed queue. The fleet never silently closes an issue and never trusts a subagent's self-report.

An open-issue backlog is the raw, unsorted mouth of the SDLC pipeline. Before any downstream fleet can build, decide, or land, every open issue has to be hand-triaged — labeled by type and area, checked for whether it duplicates an issue already filed, routed to the stage that should own it, and ranked against the rest. For a backlog of dozens the sorting is pure attention tax, paid before the first line of real work begins. `issue-fleet` is the **intake** stage of the `-fleet` family conveyor (**intake** → decide → build → land) and its **entry point**: it turns the backlog into a queue the downstream fleets can consume. It is the sibling of `roadmap-fleet` (build) and `pr-fleet` (land): all three fan out over a work-queue with a concurrency governor and independent verification, then hand to a human. The difference is the queue and the terminal act — `issue-fleet` consumes the **open-issue backlog** and its terminal act is a **clean, ranked, deduped, routed queue**; it produces no code and merges nothing. The shared, stage-agnostic scaffolding all three build on is documented in the `-fleet` family spine reference (`docs/reference/fleet-family.md`).

## When to Use

- An open-issue backlog needs autonomous triage — labeling, deduping, routing, and prioritizing — with one bulk human decision instead of per-issue sorting
- Clearing accumulated backlog pressure where hand-sorting each issue before any work starts does not scale
- Turning a heterogeneous open-issue backlog into a ranked, deduped, routed queue the downstream fleets (`adr-fleet`, `roadmap-fleet`, `pr-fleet`, and the quality-queue fleets) can consume
- When the issues are largely independent — each is triaged on its own signals and does not require another's triage first
- NOT for a single issue — label and route it directly; a fleet's overhead only pays off across a backlog
- NOT for building, speccing, or fixing what an issue describes — that is the downstream fleets; `issue-fleet` sorts the queue, it does not work it
- NOT for inventing a new label taxonomy — the fleet applies the project's existing label vocabulary; designing a new scheme is a separate concern
- NOT for converging one issue to a decision through discussion rounds — that is a **pipeline** (it loops on one target), not a fleet (which fans out across many independent issues)

## Flags

| Flag            | Effect                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `--concurrency` | Cap concurrent triage subagents (default 2, max recommended 3 — the machine-storm cap)             |
| `--report-only` | Enumerate and triage the backlog and present the ranked queue; do not label, close, or emit routes |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out and any mutation                                  |

## Process

### Iron Law

**An issue is closed only after the human authorized closing it up front AND independent verification re-derived it as a genuine duplicate with a real canonical citation. The fleet never silently closes an issue, and never accepts a subagent's self-report as proof a triage verdict is correct.**

Closing an issue is the one irreversible act of intake, and it is a human decision. The fleet may execute a close, but only for an issue the human explicitly checked to close in CONFIRM and that independent verification then confirmed genuinely duplicates a real canonical issue or resolving PR. A subagent that reports "this is a duplicate, close it" has told you what it believes, not what is true — the only evidence is a citation that actually matches, re-derived by the orchestrator itself. Every non-destructive mutation (a label, a route, the ranked order) is likewise re-derived from the issue's own signals before it is applied. Closing an unauthorized issue, or one whose citation does not hold up, or one on a self-report, is a gate violation.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
              Phase 5: HANDOFF + REPORT <-- Phase 4: VERIFY
```

| Phase               | Purpose                                                                        | Exit Condition                                                              |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1. SELECT           | Enumerate the backlog, triage each issue on four axes, snapshot for dedup      | Triaged `IssueCandidate[]` with label/dedup/route/rank and detected forks   |
| 2. CONFIRM          | One up-front human round that carries the **destructive-close authorization**  | Human-checked close set, answered forks, agreed concurrency                 |
| 3. DISPATCH         | Queue-slice-partitioned, concurrency-governed triage subagents finalize triage | Every slice returned finalized triage, parked an issue, or failed           |
| 4. VERIFY           | Re-derive every mutation from the issue's signals, never self-report           | Each mutation marked apply-ready / rejected; each close confirmed-duplicate |
| 5. HANDOFF + REPORT | Apply verified labels/routes, close authorized+verified duplicates, emit queue | Routed queue emitted; report delivered; duplicates closed with citations    |

The five-phase spine, the concurrency governor, the independent-verification discipline, the worktree fan-out with its push-path caveat, and the never-silent invariant are the family-shared scaffolding — stated once in `docs/reference/fleet-family.md`. This skill states only what is specific to the **intake** stage: the open-issue queue, the label/dedup/route/prioritize triage taxonomy, and the human destructive-close gate.

### Phase 1: SELECT — Enumerate, Triage, Snapshot, Detect Forks

1. **Enumerate the open-issue backlog.** List open issues via `gh issue list --state open`. Missing `gh` auth degrades to reporting the gap rather than aborting — with no queue there is nothing to triage.

2. **Triage each issue on the four axes** from its own signals (title, body, existing labels, linked refs):
   - **label** — assign the project's existing type/area labels (e.g. `bug`, `enhancement`/`feature`, `documentation`, `question`) from the issue's content. Never invent a new label.
   - **dedup** — detect whether the issue restates an already-open issue or one already resolved by a merged PR. Classify `novel` or `duplicate-of <ref>`. A duplicate carries a **canonical citation**; it is flagged for closure, never for a downstream build.
   - **route** — assign the downstream fleet that should own the issue: a decision-shaped issue → `adr-fleet`; a build-shaped feature/enhancement → `roadmap-fleet`; a CI-red / flaky-run issue → `cicd-fleet`; a coverage gap → `test-fleet`; an entropy/hotspot issue → `cleanup-fleet`. An issue that plausibly fits two stages is a **fork**, not a guess.
   - **prioritize** — score the surviving, routed issues by impact. Do not rank ad-hoc; reuse `harness-roadmap-pilot`-style impact scoring so the order is principled and reproducible.

3. **Snapshot the full open-issue list** as a shared read-only reference so slice-partitioned triage subagents (DISPATCH) still detect duplicates **across** slices, not only within one.

4. **Detect routing/label forks up front.** Scan each issue for genuine ambiguity a triager would otherwise have to guess (e.g. "is this a bug or an enhancement?", "does this belong to `roadmap-fleet` or `adr-fleet`?"). Surface these _known_ forks in CONFIRM; do not answer them here.

5. **Build the `IssueCandidate` record** for each issue:

   ```
   IssueCandidate {
     number,            // issue number / url
     title,
     signals,           // extracted title/body/labels/linked-refs
     labels,            // proposed type/area labels (from existing vocabulary)
     dedup,             // "novel" | "duplicate-of"
     canonicalRef,      // set when dedup = duplicate-of (issue/PR citation)
     route,             // downstream fleet: adr | roadmap | pr | cicd | test | cleanup
     score,             // roadmap-pilot impact score (for ranking)
     closeAuthorized,   // set in CONFIRM (human destructive-close authorization)
     forks,             // detected known label/route forks (may be empty)
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate That Carries the Close Decision `[checkpoint:human-verify]`

1. **Present the triaged queue in one round.** This is the **only guaranteed human touchpoint** and the **seat of the destructive-close decision** — everything downstream runs autonomously. Present, together, in a single surface:
   - The triaged issues, ranked by impact, each with its proposed labels, route, and dedup verdict.
   - Duplicates **flagged for closure** with their canonical citation — the human confirms closing; the fleet never closes them otherwise.
   - Every detected known label/route fork as a **multiple-choice question** with a recommended default.
   - The **proposed concurrency** (default 2, capped at ~3).

2. **The human explicitly checks which duplicates to close.** This checked set is the **destructive-close authorization** — captured once for the batch. The human may also trim, answer forks, and adjust routes in this same gate. A duplicate the human does not check is never closed, no matter how clear the match looks. Non-destructive mutations (labels, routes, the ranked order) proceed autonomously after this gate.

3. **From here it is autonomous.** After this gate the fleet does not pause per-issue. The only thing that re-surfaces before the report is an _unforeseen_ fork that parks a single issue (see DISPATCH) — and even that does not block the batch. Under `--dry-run` the skill stops at the end of this phase.

### Phase 3: DISPATCH — Queue-Slice Triage Fan-Out With a Concurrency Governor

1. **Partition the backlog into disjoint slices; one triage subagent per slice.** issue-fleet's per-item pipeline is _triage_, which produces issue-metadata mutations (labels, routes, dedup closes) via `gh`, not code — so it needs no git worktree per issue. The worktree isolation the spine mandates for the code-mutating build/land members degrades here to **queue-slice partitioning**: each subagent owns a disjoint slice of the backlog and finalizes label/dedup/route/prioritize for it. Each subagent reads the shared dedup snapshot from SELECT so duplicates are caught across slices, not only within one. Feed answered forks from CONFIRM into every brief so a subagent never re-asks a settled question.

2. **Cap concurrency at the governor (default 2, max ~3).** This is the machine-storm limit shared across the family: beyond roughly three concurrent subagents the compound load produces flaky failures indistinguishable from real ones. Never exceed the confirmed concurrency to "go faster" — a stormed batch is slower once you account for re-runs.

3. **Park unforeseen forks; never guess mid-flight.** A subagent runs autonomously on recommended-option defaults for anything routine. But if an issue hits a genuinely **unforeseen** fork — an ambiguous route or type not surfaced in CONFIRM — that issue **parks and reports** the fork instead of guessing. Parking is per-issue: the rest of the batch continues uninterrupted. The parked fork appears in the report for the human.

4. **Record a "triage actions" note per issue.** Each subagent records the labels it proposes, the dedup verdict and its citation, the route, and the rank basis, so the eventual report shows exactly what the fleet decided — batch review is only trustworthy when the reviewer can see what was triaged and why.

5. **Push-path caveat.** If a triage step ever needs to push a commit from a worktree created under a `.claude/`-nested path, that breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

**Worker handoff — return the canonical `FleetHandoffRecord`.** When a worker finishes its queue slice it hands the orchestrator exactly one `FleetHandoffRecord` (from `@harness-engineering/types`) — the ONE bounded envelope every `-fleet` member emits, so `fleet-command` parses any fleet's worker output uniformly instead of special-casing an ad hoc per-worker report shape. The record carries `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, an `evidence[]` of verifiable pointers (branch, PR, artifact path, CI check — exactly the references VERIFY re-checks), `next_steps[]`, and, for any non-`done` status, a `blocker`. The orchestrator validates it with `validateFleetHandoffRecord`; a malformed or unknown-keyed record is rejected, never silently misread. See the canonical handoff record in `docs/reference/fleet-family.md`.

### Phase 4: VERIFY — Independent Re-Derivation, Never Self-Report

1. **Never accept a subagent's self-report as verification.** "This is a duplicate, these are the right labels" is a claim to be checked, not a result. For every proposed mutation, the orchestrator independently re-derives it from the issue's own signals.

2. **Re-derive every label and route.** Confirm each proposed label is supported by a signal in the issue and drawn from the existing vocabulary; confirm each route matches the issue's shape. A label with no supporting signal, or a route with no basis, is **rejected and reported**, not applied.

3. **Confirm every dedup close is a genuine duplicate with a real citation.** For each issue authorized to close in CONFIRM, independently confirm the `canonicalRef` actually exists and genuinely covers the issue's content. A citation that does not hold up means **not a confirmed duplicate** — the issue is reported, not closed.

4. **Require the human close-authorization.** Confirm the issue was checked to close in CONFIRM. An issue that verification confirms is a duplicate but that the human did **not** authorize closing is **not** closed — it is reported as verified-duplicate-but-unauthorized.

5. **Classify each mutation** as `apply-ready` (grounded + authorized where destructive), `rejected` (no supporting signal / citation does not hold), or `retry` (transient enumeration failure, retried at most once). No close happens without passing every check.

### Phase 5: HANDOFF + REPORT — Apply Verified Triage, Emit the Routed Queue, Never Silent-Close

1. **Apply the verified non-destructive mutations.** Apply the re-derived labels and record the routes via `gh`. These proceed autonomously — they are reversible and were grounded in VERIFY.

2. **Close only the authorized + verified duplicates.** Close each issue that is both human-authorized (CONFIRM) and independently confirmed a genuine duplicate (VERIFY), with a comment **citing the canonical issue/PR**. Close nothing else — never a bare close, never a re-triage-from-scratch.

3. **Emit the terminal artifact: the clean, ranked, deduped, routed queue**, grouped by downstream fleet — the contract the next fleet in the conveyor reads. Alongside it, emit a one-row-per-issue batch summary for the human:

   | Issue | Labels applied | Dedup verdict | Route | Rank | Parked forks |
   | ----- | -------------- | ------------- | ----- | ---- | ------------ |

   Every row carries the issue link, the triage-actions note from DISPATCH, and any parked fork. Rejected mutations are listed with the reason (no supporting signal, citation did not hold, unauthorized).

4. **Never silently close.** Every close traces to an explicit human authorization plus independent verification. An issue the human did not check, or that verification did not confirm, is reported — not closed. Silent or speculative closing is out of scope by design.

5. **Degrade gracefully.** Missing `gh` auth, an un-scoreable issue, or a single slice's failed triage results in that issue (or slice) being **reported** while the rest of the batch proceeds. One bad issue never sinks the batch.

## Harness Integration

- **`harness skill run issue-fleet`** — Run the full five-phase intake pipeline.
- **`harness-roadmap-pilot`** — Its impact scoring is reused in SELECT for the `prioritize` axis so the ranked queue is principled and reproducible.
- **`gh`** — Enumerate open issues and read their signals (SELECT), apply labels and record routes (HANDOFF), and close confirmed-duplicate issues with citations (HANDOFF/REPORT).
- **The downstream fleets** — `adr-fleet`, `roadmap-fleet`, `pr-fleet`, `cicd-fleet`, `test-fleet`, `cleanup-fleet` — consume the routed queue issue-fleet emits; issue-fleet routes to them and never does their work.
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (five-phase skeleton, governor, verification discipline, worktree fan-out, never-silent invariant); issue-fleet is listed there as the intake member.
- **`harness skill validate issue-fleet`** — The authoring-time gate for this skill's own structure and schema.

## Success Criteria

- Given a backlog of N open issues, the fleet emits a ranked, deduped, routed queue grouped by downstream fleet, and applies exactly the labels/routes independent verification confirmed are grounded in each issue's signals.
- There is **exactly one** up-front human decision round, and it carries the destructive-close authorization; no per-issue interactive pauses except a genuinely-new fork parked to its own issue.
- The fleet **never** closes an issue the human did not explicitly authorize, and **never** closes one verification did not confirm is a genuine duplicate with a real citation.
- No mutation is applied on a subagent self-report — every label, route, and close is independently re-derived from the issue's own signals.
- Duplicate issues are **closed with citations, not silently**; non-duplicate issues are never closed.
- Triage applies the project's **existing** label vocabulary and never invents new labels.
- It **degrades gracefully**: missing `gh` auth, an un-scoreable issue, or a single slice's failed triage is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).

## Gates

- **No close without an explicit human authorization.** An issue not checked to close in CONFIRM is never closed, regardless of how clear the duplicate looks. Closing an unauthorized issue = gate violation.
- **No close without a verified, real citation.** A dedup close whose `canonicalRef` does not exist or does not genuinely cover the issue is not a confirmed duplicate. Report it; do not close it.
- **Never silently close.** The fleet closes only what the human authorized and verification confirmed. Speculative or bare closing = gate violation.
- **A self-report is never verification.** Accepting "this is a duplicate / these labels are right" without independently re-deriving it from the issue's signals = gate violation. Re-derive independently.
- **Never invent labels.** Triage applies the project's existing label vocabulary; minting a new label to fit an issue = gate violation.
- **Never exceed the concurrency governor.** More than ~3 concurrent subagents is the machine-storm zone; do not raise the cap to "go faster."
- **Never `--no-verify`.** No subagent bypasses the pre-push gates; a `.claude/`-nested worktree pushes via the GitHub API or a non-nested worktree instead.

## Escalation

- **Missing `gh` auth:** with no queue access there is nothing to triage — stop and report the gap rather than guessing at issue state.
- **An issue parks on an unforeseen fork:** surface the fork (with the issue's context and the recommended default) in the report for the human; do not guess and route. The parked issue is the only one affected.
- **A dedup citation does not hold up:** report the issue as not-a-confirmed-duplicate with the failing citation named; never close it. Do not downgrade a shaky match into "probably a duplicate".
- **An issue plausibly fits two downstream stages:** surface it as a routing fork in CONFIRM, or park it if discovered mid-flight; never force-route it to one stage by guessing.
- **An issue is un-scoreable (no signal to rank on):** report it in an "unranked" group for human triage rather than assigning a fabricated priority.
- **The backlog appears coupled (one issue's triage depends on another's outcome):** triage them in dependency order or, if the coupling needs human sequencing, report it; fan-out assumes independence.

## Rationalizations to Reject

| Rationalization                                                                       | Reality                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The subagent said this is a duplicate, so close it"                                  | A self-report is a claim, not evidence. Independently confirm the citation exists and genuinely covers the issue before closing — or it is not a confirmed duplicate.    |
| "This is obviously a duplicate — I'll close it even though the human didn't check it" | The close decision is the human's. A duplicate not checked to close in CONFIRM is never closed, no matter how clear the match. Report it as verified-but-unauthorized.   |
| "There's no label that fits, so I'll create a new one"                                | Triage applies the project's existing label vocabulary. Inventing a label buries a taxonomy decision in a batch run; report the gap instead of minting a label.          |
| "This issue could be a bug or an enhancement — I'll just pick one and route it"       | An ambiguous type/route is a fork: surface it in CONFIRM or park it. Guessing routes the issue to the wrong downstream fleet and corrupts the queue.                     |
| "Each slice only needs to dedup within itself"                                        | Slice-local dedup misses duplicates that land in different slices. Every triage subagent checks the shared full-backlog snapshot so cross-slice duplicates are caught.   |
| "This route is close enough — I'll skip re-deriving it and trust the subagent's call" | Every mutation is re-derived from the issue's own signals in VERIFY. An un-grounded route sends work to the wrong fleet; a route with no basis is rejected, not applied. |
| "I'll assign this un-scoreable issue a middle priority to keep the ranking clean"     | A fabricated priority is a lie in the queue. Report un-scoreable issues in an unranked group for human triage; do not invent a score.                                    |
| "Bumping concurrency to six will clear the backlog sooner"                            | Beyond ~3 concurrent subagents is the machine-storm zone — compound load produces flaky failures that cost more in re-runs than the extra parallelism saves.             |

## Red Flags

| Flag                                                                 | Corrective Action                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| "I'll close it based on the subagent's dedup call"                   | STOP. Independently confirm the citation exists and covers the issue. A dedup call is not a verification.      |
| "It's clearly a duplicate, I'll close it even unauthorized"          | STOP. The human authorizes each close in CONFIRM. Unauthorized duplicates are reported, never closed.          |
| "No label fits — I'll invent one"                                    | STOP. Apply the existing vocabulary. Report the taxonomy gap; never mint a new label mid-batch.                |
| "This route is ambiguous but I'll guess to keep moving"              | STOP. Ambiguous routes are forks — surface in CONFIRM or park. Guessing corrupts the downstream queue.         |
| "The pre-push gate is failing in this worktree — I'll `--no-verify`" | STOP. Never bypass. Push via the GitHub API or a non-`.claude` worktree; the gate is part of the verification. |

## Examples

### Example: A nine-issue open backlog

```
$ harness skill run issue-fleet --concurrency 2

Phase 1: SELECT
  Enumerated: 9 open issues (gh issue list).
  Triage (label / dedup / route / prioritize):
    - #A "crash on empty config"      -> bug        / novel                / cicd-fleet   / rank 1
    - #B "add dark mode"              -> enhancement / novel                / roadmap-fleet/ rank 3
    - #C "dark theme support"         -> enhancement / duplicate-of #B      / (close)      / —
    - #D "should we adopt Zod?"       -> question    / novel                / adr-fleet    / rank 4
    - #E "flaky auth test"            -> bug         / novel                / cicd-fleet   / rank 2
    - #F "no tests for parser"        -> (none)      / novel                / test-fleet   / rank 6
    - #G "dead code in utils"         -> (none)      / novel                / cleanup-fleet/ rank 7
    - #H "typo in README"             -> documentation / novel              / roadmap-fleet/ rank 8
    - #I "feature X or refactor Y?"   -> enhancement / novel                / FORK         / —
  Snapshotted full backlog for cross-slice dedup.
  Detected forks: 1 — "#I: roadmap-fleet (build feature) or adr-fleet (decide refactor)?"

Phase 2: CONFIRM  [checkpoint:human-verify]
  Triaged queue presented. #C flagged for closure (duplicate-of #B).
  Human checks to CLOSE: #C  (the destructive-close authorization).
  Human answers fork: #I -> adr-fleet. Concurrency confirmed: 2.

Phase 3: DISPATCH (governor = 2)
  Backlog partitioned into 2 slices; 2 triage subagents finalize triage
  against the shared dedup snapshot; #I's answered fork fed into the brief.

Phase 4: VERIFY (independent — no self-report)
  #C: canonicalRef #B exists and covers the content, human-authorized -> close-ready
  labels/routes for #A/#B/#D/#E/#F/#G/#H re-derived from signals -> apply-ready
  #I: route re-derived as adr-fleet (from confirm) -> apply-ready

Phase 5: HANDOFF + REPORT
  Applied labels + routes for 8 surviving issues.
  Closed #C as duplicate, citing #B.
  Emitted routed queue:
    adr-fleet: [#D, #I]   roadmap-fleet: [#B, #H]   cicd-fleet: [#A, #E]
    test-fleet: [#F]      cleanup-fleet: [#G]
  Never closed an unauthorized or unverified issue.
```

### Example: Refusing to close a clear-but-unauthorized duplicate

An issue is an obvious restatement of another open issue, with a citation that holds up under VERIFY — but the human did not check it to close in CONFIRM. Per the Iron Law it is **not closed**; it appears in the report as verified-duplicate-but-unauthorized for the human to pick up next time. The close decision was never the fleet's to make.

## Test Scenarios

### Scenario 1: Gate — closing an unauthorized duplicate

VERIFY confirms an issue genuinely duplicates another (the citation holds up), but it was not checked to close in CONFIRM. Expected: the "no close without an explicit human authorization" Gate halts the close; the issue is reported verified-duplicate-but-unauthorized, not closed. Closing it because it "looks clear" is the failure this scenario guards against.

### Scenario 2: Rationalization — inventing a label to fit an issue

A triage subagent finds no existing label that fits and reasons "I'll create one." Expected: rejected by the "never invent labels" gate — triage applies the project's existing vocabulary and reports the taxonomy gap. Minting a label mid-batch buries a taxonomy decision the reviewer never sees.

### Scenario 3: Park-unforeseen — an ambiguous route mid-flight

A triage subagent hits an issue that plausibly fits two downstream stages and was not surfaced in CONFIRM. Expected: the issue **parks and reports** the routing fork rather than guessing a stage; the parked fork appears in the report for the human; the other issues in the slice continue uninterrupted. Force-routing it is the failure this scenario guards against.

### Scenario 4: Self-report — accepting a dedup call without re-deriving it

A subagent reports "this is a duplicate of #123, close it." Expected: the "a self-report is never verification" gate requires the orchestrator to independently confirm #123 exists and genuinely covers the issue before closing. Closing on the report alone — or on a citation that does not hold up — is the failure this scenario guards against.
