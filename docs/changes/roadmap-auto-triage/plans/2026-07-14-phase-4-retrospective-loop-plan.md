# Plan: Roadmap Auto-Triage — Phase 4 (Post-Diff Retrospective + Closed Loop)

## Goal

At the code-review phase, run the classifier at **full strength on the actual
diff** and compare it to the pre-dispatch prediction. Match ⇒ surface the PR for
human verification (per ratchet stage); mismatch ⇒ block auto-merge and escalate.
Record every outcome to feed the precedent lever — closing the loop and enabling the autonomy
ratchet to self-loosen on evidence. This is the last, highest-risk phase, built on
three proven layers.

## Scope Guards (do NOT do in this plan)

- Do not weaken the pre-diff gates or the S3-001 cap — this adds a _post_-diff gate,
  it does not relax the earlier ones.
- Do not auto-_merge_; the retrospective gates review, it never lands code itself.
- Ratchet auto-advance is data-driven only — never a manual jump past a mispredict.
- Default-off; ratchet stage 2 is opt-in and precedent-gated (stages 3–4 deferred).

## Observable Truths (Acceptance Criteria)

- SC1: After a dispatched item produces a diff, the retrospective computes post-diff
  signals (`filesTouched/layersTouched/blastRadius` from the real diff) and runs
  `classify(..., phase:'post-diff')` — confidence may reach `high`.
- SC2: The post-diff verdict is compared to the stored pre-dispatch prediction;
  "diff exceeded prediction" is defined numerically (level delta ≥ 1 band OR
  blast-radius over the predicted-scope threshold).
- SC3: **Mismatch ⇒ block auto-merge + escalate to full human review, at every
  ratchet stage** (non-negotiable safety catch).
- SC4: Match handling for **v1's stage 2** — required human verify annotation on
  every autonomous PR. Stages 3–4 (sampled verify / fully-autonomous merge) are
  **deferred post-v1**; the ratchet cannot advance past stage 2 in v1.
- SC5: Every outcome `{ prediction, actual, matched }` is recorded to a precedent
  store; the Phase-1 `PrecedentLookup` seam now returns real base-rates (closes the
  P1 degrade-empty stub).
- SC6: The ratchet advances a shape's stage only when its recorded success-rate
  crosses a threshold over a minimum sample; a mispredict resets/holds it.
- SC7: Retrospective error ⇒ treat as mismatch (block + escalate); never a silent
  pass.
- SC8: Default-off ⇒ no retrospective, no recording; stage 2 unreachable (stages
  3–4 deferred post-v1 regardless).

## Grounding (evidence: file:line)

- Review subsystem to hook: `packages/core/src/review/` (`ci/orchestrator.ts`,
  `depth-calibrator.ts`) and `packages/core/src/feedback/review/self-review.ts`.
- Post-diff signals + classifier: `runStaticPass(..., 'post-diff')` /
  `classify` (`packages/intelligence/src/complexity/`).
- Outcome recording pattern to mirror: `AdaptiveRouter.recordOutcome`
  (`packages/orchestrator/src/agent/adaptive-router.ts`) +
  `escalation-state.ts`; completion path `packages/orchestrator/src/completion/handler.ts`.
- Precedent similarity: intelligence pipeline
  (`packages/intelligence/src/pipeline.ts`) / `search_similar`.
- Stored prediction: the `TriageVerdict` persisted at dispatch (Phase 3 marker).

## Architecture (layer-safe)

Two pure cores in **intelligence**: the **comparator** (prediction vs. post-diff
verdict → match/mismatch) and the **ratchet** (recorded outcomes → allowed stage).
Orchestrator/core does the diff extraction, review-pipeline hook, PR annotation,
and persistence. The comparator and ratchet are exhaustively unit-testable without
a live review run.

## File Map

- `packages/intelligence/src/triage/retrospective.ts` — pure `compareToPrediction(
prediction, postDiffVerdict)` → `{ matched, exceededBy, action }`.
- `packages/intelligence/src/triage/ratchet.ts` — pure `resolveStage(shapeHistory)`
  → `1|2|3|4`; advance/hold/reset rules.
- `…/retrospective.test.ts`, `…/ratchet.test.ts` — SC1–SC4, SC6, SC7.
- `packages/orchestrator/src/agent/triage-outcome.ts` — extract post-diff signals
  from the diff, run the comparator, record the outcome, implement the
  `PrecedentLookup` seam (SC5).
- Hook into `packages/core/src/review/` — match→annotate PR, mismatch→block+escalate.
- Config: enable ratchet stage 2 (precedent-gated); stages 3–4 deferred post-v1.

## Uncertainties

- **Exact review-pipeline seam** — whether the retrospective runs as a review agent,
  a review-orchestrator step, or a completion-handler hook. Confirm against
  `packages/core/src/review/ci/orchestrator.ts` before Task 4.
- Post-diff signal extraction fidelity (mapping a diff to `filesTouched/blastRadius`
  — reuse `compute_blast_radius` on the changed entities).
- Where predictions are persisted for later comparison, and precedent-store shape
  (reuse learnings/outcome store vs. a dedicated one).
- "Shape" definition for precedent bucketing (labels + category + level).

## Tasks

### Task 0 (confirm-or-abort): Review-pipeline seam

**Depends on:** Phase 3 | **Files:** none (investigation) | **Category:** spike
**ACCEPTED-RISK GATE** (proposal §"accepted risks"). Confirm the exact seam by
which the retrospective hooks the existing review pipeline
(`packages/core/src/review/ci/orchestrator.ts` — review agent vs. orchestrator step
vs. completion hook). If no clean seam exists, **STOP and re-plan Phase 4** rather
than building Task 4 on a false assumption.

### Task 1 (TDD): Comparator (`retrospective.ts`)

**Depends on:** Phase 3 | **Files:** `…/triage/retrospective.ts`,
`retrospective.test.ts` | **Category:** impl+test
Pure prediction-vs-actual: match, `exceededBy` (level bands / blast-radius overrun,
SC2), and `action` (`verify | block-escalate`). Error input ⇒ `block-escalate`
(SC7).

### Task 2 (TDD): Ratchet (`ratchet.ts`)

**Depends on:** Phase 3 | **Files:** `…/triage/ratchet.ts`, `ratchet.test.ts` |
**Category:** impl+test
Pure `resolveStage(history)`: advance on success-rate ≥ threshold over min-sample;
hold/reset on a mispredict (SC6). Never returns a stage the evidence doesn't support.

### Task 3: Outcome recording + precedent-lever wiring (`triage-outcome.ts`)

**Depends on:** Task 1 | **Files:**
`packages/orchestrator/src/agent/triage-outcome.ts`, tests | **Category:** impl
Extract post-diff signals from the diff, run `classify(post-diff)` + comparator,
record `{prediction, actual, matched}`; implement `PrecedentLookup` so Phase-1
the precedent lever returns real base-rates (SC5). Mirror `recordOutcome` conventions.

### Task 4: Review-phase hook

**Depends on:** Task 0, Task 1, Task 3 | **Files:** `packages/core/src/review/…` |
**Category:** impl
On PR/review: run the retrospective. Match ⇒ attach "AI autonomous — verify"
annotation (stage-dependent); mismatch ⇒ block auto-merge + escalate to full human
review (SC3). Error ⇒ mismatch path (SC7).

### Task 5: Stage-gated match handling + config

**Depends on:** Task 2, Task 4 | **Files:** config, review hook | **Category:** impl
Wire **v1 stage 2** (required verify on match, SC4); cap the ratchet at stage 2 —
stages 3–4 deferred post-v1. Ratchet advance still gated by precedent (SC6).
Default-off (SC8).

### Task 6: `[checkpoint:human-verify]` — closed-loop e2e

**Depends on:** Task 5 | **Files:** none | **Category:** integration
Full loop on real items: predict → dispatch → diff → retrospective → record →
the precedent lever reflects it → ratchet advances only on accumulated matches. Confirm a
deliberately-underscoped item trips mismatch→block. Human sign-off on autonomy.

## Sequencing

T0 (confirm-or-abort seam) first — gates T4. T1 + T2 (pure cores, parallel) →
T3 (recording, needs T1) → T4 (hook, needs T0+T1+T3) → T5 (stages, needs T2+T4) → T6.

## Traceability

SC1–SC2 → T1; SC3,SC7 → T1/T4; SC4 → T5; SC5 → T3; SC6 → T2/T5; SC8 → T5; all → T6.
Maps to proposal §"Post-diff autonomy retrospective" + §"autonomy ratchet" +
D11–D14, and resolves the precedent-lever outcome-source open question.

## Concerns

- **This gate is the whole system's honesty check** — if the comparator is lax,
  mispredicts merge and the ratchet advances on false evidence. Bias `exceededBy`
  toward flagging: a false mismatch costs a human review, a false match ships an
  under-scrutinized change.
- The retrospective must be robust to a missing/garbled stored prediction — treat
  absence as mismatch, never as a pass.
- Ratchet advancement is the one place autonomy _increases_ automatically; keep its
  thresholds conservative and its sample sizes real, and log every advance.
