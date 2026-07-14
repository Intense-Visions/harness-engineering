# Roadmap Auto-Triage — Phased Build Overview

Companion to `../proposal.md` (14 locked decisions). This sequences the build so
**each phase is independently useful, separately reviewable, and monotonically
increases autonomy/risk.** You can stop at any phase boundary and still have a
coherent product. Default-off throughout — enabling nothing changes behavior.

## The ordering principle: read → generate → supervised-execute → self-calibrate

Every gate before the post-diff retrospective is a _prediction_ on weak pre-diff
signal. So we build the cheap, read-only predictors first (provable with zero
execution risk), add autonomous _generation_ next (still no execution), then
_supervised_ execution, and only last the _closed loop_ that grades predictions
against real diffs and lets autonomy self-loosen. Risk is introduced only after
the layer beneath it is proven.

## Phases

### Phase 0 — Foundations / shared contracts

**Delivers:** the horizontal substrate Phases 1/3/4 all build on — the
`TriageRecord` data model + outcome-log store, the `roadmap.autoTriage` config
schema (type + Zod, default-off), the leader-gated scheduling seam, and the entity
extractor the scope lever depends on. No feature behavior; inert until a phase uses it.
**Value:** one source of truth for the cross-phase contracts instead of three
re-derivations. **Risk:** ~none (default-off substrate).

### Phase 1 — Scoping probe + triage report (read-only)

**Delivers:** a scheduled/on-demand report that scores every actionable roadmap
item and ranks dispatchability with rationale. No dispatch, no writes to code.
**Levers:** 1 (graph scope), 2 (semantic read), 3 (open-decisions), 4 (degrade-
empty → `unknown`). Corroboration/gate function + trace output.
**Value if you stop here:** a smart triage dashboard a human acts on manually.
**Risk:** ~none (read-only). Proves the core signal is trustworthy.

### Phase 2 — Autonomous brainstorm + spec generation (no dispatch)

**Delivers:** for each Phase-1 candidate, an autonomously generated spec — or a
"halted at fork X, needs you" handoff. Depth-scaled brainstorm runner (both-roles,
auto-recommend, halt-on-low-confidence) + re-score of the enriched item.
**Value if you stop here:** auto-drafted specs a human reviews/approves.
**Risk:** low (produces docs, executes nothing). Proves the riskiest _logic_ —
brainstorm-produces-spec and halt-on-judgment — with no execution exposure.

### Phase 3 — Dispatch wiring + ratchet stage 1 (supervised execution)

**Delivers:** mark candidates, wire to the existing orchestrator pickup loop,
final human go/no-go gate. Items now actually execute — but only after explicit
human go (ratchet stage 1).
**Value if you stop here:** supervised autonomous dispatch; human is the last word.
**Risk:** first real execution — fully human-gated. Reuses shipped dispatch/claim
machinery rather than a new path.

### Phase 4 — Post-diff retrospective + closed loop + ratchet advance

**Delivers:** the review-phase gate (full-strength classifier vs. prediction;
match→verify, mismatch→block+escalate), outcome recording that feeds the precedent
lever, and **v1 ratchet stage 2** (auto-execute → human verifies every PR). Stages
3–4 (sampled verify / fully-autonomous merge) are **deferred post-v1** — v1 never
auto-merges. Each phase begins with a confirm-or-abort spike for its accepted-risk
capability (Phase 2: fork-confidence; Phase 4: the review-pipeline seam).
**Value:** self-calibrating autonomy — predictions get graded and improve with use.
**Risk:** highest, built last, on top of three proven layers. The retrospective
_always_ blocks mispredicts, at every stage.

## Phase gates (human checkpoints between phases)

Each phase ends at a `[checkpoint:human-verify]`. Advancing phases is a human
decision, not automatic — distinct from the _runtime_ autonomy ratchet inside the
feature. Phase 4's ratchet is what self-loosens at runtime; the phase sequence
itself is human-gated all the way.

## Dependency map

```
P0 (foundations: record model, config, scheduling, entity extractor)
 └─> P1 (probe, read-only)  ── consumes record/config/entity contracts
      └─> P2 (brainstorm+spec)  ── needs P1's candidate set + complexity estimate
           └─> P3 (dispatch+stage1) ── writes prediction; needs P2's spec
                └─> P4 (retrospective+loop) ── writes outcome, grades P3's dispatches;
                                               fills the precedent-lever store P1 reads
```

The precedent lever is the one back-edge: P0 defines the store, P1 reads it (empty at first),
P4 fills it. The system is open-loop through P3 and closes in P4 — deliberately, so
calibration data is real (from actual dispatches) rather than synthetic.

## Detailed plans (all task-level)

- `2026-07-14-phase-0-foundations-plan.md` — shared contracts (record, config,
  scheduling, entity extractor). Lands before/with Phase 1.
- `2026-07-14-phase-1-scoping-probe-plan.md` — read-only probe + triage report.
- `2026-07-14-phase-2-brainstorm-spec-plan.md` — autonomous brainstorm + spec gen.
- `2026-07-14-phase-3-dispatch-ratchet-plan.md` — dispatch wiring + ratchet stage 1.
- `2026-07-14-phase-4-retrospective-loop-plan.md` — post-diff retrospective + loop.

Phases 2–4 carry flagged **Uncertainties** sections (e.g. how programmatically the
brainstorm skill can be driven, the exact roadmap marker representation, the
review-pipeline seam) that Phase 1's results and a pre-phase grounding pass should
resolve before each is executed — confirm those anchors when the phase is picked up
rather than treating the plan as frozen.
