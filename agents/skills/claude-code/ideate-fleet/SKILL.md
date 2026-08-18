# Ideate Fleet

> Strategy-grounded ideation fan-out at the head of the `-fleet` spine — compose `STRATEGY.md` tracks and supplied opportunity areas into a queue of disjoint themes, confirm the batch with the human in one up-front round, fan out worktree-isolated subagents that each run the **real** `harness-ideate` pipeline for one theme to its ranked artifact, collect every artifact back out of its worktree, independently re-derive every ranking instead of trusting a subagent's report, and hand back **one curated ranked shortlist for a human to pick from**. The fleet files nothing and commits nothing.

The `-fleet` conveyor starts at intake: `issue-fleet` sorts a backlog that already exists, and nothing upstream produces it. Ideation is still a per-topic, human-driven act — `harness-ideate` converges **one** topic into **one** ranked artifact, so a team that wants candidates across five strategy tracks runs it five times by hand and then reconciles five separately-ranked lists into one decision itself. That reconciliation — deduping across topics, checking each candidate against what is already filed or already shipped, and cutting the union down to something a human can actually read — is exactly the attention tax this family exists to remove. `ideate-fleet` fills that gap and becomes the head of the spine: **ideate → issue → adr → roadmap → pr**.

Its defining property is a caution rather than a capability. **Ideation is the lowest-precision stage in the lifecycle.** `harness-ideate` is asked for 5–25 candidates per topic whether or not that many good ones exist; its only defense is a stated preference for fewer-but-distinct over padded near-duplicates, and nothing stops a merely-plausible idea from filling a slot. Across six themes that is a hundred-plus ideas, most of which should never become work. A fleet that auto-filed them would convert one afternoon of machine thinking into a hundred tracking issues that `issue-fleet` then has to triage — the backlog-spam failure mode, transposed one stage upstream and multiplied by the fan-out. So this fleet **files nothing**. Its product is a curated, deduped, bounded shortlist; only the ideas a human explicitly picks become issues or roadmap rows, and those enter the conveyor at intake like anything else. This is `bug-fleet`'s no-reproduction-no-filing discipline applied at the stage where precision is lowest and the temptation to over-produce is highest.

This skill builds on the shared `-fleet` spine documented in `docs/reference/fleet-family.md` — the five-phase SELECT → CONFIRM → DISPATCH → VERIFY → terminal skeleton, the concurrency governor, the artifact-based verification discipline, the worktree fan-out with its nested-path push caveat, the front-load / park-unforeseen interaction model, and the never-ship-unreviewed-work invariant. The family ADRs cited there — _Subagent worktree fan-out (vs the Workflow primitive) for `-fleet` execution_ and _The front-load / park-unforeseen interaction model for the `-fleet` family_ — state that contract once for the family. This SKILL.md defines only what is `ideate-fleet`'s own: its theme queue, its curation taxonomy, its artifact-collection step, its re-derived-ranking verification, its shortlist terminal act, and its domain-specific rationalizations.

## When to Use

- Generating fresh candidate work across several strategy tracks at once, when nothing has been selected yet and the backlog holds no strategy-grounded candidates
- Making `STRATEGY.md` the queue itself rather than one more optional grounding input, so every theme traces to a committed track or to an opportunity area the human named
- Batch-scale ideation, where running `harness-ideate` per topic by hand and then reconciling the separately-ranked lists is the bottleneck
- When the themes are genuinely independent — each is one coherent ideation topic, run in its own worktree, and one theme's candidates do not depend on another's
- When the output has to be short enough to read in one sitting and trustworthy enough to pick from: every row carries a re-derived score, a standing objection, and a novelty citation
- NOT for a single topic — converging one topic into one ranked artifact is `harness-ideate`; a fleet's overhead only pays off across a batch
- NOT for ranking work that already exists — prioritizing existing roadmap entries is `harness-roadmap-pilot`; this member generates fresh candidates
- NOT for triaging, deduping, or routing an existing issue backlog — that is `issue-fleet`, immediately downstream on the conveyor
- NOT for producing specs, plans, ADRs, or code — a picked idea goes to `harness-brainstorming` by hand, after this run has already ended
- NOT for writing or repairing `STRATEGY.md` — that is `harness-strategy`; this member only reads it, exactly as `harness-ideate` does

## Flags

| Flag            | Effect                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| `--themes`      | Opportunity areas folded into the theme queue alongside the `STRATEGY.md` tracks           |
| `--count`       | Candidate ideas requested per theme (default 10, clamped to `harness-ideate`'s `[5, 25]`)  |
| `--cut`         | Per-theme shortlist cut — how many candidates one theme may promote (default 3)            |
| `--cap`         | Global shortlist cap across all themes (default 10, resolved by the reserved-slot rule)    |
| `--concurrency` | Cap concurrent ideation subagents (default 2, max recommended 3 — the machine-storm limit) |
| `--lookback`    | Novelty cross-check window for recently-merged PRs, in days (default 90)                   |
| `--dry-run`     | Run SELECT and CONFIRM only; stop before fan-out                                           |

Every flag has a default and is restated in the CONFIRM round, so a bare invocation is a complete invocation. There is deliberately **no `--report-only`**: a member that files nothing has no destructive mode to suppress, so the flag would do nothing. The objection policy is likewise settled at CONFIRM rather than exposed as a flag.

## Process

### Iron Law

**NOTHING IS FILED — the fleet never creates an issue, never adds or mutates a roadmap row, never writes a spec, plan, or ADR, and never opens a PR. It commits nothing, stages nothing, and pushes nothing. Ideas leave this run _promoted_ in exactly one form: a curated shortlist a human picks from — the collected per-theme artifacts are left beside it as un-promoted evidence. The pick is the human's act, and it happens after the run has ended.**

Ideation is the lowest-precision stage in the lifecycle. `harness-ideate` fills its requested count with whatever is plausible, and the fan-out multiplies that by the theme count — so the fleet's raw output is, by construction, mostly ideas that should never become work. Auto-filing them would hand `issue-fleet` a backlog the fleet itself manufactured, making the intake stage's job harder rather than easier, and would launder machine speculation into tracked work that then looks like a commitment somebody made. `bug-fleet` refuses to file a defect without a reproduction because confident prose is not evidence; the same reasoning applies here with more force, because an idea has no equivalent of a failing test. **The human pick is the only gate that converts an idea into work**, and this fleet does not stand on that side of it.

The corollary matters as much as the law. **A thin theme is a valid, valuable result.** The pressure to return something — anything — so a batch does not look wasted is precisely what produces the shortlist nobody trusts. A theme reported thin tells the human that track is already well-covered, which is information. Padding it destroys the property that makes the shortlist worth reading at all.

```
Phase 1: SELECT --> Phase 2: CONFIRM --> Phase 3: DISPATCH
                                                    |
                                                    v
          Phase 5: CURATE-AND-REPORT <-- Phase 4: VERIFY
```

| Phase                | Purpose                                                                                         | Exit Condition                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. SELECT            | Compose strategy tracks and supplied areas into disjoint, strategically-ranked themes           | Ranked `Theme[]`, disjoint and within the batch bound, each with its strategic basis |
| 2. CONFIRM           | One human round: the themes and merges, the counts, the caps, the policy, the pinned date       | Approved batch with a pinned UTC date and every bound confirmed                      |
| 3. DISPATCH          | Subagents run GROUND → GENERATE → CRITIQUE → RANK → WRITE, then PRESELECT, CROSS-CHECK, COLLECT | Every theme returned candidates, thin, parked, or failed (all recorded)              |
| 4. VERIFY            | Artifact provenance + an independently re-derived ranking, never a self-report                  | Each theme marked verified / thin / parked / rejected                                |
| 5. CURATE-AND-REPORT | Dedup backstop, the bounded cut, one shortlist presented to the human                           | Shortlist presented; nothing filed and nothing committed                             |

### Phase 1: SELECT — Compose the Strategy into Disjoint, Strategically-Ranked Themes

1. **Ground in `STRATEGY.md` — read it, never write it.** Call `read_strategy` on the harness MCP server and handle its three cases exactly as `harness-ideate` does:
   - **Absent** — no strategy grounding; supplied `--themes` proceed ungrounded and the batch's assumptions note records it.
   - **Present and valid** — capture the `Tracks` bullets plus `Target problem`, `Our approach`, and `Who it's for`; these are the queue and the scoring basis.
   - **Present but invalid** — surface the validation error **verbatim**, degrade to the supplied themes, and continue. Repairing `STRATEGY.md` is `harness-strategy`'s job and never this fleet's.

   When `read_strategy` itself is unreachable (no harness MCP server), use `harness-ideate`'s documented `@harness-engineering/core` fallback. If that is unavailable too, treat the run as having **no strategy source**.

2. **Stop when there is no theme source at all.** If `STRATEGY.md` is absent or unusable **and** no `--themes` were supplied, **stop and report**. There is nothing to fan out over, and deriving themes from the codebase instead would invent strategy the human never committed to.

3. **Fold the sources into themes.** A **theme** is one coherent ideation topic — the unit that becomes one `harness-ideate` run, in one worktree. Two constraints are hard:
   - **Disjoint.** Two themes whose focus lines overlap produce the same idea twice in two worktrees, which is how a fleet becomes a duplicate factory. Disjointness is not merely asserted: compare **every pair** of candidate focus lines and, where two overlap, **merge them into one theme with a combined focus line** — or split them along a stated boundary if the human prefers that at CONFIRM. Every merge is carried into the CONFIRM round **showing both source lines**, so the human sees what was folded together before anything fans out.
   - **Bounded.** Default **6 themes** per batch. The bound is what keeps the shortlist readable and the fan-out inside the governor's reach.

4. **Score and order by strategic weight.** Do not rank ad-hoc. Reuse `harness-roadmap-pilot`-style impact scoring over a composite of **track membership**, **whether the theme touches `Target problem` or `Our approach`**, and **how thinly the theme is already covered by existing roadmap rows**, so the order is principled and reproducible rather than a matter of which theme looked interesting first. Highest strategic weight first; this order is also the first tiebreaker in the CURATE cut.

5. **Build the `Theme` record** for each survivor:

   ```
   Theme {
     sources,      // "strategy-track" | "supplied" (may be both after a merge)
     id,           // theme slug
     focus,        // the one-line focus the harness-ideate run receives verbatim
     mergedFrom,   // the source focus lines folded in for disjointness (may be empty)
     basis,        // track membership, target-problem/approach touch, existing coverage
     score,        // composite strategic weight
     forks,        // detected decision forks to surface at CONFIRM (may be empty)
   }
   ```

### Phase 2: CONFIRM — The Single Up-Front Human Gate `[checkpoint:human-verify]`

1. **Present the whole batch in one round.** This is the **only** human touchpoint until the shortlist is presented — everything between runs autonomously. Present, together, in a single surface:
   - The **ranked themes**, highest strategic weight first, each with its basis, and **every disjointness merge with both source focus lines**.
   - The **per-theme candidate count** (default 10, clamped to `harness-ideate`'s `[5, 25]`).
   - The **objection policy** (default `none` — every strongest objection stands as an accepted downside).
   - The **per-theme shortlist cut** (default 3) and the **global shortlist cap** (default 10).
   - The **novelty lookback window** for recently-merged PRs (default 90 days).
   - The **pinned UTC batch date**, fixed here and reused for the whole batch.
   - The **proposed concurrency** (default 2, capped at ~3).
   - An explicit restatement that **nothing will be filed and nothing committed** — no issue, no roadmap row, no spec, no plan, no ADR, no PR, no commit, no push.

2. **The human approves or trims once.** A theme the human drops is dropped; a bound the human tightens applies to the whole batch; a merge the human would rather split is split here, before dispatch. Front-loading the genuinely-ambiguous calls is what keeps the autonomous stretch from producing a shortlist the human would have declined.

3. **Pin the batch date in UTC here.** One date for the shortlist filename and for artifact resolution, so a run that spans UTC midnight does not scatter its artifacts across two dates — the same reason `bug-fleet` pins one base SHA per batch.

4. **From here it is autonomous.** The fleet does not pause per theme. The only thing that re-surfaces before CURATE-AND-REPORT is a theme that hits a genuinely-unforeseen fork mid-flight, which parks that one theme without blocking the batch. Under `--dry-run` the skill stops at the end of this phase.

### Phase 3: DISPATCH — Worktree Fan-Out With a Concurrency Governor

One worktree-isolated subagent per confirmed theme, each running the **real** `harness-ideate` pipeline for its one theme. It does not hand-generate ideas, it does not hand-edit the artifact, and it does not short-cut the pipeline — the ranked artifact the pipeline necessarily leaves behind is what VERIFY checks for, exactly as a plan directory is for the build-stage member.

1. **GROUND → GENERATE → CRITIQUE → RANK → WRITE — the real `harness-ideate`, run to its ranked artifact.** The subagent invokes the actual skill with the confirmed focus line and candidate count. It never writes an ideation artifact itself; producing one by hand leaves a file that looks right and proves nothing.

2. **Answer `harness-ideate`'s two interactive stops from CONFIRM policy — never skip them.** The pipeline pauses twice: once to confirm its inputs, and once after critique to ask which objections to answer. A fan-out cannot pause per theme, so both are answered from policy settled at CONFIRM:
   - **Inputs** — the confirmed theme focus line and the confirmed candidate count.
   - **Objections** — the confirmed policy, **default `none`**: every strongest objection stands as an accepted downside. An unanswered objection lowers an idea's standing, which is the honest default for a machine-generated rebuttal to a machine-generated critique. A fleet that answered its own objections would inflate its own rankings, and the human who picks from the shortlist reads the standing objection as part of the pick.

3. **PRESELECT the theme's top-K.** Take the top `--cut` candidates by the artifact's own order as this theme's shortlist **proposal** — provisionally. Phase 3 reads that order for convenience; Phase 4 re-derives it before anything is promoted, so trusting it here costs nothing. Everything below the cut stays in the artifact — un-promoted, never deleted.

4. **CROSS-CHECK each preselected candidate for novelty.** Check it against **open issues** (via `gh`), **existing roadmap rows** (read directly from `docs/roadmap.md` / `docs/roadmap.d/` — never by invoking a roadmap skill), and **recently-shipped features** — PRs merged within the confirmed lookback window (default 90 days, via `gh`) plus roadmap rows in a done state.
   - An already-tracked or already-shipped idea is annotated **`already-known`** and dropped **citing the issue, roadmap row, or PR that covers it** — never re-surfaced as new.
   - Each drop **backfills** from the next-highest below-cut candidate in that theme until the cut refills or the theme's candidates are exhausted. Every backfill is recorded.
   - If a cross-check source is unavailable (`gh` unauthenticated, no tracker, no roadmap), the candidate is annotated **`novelty-unknown`** — **not `novel`**. It stays eligible, its shortlist row says the check could not run and names the missing source, and the batch's assumptions note records it. Never launder an unrun check into a novelty claim.

5. **COLLECT the artifact verbatim before the worktree is released.** Each `harness-ideate` run writes its artifact inside that theme's worktree, and this fleet pushes nothing — so without collection the artifacts die with the worktrees and every shortlist link dangles. Copy each theme's artifact **byte-identical** into the invoking working tree's `docs/ideation/`. Copying is not editing, and writing a local file is not filing.
   - **The collision rule is applied at collection, not in the worktree.** Each worktree starts with its own empty `docs/ideation/`, so a subagent never observes a collision and never applies `harness-ideate`'s hex-suffix rule. Two themes whose focus lines truncate to the same 30-character slug — and a retry re-running the same focus on the pinned date — would otherwise arrive as the same filename and one would silently overwrite the other. The collector therefore applies that same rule on arrival, deriving the 6-character lowercase hex suffix from the SHA-1 of the focus line plus the run's ISO timestamp — which the artifact records as `generated_at` — so both files coexist and each stays resolvable by its frontmatter.
   - **Release the worktree only after its artifact has landed** in the invoking tree. Removing it first destroys the only copy.
   - A theme whose artifact **cannot be collected** (destination unwritable, worktree unreadable) is **parked** with the filesystem error surfaced verbatim — not rejected, and its worktree is **left in place** so the artifact is still recoverable by hand. A collection failure is the orchestrator's plumbing problem, and calling it a failed pipeline run would blame the subagent for the fleet's own wiring.

6. **Never edit a per-theme artifact.** The fleet reads it, re-derives from it, and links it. Cross-check results, backfills, and verdicts live in the returned record, never in the artifact — an edited artifact can no longer serve as evidence that the pipeline produced it.

7. **Cap concurrency at the governor (default 2, max ~3).** This is the machine-storm limit: beyond roughly three concurrent subagents the compound load produces failures indistinguishable from real ones. Never raise the cap to "go faster." The confirmed candidate count is a separate bound — it caps what each subagent asks `harness-ideate` for, not how many subagents run.

8. **Record an "assumptions made" note per theme** — the derivation basis the theme came from and any merge folded into it, the pinned batch date, the objection policy applied, the cut and cap in force, and every novelty call including the sources that were unavailable. A shortlist is only trustworthy when the reader can see what was assumed and what was deliberately dropped.

9. **Park the unforeseen.** A theme that hits a genuinely-unforeseen fork — the focus line turns out to span two themes, the strategy source contradicts a supplied area, `harness-ideate` cannot proceed — **parks that one theme and reports it**. The other themes continue uninterrupted.

10. **Push-path caveat.** This member pushes nothing, so the pre-push documentation gate never fires for it — but worktrees are still created **outside** a nested agent-config path, so a subagent that needs to run any repository gate is not operating in a self-excluding tree. **Never `--no-verify`** under any circumstance.

Each preselected candidate carries this record forward:

```
Candidate {
  theme,           // the theme it was generated in
  premise,         // the idea, in one declarative sentence
  persona,         // the target persona segment
  complexity,      // low | medium | high
  impact,          // low | medium | high
  confidence,      // low | medium | high
  effort,          // low | medium | high
  recordedScore,   // the base score the artifact records
  rederivedScore,  // the base score the orchestrator recomputes in VERIFY
  finalScore,      // rederivedScore + the artifact's recorded bonus (the bonus is read, never recomputed)
  alignment,       // "applied" | "recorded-not-applied" + reason
  objection,       // the standing strongest-objection paragraph
  novelty,         // "novel" | "already-known" + citation | "novelty-unknown" + missing source
  verdict,         // "shortlisted" | "backfilled-shortlisted" | "below-cut" | "deduped-into" + target | "already-known"
}
```

And the batch itself carries the record every shortlist row and every assumptions note is written against:

```
Batch {
  label,           // the human's invocation topic, or the highest-weighted theme's focus when none was given
  slug,            // batch-slug: kebab-cased label, truncated to 30 chars (+ hex suffix on collision)
  pinnedDate,      // the UTC date fixed at CONFIRM, used for the shortlist filename and artifact resolution
  themes,          // the confirmed Theme[] with their SELECT order
  bounds,          // count, cut, cap (and any reserved-slot raise), lookback, governor
  objectionPolicy, // the policy answered into every harness-ideate run (default "none")
  verdicts,        // per-theme: verified | thin | parked | rejected
  artifacts,       // the collected artifact path per theme
}
```

**Worker handoff — return the canonical `FleetHandoffRecord`.** When a worker finishes its theme it hands the orchestrator exactly one `FleetHandoffRecord` (from `@harness-engineering/types`) — the ONE bounded envelope every `-fleet` member emits, so `fleet-command` parses any fleet's worker output uniformly instead of special-casing an ad hoc per-worker report shape. The record carries `status` (`done | parked | blocked | failed`), `fleet`, `item`, a one-line `summary`, an `evidence[]` of verifiable pointers (branch, PR, artifact path, CI check — exactly the references VERIFY re-checks), `next_steps[]`, and, for any non-`done` status, a `blocker`. The orchestrator validates it with `validateFleetHandoffRecord`; a malformed or unknown-keyed record is rejected, never silently misread. See the canonical handoff record in `docs/reference/fleet-family.md`.

### Phase 4: VERIFY — Provenance Plus a Re-Derived Ranking, Never Self-Report

1. **Why two checks, and why CI is not one of them.** The family invariant requires proof the **real per-item pipeline ran** and forbids accepting a subagent's word for it. This member produces **no code and no PR**, so the family's all-OS-CI half has **no subject** — it is recorded as **not applicable** for every theme rather than quietly dropped, and its evidentiary weight is carried by a second check instead. Provenance proves the pipeline ran; it says nothing about whether the order it produced follows from its own inputs. Re-derivation proves the ranking was computed rather than asserted; it says nothing about whether a real run produced it. Neither does the other's job, so both run, independently, for every theme. **Never accept a subagent's self-report** — "generated ten, ranked them, top three attached" is a claim to be checked, not a result.

2. **Provenance — the pipeline actually ran.** The collected artifact must exist directly under `docs/ideation/` with frontmatter `topic` matching the theme's confirmed focus line. **The scan excludes `docs/ideation/shortlists/`** — that subdirectory holds this fleet's own terminal artifacts, and a prior batch's shortlist must never be readable as a per-theme artifact.
   - **Resolve the artifact by that frontmatter, not by an exact filename.** `harness-ideate` truncates slugs to 30 characters, and the collector applies its hex-suffix collision rule on arrival — which a retry and two themes sharing a truncated slug both trigger. An exact-path check would reject its own pipeline's legitimate output.
   - It must carry the frontmatter `harness-ideate` mandates: `topic`, `generated_at`, `strategy_grounded`, `strategy_path`, `count_requested`, `count_generated`, and `ranking_formula`. `count_requested` must equal the confirmed candidate count, and `count_generated` must equal the number of candidates actually present.
   - Each candidate must carry the six persisted fields — premise, persona, complexity, impact, confidence, effort — plus its strongest-objection paragraph. (`key_risk` is the seed the artifact renders as that paragraph, not a separate persisted field.)
   - **Absent or malformed ⇒ the pipeline did not run ⇒ rejected**, however good the ideas look.
   - A `count_generated` **below** `count_requested` is **not** a rejection — it is reported as **thin**. `harness-ideate` asks for exactly N and prefers fewer-but-distinct over padded near-duplicates, so the two readings of a shortfall are "the run under-delivered" and "the run refused to pad", and the artifact does not say which. Rejecting on that ambiguity would discard real candidates to punish an unproven contract breach, so the fleet takes the conservative side and reports it. Only a count that **exceeds** the confirmed request, or candidates missing their fields, is unambiguous enough to reject on.

3. **Re-derived ranking — the order follows from the recorded inputs.** Recompute `(impact × confidence) ÷ effort` for every candidate from that candidate's **own recorded** impact/confidence/effort using the published `1|2|3` mapping, then confirm three properties:
   - **Score equality** — each candidate's recorded base score equals the recomputed one.
   - **Non-increasing base-score order** — the artifact's order is monotonically non-increasing in **base** score. Order is checked as a **monotonicity property, not as one permitted permutation**, and **on the base score, not the final score**. Two reasons, both structural:
     - The base score is the only quantity fully re-derivable from the artifact's persisted inputs. The alignment bonus is read, never recomputed, so a final-score check would be half-borrowed from the very artifact it is auditing.
     - The `1|2|3` mapping yields **twelve** distinct base-score values, whose smallest gap is `1/6 ≈ 0.167` — larger than the `0.05` tie window, so **the window is only ever entered by exact ties**. But the bonus can reach `+0.75`, which **exceeds seven of the eleven inter-value gaps**. So a tied candidate that earns the full bonus can carry a higher _final_ score than a candidate legitimately ranked above it on base, and the artifact's final-score sequence is then **not** non-increasing while the artifact is perfectly conforming. Checking final-score monotonicity would reject that artifact and discard the whole theme.

     **Exact base-score ties in any order are accepted** — the generation order that breaks them is not persisted, so demanding one exact permutation would reject legitimate artifacts for an unknowable reason.

   - **Bounded bonus** — any strategy-alignment bonus is checked as a **standalone bounded property**, not as an ordering claim: it is within `0 ≤ bonus ≤ 0.75`, and it is non-zero only for a candidate in an **exact base-score tie** (the only case the `0.05` window admits). How `harness-ideate` resolves order between a bonused candidate and a higher-base one is **its** call, and this fleet accepts either resolution rather than forcing one.

   A recomputed-score mismatch, a non-monotonic base-score order, or an out-of-bounds bonus is **rejected, not corrected**. An order that does not follow from the recorded inputs means the ranking was asserted rather than computed — and re-deriving is the one check an eloquent subagent cannot talk its way past. Silently re-sorting would repair the symptom and destroy the signal.

4. **Assign exactly one verdict per theme:**
   - `verified` — artifact resolved, frontmatter and fields complete, every score re-derived, order non-increasing, tiebreaker in bounds.
   - `thin` — verified, but `count_generated` fell below the confirmed request (or no candidate survived curation downstream). A reported outcome, not a failure.
   - `parked` — the theme forked unforeseeably, or its artifact could not be collected. Reported with the error verbatim.
   - `rejected` — any check missing or wrong-shaped. **Retried once**; still failing, it is reported as rejected with the reason and the batch continues. Where a retry leaves two collected artifacts for one focus, the one with the **later `generated_at`** is the one verified.

5. **Record all-OS CI as not applicable** in every theme's verdict line. Recording it is what keeps the family invariant honest: a reader can see the check was considered and why it has no subject here, rather than wondering whether it was skipped.

### Phase 5: CURATE-AND-REPORT — One Shortlist, Presented and Then Stop

1. **Run the cross-theme dedup backstop.** Themes are disjoint by construction, so this is a backstop rather than the primary defense. Two candidates with the same premise collapse into **one entry citing both themes**, and the collapse is recorded. A premise that differs only by a parameter is one idea, per `harness-ideate`'s own near-duplicate rule.

2. **Apply the bounded cut, resolving cap collisions by the reserved-slot rule.** The per-theme cut and the global cap routinely collide (6 themes × 3 = 18 against a cap of 10), so the collision is resolved by a stated rule rather than by whichever theme finished first:
   - **One slot is reserved for the highest-scoring survivor of every non-thin theme**, so no theme is silently erased from the shortlist.
   - The **remaining slots** are filled by **re-derived final score descending** across all themes, ties broken by the theme's SELECT order and then by artifact order.
   - If the reserved slots alone exceed the cap, **raise the cap to the theme count and report the raise**.
   - Everything below the cut stays in its per-theme artifact, which the shortlist links. Nothing is destroyed — only un-promoted.

3. **Write exactly one shortlist**, to `docs/ideation/shortlists/` as `<batch-slug>-<pinned-UTC-date>.md`. That is a distinct namespace from the per-theme artifacts, so nothing the fleet writes can be mistaken for a `harness-ideate` run's own output or violate its one-artifact-per-run law.
   - **`batch-slug`** is derived the same way `harness-ideate` derives a topic slug: kebab-case the batch label (the human's invocation topic, or the highest-weighted theme's focus line when none was given), lowercase, collapse everything outside `[a-z0-9-]` to `-`, trim, truncate to **30 characters**.
   - **The shortlist carries the same collision rule as the artifacts.** Two batches on the same pinned UTC date would otherwise resolve to one filename and the second would silently overwrite the first — the exact loss the artifact collision rule exists to prevent. On collision, append a 6-character lowercase hex suffix derived from the batch label and the pinned timestamp, so both shortlists coexist. **Nothing the fleet writes is ever overwritten.**

   Each row carries:

   | Premise | Theme | Re-derived score | Standing objection | Novelty | Artifact |
   | ------- | ----- | ---------------- | ------------------ | ------- | -------- |

   The novelty cell is the citation, or the `novelty-unknown` note naming the missing source. The artifact cell links the **collected** copy, so the link resolves in the invoking tree. The document also carries the batch's **assumptions-made** note: theme derivation basis and every merge, the pinned batch date, the objection policy, the cut and cap applied (and any reserved-slot raise), and every novelty call including unavailable sources.

4. **Present the shortlist and stop.** Presentation is the end of the run. **No fleet action is defined for what follows** — the human routes a pick by hand to `harness-brainstorming` (to spec one) or to the roadmap (to enqueue several). The fleet performs neither and does not wait for either, because the routing act **is** the filing act and the Iron Law puts it on the human's side of the line.

5. **Report every non-shortlisted outcome with its reason and count:** `already-known` drops each citing the covering issue, roadmap row, or PR; `novelty-unknown` annotations naming the missing source; backfills applied; cross-theme dedup collapses; below-the-cut counts per theme; **thin** themes; **parked** themes with their errors; and **rejected** themes with their failed check. Thin themes are reported **as thin — a valid outcome, not a failure**.

6. **State plainly what was not done:** nothing was filed, and nothing was committed, staged, or pushed. The shortlist and the collected artifacts are ordinary working-tree changes the human keeps or discards.

7. **Degrade gracefully.** An unavailable theme source, an unavailable novelty source, a failed collection, a parked theme, or one rejected theme is **reported** while the rest of the batch proceeds. One bad theme never sinks the batch, and one thin theme is not a bad theme.

## Harness Integration

- **`harness skill run ideate-fleet`** — Run the full five-phase batch pipeline.
- **`read_strategy`** — The SELECT grounding oracle. Returns presence, validity, and the parsed document; its `Tracks` bullets are the queue and its `Target problem` / `Our approach` / `Who it's for` sections are the scoring basis.
- **`@harness-engineering/core`** — `harness-ideate`'s documented fallback for `read_strategy` when the harness MCP server is unavailable; if it is also unresolvable the run has no strategy source.
- **`harness-strategy`** — The read-only boundary: strategy **writes** `STRATEGY.md`, this fleet only **reads** it. An invalid document is surfaced verbatim and routed to that skill, never repaired here.
- **`harness-ideate`** — The real per-theme pipeline each DISPATCH subagent runs to its ranked artifact. Its artifact, its frontmatter contract, its `(impact × confidence) ÷ effort` scoring, its bounded strategy-alignment tiebreaker, and its slug/collision rules are consumed as-is — never reimplemented, never forked.
- **`harness-roadmap-pilot`** — Its impact-scoring **approach** is reused in SELECT to order themes by strategic weight. It is a reference for how to score, **never a skill this fleet invokes**: it opens its own human confirmation round and terminates by transitioning into spec or build work, both of which this fleet's Iron Law forbids. The roadmap rows the novelty cross-check reads come from `docs/roadmap.md` / `docs/roadmap.d/` directly.
- **`harness-brainstorming`** — The documented downstream a human routes a pick to. **This fleet never invokes it** — doing so would be filing by another name.
- **`gh`** — Novelty cross-check only: open issues and PRs merged within the confirmed lookback window. It is never used to create an issue, comment, or PR.
- **`harness skill validate ideate-fleet`** — The authoring-time gate for this skill's own structure and schema.
- **`docs/reference/fleet-family.md`** — The shared `-fleet` spine this skill builds on (the five-phase skeleton, the concurrency governor, the artifact-based verification discipline, the worktree fan-out and its push caveat, and the never-ship-unreviewed-work invariant), stated once for the family.

## Success Criteria

- Given a confirmed batch of N themes, the fleet produces **exactly one** curated ranked shortlist under `docs/ideation/shortlists/`, and **no issue, roadmap row, spec, plan, ADR, or PR is created**.
- The fleet **commits, stages, and pushes nothing**: the shortlist and the collected per-theme artifacts are left as working-tree changes.
- **Every shortlisted candidate traces to a verified per-theme artifact** collected into `docs/ideation/`, resolved by its frontmatter `topic` rather than by an exact filename, so slug truncation and the hex-suffix collision rule cause no false rejections. A theme with no artifact, or a malformed one, is rejected as not having run the real pipeline.
- **Every shortlisted candidate's score is independently re-derived** from the artifact's own impact/confidence/effort values. A recorded score that differs from the recomputed one, or an order that is not non-increasing in **base** score, is **rejected rather than silently re-sorted**; exact base-score ties in any order are accepted, because the generation order that breaks them is not persisted.
- The strategy-alignment bonus is checked as a **standalone bounded property** (`0 ≤ bonus ≤ 0.75`, non-zero only on an exact base-score tie), never as an ordering claim — a bonused tie may legitimately carry a higher final score than a higher-base candidate, and rejecting that would discard a conforming artifact. An out-of-bounds bonus is a rejection.
- A verified artifact whose `count_generated` is **below** the confirmed request is reported **thin**, not rejected; only a count exceeding the request, or candidates missing their persisted fields, is a rejection.
- The shortlist is **bounded** by the confirmed per-theme cut and global cap, and when the two collide the reserved-slot rule resolves it so **no non-thin theme is silently erased**. Every below-the-cut candidate stays reachable through its linked, collected artifact.
- Already-tracked or already-shipped ideas are **dropped citing the covering issue, roadmap row, or PR**, never re-surfaced as new, and each drop **backfills** from the next below-cut candidate until the cut refills or the theme is exhausted.
- When a novelty source is unavailable, affected candidates are annotated **`novelty-unknown`** naming the missing source — never reported as `novel`.
- Themes are **disjoint on dispatch**: every overlapping pair found in SELECT is merged (or split), and every merge is shown to the human with both source focus lines.
- Cross-theme duplicates are **collapsed into one entry citing both themes**, with the collapse recorded.
- Every shortlist entry carries its **standing strongest objection**, and the batch carries an **"assumptions made"** note (derivation basis and merges, pinned batch date, objection policy, cut and cap applied, novelty calls including unavailable sources).
- A theme with **no candidate surviving** cross-check, backfill, and dedup — or one whose artifact generated fewer candidates than requested — is reported **thin**: a valid outcome. **No score threshold** filters candidates beyond the bounded cut.
- There is **exactly one** up-front human decision round, and the run **ends at shortlist presentation**; no per-theme interactive pauses except a genuinely-unforeseen fork parked to its own theme, and no fleet action follows a human pick.
- When `STRATEGY.md` is absent or unusable **and** no themes were supplied, the fleet **stops and reports** rather than inventing a queue. When it is invalid but themes were supplied, the error is surfaced verbatim and the batch proceeds ungrounded — observable as `strategy_grounded: false` in every artifact and recorded in the assumptions note.
- The fleet **never modifies `STRATEGY.md`** and **never edits a per-theme artifact** — collected copies are byte-identical to what the subagent's run wrote.
- **No theme is marked verified on a self-report** — every verdict is backed by an independently-read artifact and an independently-recomputed ranking, with all-OS CI recorded as **not applicable**.
- Concurrency never exceeds the confirmed governor (default 2, max ~3), and no theme exceeds the confirmed candidate count.
- It **degrades gracefully**: an unavailable theme source, an unavailable novelty source, a failed collection, a parked theme, or a rejected theme is reported while the batch continues; a rejected theme is retried at most once, and the later-`generated_at` artifact is the one verified.

## Gates

- **NOTHING IS FILED.** No issue, no roadmap row, no spec, no plan, no ADR, no PR — in any quantity, under any confidence. Filing from inside this fleet is a gate violation regardless of how good the idea is.
- **Nothing is committed, staged, or pushed.** The shortlist and the collected artifacts are working-tree changes. `git add`, `git commit`, and `git push` are all outside this fleet's authority. **Creating and removing the dispatch worktrees is the one permitted git operation** — it is the fan-out primitive, it mutates no branch and no index, and each worktree is removed after its artifact is collected.
- **Never generate ideas by hand.** Every theme's candidates come from a real `harness-ideate` run; an artifact the fleet authored itself is not provenance, and VERIFY rejects the theme.
- **Never edit a collected artifact.** Collection is a byte-identical copy. Annotations live in the record and the shortlist, never in the evidence.
- **Never modify `STRATEGY.md`.** Present-but-invalid is surfaced verbatim and degraded around; repair belongs to `harness-strategy`.
- **A score mismatch or a non-monotonic base-score order is a rejection, not a re-sort.** Correcting the order would hide the fact that the ranking was asserted rather than computed. Monotonicity is checked on the **base** score — the only quantity fully re-derivable from the artifact — never on the final score, because a bonused tie can legitimately outscore a higher-base candidate. Exact base-score ties in any order are accepted.
- **An unrun novelty check is `novelty-unknown`, never `novel`.** A missing source is reported by name; it is never resolved in the fleet's own favor.
- **Never pad a thin theme.** A theme with no surviving candidate is reported thin. Manufacturing a filler idea to make the shortlist look full is the failure the Iron Law exists to prevent.
- **Never exceed the concurrency governor or the confirmed count, cut, cap, or lookback.** More than ~3 concurrent subagents is the machine-storm zone.
- **A self-report is never verification.** Provenance and the re-derived ranking are checked by the orchestrator itself, every time; all-OS CI is recorded as not applicable rather than silently dropped.
- **Never `--no-verify`.** The fleet pushes nothing, so the gate should never be reached — reaching for the bypass means something else has gone wrong.

## Escalation

- **`STRATEGY.md` is absent or unusable and no themes were supplied:** stop and report. There is no queue, and deriving one from the codebase would invent strategy nobody committed to.
- **`STRATEGY.md` is present but invalid:** print the validation error verbatim, proceed with the supplied themes ungrounded, record it in the assumptions note, and route the human to `harness-strategy`. Never repair it here.
- **A novelty source is unavailable (`gh` unauthenticated, no tracker, no roadmap):** annotate the affected candidates `novelty-unknown` naming the missing source and continue. Do not claim novelty and do not drop the candidates.
- **A theme's artifact cannot be collected:** park that theme with the filesystem error verbatim and continue. This is a plumbing failure, not a failed pipeline run — do not report it as rejected.
- **A theme's ranking will not re-derive after one retry:** report it rejected with the mismatching candidate and both scores. Do not re-sort the artifact and do not promote its candidates on the strength of the premises.
- **The human asks the fleet to file the shortlist's top picks:** decline and cite the Iron Law. Offer the picks as a list the human can hand to `harness-brainstorming` or add to the roadmap themselves; the routing act is the filing act.
- **The batch appears coupled (two themes keep producing the same premise):** they were not disjoint. Stop fanning those two out, merge them, and re-confirm the merged focus line with the human rather than deduping the same idea twice downstream.

## Rationalizations to Reject

| Rationalization                                                                        | Reality                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "These ideas are genuinely good — file them as issues so they aren't lost"             | Nothing is lost: every candidate lives in its collected artifact, which the shortlist links. Filing is the human's gate, and a fleet that files its own ideas is a backlog spammer upstream. |
| "Only the top pick — one issue from a whole batch is hardly spam"                      | The Iron Law admits no quantity and no confidence threshold. One auto-filed issue establishes that the fleet may file, and the next run files six.                                           |
| "The shortlist looks thin, so I'll promote a below-cut candidate to fill it out"       | A thin theme is a valid result that tells the human the track is well-covered. Padding to look productive is exactly what makes a shortlist nobody trusts.                                   |
| "The subagent ranked them already — re-deriving every score is busywork"               | Re-derivation is the one check an eloquent subagent cannot talk its way past. An order accepted on trust is an order that was asserted, not computed.                                        |
| "The recorded score is off by a hundredth — I'll fix the order and move on"            | A mismatch is a rejection, not a re-sort. Correcting it repairs the symptom and destroys the signal that the artifact's ranking did not follow from its own inputs.                          |
| "I'll answer the objections myself so the ideas score better"                          | Machine rebuttals to machine critiques inflate the fleet's own rankings. The default policy is `none`: the objection stands, and the human reads it as part of the pick.                     |
| "`gh` isn't authenticated, so nothing came back — mark them novel"                     | An unrun check is `novelty-unknown`, never `novel`. Resolving a missing source in the fleet's own favor launders an unknown into a claim.                                                    |
| "The artifact is close but missing `count_generated` — I'll add the frontmatter field" | Editing the evidence destroys it. A malformed artifact means the pipeline did not run as contracted; the theme is rejected, retried once, and reported.                                      |
| "The final scores aren't descending, so the artifact's ranking is wrong"               | Monotonicity is checked on the **base** score. A tied candidate with the full `+0.75` bonus can outscore a higher-base one — that is conforming, and rejecting it discards the whole theme.  |
| "Two themes overlap a bit, but merging loses nuance — just run both"                   | Overlapping themes generate the same idea in two worktrees, and the fleet becomes a duplicate factory. Merge at SELECT and show both source lines at CONFIRM.                                |
| "The human is clearly going to pick the top one — I'll start its spec while I'm here"  | Writing a spec is filing, and the run ends at presentation. `harness-brainstorming` is invoked by the human, after the fleet has stopped.                                                    |
| "Six themes is slow — bump concurrency to six and finish in one pass"                  | Beyond ~3 concurrent subagents is the machine-storm zone; the compound load costs more in re-runs and flaky failures than the parallelism saves.                                             |

## Red Flags

| Flag                                                                      | Corrective Action                                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "I'll open an issue for the top pick so it isn't forgotten"               | STOP. Nothing is filed. Present it on the shortlist; the human files it or does not.                                                   |
| "I'll commit the shortlist so the batch isn't lost"                       | STOP. The fleet commits, stages, and pushes nothing. Leave it as a working-tree change and say so in the report.                       |
| "I'll mark the theme verified based on the subagent's summary"            | STOP. Read the collected artifact yourself and recompute every score. A summary is not a verification.                                 |
| "This theme's artifact ranks fine once I re-sort it"                      | STOP. A non-monotonic order is a rejection. Retry the theme once, then report it rejected — never re-sort the evidence.                |
| "No candidate survived here — I'll surface the best of the already-known" | STOP. An already-known idea is dropped citing what covers it. Report the theme thin; that is a finding, not an empty result.           |
| "The pre-push gate is failing in this worktree — I'll `--no-verify`"      | STOP. This fleet pushes nothing, so reaching for the bypass means the run has strayed outside its boundaries. Stop and report instead. |

## Examples

### Example: A five-theme strategy sweep

```
$ harness skill run ideate-fleet --concurrency 2 --cut 3 --cap 10

Phase 1: SELECT
  read_strategy -> present, valid. Tracks read: 4.
  Supplied --themes: 2 opportunity areas.
  Composed 6 candidate themes; 2 overlapped on "adoption onboarding"
    -> MERGED into one theme (both source focus lines retained).
  Batch = 5 disjoint themes, scored by track membership x problem/approach
    touch x existing roadmap coverage; ordered.

Phase 2: CONFIRM  [checkpoint:human-verify]
  5 ranked themes presented with basis; the merge shown with both source lines.
  Count/theme 10 - objection policy none - cut 3 - cap 10 - lookback 90d.
  Pinned UTC batch date fixed here. Concurrency 2.
  Restated: nothing will be filed; nothing will be committed or pushed.
  Human drops 1 low-weight theme -> batch = 4.

Phase 3: DISPATCH (governor = 2)
  theme upstream-grounding  ideate -> artifact, 10 candidates
                            PRESELECT 3 -> CROSS-CHECK: 1 already-known (roadmap
                            row cited) -> BACKFILL 1 -> COLLECT ok
  theme lifecycle-reach     ideate -> artifact, 8 of 10 (documented shortfall)
                            PRESELECT 3 -> CROSS-CHECK novel -> COLLECT ok
  theme adoption-onboarding ideate -> artifact, 10 candidates
                            CROSS-CHECK: gh unauthenticated -> novelty-unknown x3
                            COLLECT ok (hex suffix applied: slug collision)
  theme review-depth        ideate -> artifact, 10 candidates
                            CROSS-CHECK: all 3 already-known, backfill exhausted

Phase 4: VERIFY (independent - no self-report; all-OS CI: not applicable)
  upstream-grounding   frontmatter ok; 10/10; scores re-derived, order
                       non-increasing; bonus in bounds            -> verified
  lifecycle-reach      frontmatter ok; 8 generated of 10 requested -> thin
  adoption-onboarding  frontmatter ok; scores re-derived           -> verified
  review-depth         frontmatter ok; scores re-derived           -> verified
                       (no candidate survives curation             -> thin)

Phase 5: CURATE-AND-REPORT
  Cross-theme dedup backstop: 1 collapse (one entry citing both themes).
  Reserved slots: 1 per non-thin theme (2); remaining filled by re-derived
  score descending. Shortlist = 7 entries, under the cap of 10.
  Shortlist written to docs/ideation/shortlists/ (pinned UTC date).
  Reported: already-known 4 (each citing its issue/row/PR), novelty-unknown 3
  (gh unauthenticated), backfills 1, dedup collapses 1, below-cut 22,
  thin themes 2, parked 0, rejected 0.
  Nothing filed. Nothing committed, staged, or pushed.
```

### Example: Rejecting a theme whose ranking does not re-derive

A subagent returns "ten candidates, ranked, top three attached." VERIFY resolves the collected artifact by its frontmatter `topic` and recomputes each base score from the artifact's own impact/confidence/effort values. Candidate 2 records `3.00` where `(medium × medium) ÷ low` recomputes to `4.00`, and it sits below a candidate scoring `3.50` — so the order is not non-increasing under the recomputed scores. The order was asserted, not computed. Per the Gates the theme is **rejected**, retried once, and — failing the same way — reported rejected with both scores named. Its candidates do not reach the shortlist, and the other themes proceed unaffected. The artifact is left exactly as written.

## Test Scenarios

### Scenario 1: Gate — filing the top pick "so it isn't forgotten"

The shortlist's top entry is strong, uncontested, and obviously worth doing, and the fleet reasons that opening one tracking issue is a courtesy rather than spam. Expected: the **NOTHING IS FILED** Gate stops it — the entry is presented on the shortlist with its score, standing objection, novelty citation, and artifact link, and the run ends at presentation. The "only the top pick — one issue is hardly spam" rationalization is the failure this scenario guards against; one auto-filed issue establishes that the fleet may file.

### Scenario 2: Gate — re-sorting an artifact whose order does not re-derive

A theme's artifact lists a candidate whose recorded base score does not match the recomputation, leaving the order non-monotonic. Expected: the **"a score mismatch or non-monotonic order is a rejection, not a re-sort"** Gate rejects the theme (retried once, then reported) rather than fixing the order and promoting its candidates. Re-sorting would repair the symptom and erase the evidence that the ranking was asserted rather than computed.

### Scenario 3: Gate — padding a thin theme to fill the shortlist

Every preselected candidate in a theme is dropped as already-known, backfill exhausts the theme's candidates, and the shortlist comes back one row shorter than the cap allows. Expected: the **"never pad a thin theme"** Gate reports the theme **thin**, citing what covers each dropped idea, instead of promoting a below-cut candidate or resurfacing an already-known one. The "the shortlist looks thin, so fill it out" rationalization is the failure this scenario guards against — a thin theme tells the human that track is well-covered.
