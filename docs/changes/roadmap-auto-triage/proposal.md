# Roadmap Auto-Triage

Status: **Proposal (awaiting approval)**
Owner: Chad Warner
Depends on: Adaptive Model Routing (AMR) complexity cascade — shipped.

## Overview

Score every actionable roadmap item on a schedule, and **autonomously dispatch
the ones the system can confidently and cheaply scope**, while routing everything
that needs human judgment to a human. The classifier is a vote, not the gate:
authorization comes from a bounded **pre-dispatch scoping probe** that
corroborates several cheap, independent signals. Items that pass the probe are
then run through an **autonomous brainstorm** — the system plays both roles,
generating each fork and picking its own recommended default — which produces a
real spec, self-identifies any human-judgment fork it can't confidently resolve
(→ no-go), and feeds a final go/no-go before the existing orchestrator dispatch
loop executes. Default-off; when off, roadmap behavior is byte-identical to today.

## Pipeline

```
score (cheap 4-lever probe)  →  [eligible band: trivial or simple]  →  autonomous brainstorm
   ↳ can't confidently recommend at a fork → NO-GO → human (with the brainstorm so far)
   ↳ completes clean → re-score → pre-exec gate → orchestrator dispatch → PR
                                                                            │
        post-diff autonomy retrospective (full-strength classifier on the ACTUAL diff)
           ↳ diff matches prediction → human verifies the PR (per ratchet stage)
           ↳ diff exceeds prediction → block auto-merge, escalate to full review
           ↳ either way → record outcome → feeds the precedent lever (closes the loop)
```

The probe is the cheap filter (is this even a candidate?). The brainstorm is the
deep confirmation that _also produces the executable spec_. The **post-diff
retrospective** is the only gate that sees ground truth — it grades the earlier
(pre-diff, confidence-capped) predictions against the real change and feeds the
result back into the precedent lever. Every gate before it works with the weak pre-diff
signal; this one runs the classifier at full strength.

## Why now

- AMR shipped a complexity cascade and capability-tier routing; local execution
  is wired and free. The routing machinery to _act_ on a triage decision exists.
- The roadmap-pilot skill already scores `(impact × confidence) ÷ effort`, and the
  orchestrator already polls `docs/roadmap.md` and dispatches active items. The
  missing piece is an **automatic, safe escalation decision** in between.
- The classifier audit (below) showed the pre-diff verdict is too thin to gate
  autonomous dispatch _alone_ — which is exactly why the probe exists.

## The classifier audit that shaped this design

Auditing the AMR complexity cascade for use as a safety gate surfaced three facts:

1. **Pre-diff, the static score collapses to description _length_.** Diff signals
   (`filesTouched`, `blastRadius`, `layersTouched`) are undefined until a diff
   exists, so the pass normalizes against the one weight in play and the score
   reduces to roughly `clamp01(descriptionLength/500 − scopeReduction)`. "Trivial"
   pre-diff literally means "the text is short" — a weak, partly _inverted_ proxy
   (a terse `"Migrate auth to OIDC"` scores trivial).
2. **The shortest items get no LLM check.** The tie-break only fires when static
   confidence is _low_; extreme-short items resolve high→capped-medium and static
   wins with zero LLM sanity pass — the exact items auto-dispatch would green-light.
3. **Pre-diff confidence is hard-capped at `medium`** (S3-001 — no diff evidence
   can earn `high`). A `trivial + high` gate is unreachable for backlog items.

Conclusion: the classifier is **sound for its designed job** (model-tier selection
on an already-human-approved dispatch, where a miss just picks a cheaper/pricier
model). It is **not sound as the sole authorization for autonomous dispatch**,
where a miss runs an agent unsupervised on genuinely complex work. So we don't
overload it — we corroborate it.

## The reframe

A "require a human spec first" gate is a _paperwork_ test, not a _capability_
test. Instead of checking whether a human already did the thinking, the probe
**cheaply does the scoping work itself** and dispatches only when that scoping is
bounded and confident — routing to a human exactly when it can't be. This keeps
STRATEGY's line ("humans own the thinking layer") intact, redrawn correctly:
**humans own the judgment-required items; the system self-identifies them by
trying to scope an item and hitting a decision it can't make.**

## The scoping probe (four corroborating levers)

All levers run on the free local model + the knowledge graph. Cheapest-first;
any lever that returns "unknown" lowers the **corroboration score** rather than
forcing a pass. The levers are named (scope / semantic-read / open-decisions /
precedent) so later sections can refer to them without positional numbers.

> **A note on "confidence."** Four distinct things wear this word; they are not
> interchangeable. (a) _classifier-confidence_ — the cascade's `low|medium|high`
> enum. (b) _corroboration_ — how many independent levers agree; the actual gate
> score. (c) _fork-confidence_ — the brainstorm's certainty in a recommended
> default. (d) _precedent rate_ — the precedent lever's measured autonomous-success
> rate. Where this doc says "confident/confidently" unqualified, it means (b).

1. **Scope lever — graph-grounded scope estimate.** Resolve entities named in the
   item's title/description against the knowledge graph (`compute_blast_radius`,
   `get_impact`, `find_context_for`) to produce _estimated_ `filesTouched`,
   `layersTouched`, `blastRadius`. This replaces the length proxy with real scope —
   upgrading the classifier from "pre-diff text-only" to "estimated post-diff."
   Entities that don't resolve (vague item) is itself a strong human signal.
2. **Semantic-read lever — always-on local read.** One local-model pass that
   actually reads the task and judges complexity + names open questions — closing
   the "shortest items get no LLM check" gap.
3. **Open-decisions lever — the human/agent boundary.** The same pass emits a
   structured self-assessment: are there choices requiring human judgment (API
   shape, product tradeoff, irreversible/outward action)? Any → human, regardless
   of score.
4. **Precedent lever — self-calibrating base-rate.** `search_similar` over past
   items: did items _of this shape_ complete autonomously without escalation or
   human rescue? A measured _precedent rate_ is real evidence.
   **Cold-start:** with no outcome history the rate returns _unknown_ (never blocks
   on emptiness); the gate leans on the scope/semantic-read/open-decisions levers
   and routes borderline items to human, self-loosening as history accrues.
   Conservative early by construction.

**Gate:** dispatch when the scope is bounded **AND** the semantic read agrees
**trivial or simple (the eligible band)** **AND** there are no open decisions
**AND** the precedent rate does not contradict. The gate score is _corroboration
across independent levers_, not band-distance on a length proxy. Fails safe to
human on any shortfall or on classifier/probe error (the shipped `classifySafe`
degrade already returns `{moderate, low}`, which does not pass).

## Autonomous brainstorm stage

Items that clear the cheap probe don't dispatch directly — they run through an
**autonomous brainstorm** on the local model, which is the deep confirmation the
probe's cheap read only approximates. The brainstorm plays both roles: it
generates each fork and selects its own recommended default (the brainstorming
skill already emits a recommendation per fork). This yields three things at once:

1. **A spec, autonomously.** The brainstorm's proposal/recommendations become the
   scope handed to the executing agent — resolving the "we won't require a human
   spec, but the executor still needs one" tension. The system authors it.
2. **The no-go trigger, for free.** A fork where the brainstorm _cannot_
   confidently recommend a default _is_ an open decision requiring human judgment.
   It stops there and hands the half-finished brainstorm to a human at the exact
   fork it got stuck — no separate open-decisions detector needed.
3. **A meaningful re-score.** Post-brainstorm the item has real content (surfaced
   decisions, scope, plan), so re-running the classifier scores _substance_, not
   description length. This is the automated confirmation feeding the final gate.

Brainstorm **depth scales to the probe's complexity estimate** — a typo fix gets a
shallow pass, not the full EXPLORE→EVALUATE→PRIORITIZE→VALIDATE treatment — to
keep cost bounded. It runs only for items the cheap probe already flagged as
candidates.

### Final go/no-go (self-loosening, default human)

After a clean brainstorm + passing re-score, items reach the final gate:
**batched for one human go/no-go by default**; once the precedent lever
shows items of that shape ship cleanly autonomously, the knob permits auto-go.
Conservative early, earns autonomy — the same cold-start philosophy as the precedent lever.
A human is never _removed_ from the loop until the data says it's safe.

## Post-diff autonomy retrospective (the closed loop)

Every gate above fires **pre-diff** — working with the weak, confidence-capped
signal the classifier audit exposed. Once the agent produces a PR, the change
_exists_, so a final gate at the **code-review phase** runs the classifier at
**full strength** (real blast radius / files / layers; confidence can reach
`high`) and compares the actual diff to the pre-dispatch prediction:

- **Diff matches the prediction** (stayed within the predicted band) → attach an
  "AI did this autonomously — please verify" annotation and surface the PR for
  human verification (required or sampled, per the ratchet stage below).
- **Diff exceeded its predicted triviality** (mispredict — bigger/riskier than
  the pre-diff signal claimed) → **block auto-merge, escalate to full human
  review.** This is the last catch, and it catches the case the pre-diff gates
  structurally can't see.

Crucially, this verdict is the **ground-truth label that feeds the precedent lever** — it is
where precedent outcomes come from (previously an open question). The system goes
from open-loop (predict and hope) to **closed-loop**: predict → validate against
the real diff → self-calibrate. The pre-dispatch gates get more accurate because
this post-dispatch gate grades their homework.

## The autonomy ratchet

The pre-execution final gate (D10) and this post-diff gate are not two knobs —
they are **stages of one ratchet** that advances only as precedent earns it. The
retrospective runs at _every_ stage as the non-negotiable safety catch (a
mispredict always escalates); what advances is only what happens on a _match_:

1. **Human go/no-go before execution** — most conservative. **(v1)**
2. **Auto-execute → human verifies every PR** — required verification. **(v1)**
3. **Auto-execute → sampled verification** — only mispredicts + a sample. _(deferred)_
4. **Fully autonomous** — matches merge; the retrospective still blocks on mismatch.
   _(deferred)_

The human leaves the happy path only when the diffs have proven the predictions
right. Default is stage 1; the knob (and accumulated precedent) advances it.

**v1 ships stages 1–2 only** — a human always verifies before merge, so v1 never
auto-merges. Stages 3–4 (sampled verification and fully-autonomous merge) are
deferred to a later version; the retrospective and precedent recording still run
in v1 (they are what _earn_ the later stages), but the knob cannot advance past
stage 2.

## Dispatch path (Q3 decision: score + mark, orchestrator dispatches)

The triage job **scores and marks** eligible items; the **existing orchestrator
pickup loop dispatches** them through its normal gating. No second dispatch path.
This reuses shipped machinery (`activeStates`, escalation `autoExecute`
categories, claim-safety) and keeps a single audited route to an agent.

## Prioritization / ordering (locked earlier)

Ranking reuses roadmap-pilot's scoring; **impact is the secondary sort** (added
now, not deferred) so that among equally-dispatchable items the higher-impact
work goes first.

## Decisions (locked)

- **D1** Auto-triage items in the **eligible band** (complexity `trivial` or
  `simple`) that are confidently scoped; humans keep everything `moderate`/`complex`
  or ambiguous.
- **D2** The gate is the four-lever scoping probe (corroboration), _not_ the AMR
  verdict alone and _not_ "a human spec must exist." The corroboration rule — how
  many/which levers must agree, and the numeric "bounded scope" bar — is a seed
  defined in config (see Open Questions and the Phase 0 foundations plan), not
  hard-coded here.
- **D3** Dispatch path: score + mark; existing orchestrator dispatches.
- **D4** Secondary sort by impact, now.
- **D5** Default-off; enabling changes nothing until explicitly configured.
- **D6** Eligible-band candidates run an autonomous brainstorm (local model,
  auto-accept-own-recommendation), depth scaled to the probe's complexity estimate.
- **D7** A low-confidence fork in that brainstorm = automatic no-go + human handoff
  at that exact fork.
- **D8** The brainstorm's proposal becomes the spec handed to the executor.
- **D9** Re-score the enriched (post-brainstorm) item as the automated confirmation
  feeding the final gate.
- **D10** Final gate is self-loosening: human-batched go/no-go by default, auto-go
  permitted once precedent supports the item's shape.
  D11–D14 specify **one mechanism** — the closed-loop retrospective and the autonomy
  ratchet — carved into four disjoint facets (mechanism / response / data-loop /
  control):

- **D11 (mechanism)** A post-diff autonomy-retrospective gate at the code-review
  phase runs the full-strength classifier on the actual diff and compares it to the
  pre-dispatch prediction.
- **D12 (response)** Match ⇒ surface PR for human verification; mismatch
  (over-scope) ⇒ block auto-merge and escalate to full human review.
- **D13 (data loop)** The retrospective verdict is the ground-truth outcome that
  feeds the precedent lever (this is the answer to "how precedent outcomes are
  recorded").
- **D14 (control)** D10–D13 compose one **autonomy ratchet** (4 stages), not
  independent knobs; the retrospective runs at every stage, only match-handling
  advances.

## Non-goals

- Auto-authoring a _stub_ spec purely to clear a spec-less gate (rejected —
  mechanical paperwork). This is not the autonomous brainstorm, which is in scope
  and distinguished in the "Autonomous brainstorm stage" section.
- A parallel dispatch path independent of the orchestrator.
- Changing AMR's `classifySafe` degrade or the S3-001 pre-diff confidence cap.
- Auto-_merging_ agent output **in v1**. The ratchet's fully-autonomous stage
  (which would merge) is deferred (stages 3–4); v1 ships stages 1–2, where a human
  always verifies before merge. Review is unchanged.

## v1 scope, deferrals, and accepted risks

- **Deferred to post-v1:** ratchet stages 3–4 (sampled verification, fully-autonomous
  merge). v1 stops at stage 2 (human verifies every autonomous PR).
- **Accepted risk (feasibility).** Two capabilities are assumed but unproven at
  spec time: (a) the local model emitting a usable _fork-confidence_ per brainstorm
  fork, and (b) the exact seam by which the post-diff retrospective hooks the
  existing review pipeline. These are **knowingly accepted**, not resolved. The
  mitigation is a hard confirm-or-abort gate as the _first_ task of the phase that
  depends on each (Phase 2 for fork-confidence, Phase 4 for the review seam): if the
  capability doesn't materialize on inspection, that phase stops and re-plans rather
  than building on a false assumption.

## Assumptions

- **The knowledge graph is populated.** The scope lever resolves entities against
  `.harness/graph/`. Absent or sparse graph ⇒ entities don't resolve ⇒ items fall
  to `unresolved-scope` ⇒ human. The feature degrades to a **no-op, never a wrong
  dispatch** — but it dispatches _nothing_ until the graph is populated.
- **A free local model is configured.** The semantic-read, open-decisions, and
  brainstorm stages run on the local backend. Absent one, those levers return
  `unknown` and the gate fails safe to human — again a no-op, not a misdispatch.
- **Items carry a stable identity** (`externalId`) for keying predictions/outcomes;
  an item lacking one is not eligible for autonomous dispatch.

## Success criteria

These are the canonical, testable criteria; per-phase plans refine them into their
own numbered SCs. Numeric seeds (N, R, band bars) live in config (Phase 0), so a
criterion citing them is checkable against a fixture, not a mood.

### Functional

- **SC-F1** A scheduled run scores **100% of actionable items** and emits, per
  item, a verdict `{ band, corroboration, dispatchable, levers, rationale }`.
- **SC-F2** Every dispatched candidate has a generated spec attached; every
  _non_-dispatched item carries exactly one legible reason from a closed set
  (`not-in-band` / `unresolved-scope` / `open-decision` / `halted-fork` /
  `precedent-contradicts` / `error`).
- **SC-F3** Ranking is the pilot score with **impact as the deterministic
  tiebreak**: given two equal-score items, the higher-impact one is always ordered
  first.

### Safety / invariants (the pass/fail gates)

- **SC-S1** Default-off ⇒ byte-identical roadmap behavior (output diff = ∅).
- **SC-S2** Over a labeled test set, **zero** open-decision items auto-dispatch.
- **SC-S3** Any probe/classifier/brainstorm error routes the item to human;
  **never** dispatched.
- **SC-S4** Cold-start (empty precedent) ⇒ ratchet pinned at stage 1; no auto-go.
- **SC-S5** Every post-diff mispredict blocks auto-merge **and** escalates, at
  every ratchet stage.

### Closed-loop calibration

- **SC-C1** Every dispatch produces a recorded outcome; a shape's _precedent rate_
  reflects all recorded outcomes for that shape (no dropped grades).
- **SC-C2** The ratchet advances a shape only after **≥ N recorded matches at
  ≥ R success-rate** (N, R config seeds); a single mispredict holds or resets it.

### Operability

- **SC-O1** Every decision is fully traceable: which levers fired, their values,
  the corroboration result, and the dispatch/hold reason.

## Open questions for planning

- Where the triage loop lives (maintenance cron vs. orchestrator-internal tick).
- Exact corroboration thresholds and how "bounded scope" is numerically defined.
- The marker mechanism on `roadmap.md` and how the orchestrator reads it without
  colliding with the spec-less→human gate.
- How the post-diff retrospective hooks the existing review pipeline
  (`review_changes` / `run_code_review`) and where its verdict + annotation land.
- How "diff exceeded prediction" is defined numerically (tier/level delta,
  blast-radius overrun) to trigger the mismatch escalation.

Resolved: precedent outcomes for the precedent lever come from the post-diff retrospective
verdict (D13).

## Implementation Order

Phased build; each phase is independently useful and ends at a human checkpoint.
Task-level plans live in `plans/` (one per phase) and have passed soundness review.
Risk ascends: read-only → generate → supervised-execute → self-calibrate.

### Phase 0: Foundations

<!-- complexity: medium -->

Shared contracts: `TriageRecord` + outcome-log store, `roadmap.autoTriage` config
(type + Zod), leader-gated scheduling seam, entity extractor. Default-off substrate;
no feature behavior. Plan: `plans/2026-07-14-phase-0-foundations-plan.md`.

### Phase 1: Scoping Probe

<!-- complexity: medium -->

Read-only four-lever probe (scope / semantic-read / open-decisions / precedent) +
ranked triage report. No dispatch, no writes.
Plan: `plans/2026-07-14-phase-1-scoping-probe-plan.md`.

### Phase 2: Autonomous Brainstorm

<!-- complexity: high -->

Depth-scaled brainstorm runner + autonomous spec generation. Opens with a
confirm-or-abort spike (fork-confidence — accepted risk). Produces docs, executes
nothing. Plan: `plans/2026-07-14-phase-2-brainstorm-spec-plan.md`.

### Phase 3: Dispatch + Ratchet Stage 1

<!-- complexity: medium -->

Go/no-go gate + marker → existing orchestrator pickup. First (human-gated)
execution. Plan: `plans/2026-07-14-phase-3-dispatch-ratchet-plan.md`.

### Phase 4: Post-Diff Retrospective + Closed Loop

<!-- complexity: high -->

Retrospective gate + precedent recording + v1 ratchet stage 2. Opens with a
confirm-or-abort spike (review-pipeline seam — accepted risk).
Plan: `plans/2026-07-14-phase-4-retrospective-loop-plan.md`.
