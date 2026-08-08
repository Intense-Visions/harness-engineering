# Security Fleet

> Autonomous security backlog sweep — enumerate risk-ranked code areas plus the resolved dependency tree, discard every candidate that cannot produce concrete evidence, confirm one ranked batch with the human in a single up-front round, then route each survivor by a bounded-fix test: a safe bounded fix is built through the **real** pipeline into an independently verified PR, while a risky or structural finding is filed with its evidence packet instead of force-fixed. The fleet never auto-merges, never closes a finding by suppression, and never reports a secret's value.

A security backlog is the worst kind of attention slog. The signal is loud — a mechanical scanner emits dozens of findings, a dependency audit emits dozens more, a judgment-based critique emits dozens beyond that — and most of it is noise. Someone has to decide, per finding, whether the flagged sink is actually reachable, whether the advisory's affected code path is actually imported, whether the trust-boundary concern is real or theoretical; then, for the survivors, whether this is a two-line fix or an auth-model redesign. The scanners are fast; the human triage in the middle is the bottleneck, and it is the step most often skipped — which is how a repo ends up with "40 vulnerabilities" on its default branch that nobody has read. `security-fleet` is a **quality-queue** member of the `-fleet` family, sweeping the security backlog of the standing codebase alongside the core conveyor (intake → decide → build → land). Two things make it a distinct member rather than a re-skin of a build-stage fleet. It is **evidence-gated**: a candidate enters the batch only when it carries a named evidence class, and one that carries none is discarded rather than reported at low confidence. And its **terminal act is tiered**: not every real finding should become a PR, because a sweep that quietly redesigns an auth model is more dangerous than the vulnerability it was closing. The shared, stage-agnostic scaffolding it builds on is documented in the `-fleet` family spine reference (`docs/reference/fleet-family.md`).

## When to Use

- A noisy security backlog — scanner findings, audit findings, and critique findings together — needs autonomous triage plus one bulk review instead of per-finding babysitting
- Clearing accumulated security debt where reading, reproducing, and routing each finding by hand does not scale
- Turning a code scan plus a dependency audit into a small batch of evidence-backed outcomes — reviewable fix PRs and filed structural findings — in a single session
- When the findings are largely independent — each one's remedy lands on its own and does not require another finding's fix first
- NOT for auditing a single file or one dependency on request — invoke `harness-security-scan` or `harness-supply-chain-audit` directly; a fleet's overhead only pays off across a backlog
- NOT for general correctness bugs — the boundary against the build pipeline is by **domain**; a non-security defect found incidentally is parked and handed off, never fixed inside the security sweep
- NOT for exploit development, live-system probing, or penetration testing — analysis is static plus advisory-based over the standing codebase, and producing a working exploit is explicitly out of scope
- NOT for reporting speculative "hardening opportunities" — a candidate with no evidence class is discarded, because a sweep that emits maybes is the problem it exists to solve
- NOT for converging one module's security posture to done through repeated rounds — that is a **pipeline** (it loops on one target), not a fleet (which fans out across many independent findings into many outcomes)

## Flags

| Flag            | Effect                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--concurrency` | Cap concurrent fix subagents (default 2, max recommended 3 — the machine-storm cap)                                   |
| `--report-only` | Enumerate, gate on evidence, tier, and present the ranked finding batch; do not dispatch fix subagents or file issues |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out                                                                      |

## Process

### Iron Law

**A finding enters the batch only when it carries a named evidence class, and a fix PR is "merge-ready" only after independent confirmation that the original evidence no longer reproduces, that the branch introduces no new security finding, and that CI is green across all OS. The fleet never auto-merges, never closes a finding by suppression, and never accepts a subagent's self-report as proof.**

Security tooling's failure mode is not missing findings — it is volume. A scanner that emits sixty maybes and three real problems has not helped anyone; a human who learns the queue contains maybes stops reading the queue. So the gate has to be a **mechanism, not a hope**: named evidence classes, applied before an item ever costs a human a second of attention, with the discards counted so the gate itself stays auditable. The same logic runs the other way at the end. "The scanner is quiet now" is not proof a vulnerability is closed — a suppression makes a scanner quiet, and so does deleting the test that reached the sink. The only proof is that the **original evidence no longer reproduces**: the sink is unreachable, the advisory is clear, the boundary control is present. Everything between those two gates is machinery.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
                     Phase 5: REPORT <-- Phase 4: VERIFY
```

| Phase       | Purpose                                                                         | Exit Condition                                                                                            |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1. SELECT   | Enumerate both halves of the queue, apply the evidence gate, cross-check, tier  | Ranked `SecurityFinding[]` with evidence classes, tiers, cross-check verdicts, forks, and a discard count |
| 2. CONFIRM  | One up-front human round: approve/trim, re-tier, answer forks, set concurrency  | Human-approved batch with answered forks, confirmed tiers, agreed concurrency                             |
| 3. DISPATCH | FIX-tier worktree fan-out through the real pipeline; FILE-tier evidence packets | Every confirmed item returned a branch, an evidence packet, parked, or re-tiered (all recorded)           |
| 4. VERIFY   | Independent artifact + evidence-cleared + no-new-finding + all-OS-CI check      | Each item marked verified / rejected / retry                                                              |
| 5. REPORT   | One-row-per-item batch summary with the discard count; never merge              | Report delivered with the aggregate discard count; nothing merged                                         |

The five-phase spine, the concurrency governor, the artifact + all-OS-CI verification discipline, the worktree fan-out with its push-path caveat, and the never-silent-merge invariant are the family-shared scaffolding — stated once in `docs/reference/fleet-family.md`, and fixed at family level by the subagent worktree fan-out ADR and the front-load / park-unforeseen interaction-model ADR. This skill states only what is specific to the security stage: the **evidence-gated two-sourced queue**, the **tiered terminal act**, the **security-shaped verification** (evidence cleared plus no new finding, not just an artifact), and the **secret-handling rule** no other member needs.

### Phase 1: SELECT — Enumerate Both Halves, Gate on Evidence, Cross-Check, Tier, Score

1. **Enumerate from both halves of the security surface.** The queue is two-sourced and merged into one ranked list. On the **code side**, compose `harness-security-scan` (mechanical detection) with `security-craft` (LLM-judgment trust-boundary and least-authority critique) over the areas the graph ranks as highest-exposure — entry points, trust boundaries, critical paths — with `harness-security-review` supplying the OWASP/CWE finding taxonomy so findings are named in a vocabulary a reviewer already reads. On the **supply-chain side**, compose `harness-supply-chain-audit`'s 6-factor dependency risk evaluation with advisory matching over the **resolved** dependency tree (the lockfile's actual versions, not the manifest's ranges). A missing scanner or an unavailable advisory source **degrades to the remaining half and is recorded** — a half queue is never presented as a complete one.

2. **Apply the evidence gate — a hard filter, not a confidence score.** Assign each candidate exactly one of three named evidence classes, or discard it:
   - **`reachable-sink`** — an untrusted source reaches a dangerous sink along a path that **actually exists in the code**. "This function looks dangerous" is not a reachable sink; the path is the evidence.
   - **`exploitable-path`** — a trust boundary is crossed without the control that boundary requires, with the crossing named **concretely**: which entry point, which missing control. "Exploitable" here means the path is demonstrated **in the code** — building a working exploit is an explicit non-goal.
   - **`advisory-match`** — a resolved dependency version falls inside an advisory's affected range **and** the vulnerable API surface is actually reached from this codebase. A lockfile-only match on an unused code path is a **weaker** finding within this class and must be **labeled as such**, never inflated to look like a reached one.

   A candidate with no class is **discarded** — not downgraded, not carried into CONFIRM as an FYI, not reported at low confidence. Keep an **aggregate discard count** and report it, so the gate itself stays auditable and a reviewer can see how much noise it absorbed.

3. **Cross-check every survivor against what is already resolved or in flight.** Check each finding against already-fixed or superseded state on the default branch (an advisory already remediated there), against in-flight security PRs, and against existing open security issues. A duplicate is **flagged for closure or dropped, never re-filed** — duplicate security issues are actively corrosive to a triage queue, because they make the queue look larger than the risk.

4. **Tier each survivor by the bounded-fix test.** **FIX** = the remedy is safe, bounded, and mechanically verifiable: a dependency bump within a compatible range, an input-validation or output-encoding patch at identified call sites, removal of a hardcoded credential from source. **FILE** = the remedy is risky or structural: an authentication/authorization model change, a trust-boundary redesign, a cryptographic scheme replacement, or any remedy whose blast radius crosses module boundaries or changes a security contract. The tier is decided **here** and confirmed in CONFIRM — it is **never chosen mid-flight**, because a tier chosen while already editing code is a tier chosen by sunk cost.

5. **Score and order by severity × evidence strength × exposure.** Do not rank ad-hoc, and do not rank by scanner severity alone. Reuse `harness-roadmap-pilot`-style impact scoring with the graph supplying the exposure term. The worked comparison that makes this concrete: a **high**-severity advisory on an unreached dev-only dependency ranks **below** a **moderate** reachable injection sink at a public entry point — because severity describes the weakness in the abstract, while evidence strength and exposure describe what it means here.

6. **Build the `SecurityFinding` record** for each survivor, and detect known decision forks without answering them:

   ```
   SecurityFinding {
     id,               // stable finding id
     title,
     source,           // "code-scan" | "craft-critique" | "supply-chain" | "advisory"
     evidenceClass,    // "reachable-sink" | "exploitable-path" | "advisory-match"
     evidence,         // the concrete trace: sink path, boundary crossing, or advisory id + range + usage site
     severity,
     cweOrAdvisory,    // taxonomy reference
     exposure,         // graph-derived exposure weight
     score,            // severity x evidence strength x exposure
     tier,             // "fix" | "file"
     crossCheck,       // "novel" | "already-fixed" | "duplicate-issue" | "in-progress-elsewhere"
     locations,
     // populated after DISPATCH:
     branch, regressionTest, evidenceCleared, assumptions, parkedForks, reTieredTo,
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate `[checkpoint:human-verify]`

1. **Present the ranked finding batch in one round.** This is the **only guaranteed human touchpoint before review** — everything downstream runs autonomously. Present, together, in a single surface:
   - The ranked findings (highest score first), each with its **evidence class**, its concrete evidence trace, its score, and its **proposed tier**.
   - The **aggregate evidence-gate discard count** — how many candidates the gate absorbed and why in summary. The reader needs to see the noise that did not reach them; that is what makes the short list credible.
   - Duplicates and already-remediated findings **flagged for drop or closure**, each with the citation (the resolving PR, the existing issue) — never re-filed.
   - Every detected known decision fork as a **multiple-choice question** with a recommended default (e.g. "this dependency's compatible-range bump crosses a major version — bump within range and accept the remaining exposure, or file it as structural?").
   - The **proposed concurrency** (default 2, capped at ~3).

2. **The human approves or trims once, and may re-tier.** Batch approval, fork answering, drop confirmation, and tier confirmation all happen in this same gate. The human may **re-tier** any item in either direction — FIX → FILE when a proposed fix looks riskier than it reads, or FILE → FIX when a structural-looking finding is bounded in this codebase. Answered forks are recorded and fed into each item's DISPATCH brief so no subagent re-asks a settled question.

3. **From here it is autonomous.** After this gate the fleet does not pause per-finding. The only things that re-surface before REPORT are a genuinely **unforeseen** fork and a **mid-flight re-tier** — each of which parks a single item without blocking the batch (see DISPATCH). Under `--dry-run` the skill stops at the end of this phase; under `--report-only` it presents the gated, tiered, ranked batch and dispatches nothing.

4. **Degraded terminal act is named here, not discovered later.** If `gh` is unauthenticated the fleet still runs SELECT and CONFIRM in full: it opens no PRs and files no issues, and it reports the ranked queue with the **blocked terminal act named explicitly**. A queue delivered without its terminal act is a useful outcome; a queue delivered as though it had shipped is not.

### Phase 3: DISPATCH — Tiered Fan-Out With a Concurrency Governor

1. **FIX tier: one worktree-isolated subagent per finding**, briefed to run four steps in order. (a) **Re-confirm the evidence reproduces in its own worktree before changing anything** — inherited evidence is not evidence, and a finding that will not reproduce is a false positive to be **dropped and reported**, never fixed on faith. (b) Run the **real** `harness-brainstorming` → `harness-autopilot` build pipeline to author the fix — this is the family's dogfooding invariant and it is what leaves the plan directory plus autopilot-state that VERIFY checks for. (c) Where the finding is code-side, add a **regression test that fails before the fix and passes after** — the security analogue of a behavior-asserting test, and the only proof the vulnerability is closed rather than merely unscanned. (d) Run the OWASP/CWE reviewer (`harness-security-review`) **over its own diff** before pushing, so a fix that introduces a new weakness is caught before VERIFY rather than at it. Self-review is a first pass, not the verdict — VERIFY re-scans independently precisely because a subagent reviewing its own work is the weakest link in the chain.

2. **The `advisory-match` degradation is narrow and named.** For a dependency bump with **no code-side sink**, step (c) degrades to the advisory clearing plus all-OS CI green (no behavior regression) — a version bump has no call site of its own to characterize. This is the only degradation, and it is not a general licence: a code-side `reachable-sink` or `exploitable-path` finding **always** needs a regression test that fails before the fix. "It's just a small patch" is not an `advisory-match`.

3. **FILE tier: an evidence packet, not a build.** A FILE-tier item opens **no branch** and runs no build pipeline. Its work product is a filed issue containing the evidence class and its concrete trace, the affected locations, the advisory or CWE reference, **why the remedy is structural**, and the options a human would need to decide between. It is filed through the project's configured security-disclosure channel when one exists, otherwise the normal issue tracker. A filed item with no evidence is exactly the speculative flag the gate exists to reject — the evidence packet _is_ the deliverable.

4. **Re-tier and park; never grow the fix.** A FIX-tier item that proves **structural mid-flight** — the bounded patch turns out to require an auth-model change, or the sink cannot be closed without moving a trust boundary — **re-tiers to FILE and parks**, carrying everything it learned into the evidence packet. It does not grow the fix to fit the finding. Separately, an item whose only available remedy is a **suppression, ignore rule, advisory mute, or scanner exclusion** re-tiers to FILE **with that constraint stated** — it is never closed by suppression, because suppression closes a count, not a vulnerability. Any other unforeseen fork parks that one item; the rest of the batch continues uninterrupted.

5. **Never publish a secret's value.** A leaked-credential finding is the one case where the evidence _is_ the secret. Report the **file, the line, and the credential type** — never the value — in **every** surface: PR description, issue body, report row, and commit message alike. A sweep that publishes the secrets it found has converted a contained leak into a broadcast one. State plainly in the outcome that **rotation is a required human action the fleet does not perform**: removing a credential from source does not un-leak it, and a fix PR that removes the string without rotation is a half-closed finding.

6. **Domain boundary: park correctness defects, do not fix them.** A non-security correctness defect discovered incidentally — a crash, a wrong result, a race — **parks and is reported** for the build pipeline. It is never fixed inside the security sweep, even when the subagent is already in the file. Two fleets fixing the same file from different queues produce conflicting PRs; the clean domain split is what keeps the batches independent.

7. **Concurrency governor and push path.** Cap concurrent subagents at the confirmed governor (default 2, max ~3) — the machine-storm limit shared across the family, beyond which compound load produces flaky failures indistinguishable from real ones. Never raise the cap to "go faster." A worktree created under a `.claude/`-nested path breaks the local pre-push `check-docs` gate (it self-excludes and scans zero files); subagents push via the GitHub API or from a non-`.claude` throwaway worktree. **Never `--no-verify`** — bypassing the gate defeats the verification the whole fleet depends on.

### Phase 4: VERIFY — Independent Confirmation, Never Self-Report

1. **Never accept a subagent's self-report as verification.** "Fixed, scanner is clean, CI green" is a claim to be checked, not a result. For each returned FIX-tier branch the orchestrator independently confirms all four checks below; failing any one of them is a rejection, not a discount.

2. **Pipeline artifact.** Confirm a plan directory under `docs/changes/<slug>/plans/` and an autopilot-state exist on the branch. A branch with no artifact **did not run the real pipeline** — it is a hand-patch, regardless of what the report says, and hand-patched security fixes are exactly the scanner-silencing edits this fleet exists to prevent.

3. **Evidence cleared.** Confirm the **original evidence no longer reproduces** on the branch: the sink is unreachable, the advisory is clear, or the boundary control is present — whichever class the finding carried. This is the security analogue of a coverage delta, and it is the check that distinguishes a fix from a mute. Re-run the evidence, do not re-read the report.

4. **No new finding.** Re-scan the branch and confirm it is **not worse than the base**. A fix that clears its own evidence while introducing a new weakness is **rejected, not reported as merge-ready** — trading one vulnerability for another is not a fix, and the fact that the original ticket can now be closed is not a reason to ship it.

5. **All-OS CI green.** Confirm the pushed branch is green on **all** operating systems plus the enforce and harness checks, with the **full** test suite passing — not just the new regression test. Green on one OS is not green, and a mixed result is never averaged into "mostly green."

6. **FILE-tier items are verified differently, but they are still verified.** Confirm the issue **exists**, carries a **named evidence class with its concrete trace**, and is **not a duplicate** of an existing open item. A filed issue with no evidence packet is the speculative flag the gate rejected upstream, re-entering through the back door.

7. **Classify each item** as `verified` (all applicable checks passed), `rejected` (missing artifact, evidence still reproduces, a new finding introduced, or definitively red CI), or `retry` (transient, retried **at most once**). No item reaches REPORT as merge-ready without passing every check that applies to its tier.

### Phase 5: REPORT — Batch Summary, Discard Count, Never Merge

1. **Emit a one-row-per-item batch summary** for bulk human review:

   | Finding | Evidence class | Tier | Verdict | PR / Issue | Assumptions made | Parked / re-tiered |
   | ------- | -------------- | ---- | ------- | ---------- | ---------------- | ------------------ |

   Every verified row carries its PR or issue link, the **assumptions-made note** from DISPATCH, and any parked fork or mid-flight re-tier. Rejected items are listed **with the reason** (no artifact, evidence still reproduces, new finding introduced, subset-red CI) — a rejection is a result the reviewer needs, not a failure to hide.

2. **Print the aggregate evidence-gate discard count alongside the table.** State how many candidates were enumerated, how many carried a named evidence class, and how many were discarded. The batch is only credible when the reader can see the volume the gate absorbed.

3. **Annotate duplicates and already-remediated findings with a citation** — the resolving PR or the existing open issue — recorded as dropped or closed. Never re-filed, never re-fixed.

4. **Report secrets by location and type only.** Restated here because REPORT is the surface where it is most tempting to be helpful: file, line, and credential type — never the value. Name **rotation as the required human action** the fleet did not perform.

5. **Never merge.** The fleet delivers verified, reviewable fix PRs and filed evidence packets; the human lands them. The never-silent-merge invariant applies with extra force here — a security PR that merges without a human read is the failure mode the whole batch-review model exists to prevent.

6. **Degrade gracefully.** A missing scanner, unavailable advisory data, missing `gh` auth, or a single item's failed fix is **reported while the batch continues**, with the gap named. One bad item never sinks the batch, and a partial queue is never presented as a complete one.

## Harness Integration

- **`harness skill run security-fleet`** — Run the full five-phase batch sweep.
- **`harness-security-scan`** — Composed in SELECT for mechanical code-side enumeration, and again in VERIFY to re-scan each branch for new findings; the fleet does not reimplement scanning.
- **`harness-supply-chain-audit`** — Composed in SELECT for 6-factor dependency risk evaluation and advisory matching over the resolved dependency tree.
- **`security-craft`** — The LLM-judgment trust-boundary and least-authority critique that supplies the code-side findings a mechanical scanner cannot see.
- **`harness-security-review`** — Supplies the OWASP/CWE finding taxonomy in SELECT, and is run by each FIX-tier subagent over its **own diff** in DISPATCH before pushing.
- **`harness-roadmap-pilot`** — Its impact scoring is reused in SELECT to order findings by severity × evidence strength × exposure.
- **`harness-brainstorming` → `harness-autopilot`** — The real per-item build pipeline each FIX-tier subagent runs; it is also the source of the plan-directory and autopilot-state artifact VERIFY requires.
- **The knowledge graph** — Supplies the exposure weighting (entry points, trust boundaries, critical paths) that turns a flat finding list into a risk-ranked queue.
- **`gh`** — Cross-check in-flight security PRs and open security issues (SELECT), read `gh pr checks` for all-OS CI (VERIFY), and open fix PRs and file evidence packets (REPORT).
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (five-phase skeleton, concurrency governor, artifact + all-OS-CI verification discipline, worktree fan-out, never-silent-merge).
- **`harness skill validate security-fleet`** — The authoring-time gate for this skill's own structure and schema.

## Success Criteria

- Given a confirmed batch of N findings, the fleet produces up to N outcomes — FIX-tier PRs each independently verified for pipeline artifact, cleared evidence, no new findings, and all-OS-green CI; FILE-tier issues each carrying a named evidence class with its trace.
- **Every item in the batch carries a named evidence class** — candidates without one are discarded before CONFIRM and reported only as an aggregate count.
- There is **exactly one** up-front human decision round; no per-item interactive pauses except a genuinely-new fork or a mid-flight re-tier parked to its own item.
- **No structural remedy is applied autonomously** — an auth-model or trust-boundary change is filed with evidence, never patched inside the sweep.
- **Every FIX-tier PR carries an "assumptions made" note** and, where the finding is code-side, a regression test that fails before the fix.
- **No secret value appears** in any PR description, issue body, report row, or commit message — secrets are reported by location and type only, with rotation named as a human action.
- **No finding is closed by suppression** — an ignore rule, advisory mute, or scanner exclusion added to clear an item is rejected.
- Duplicates and already-remediated findings are **dropped or closed with a citation**, never re-filed or re-fixed.
- The skill **never auto-merges** a security PR.
- It **degrades gracefully** — a missing scanner, unavailable advisory data, missing `gh` auth, or a single item's failed fix is reported while the batch continues.
- Concurrency never exceeds the confirmed governor (default 2, max ~3).
- **No item is marked fixed on a subagent self-report** — every verdict is backed by independently-checked evidence.

## Gates

- **No item in the batch without a named evidence class.** No evidence, no item — discarded and counted, never downgraded to "low confidence" and never carried into CONFIRM as an FYI. Presenting an ungated candidate to the human is a gate violation.
- **No "merge-ready" without the original evidence cleared.** A branch whose sink is still reachable, whose advisory still matches, or whose boundary control is still missing is not a fix — however green its CI is.
- **No "merge-ready" when the branch introduces a new security finding.** A re-scan worse than the base is a rejection, not a trade. Clearing one weakness while adding another does not net out.
- **No "merge-ready" without the pipeline artifact and all-OS CI green.** A branch with no plan directory and autopilot-state did not run the real pipeline; green on a subset of operating systems is not green.
- **Never close a finding by suppression.** An ignore rule, advisory mute, or scanner exclusion added to clear an item is a gate violation — re-tier the item to FILE with the constraint stated. Suppression closes a count, not a vulnerability.
- **Never apply a structural remedy autonomously.** Auth-model changes, trust-boundary redesigns, and cryptographic-scheme replacements are **filed with evidence**, never patched inside the sweep. A sweep that redesigns an auth model is a larger risk than the finding it was closing.
- **Never publish a secret's value.** Location and type only, in every surface — PR description, issue body, report row, commit message. Rotation is a human action the fleet names and does not perform.
- **Never fix a non-security defect inside the sweep.** Park it and report it for the build pipeline; the domain split is what keeps two fleets from producing conflicting PRs on the same file.
- **Never auto-merge**, **never exceed the concurrency governor**, **never `--no-verify`**, and **a self-report is never verification**.

## Escalation

- **A scanner or the advisory source is unavailable:** build the queue from the remaining half, record the gap in CONFIRM and REPORT, and never present the partial queue as complete. If neither half is available, stop and report — there is no queue to sweep.
- **`gh` is unauthenticated:** run SELECT and CONFIRM, open no PRs and file no issues, and report the ranked queue with the blocked terminal act named.
- **A finding's evidence does not reproduce in the subagent's own worktree:** drop it as a **false positive** and report it as such. Never fix on inherited evidence — a fix for a finding that does not reproduce is a change with no justification.
- **A FIX-tier item proves structural mid-flight:** re-tier it to FILE and park it, carrying what the subagent learned into the evidence packet. Never grow the fix to fit.
- **A fix clears its evidence but the re-scan shows a new finding:** reject the item with both findings named. Do not report it merge-ready and do not "note the follow-up" in the PR body.
- **The only available remedy is a suppression:** re-tier to FILE with that constraint stated explicitly, so the human decides whether to accept the risk. Never close the item by adding the suppression.
- **A non-security correctness defect surfaces:** park that item and report the defect with its context for the build pipeline. The other in-flight items continue.
- **CI is red on a subset of operating systems:** report the item failed with the failing OS and check named. Never average a mixed result into "mostly green," and never mark it merge-ready pending a re-run.
- **The batch appears coupled (several findings share one fix, or one fix must land first):** stop fanning out those items — the coupling means they are a pipeline, not a fleet. Escalate to the human to sequence them.

## Rationalizations to Reject

| Rationalization                                                           | Reality                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The scanner flagged it, so it goes in the batch"                         | A scanner flag is a candidate, not a finding. No named evidence class, no item — volume is the exact failure mode the gate exists to stop, and a queue full of maybes stops being read.          |
| "It's probably reachable — I'll include it at low confidence"             | "Low confidence" is not an evidence class. Either the path exists in the code or it does not; discard it and count it, rather than spending the human's attention on a maybe.                    |
| "Adding an ignore rule clears the finding"                                | Suppression closes a count, not a vulnerability. Re-tier the item to FILE with the constraint stated and let a human accept the risk explicitly — never silently, and never as a "fix."          |
| "The auth model is the real problem — I'll redesign it while I'm in here" | An autonomous sweep that redesigns an auth model is a larger risk than the finding it was closing. File it with the evidence packet and the options; the decision belongs to a human.            |
| "The subagent says the fix works and CI is green"                         | A self-report is a claim. Independently confirm the original evidence no longer reproduces and that the re-scan is not worse than the base — a clean scanner can also mean a muted one.          |
| "The bump clears the advisory, so no test is needed"                      | True only for an `advisory-match` with no code-side sink. A `reachable-sink` or `exploitable-path` finding needs a regression test that fails before the fix — otherwise it is merely unscanned. |
| "I'll paste the leaked key into the issue so the reviewer can confirm it" | The evidence _is_ the secret; publishing it converts a contained leak into a broadcast one. File, line, and credential type only — and name rotation as the human action still outstanding.      |
| "This crash is a bug, not a security issue, but I'm already in the file"  | Domain split. Park it and report it for the build pipeline; a correctness fix buried in a security PR is unreviewable and collides with whatever fleet owns that queue.                          |
| "Bumping concurrency to six will close the backlog sooner"                | Beyond ~3 concurrent fix agents is the machine-storm zone — compound load produces flaky failures indistinguishable from real ones, and re-runs cost more than the parallelism saved.            |

## Red Flags

| Flag                                                                     | Corrective Action                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| "The subagent's summary says it's fixed — I'll mark it verified"         | STOP. Re-run the evidence and re-scan the branch yourself. A summary is a claim; a cleared evidence trace is verification.          |
| "The scanner is quiet now, so the finding is closed"                     | STOP. Check _why_ it is quiet. If an ignore rule, mute, or exclusion did it, re-tier the item to FILE with the constraint stated.   |
| "This needs a trust-boundary change — I'll just do it carefully"         | STOP. Structural remedies are never applied autonomously. Re-tier to FILE and park with the evidence packet.                        |
| "I'll include the credential value so the reviewer can verify the leak"  | STOP. Never publish a secret's value in any surface. Report location and type, and name rotation as the required human action.      |
| "The pre-push gate is failing in this worktree — I'll `--no-verify`"     | STOP. Never bypass. Push via the GitHub API or a non-`.claude` worktree; the gate is part of the verification the fleet depends on. |
| "Everything's verified — let me merge the security PRs and close it out" | STOP. The fleet never merges. Deliver verified PRs and filed evidence packets; landing a security change is the human's read.       |

## Examples

### Example: A mixed-tier security backlog batch

```
$ harness skill run security-fleet --concurrency 2

Phase 1: SELECT
  Enumerated both halves:
    code side       -> security-scan + security-craft over graph-ranked high-exposure areas: 20 candidates
    supply-chain    -> supply-chain-audit + advisory match over the resolved tree:           13 candidates
  Evidence gate (hard filter):
    11 carry a named evidence class -> reachable-sink 4, exploitable-path 3, advisory-match 4
    22 discarded (no class: "looks dangerous", unreached advisory range, style-only hardening)
  Cross-check vs default branch / in-flight PRs / open issues:
    - "legacy-cookie-flags"  -> duplicate-issue (open item)      -> flagged for closure with citation, dropped
    - "stale-yaml-loader"    -> already-fixed on default branch  -> dropped, cited
  Tiered 9 survivors by the bounded-fix test:  6 FIX / 3 FILE
  Scored by severity x evidence strength x exposure:
    a HIGH advisory on an unreached dev-only dep ranked BELOW a MODERATE reachable sink at a public entry point.
  Detected forks: 1 — "stream-parse: the compatible-range bump crosses a major; bump or file as structural?"

Phase 2: CONFIRM  [checkpoint:human-verify]
  Ranked batch (9) presented with evidence class + proposed tier per item.
  Evidence-gate discard count shown: 33 candidates -> 11 gated -> 22 discarded.
  Human answers fork: stream-parse -> bump within range.
  Human RE-TIERS "session-refresh" FIX -> FILE (the patch looked riskier than it read).
  Batch = 5 FIX / 4 FILE. Concurrency confirmed: 2.

Phase 3: DISPATCH (governor = 2)
  5 worktree-isolated FIX subagents, 2 at a time. Each: re-confirm evidence -> real
  brainstorming -> autopilot pipeline -> regression test -> OWASP/CWE self-review of its own diff.
  "upload-path" re-confirmed its evidence, fixed, self-reviewed, pushed.
  "session-token" proves STRUCTURAL mid-flight (the sink cannot close without moving a
    trust boundary) -> RE-TIERS to FILE and parks, carrying its trace into the packet.
  4 branches returned. FILE tier: 5 evidence packets filed (4 confirmed + 1 re-tiered).

Phase 4: VERIFY (independent — never self-report)
  render-user-bio  reachable-sink   artifact ok, evidence cleared, re-scan = base, CI green all OS -> verified
  stream-parse     advisory-match   artifact ok, advisory clear, CI green all OS (bump: no sink)   -> verified
  config-loader    reachable-sink   artifact ok, credential removed from source, CI green all OS   -> verified
  upload-path      exploitable-path evidence cleared BUT re-scan introduces a new weakness         -> REJECTED
  FILE tier: 5 issues confirmed to exist, each with a named evidence class + trace, none a duplicate.

Phase 5: REPORT
  | Finding         | Evidence class   | Tier | Verdict  | PR / Issue | Assumptions made        | Parked / re-tiered   |
  | --------------- | ---------------- | ---- | -------- | ---------- | ----------------------- | -------------------- |
  | render-user-bio | reachable-sink   | fix  | verified | link       | encoded at render site  | —                    |
  | stream-parse    | advisory-match   | fix  | verified | link       | bumped within range     | —                    |
  | config-loader   | reachable-sink   | fix  | verified | link       | —                       | —                    |
  | upload-path     | exploitable-path | fix  | rejected | —          | —                       | new finding in fix   |
  | session-token   | reachable-sink   | file | filed    | link       | —                       | re-tiered mid-flight |
  Evidence-gate discards: 22 of 33 candidates carried no evidence class.
  config-loader: credential found at src/config/loader.ts:41, type = API key. Value NOT reported.
    ROTATION IS REQUIRED and was NOT performed by the fleet.
  Dropped with citation: legacy-cookie-flags (duplicate), stale-yaml-loader (already fixed).
  Never merged. 3 fix PRs + 5 filed evidence packets handed over for review.
```

### Example: Rejecting a fix that silenced the scanner

A subagent returns a branch for a `reachable-sink` finding and reports "done — scanner is clean, CI green." VERIFY reads the diff: the fix is a scanner exclusion for the offending rule, not a change to the sink. Re-running the evidence with the exclusion removed shows the untrusted source still reaches the sink along the same path — the evidence **never cleared**, the scanner was merely muted. Per the Iron Law the item is **rejected**, and because a suppression was its only offered remedy it is **re-tiered to FILE with that constraint stated** so a human decides whether to accept the risk. The batch's other verified items proceed to REPORT unaffected.

## Test Scenarios

### Scenario 1: Gate — a candidate with no evidence class carried into CONFIRM

SELECT produces a candidate the scanner rated high but for which no reachable path, no concrete boundary crossing, and no advisory match could be established, and the temptation is to present it "so the human can judge." Expected: the **"no item in the batch without a named evidence class"** gate discards it before CONFIRM and increments the aggregate discard count; it is never carried as a low-confidence FYI. Spending the human's attention on an ungated maybe is the failure this scenario guards against.

### Scenario 2: Rationalization — closing a finding by suppression

A FIX-tier subagent finds that the only way to clear its finding within the sweep is to add an ignore rule or advisory mute. Expected: the **"never close a finding by suppression"** gate rejects that remedy; the item **re-tiers to FILE with the constraint stated** so the human can accept the risk explicitly. Reporting the item as fixed because the scanner went quiet is the failure this scenario guards against.

### Scenario 3: Park/re-tier — a FIX-tier item proves structural mid-flight

A subagent begins a bounded input-validation patch and discovers the sink cannot be closed without moving a trust boundary. Expected: the item **re-tiers to FILE and parks**, carrying its evidence trace and the options into a filed packet — it does **not** grow the fix to fit, and it does not apply the structural remedy autonomously. The other in-flight items continue uninterrupted, and the re-tier is recorded in REPORT. Redesigning a security contract inside a sweep is the failure this scenario guards against.

### Scenario 4: Secret handling — a leaked credential echoed into an issue body

A finding is a hardcoded credential in source, and the subagent drafts an issue quoting the value "so the reviewer can confirm it." Expected: the **"never publish a secret's value"** gate strips it — the outcome names the file, the line, and the credential **type** only, in every surface including the PR description, report row, and commit message, and states that **rotation is a required human action the fleet did not perform**. Converting a contained leak into a broadcast one is the failure this scenario guards against.
