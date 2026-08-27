# ADR Fleet

> Autonomous batch-decide orchestrator — sweep the backlog of pending architectural decisions, confirm the batch with the human in one up-front round (answering each decision's key trade-off), fan out worktree-isolated subagents that each run the **real** architecture-advisor pipeline to draft one ADR at `status: proposed`, independently verify every draft is a well-formed record, and hand the human **one batch sign-off pass** to accept. The fleet never auto-accepts a decision and never trusts a subagent's self-report.

Working down a backlog of undocumented architectural decisions is the same attention slog the family exists to remove — one stage before building. Every pending decision has to be found (which specs name a decision with no ADR? which issues are blocked on an architecture call? which parked forks were never written up?), driven through the advisor flow (research the codebase, weigh the options, draft the record), and finally signed off — one at a time, with a human present at every clarifying question and every "is this the decision?" gate. For a backlog of dozens the human's attention is the bottleneck, not the machinery. `adr-fleet` inverts the model: it takes a **batch** of pending decisions, runs the real advisor pipeline autonomously and in isolation for each, drafts a reviewable ADR, verifies it, and returns **drafted ADRs to sign off in one pass** — moving the human from "drive every decision" to "confirm the batch once, sign off the ADRs once." It is the **decide** stage of the `-fleet` family conveyor: intake → **decide (adr-fleet)** → build → land. The shared, stage-agnostic scaffolding it builds on is documented once in the `-fleet` family spine reference (`docs/reference/fleet-family.md`).

## When to Use

- A batch of pending architectural decisions (undocumented decision points, decision-blocked issues, or parked forks) needs autonomous drafting plus one bulk ADR sign-off
- Clearing accumulated decision debt where per-decision interactive advising does not scale
- Turning a backlog of "we never wrote that down" architecture calls into a set of verified, drafted ADRs ready for one review pass
- When the decisions are genuinely independent — each produces its own ADR and does not depend on another's outcome
- NOT for a single decision — invoke `harness-architecture-advisor` directly; a fleet's overhead only pays off across a batch
- NOT for implementing the decision an ADR records — that is `roadmap-fleet` / the per-item build pipeline downstream; `adr-fleet` decides and documents, it does not build
- NOT for convergence on one contested decision — iterating a single decision to consensus is an interactive advisor session, not a fleet (which fans out across many independent decisions into many ADRs)
- NOT when the decisions are coupled (one decision's answer determines another's options) — sequence them through the advisor instead; fan-out assumes independence

## Flags

| Flag            | Effect                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `--concurrency` | Cap concurrent draft subagents (default 2, max recommended 3 — the machine-storm limit)       |
| `--report-only` | Enumerate, cross-check, and present the ranked pending-decision batch; do not dispatch drafts |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out                                              |

## Process

### Iron Law

**A drafted ADR becomes `accepted` only after an explicit human sign-off. The fleet drafts to `proposed`, never auto-accepts, and never accepts a subagent's self-report as proof its advisor pipeline ran.**

A subagent that reports "done — advised the decision, ADR drafted" has told you what it believes, not what is true. The only evidence that the real advisor pipeline ran is the artifact it necessarily leaves behind — a well-formed ADR file (required frontmatter, a unique sequential number, `status: proposed`, and the Context/Decision/Consequences sections) on a CI-green branch. If that draft is missing or malformed, the decision did not run the pipeline as required and is rejected or retried — regardless of how confident the report reads. And **accepting** the decision is the human's call: the fleet stops at a set of verified, reviewable drafts and flips `proposed` → `accepted` only for the ADRs a human explicitly signed off.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
             Phase 5: SIGN-OFF + REPORT <-- Phase 4: VERIFY
```

| Phase                | Purpose                                                                          | Exit Condition                                                            |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. SELECT            | Enumerate + cross-check the pending-decision queue, score, pre-allocate numbers  | Ranked `DecisionCandidate[]` with cross-check verdicts and detected forks |
| 2. CONFIRM           | One up-front human round: approve/trim, answer forks, set concurrency            | Human-approved batch with answered forks and agreed concurrency           |
| 3. DISPATCH          | Worktree-isolated subagents run the real advisor pipeline and draft one ADR each | Every confirmed decision returned a drafted ADR, parked, or failed        |
| 4. VERIFY            | Independent drafted-ADR + all-OS-CI confirmation, never self-report              | Each returned draft marked verified / rejected / retry                    |
| 5. SIGN-OFF + REPORT | One batch sign-off pass; accept only what the human accepts; summarize           | Accepted ADRs flipped to `accepted`; report delivered; never auto-accept  |

The five-phase spine, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its push-path caveat, and the never-silent invariant are the family-shared scaffolding — stated once in `docs/reference/fleet-family.md`. This skill states only what is specific to the **decide** stage: the pending-decision queue, advisor-drafting, and the human batch sign-off gate.

### Phase 1: SELECT — Enumerate, Cross-Check, Score, Pre-Allocate

1. **Enumerate the pending-decision queue from a wide net.** Gather candidates from three sources and let the ranker judge:
   - **Undocumented decision points** — specs/proposals under `docs/changes/*/proposal.md` whose "Decisions made" / "Architectural Decisions" section names a decision with no matching ADR in `docs/knowledge/decisions/`.
   - **Decision-blocked work** — open issues / roadmap items tagged as needing an architectural decision (e.g. a `needs-adr` label via `gh issue list`) or that reference an ADR number that does not exist yet.
   - **Parked forks** — decision forks explicitly parked by prior fleet runs (build/land REPORT rows) that were never written up.

   A missing source (no `gh` auth, no roadmap, no prior parked forks) degrades to whichever sources are available; record which source was unavailable rather than aborting.

2. **Cross-check each candidate against existing ADRs.** For every candidate, search `docs/knowledge/decisions/` for an ADR that already records it. A candidate whose decision is already documented is **already-decided** — flag it for closure with a citation, not a re-draft.

3. **Score and order via `roadmap-pilot` impact scoring.** Do not rank ad-hoc. Reuse `harness-roadmap-pilot`'s impact scoring so selection is principled and reproducible; order the batch highest-impact first.

4. **Pre-allocate a contiguous block of ADR numbers.** Scan `docs/knowledge/decisions/` for the highest existing number and assign each confirmed candidate the next sequential number. Pre-allocation by the orchestrator (not scan-and-increment inside each subagent) is what prevents the number collision when N subagents draft concurrently.

5. **Detect decision forks up front.** For each candidate, capture the decision's **key trade-off question** — the question the advisor's DISCOVER phase would otherwise ask interactively (e.g. "store as UTC or local?", "extend the existing table or add a new one?"). These _known_ forks are surfaced in CONFIRM. Do not attempt to answer them here.

6. **Build the `DecisionCandidate` record** for each survivor:

   ```
   DecisionCandidate {
     source,             // "undocumented-decision-point" | "decision-blocked-work" | "parked-fork"
     id,                 // spec path | issue ref | prior-run row
     title,
     score,              // roadmap-pilot impact score
     crossCheck,         // "novel" | "already-decided"
     existingAdr,        // set when crossCheck = already-decided
     allocatedAdrNumber, // pre-allocated NNNN for the draft
     forks,              // the advisor's key trade-off question(s) (may be empty)
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate `[checkpoint:human-verify]`

1. **Present the ranked batch in one round.** This is the **only guaranteed human touchpoint before sign-off** — everything through VERIFY runs autonomously. Present, together, in a single surface:
   - The ranked candidates (highest-impact first) with scores.
   - Already-decided points **flagged for closure** with their existing ADR — the human confirms closing, the fleet never re-drafts them.
   - Every detected decision fork as a **multiple-choice question** with a recommended default.
   - The **proposed concurrency** (default 2, capped at ~3).

2. **The human approves or trims once, and answers the forks.** Batch approval, fork answering, and already-decided triage all happen in this same gate — front-loading the genuinely-ambiguous trade-offs is what keeps wrong-guess re-drafts low. Answered forks are recorded and fed into each decision's DISPATCH brief so the advisor never re-asks a settled question.

3. **From here it is autonomous until sign-off.** After this gate the fleet does not pause per-decision. The only thing that re-surfaces before the sign-off pass is an _unforeseen_ question that parks a single decision (see DISPATCH) — and even that does not block the batch. Under `--dry-run` the skill stops at the end of this phase.

### Phase 3: DISPATCH — Worktree Advisor Fan-Out With a Concurrency Governor

1. **One worktree-isolated subagent per confirmed decision.** Each subagent is briefed to run the **real** per-item decide pipeline for its one decision: `harness-architecture-advisor` in autonomous mode (ANALYZE the codebase → PROPOSE options with trade-offs → DOCUMENT the chosen option as an ADR, persisted through the `manage_adr` tool — see step 2). It does not hand-write the ADR to skip the advisor, and it does not accept the decision — the drafted ADR the advisor leaves behind is what VERIFY checks for. Feed the decision's answered forks from CONFIRM and its pre-allocated ADR number into the brief.

2. **Draft to the canonical decisions directory at `status: proposed` via `manage_adr`.** The subagent persists the drafted record with the `mcp__harness__manage_adr` tool (`action: "create"`, passing `title`, `context`, `decision`, `consequences`, and the decision's `tier`/`source`), **not** by hand-writing the markdown. `manage_adr` is the canonical write mechanism: it allocates the next collision-free number (`max(existing) + 1`, zero-padded per #1323 — never re-minting a number even across the on-disk gaps and duplicates), emits the repo's required frontmatter and the Context/Decision/Consequences sections, and defaults `status` to `proposed` — the explicit never-auto-accept marker that distinguishes a fleet draft from an accepted decision. The orchestrator's pre-allocated number from SELECT is the _expected_ value VERIFY reconciles against the number the tool actually minted (per-worktree `max+1` from a shared base plus the merge order the orchestrator plans); writing through `manage_adr` in the canonical location makes the batch reviewable as ordinary ADR diffs. The subagent still owns the drafting and verification — the advisor decides _what_ the record says; `manage_adr` is only _how_ it is written.

3. **Cap concurrency at the governor (default 2, max ~3).** This is the machine-storm limit: beyond roughly three concurrent draft agents the compound load produces flaky failures that are indistinguishable from real ones. Never exceed the confirmed concurrency to "go faster" — a stormed batch is slower once you account for re-runs.

4. **Park unforeseen questions; never guess mid-flight.** A subagent runs autonomously on recommended-option defaults for anything routine. But if a decision hits a genuinely **unforeseen** question — one not surfaced in CONFIRM whose answer materially changes the decision — that decision **parks and reports** the question instead of guessing. Parking is per-decision: the other decisions in the batch continue uninterrupted. The parked question appears in the sign-off report for the human.

5. **Record an "assumptions made" note per decision.** Each subagent records the recommended-option defaults it took so the drafted ADR carries an assumptions note — batch sign-off is only trustworthy when the reviewer can see what was assumed.

6. **Push-path caveat.** A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files). Subagents push the drafted ADR via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

**Worker handoff — return the canonical `FleetHandoffRecord`.** When a worker finishes its decision it hands the orchestrator exactly one `FleetHandoffRecord` (from `@harness-engineering/types`) — the ONE bounded envelope every `-fleet` member emits, so `fleet-command` parses any fleet's worker output uniformly instead of special-casing an ad hoc per-worker report shape. The record carries `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, an `evidence[]` of verifiable pointers (branch, PR, artifact path, CI check — exactly the references VERIFY re-checks), `next_steps[]`, and, for any non-`done` status, a `blocker`. The orchestrator validates it with `validateFleetHandoffRecord`; a malformed or unknown-keyed record is rejected, never silently misread. See the canonical handoff record in `docs/reference/fleet-family.md`.

### Phase 4: VERIFY — Independent Confirmation, Never Self-Report

1. **Never accept a subagent's self-report as verification.** "The advisor ran and the ADR is drafted" is a claim to be checked, not a result. For each returned branch, the orchestrator independently confirms the evidence itself.

2. **Require the drafted-ADR artifact.** Confirm the branch carries a **well-formed** ADR at its pre-allocated `docs/knowledge/decisions/NNNN-<slug>.md`:
   - Required frontmatter (`number`, `title`, `date`, `status: proposed`, `tier`, `source`) with a **unique** number matching its pre-allocation.
   - The three required sections — Context, Decision, Consequences — each non-empty.

   A branch with **no drafted ADR, a malformed one, or one already flipped to `accepted`** did not run the real pipeline as required — regardless of what the subagent reported. Reject it (or retry once); it is never carried into sign-off as-is.

3. **Require all-OS CI green.** Confirm the pushed branch's CI is green on **all target operating systems** plus the project's required checks (`gh pr checks` / `gh run list`). Green on one OS is not green. A subset-red branch is not sign-off-ready — it is reported as failed, and the batch continues. **Base freshness (spine clause):** all-OS green is trusted as `verified` only when it ran against **current `main`** — the branch is up to date with `main`, or branch protection enforces strict / up-to-date-before-merge. Green gathered against a base that `main` has since moved past is **stale**: downgrade the item to **`degraded`**, not verified, and report the stale tested base SHA vs current `main`. See `docs/reference/fleet-family.md` § _Base freshness_ (`classifyBaseFreshness`).

4. **Classify each returned decision** as `verified` (well-formed `proposed` ADR present + all-OS CI green), `rejected` (missing/malformed draft or definitively red), or `retry` (transient, retried at most once). No decision reaches the sign-off pass without passing both the artifact and the CI check.

### Phase 5: SIGN-OFF + REPORT — One Human Sign-Off Pass, Never Auto-Accept

1. **Present every verified drafted ADR to the human in one batch pass.** This is the terminal, human-authority act. For each verified draft, the human ACCEPTS or REJECTS. The human is the decision authority — the fleet never derives acceptance from "the draft looks right."

2. **Flip `status: proposed` → `accepted` for accepted ADRs only, via `manage_adr`.** The fleet **executes** the status flip through `mcp__harness__manage_adr` (`action: "update"`, `ref` = the ADR number, `status: "accepted"`) — the same tool that wrote the record now amends it, never reusing a number — for exactly the ADRs the human explicitly accepted, and no others. Rejected drafts are removed or sent back with the human's reason. A verified draft the human did not accept stays `proposed` (or is dropped) — it is never accepted on the fleet's judgment.

3. **Emit a one-row-per-decision batch summary** for the record:

   | Decision | ADR | Verdict | Assumptions made | Parked forks | Sign-off |
   | -------- | --- | ------- | ---------------- | ------------ | -------- |

   Every verified decision's row carries its ADR number/link, the **assumptions-made note** from DISPATCH, any parked unforeseen question, and the sign-off result. Rejected/failed decisions are listed with the reason.

4. **Close already-decided candidates accurately.** For each candidate flagged already-decided in SELECT and confirmed in CONFIRM, close it with a comment **citing the existing ADR** — never a bare close, and never a re-draft.

5. **Never auto-accept.** The fleet delivers verified, reviewable drafts and accepts only what the human signed off. Flipping an ADR to `accepted` without an explicit human sign-off — or because the draft passed VERIFY — is out of scope by design.

6. **Degrade gracefully.** A missing queue source, missing `gh` auth, or a single decision's failed draft results in that decision (or source) being **reported** while the rest of the batch proceeds. One bad decision never sinks the batch.

## Harness Integration

- **`harness skill run adr-fleet`** — Run the full five-phase batch-decide pipeline.
- **`harness-architecture-advisor`** — The real per-item decide pipeline each subagent runs in DISPATCH to draft one ADR; the fleet composes it and never reimplements the advising.
- **`manage_adr` (`mcp__harness__manage_adr`)** — The canonical write mechanism for the ADR store. DISPATCH persists each drafted record with `action: "create"` (collision-free `max+1` numbering per #1323, `status: proposed` by default); SIGN-OFF amends the human-accepted records with `action: "update"` (`status: accepted`). The fleet owns drafting and verification; the tool owns _writing_ the record.
- **`harness-roadmap-pilot`** — Composed in SELECT for principled impact scoring and ordering of the pending-decision batch.
- **`gh`** — Enumerate decision-blocked issues (SELECT), read `gh pr checks` (VERIFY), and close already-decided candidates with existing-ADR citations (SIGN-OFF).
- **`docs/knowledge/decisions/`** — The canonical ADR directory (convention in its `README.md`): sequential 4-digit numbering, required frontmatter, and Context/Decision/Consequences sections that every drafted ADR must satisfy.
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (the five-phase skeleton, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out, and the never-silent invariant), stated once for the family.
- **`harness skill validate adr-fleet`** — The authoring-time gate for this skill's own structure and schema.

## Success Criteria

- Given a confirmed batch of N pending decisions, the fleet produces **up to N** drafted ADRs, each with a well-formed `proposed` record (required frontmatter + Context/Decision/Consequences, a unique sequential number) and green CI across all target operating systems plus the project's required checks.
- There is **exactly one** up-front human decision round (CONFIRM) plus one terminal sign-off pass; no per-decision interactive pauses except a genuinely-new question parked to its own decision.
- The fleet **never** flips an ADR to `accepted` without an explicit human sign-off, and **never** auto-accepts a draft.
- Every drafted ADR was produced by the real `harness-architecture-advisor` pipeline — never hand-written to skip the advisor, and never marked verified on a subagent self-report.
- Already-decided candidates are **closed with existing-ADR citations, not re-drafted**.
- The skill **degrades gracefully**: a missing queue source, missing `gh` auth, or a single decision's failed draft is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No decision reaches sign-off on a subagent self-report — every verdict is backed by independently-checked drafted-ADR + CI evidence.

## Gates

- **No sign-off-ready draft without a well-formed `proposed` ADR artifact.** A branch lacking a valid `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed` did not run the real advisor pipeline. It is rejected or retried — never carried into the sign-off pass, no matter what the subagent claimed.
- **No sign-off-ready draft without all-OS CI green.** Green on a subset of operating systems (or with enforce/harness checks red) is not sign-off-ready. Report it failed; do not carry it forward.
- **Never auto-accept.** The fleet flips `proposed` → `accepted` only for ADRs the human explicitly signed off. Accepting a draft on the fleet's own judgment, or because it passed VERIFY, = gate violation; the human is the decision authority.
- **Never exceed the concurrency governor.** More than ~3 concurrent draft agents is the machine-storm zone; do not raise the cap to "go faster."
- **A self-report is never verification.** Accepting "advisor ran, ADR drafted" without independently checking the drafted ADR and CI = gate violation. Re-verify independently.
- **Never `--no-verify`.** No subagent bypasses the pre-push gates; a `.claude/`-nested worktree pushes via the GitHub API or a non-nested worktree instead.

## Escalation

- **Missing queue source (`gh` auth absent, no roadmap, no prior parked forks):** proceed with whichever sources are available; record the missing source in the report rather than aborting. If **no** source yields candidates, stop and report — there is nothing to decide.
- **A subagent returns a branch with no drafted ADR (or a malformed one):** do not accept its self-report. Reject or retry once; if it still produces no well-formed `proposed` ADR, report the decision as "did not run the advisor pipeline" and move on — the batch continues.
- **A decision parks on an unforeseen question:** surface the question (with the decision's context and the recommended default) in the sign-off report for the human; do not guess and continue. The parked decision is the only one affected.
- **CI red on a subset of OS:** report the decision failed with the failing OS/check named; never carry it into sign-off. Do not average a mixed CI result into "mostly green".
- **The human rejects a drafted ADR at sign-off:** remove or send the draft back with the reason; never flip it to `accepted`. A rejected decision may be re-dispatched in a later run with the reason folded into its brief.
- **The batch appears coupled (one decision's answer determines another's options):** stop fanning out those decisions; the coupling means they are a sequenced advisor session, not a fleet. Escalate to the human to sequence them through the advisor.

## Rationalizations to Reject

| Rationalization                                                                            | Reality                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The subagent reported the advisor ran and the ADR is drafted, so it did"                  | A self-report is a claim, not evidence. Independently confirm a well-formed `proposed` ADR exists at its pre-allocated number and CI is green — or the decision did not run.             |
| "The draft passed VERIFY and reads well — I'll mark it accepted and save the human a step" | Never auto-accept. VERIFY proves the draft is well-formed, not that the decision is right. The `proposed` → `accepted` flip requires an explicit human sign-off.                         |
| "CI is green on Linux, this draft is ready"                                                | Green on one OS is not green. Sign-off-ready requires all target operating systems plus the project's required checks. A subset-red branch is reported failed, not carried.              |
| "This decision's fork is small — I'll just guess and keep the batch moving"                | Unforeseen questions **park and report**; they are never silently guessed mid-flight. Guessing buries an unstated assumption in an ADR the reviewer cannot see.                          |
| "I'll hand-write this ADR — it's faster than running the advisor"                          | Dogfood the real advisor pipeline. A hand-written ADR skips the ANALYZE/PROPOSE trade-off surfacing the drafts depend on, leaves no evidence the pipeline ran, and fails VERIFY.         |
| "This decision looks new to me, no need to check existing ADRs"                            | Cross-check every candidate against `docs/knowledge/decisions/`. An already-decided point re-drafted is duplicate work and a conflicting ADR; decided points get closed, not re-drafted. |
| "Each subagent can just scan-and-increment for its ADR number"                             | Under concurrent fan-out, scan-and-increment collides — two subagents claim the same number. Numbers are **pre-allocated by the orchestrator** in SELECT, one per decision.              |
| "Bumping concurrency to six will finish the batch sooner"                                  | Beyond ~3 concurrent draft agents is the machine-storm zone — compound load produces flaky failures that cost more in re-runs than the extra parallelism saves.                          |

## Red Flags

| Flag                                                                             | Corrective Action                                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "I'll mark it verified based on the subagent's summary"                          | STOP. Independently check the drafted ADR and CI. A summary is not a verification.                               |
| "The draft is verified — let me flip it to accepted and close the loop"          | STOP. The fleet never accepts. Present the draft for human sign-off; the `proposed` → `accepted` flip is theirs. |
| "I'll answer this new question with the obvious choice and continue"             | STOP. Unforeseen questions park and report. Record it for the human; do not guess it into an ADR.                |
| "The pre-push gate is failing in this worktree — I'll `--no-verify`"             | STOP. Never bypass. Push via the GitHub API or a non-`.claude` worktree; the gate is part of the verification.   |
| "I'll re-draft this decision; it's easier than confirming whether an ADR exists" | STOP. Cross-check first. Re-drafting an already-decided point creates a conflicting duplicate ADR.               |

## Examples

### Example: A six-candidate pending-decision backlog

```
$ harness skill run adr-fleet --concurrency 2

Phase 1: SELECT
  Enumerated: 3 undocumented decision points (specs with no ADR) +
              2 decision-blocked issues (needs-adr) + 1 parked fork (prior build run).
  Cross-check vs docs/knowledge/decisions/:
    - "token store: UTC vs local"  -> already-decided (existing ADR) -> flag for closure
  Scored 5 survivors via roadmap-pilot impact scoring; ordered highest-first.
  Pre-allocated the next five free ADR numbers N..N+4 (one per survivor).
  Detected forks: 2
    - "audit log": extend existing table vs new table?
    - "retry policy": fixed backoff vs exponential?

Phase 2: CONFIRM  [checkpoint:human-verify]
  Ranked batch (5) presented. Already-decided item flagged for closure.
  Human answers forks: audit log -> new table; retry policy -> exponential.
  Human trims 1 low-value item -> batch = 4. Concurrency confirmed: 2.

Phase 3: DISPATCH (governor = 2)
  4 worktree-isolated subagents, 2 at a time, each running the real
  architecture-advisor for its one decision; answered forks + allocated numbers fed in.
  Each drafts docs/knowledge/decisions/NNNN-slug.md at status: proposed.
  Decision "cache strategy" hits an UNFORESEEN question (per-tenant vs global cache)
    -> parks and reports; the other 3 continue.

Phase 4: VERIFY (independent — no self-report)
  decision A: well-formed proposed ADR N present, CI green all 3 OS + enforce + harness -> verified
  decision B: well-formed proposed ADR N+1 present, CI green all 3 OS -> verified
  decision C: NO ADR on the branch (self-reported "drafted") -> REJECTED (hand-waved, not piped)
  decision D: parked in DISPATCH -> not verified (question awaits human)

Phase 5: SIGN-OFF + REPORT
  Human sign-off pass over verified drafts:
  | Decision      | ADR   | Verdict   | Assumptions made          | Parked forks          | Sign-off |
  | ------------- | ----- | --------- | ------------------------- | --------------------- | -------- |
  | audit log     | N     | verified  | new table (from confirm)  | —                     | ACCEPTED |
  | retry policy  | N+1   | verified  | exponential (from confirm)| —                     | ACCEPTED |
  | webhook auth  | —     | rejected  | —                         | — (no ADR drafted)    | —        |
  | cache strategy| —     | parked    | —                         | per-tenant vs global? | —        |
  Flipped ADR N, N+1 proposed -> accepted (only the two the human accepted).
  Closed 1 already-decided candidate with a comment citing the existing ADR.
  Never auto-accepted. 2 ADRs signed off; 2 decisions reported for follow-up.
```

### Example: Rejecting a hand-waved ADR

A subagent returns a branch and reports "done — advised the decision, ADR drafted, CI green." VERIFY looks for the pre-allocated `docs/knowledge/decisions/NNNN-<slug>.md` and finds nothing (or finds a stub with an empty Decision section): there is no well-formed `proposed` ADR. The decision was hand-waved, short-cutting the real advisor pipeline. Per the Iron Law it is **rejected** (retried once, still no well-formed draft → reported as "did not run the advisor pipeline"), never carried into sign-off. The batch's other verified drafts proceed to the sign-off pass unaffected.

## Test Scenarios

### Scenario 1: Gate — a self-report accepted as verification

VERIFY receives a subagent claiming "advisor ran, ADR drafted, CI green" but the branch has no well-formed `docs/knowledge/decisions/NNNN-<slug>.md` at `status: proposed`. Expected: the "no sign-off-ready draft without a well-formed `proposed` ADR artifact" Gate halts carrying it forward; the decision is rejected/retried, not presented for sign-off. Accepting the self-report is the failure this scenario guards against.

### Scenario 2: Gate — auto-accepting a verified draft

A drafted ADR passes VERIFY (well-formed, CI green) and reads convincingly. The operator reasons "it's clearly right — I'll flip it to accepted and save the human a step." Expected: rejected by the "never auto-accept" Gate — VERIFY proves the draft is well-formed, not that the decision is right. The `proposed` → `accepted` flip requires an explicit human sign-off; the fleet is the executor of that authorization, never its originator.

### Scenario 3: Park-unforeseen — a new question mid-flight

A draft subagent hits a genuinely new question not surfaced in CONFIRM (per-tenant vs global cache). Expected: the decision **parks and reports** the question rather than guessing; the parked question appears in the sign-off report for the human; the other in-flight decisions continue uninterrupted. Silently guessing the question into the ADR is the failure this scenario guards against.

### Scenario 4: Cross-check — re-drafting an already-decided point

SELECT surfaces a candidate whose decision an existing ADR already records. The operator reasons "I don't recognize this — draft it." Expected: rejected by the cross-check discipline — the candidate is flagged already-decided and closed with a citation to the existing ADR, never re-drafted into a conflicting duplicate.
