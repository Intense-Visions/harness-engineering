# Docs Fleet

> Autonomous documentation-drift remediation sweep — enumerate the doc-drift/undocumented backlog by composing the existing documentation-floor detectors (`detect-doc-drift`, `harness check-docs`), fold the codebase into independent doc-fix areas, rank them by staleness value, confirm the batch with the human in one up-front round, fan out worktree-isolated subagents that each run the **real** per-area documentation pipeline (`harness-docs-pipeline --fix` to convergence), independently verify every result by a clean doc re-scan and all-OS CI, and hand back a set of scoped doc-fix PRs for one bulk review. The fleet never auto-merges and never trusts a subagent's self-report.

Working a documentation-drift backlog down by hand is a per-area attention slog: every drifted or undocumented area of the codebase must be found, its remediation scoped, driven through `harness-docs-pipeline` to convergence, and turned into a reviewable PR — one at a time, with a human present throughout. For a codebase with dozens of drifted docs and undocumented modules the human's attention, not the machinery, is the bottleneck. `docs-fleet` inverts the model: it enumerates the backlog by composing the existing documentation-floor detectors, runs the real per-area pipeline autonomously and in isolation for each area, verifies the result, and returns **scoped doc-fix PRs to review in bulk** — moving the human from "remediate every drifted doc" to "confirm the batch once, review the PRs once." It is a **quality-queue** member of the `-fleet` family: it does not sit on the core intake → decide → build → land spine, but works the documentation-freshness queue alongside it.

This skill builds on the shared `-fleet` spine documented in `docs/reference/fleet-family.md` — the five-phase SELECT → CONFIRM → DISPATCH → VERIFY → terminal skeleton, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its `.claude/`-nested push caveat, the per-leaf context-replay budget, the canonical `FleetHandoffRecord` handoff, and the never-silent-merge invariant. That page states the family contract once; this SKILL.md defines only what is `docs-fleet`'s own: its queue, its triage taxonomy, its per-area pipeline, its terminal act, and its domain-specific rationalizations.

## Boundary — docs-fleet vs cleanup-fleet vs craft-fleet

The `-fleet` family already has two neighbours that touch documentation-adjacent concerns; docs-fleet is scoped so it composes them, never overlaps them:

| Fleet           | Queue it works                                                | What it does NOT own                                                     |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `docs-fleet`    | **doc-drift + undocumented/coverage floor** (docs vs code)    | code entropy; documentation _prose quality_ (that is the two neighbours) |
| `cleanup-fleet` | code entropy / structural hotspots (dead code, drift-in-code) | documentation freshness — a stale doc is not a code hotspot              |
| `craft-fleet`   | LLM-judgment code/doc _quality_ ceiling (incl. `docs-craft`)  | whether a doc _exists_ or has _drifted_ — that is a floor, not a ceiling |

The line is **floor vs ceiling**: docs-fleet enforces that documentation _exists, matches the code, and links resolve_ (the mechanical documentation floor, exactly what `harness-docs-pipeline` remediates); `craft-fleet`'s `docs-craft` critiques whether a doc that already passes the floor _teaches well_ (the LLM-judgment ceiling). A drifted or missing doc is docs-fleet's; a doc that is fresh but mediocre is `craft-fleet`'s. docs-fleet composes `harness-docs-pipeline`, which itself composes `detect-doc-drift` — it reimplements neither.

## When to Use

- A documentation-drift/coverage backlog has accumulated (stale doc sections after refactors, renamed symbols still referenced in docs, undocumented new modules, broken doc links) and needs autonomous remediation plus one bulk PR review
- Clearing documentation debt across many independent doc areas where per-area interactive remediation does not scale
- Turning the output of `detect-doc-drift` / `harness check-docs` / `harness-docs-pipeline` into a set of verified, scoped, merge-ready doc-fix PRs in a single session
- After a large refactor or a batch of merges that plausibly drifted docs across many modules at once
- When the areas are genuinely independent — each is a distinct module/doc cluster producing its own PR, and remediating one does not depend on another's merge
- NOT for a single drifted doc — invoke `harness-docs-pipeline` directly; a fleet's overhead only pays off across a batch
- NOT for landing / merging PRs — that is `pr-fleet`; `docs-fleet` stops at merge-ready and never merges
- NOT for convergence on one area — iterating a single module's docs to freshness is `harness-docs-pipeline` (a **pipeline** that loops on one target), not a fleet (which fans out across many independent areas into many PRs)
- NOT for elevating documentation _quality/prose_ — that is `craft-fleet` via `docs-craft`; docs-fleet works the drift/coverage floor, not the writing-quality ceiling

## Flags

| Flag            | Effect                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `--concurrency` | Cap concurrent remediation subagents (default 2, max recommended 3 — the machine-storm limit)          |
| `--report-only` | Enumerate, score, and present the ranked doc-area batch; do not dispatch, verify, or open PRs          |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out                                                       |
| `--safe-only`   | Restrict remediation to the safe fix class even if an area's probably-safe/unsafe fix looks mechanical |

## Process

### Iron Law

**A doc-fix PR is "merge-ready" only after independent doc-re-scan convergence + all-OS-CI verification. The fleet never auto-merges, never applies an `unsafe` documentation change autonomously, and never accepts a subagent's self-report as proof its pipeline ran.**

A subagent that reports "docs updated — drift gone, CI green" has told you what it believes, not what is true. The only evidence that the real per-area pipeline ran and worked is the convergence record it necessarily leaves behind — the drift/coverage findings the area opened with are resolved and a fresh re-scan (`detect-doc-drift` / `harness check-docs`) over the area is clean — plus the CI signal on the pushed branch. If the re-scan still shows drift, the remediation did not converge and the item is rejected or retried, regardless of how confident the report reads. And landing the batch is the human's call: the fleet stops at a set of verified, reviewable PRs, because a silently-merged doc that _looks_ fresh but describes the wrong behaviour is worse than an obviously-stale one.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
                     Phase 5: REPORT <-- Phase 4: VERIFY
```

| Phase       | Purpose                                                                         | Exit Condition                                                           |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. SELECT   | Compose doc detectors into areas, cross-check, score by staleness value         | Ranked `DocArea[]` with fix class, cross-check verdicts, detected forks  |
| 2. CONFIRM  | One up-front human round: approve/trim, confirm safe/unsafe calls, set cap      | Human-approved batch with confirmed classes and agreed concurrency       |
| 3. DISPATCH | Worktree-isolated subagents run the real `harness-docs-pipeline --fix` per area | Every confirmed area returned a branch, parked, or failed (all recorded) |
| 4. VERIFY   | Independent doc-re-scan convergence + all-OS-CI confirmation, never self-report | Each returned area marked verified / rejected / retry                    |
| 5. REPORT   | One-row-per-area batch summary; never merge                                     | Report delivered; parked unsafe remediations surfaced for the human      |

### Phase 1: SELECT — Compose Doc Detectors, Cross-Check, Score

1. **Enumerate the documentation-drift/coverage backlog by composing the existing detectors — reimplement none of them.** Run and fold together:
   - `detect-doc-drift` — drift between code and docs (renamed symbols, deleted-code references, changed-behaviour descriptions, moved code).
   - `harness check-docs` — the mechanical documentation floor: coverage (undocumented modules/exports), broken doc links, stale sections.
   - `harness-docs-pipeline` in report-only mode (no `--fix`) — its DETECT + AUDIT phases produce the combined drift + gap finding set the fleet folds into areas.
   - a git-churn pass over `docs/` and the source it documents (`git log --format=format: --name-only --since=...`) to surface areas whose code moved recently but whose docs did not.

   Missing any one source degrades to whichever detectors are available; record which source was unavailable rather than aborting. **Verify the toolchain first** (spine § _Runtime preconditions_): record the resolved `harness --version` and treat a stale scanner's findings as untrusted.

2. **Fold findings into doc-fix areas.** A **doc area** is one coherent module/doc cluster — the unit that becomes one PR. Group co-located drift + coverage findings that document the same module into a single area; never split a coherent doc-fix across PRs, and never bundle unrelated modules' doc-fixes into one.

3. **Classify each area's fix class** by the worst-safety finding it carries, mapping to `harness-docs-pipeline`'s existing fix-safety taxonomy:
   - **safe** (applied silently by `harness-docs-pipeline --fix`): unambiguous path/link redirects for renames, import-reference fixes, adding an entry for a new file with an obvious single-purpose name.
   - **probably-safe** (pipeline presents a diff; the fleet applies autonomously under `--fix` unless `--safe-only`): rewriting a description for a simple rename/parameter change, updating code examples, adding an entry for a new file that needs a written description.
   - **unsafe** (parked for the human): rewriting behavioural explanations, removing sections for deleted code, and authoring documentation for complex modules or new doc pages. An area whose remediation _requires_ an unsafe change parks.

4. **Cross-check each area against merged and open PRs.** For every area, search merged/open PRs for one that already refreshed those docs. An area whose docs were already remediated is **already-fresh** — flag it for drop/annotate, not re-remediation. (An open doc PR is a live claim; drop the area — see spine § _Cross-run claim lease_ for the ID-based-member mechanism, which docs-fleet uses only its open-PR-cross-check degradation of, since a doc area has no GitHub-native id at SELECT.)

5. **Score and order by composite staleness value.** Do not rank ad-hoc. Reuse `roadmap-pilot`-style impact scoring over a composite of **doc-churn-gap (code moved, docs did not) × drift-finding density × coverage-gap density**, so the areas whose documentation is most out of step with the code come first and selection is principled and reproducible.

6. **Build the `DocArea` record** for each survivor:

   ```
   DocArea {
     sources,           // which detectors surfaced it (may be several)
     id,                // area slug
     area,              // module / docs paths the area covers
     findings,          // the drift + coverage findings the area opens with
     fixClass,          // "safe" | "probably-safe" | "unsafe"
     score,             // composite staleness-value score
     crossCheck,        // "novel" | "already-fresh"
     resolvingPr,       // set when crossCheck = already-fresh
     forks,             // detected unsafe-remediation forks (may be empty)
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate `[checkpoint:human-verify]`

1. **Present the ranked doc-area batch in one round.** This is the **only guaranteed human touchpoint before PR review** — everything downstream runs autonomously. Present, together, in a single surface:
   - The ranked areas (highest-staleness first) with scores and the findings each opens with.
   - Each area's **safe / probably-safe / unsafe** fix classification — with unsafe areas flagged as they will **park** (never auto-apply).
   - Already-fresh areas **flagged for drop** with the resolving PR.
   - The **proposed concurrency** (default 2, capped at ~3).

2. **The human approves or trims once, and confirms the classifications.** Batch approval, fix-class confirmation, and already-fresh triage all happen in this same gate — front-loading the genuinely-ambiguous calls is what keeps wrong-remediation rework low. An area the human downgrades to unsafe is treated as parked from the start.

3. **From here it is autonomous.** After this gate the fleet does not pause per-area. The only thing that re-surfaces to the human before REPORT is an area that turns out mid-flight to need an **unsafe** documentation change (see DISPATCH) — and even that parks only that one area without blocking the batch. Under `--dry-run` the skill stops at the end of this phase.

### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor

1. **One worktree-isolated subagent per confirmed area.** Each subagent is briefed to run the **real** per-area pipeline for its one area: `harness-docs-pipeline --fix` in convergence mode, scoped to that area's modules/docs. It does not hand-edit the docs, and it does not short-cut the pipeline — the convergence record the pipeline leaves behind (drift resolved, `harness check-docs` passing) is what VERIFY checks for.

2. **Cap concurrency at the governor (default 2, max ~3).** This is the machine-storm limit: beyond roughly three concurrent remediation agents the compound load produces flaky failures indistinguishable from real ones. Never exceed the confirmed concurrency to "go faster" — a stormed batch is slower once re-runs are counted.

3. **Consult the per-leaf context-replay budget before fan-out.** Documentation areas can pull wide source context (a doc that describes many modules). Estimate each leaf's context load and call `assertLeafWithinBudget` before dispatching it; an over-budget leaf is rejected loudly at dispatch, never silently spent. Assemble each leaf's working context **graph-scoped by default** (retrieve via `code_outline`/`find_context_for`, read raw source only for the region a doc-fix edits). See spine § _The per-leaf context-replay budget_.

4. **Park unsafe remediation; never apply it autonomously.** A subagent runs autonomously on the safe and probably-safe classes for its area. But if remediating the area turns out to require an **unsafe** documentation change — rewriting a behavioural explanation, removing a section for deleted code, or authoring docs for a complex module — that area **parks and reports** the change (with a recommendation) instead of applying it. Parking is per-area: the other areas in the batch continue uninterrupted. The parked unsafe remediation appears in REPORT for the human.

5. **Record an "assumptions made" note per area.** Each subagent records the ranking basis, the remediation scope it took, and the safe/probably-safe/unsafe calls it made, so the eventual PR carries an assumptions note — batch review is only trustworthy when the reviewer can see what was assumed and what was deliberately left un-remediated.

6. **Push-path caveat.** A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files — doubly damaging for a docs fleet, whose whole subject is that gate). Subagents push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the fleet depends on.

**Worker handoff — return the canonical `FleetHandoffRecord`.** When a worker finishes its area it hands the orchestrator exactly one `FleetHandoffRecord` (from `@harness-engineering/types`) — the ONE bounded envelope every `-fleet` member emits, so `fleet-command` parses any fleet's worker output uniformly instead of special-casing an ad hoc per-worker report shape. The record carries `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, an `evidence[]` of verifiable pointers (branch, PR, artifact path, CI check — exactly the references VERIFY re-checks), `next_steps[]`, and, for any non-`done` status, a `blocker`. The orchestrator validates it with `validateFleetHandoffRecord`; a malformed or unknown-keyed record is rejected, never silently misread. See the canonical handoff record in `docs/reference/fleet-family.md`.

### Phase 4: VERIFY — Independent Confirmation, Never Self-Report

1. **Never accept a subagent's self-report as verification.** "The docs were updated and CI is green" is a claim to be checked, not a result. For each returned branch, the orchestrator independently confirms the evidence itself.

2. **Require the doc-convergence artifact.** Confirm that the area actually converged:
   - The drift + coverage findings the area opened with (from SELECT) are **resolved**.
   - A fresh re-scan of the area (`detect-doc-drift` + `harness check-docs` over it) is **clean**.

   A branch whose re-scan **still reports drift or coverage gaps did not converge** — regardless of what the subagent reported. Reject it (or retry once); it is never marked merge-ready. A doc-fix that _suppressed_ a finding (deleted the doc rather than fixing it, or excluded the file from coverage) fails this re-scan by design.

3. **Require all-OS CI green.** Confirm the pushed branch's CI is green on **all target operating systems** plus the project's required checks (`gh pr checks` / `gh run list`) — including the repo's own `check-docs` CI gate, which is the exact signal this fleet exists to satisfy. Green on one OS is not green. A subset-red branch is not merge-ready — it is reported as failed, and the batch continues. **Base freshness (spine clause):** all-OS green is trusted as `verified` only when it ran against **current `main`** — the branch is up to date with `main`, or branch protection enforces strict / up-to-date-before-merge. Green gathered against a base that `main` has since moved past is **stale** (and docs drift fast as `main` churns): downgrade the item to **`degraded`**, not verified, and report the stale tested base SHA vs current `main`. See `docs/reference/fleet-family.md` § _Base freshness_ (`classifyBaseFreshness`).

4. **Classify each returned area** as `verified` (converged + all-OS CI green against a fresh base), `rejected` (did not converge or definitively red), or `retry` (transient, retried at most once). No area reaches REPORT as merge-ready without passing both the convergence and the CI check.

### Phase 5: REPORT — Batch Summary, Never Merge

1. **Emit a one-row-per-area batch summary** for bulk human review:

   | Area | Verdict | PR  | Findings resolved | Assumptions made | Parked unsafe remediation |
   | ---- | ------- | --- | ----------------- | ---------------- | ------------------------- |

   Every verified area's row carries its PR link, the count of drift/coverage findings resolved, the **assumptions-made note** from DISPATCH, and any parked unsafe remediation. Rejected/failed areas are listed with the reason.

2. **Annotate already-fresh areas accurately.** For each area flagged already-fresh in SELECT and confirmed in CONFIRM, record it as dropped with a note **citing the resolving PR** — never a re-remediation.

3. **Never merge.** The fleet delivers verified, reviewable doc-fix PRs; the human (optionally via `pr-fleet`) lands the batch. Auto-merging a doc PR is out of scope by design — a confidently-worded but wrong doc is a trap that outlives the merge.

4. **Degrade gracefully.** A missing detector source, an already-fresh area, or a single area's non-converging remediation results in that area (or source) being **reported** while the rest of the batch proceeds. One bad area never sinks the batch.

## Harness Integration

- **`harness skill run docs-fleet`** — Run the full five-phase batch pipeline.
- **`detect-doc-drift`** — Composed in SELECT to surface code-vs-doc drift; also re-run in VERIFY as the independent convergence re-scan.
- **`harness check-docs`** — Composed in SELECT for the documentation floor (coverage, broken links, stale sections); re-run in VERIFY and it is the repo's own CI doc gate the fleet's PRs must satisfy.
- **`harness-docs-pipeline`** — The real per-area remediation pipeline each DISPATCH subagent runs (`--fix`, convergence mode); the fleet composes it and never reimplements drift detection or fix application.
- **`harness-roadmap-pilot`** — Its impact-scoring approach is reused in SELECT to order areas by composite staleness value.
- **`gh`** — Cross-check merged/open PRs (SELECT), read `gh pr checks` (VERIFY), and open the doc-fix PRs (REPORT).
- **`harness skill validate docs-fleet`** — The authoring-time gate for this skill's own structure and schema.
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (the five-phase skeleton, the concurrency governor, the per-leaf context budget, the convergence/CI verification discipline, the base-freshness clause, the worktree fan-out, the canonical handoff record, and the never-silent-merge invariant), stated once for the family.

## Success Criteria

- Given a confirmed batch of N doc areas, the fleet produces **up to N** doc-fix PRs, each with a verified convergence record (re-scan clean: drift resolved, `harness check-docs` passing) and green CI across all target operating systems plus the project's required checks.
- There is **exactly one** up-front human decision round; no per-area interactive pauses except a genuinely-unsafe remediation parked to its own area.
- **Every emitted PR carries an "assumptions made" note** (ranking basis, remediation scope, safe/probably-safe/unsafe calls).
- Unsafe documentation changes (behavioural rewrites, deleted-code section removal, complex-module authoring) are **parked and reported, never auto-applied**.
- Already-fresh areas are **dropped/annotated with a resolving-PR citation, not re-remediated**.
- The skill **never auto-merges** a doc-fix PR.
- It **degrades gracefully**: a missing detector source or a single area's non-converging remediation is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- No area is marked merge-ready on a subagent self-report — every verdict is backed by an independently-checked convergence re-scan + all-OS CI against a fresh base.

## Gates

- **No "merge-ready" without a verified convergence re-scan.** An area whose re-scan still reports drift or coverage gaps did not converge. It is rejected or retried — never reported as merge-ready, no matter what the subagent claimed.
- **No "merge-ready" without all-OS CI green against a fresh base.** Green on a subset of operating systems (or with the repo's `check-docs` CI gate red), or green gathered against a base `main` has moved past, is not verified. Report subset-red as failed; downgrade stale-base green to `degraded` and refresh before it can authorize anything.
- **Never auto-apply an unsafe documentation change.** Behavioural-explanation rewrites, deleted-code section removals, and complex-module authoring park for the human; the fleet applies only the safe and probably-safe classes autonomously.
- **Never auto-merge.** The fleet stops at reviewable PRs. Merging a doc PR from inside the fleet = gate violation; the human lands the batch.
- **Never exceed the concurrency governor.** More than ~3 concurrent remediation agents is the machine-storm zone; do not raise the cap to "go faster."
- **A self-report is never verification.** Accepting "drift gone, CI green" without independently re-scanning the area and checking CI = gate violation. Re-verify independently.
- **Never suppress a finding as remediation.** Deleting a doc, excluding a file from coverage, or silencing a link check is not documentation — a suppressed finding fails the convergence re-scan by design.
- **Never `--no-verify`.** No subagent bypasses the pre-push gates; a `.claude/`-nested worktree pushes via the GitHub API or a non-nested worktree instead.

## Escalation

- **A detector source is unavailable (`detect-doc-drift` errors, `harness check-docs` missing, no git history):** proceed with whichever detectors are available; record the missing source in REPORT rather than aborting. If no detector is available, stop and report — there is nothing to enumerate.
- **A subagent returns a branch whose re-scan still shows drift:** do not accept its self-report. Reject or retry once; if it still does not converge, report the area as "did not converge" and move on — the batch continues.
- **An area parks on an unsafe remediation:** surface the unsafe change (with the area's context and a recommendation) in REPORT for the human; do not apply it and continue. The parked area is the only one affected.
- **CI red on a subset of OS:** report the area failed with the failing OS/check named; never mark it merge-ready. Do not average a mixed CI result into "mostly green".
- **The batch appears coupled (one area's doc-fix depends on another's merge):** stop fanning out those areas; the coupling means they are one convergence pipeline, not a fleet. Escalate to the human to sequence them through `harness-docs-pipeline`.

## Rationalizations to Reject

| Rationalization                                                                             | Reality                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The subagent reported the drift is gone and CI is green, so the docs are fresh"            | A self-report is a claim, not evidence. Independently re-scan the area with `detect-doc-drift` + `harness check-docs` and confirm CI — or the remediation did not converge.   |
| "It's just docs — bundle every area's fix into one big PR"                                  | Scope one coherent area per PR. A mega-doc-PR is un-reviewable and un-revertible; the whole model depends on the reviewer holding one area's diff in their head.              |
| "This module's behaviour clearly changed — just rewrite the behavioural explanation for it" | A behavioural rewrite is the unsafe class. It parks for the human; a confidently-worded but wrong behavioural doc is worse than an obviously-stale one.                       |
| "The re-scan still flags a couple of drift findings but CI is green — ship it"              | Convergence is a gate. A remediation that did not resolve the findings it opened with is not merge-ready; report it non-converging, do not ship a half-fix.                   |
| "The doc is wrong — just delete the section / exclude the file from coverage"               | Suppression is not documentation. A deleted section or excluded file fails the convergence re-scan by design; the fleet remediates, it does not mute the gate.                |
| "I'll hand-edit this one area's docs — it's faster than driving the whole pipeline"         | Dogfood the real per-area skill. A hand-edited area leaves no convergence record, fails VERIFY, and breaks the guarantee that every PR ran the audited pipeline.              |
| "The batch is verified — I'll merge these doc PRs to save the human a step"                 | Never auto-merge. A stale-but-plausible doc is a long-lived trap; the one review the whole model is built around must happen before it lands.                                 |
| "One area didn't converge, so the sweep is a bust — abort the batch"                        | Degrade gracefully. Report the non-converging area and keep the verified ones; one bad area never sinks the batch.                                                            |
| "This doc reads badly — I'll rewrite it for quality while I'm in here"                      | Quality is `craft-fleet`'s `docs-craft` ceiling, not docs-fleet's floor. docs-fleet resolves drift and coverage; scope creep into prose-elevation is a different fleet's job. |
| "I'll reimplement drift detection here so the fleet is self-contained"                      | Compose, don't reimplement. `harness-docs-pipeline` (which composes `detect-doc-drift`) exists and is battle-tested; a second detection engine is drift waiting to happen.    |

## Red Flags

| Flag                                                                            | Corrective Action                                                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "I'll mark it verified based on the subagent's summary"                         | STOP. Independently re-scan the area's docs and check CI. A summary is not a verification.                                           |
| "This behavioural-explanation rewrite looks safe enough — I'll apply it"        | STOP. Behavioural rewrites are the unsafe class and park. Record it with a recommendation; do not auto-apply.                        |
| "The pre-push check-docs gate is failing in this worktree — I'll `--no-verify`" | STOP. Never bypass — and least of all a docs fleet, whose subject IS that gate. Push via the GitHub API or a non-`.claude` worktree. |
| "All verified — let me merge and close the loop"                                | STOP. The fleet never merges. Deliver the PRs for review; landing is the human's step.                                               |
| "The coverage finding is noisy — I'll exclude the file"                         | STOP. Excluding a file is suppression, not documentation. Document the file or park the area; never mute the gate.                   |

## Examples

### Example: A five-area documentation-drift sweep

```
$ harness skill run docs-fleet --concurrency 2

Phase 1: SELECT
  Composed detectors:
    detect-doc-drift    -> 14 drift findings across 8 files (renames, deleted-code refs)
    check-docs          -> 9 undocumented exports, 3 broken links, 2 stale sections
    docs-pipeline (report-only) -> combined 28 findings
    doc-churn pass      -> 5 modules whose code moved but docs did not
  Folded into 6 areas; cross-check vs merged/open PRs:
    - "auth module docs" -> already-fresh (merged PR: link) -> flag for drop
  Classified: 3 safe, 2 probably-safe, 1 unsafe ("rewrite scheduler behaviour doc")
  Scored 5 survivors by churn-gap x drift-density x coverage-gap; ordered highest-first.

Phase 2: CONFIRM  [checkpoint:human-verify]
  Ranked batch (5) presented. Already-fresh area flagged for drop.
  Unsafe area "scheduler behaviour doc" flagged as will-park (not auto-applied).
  Human trims 1 low-value area -> batch = 4 (3 safe/probably-safe + 1 unsafe). Concurrency: 2.

Phase 3: DISPATCH (governor = 2)
  3 remediable areas: worktree-isolated subagents, 2 at a time, each running real
  harness-docs-pipeline --fix scoped to its one area.
  Unsafe area "scheduler behaviour doc" -> parks and reports (behavioural rewrite);
  the other 3 continue.

Phase 4: VERIFY (independent — no self-report)
  area A (renamed-symbol refs): re-scan clean, CI green all 3 OS + check-docs -> verified
  area B (undocumented exports): re-scan clean, CI green all 3 OS -> verified
  area C (broken links + stale section): re-scan STILL shows 2 broken links -> REJECTED
  area D (scheduler behaviour doc): parked in DISPATCH -> not verified (unsafe, awaits human)

Phase 5: REPORT
  | Area                  | Verdict  | PR   | Findings resolved | Assumptions made              | Parked unsafe remediation   |
  | --------------------- | -------- | ---- | ----------------- | ----------------------------- | --------------------------- |
  | renamed-symbol refs   | verified | link | 11                | scope: api/ docs only         | —                           |
  | undocumented exports  | verified | link | 9                 | added minimal entries         | —                           |
  | broken links + stale  | rejected | —    | —                 | —                             | — (did not converge)        |
  | scheduler behaviour   | parked   | —    | —                 | —                             | behavioural rewrite (unsafe) |
  Dropped 1 already-fresh area with a note citing the resolving PR.
  Never merged. 2 PRs handed to the human for bulk review.
```

### Example: Rejecting a non-converging area

A subagent returns a branch and reports "done — refreshed the docs, CI green." VERIFY re-scans the area with `detect-doc-drift` + `harness check-docs` and still finds two broken links the subagent missed: the remediation **did not converge**. Per the Iron Law it is **rejected** (retried once, still non-converging → reported as "did not converge"), never marked merge-ready. The batch's other verified areas proceed to REPORT unaffected.

## Test Scenarios

### Scenario 1: Gate — a self-report accepted as verification

VERIFY receives a subagent claiming "drift gone, CI green" but a fresh re-scan of the area still reports broken links. Expected: the "no merge-ready without a verified convergence re-scan" Gate halts marking it merge-ready; the area is rejected/retried, not reported as a PR. Accepting the self-report is the failure this scenario guards against.

### Scenario 2: Gate — auto-applying an unsafe documentation change

An area's remediation turns out to require rewriting a behavioural explanation for a module whose behaviour changed. Expected: the "never auto-apply an unsafe documentation change" Gate parks the area and reports the change with a recommendation; the unsafe rewrite is never applied autonomously. The other in-flight areas continue uninterrupted.

### Scenario 3: Rationalization — scope creep into quality

An operator reasons "while I'm refreshing this doc, I'll rewrite it to read better." Expected: rejected by the floor-vs-ceiling boundary — docs-fleet resolves drift and coverage (the floor); prose-elevation is `craft-fleet`'s `docs-craft` ceiling. Mixing them makes the doc-fix PR un-reviewable and blurs the two fleets' queues.

### Scenario 4: Rationalization — reimplementing detection

An operator reasons "I'll reimplement doc-drift detection inside the fleet so it's self-contained." Expected: rejected by the "compose, don't reimplement" rationalization — the fleet composes `detect-doc-drift` + `harness check-docs` for its queue and runs the real `harness-docs-pipeline` per area. A second detection engine is drift waiting to happen.
