# Plan: Roadmap Auto-Triage — Phase 3 (Dispatch Wiring + Ratchet Stage 1)

## Goal

Turn a Phase-2 spec-bearing candidate into an actual (supervised) dispatch by
**reusing the existing orchestrator pickup loop** — no new dispatch path — gated by
a **final human go/no-go** (autonomy ratchet stage 1). This is the first phase with
real execution, and it is fully human-gated.

## Scope Guards (do NOT do in this plan)

- No new dispatch/claim machinery — route through the orchestrator's existing
  pickup, claim-safety, and duplicate-dispatch protections.
- No post-diff retrospective, no precedent recording, no auto-advance past stage 1
  (Phase 4). The ratchet is pinned at stage 1 here.
- No auto-merge; review is unchanged.
- Default-off; `roadmap.autoTriage.enabled` and `ratchetStage` (default 1).

## Observable Truths (Acceptance Criteria)

- SC1: A Phase-2 `completed` candidate whose human go is given becomes
  pickup-eligible and is dispatched by the orchestrator via the _normal_ path.
- SC2: The generated spec is attached to the item, so it clears the existing
  spec-less→human gate on its own merit (not by bypass).
- SC3: The item's escalation category must be in `autoExecute`
  (`{quick-fix, diagnostic}`) to auto-execute; anything mapping to `primaryExecute`
  / `alwaysHuman` stays human even after go.
- SC4: Ratchet stage 1 — **no item dispatches without a human go**; the go is a
  batched approval over ready candidates.
- SC5: A not-approved (or halted) item stays human-owned; nothing is marked.
- SC6: Existing assignee gate honored — an item already assigned to a non-self
  assignee is skipped (`candidate-selection.ts:77`); the marker never steals it.
- SC7: Default-off ⇒ no marking, no dispatch; behavior byte-identical.

## Grounding (evidence: file:line)

- Escalation categories: `packages/orchestrator/src/workflow/config.ts:262`
  (`alwaysHuman:['full-exploration']`, `autoExecute:['quick-fix','diagnostic']`,
  `primaryExecute:[]`).
- Pickup + assignee gate:
  `packages/orchestrator/src/core/candidate-selection.ts:77`;
  `state-machine.ts` for `activeStates`.
- Marker/status surface: `packages/core/src/roadmap/parse.ts` +
  `serialize.ts`; roadmap store under `packages/core/src/roadmap/store/`.
- Spec-less→human gate: orchestrator pickup gating (planned rows without spec/plan
  → human) — see memory `orchestrator-pickup-gating`.

## Architecture (layer-safe)

The **go/no-go decision** (which ready candidates are approved, and the stage-1
block) is a pure function over the candidate set. Marking = writing the generated
spec + the fields the existing candidate-selection already reads. No changes to the
dispatch/claim core — Phase 3 only makes an item _eligible_; the orchestrator does
the rest exactly as today.

## File Map

- `packages/orchestrator/src/workflow/config.ts` — add `roadmap.autoTriage`
  (`enabled`, `ratchetStage`) to the schema (default off / stage 1).
- `packages/intelligence/src/triage/gate.ts` — pure `resolveGoNoGo(candidates,
stage)` → `{ approved, held }`; stage 1 requires an explicit human-approval flag.
- `packages/orchestrator/src/agent/triage-mark.ts` — attach spec + set
  status/fields so `candidate-selection` picks the item; respect the assignee gate.
- CLI: `triage approve` (batched human go/no-go) + wiring into the read-only report.

## Uncertainties

- **Exact marker representation** on `roadmap.md` that makes an item pickup-eligible
  without colliding with the spec-less gate — likely "attach spec + set status to an
  active state," letting the _presence of the spec_ clear the gate. Confirm the
  minimal field set `candidate-selection` requires before Task 3.
- Where the generated spec physically lives so the executor reads it (item-attached
  path vs `docs/changes/<item>/`).
- Category assignment source: from the probe/brainstorm, or a mapping table.

## Tasks

### Task 1: Config surface (`workflow/config.ts`)

**Depends on:** Phase 2 | **Files:** `packages/orchestrator/src/workflow/config.ts`,
schema | **Category:** impl
Add `roadmap.autoTriage: { enabled: false, ratchetStage: 1 }` to the workflow
schema with strict validation (mirror the AMR schema-wiring lesson — extend the
Zod schema, not just the type). Default-off.

### Task 2 (TDD): Go/no-go gate (`gate.ts`)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/triage/gate.ts`,
`gate.test.ts` | **Category:** impl+test
Pure `resolveGoNoGo`: stage 1 ⇒ only items with an explicit human-approval flag are
`approved`; everything else `held`. Category not in `autoExecute` ⇒ `held` (SC3).

### Task 3 (TDD): Marker (`triage-mark.ts`)

**Depends on:** Task 2 | **Files:**
`packages/orchestrator/src/agent/triage-mark.ts`, `triage-mark.test.ts` |
**Category:** impl
Attach the generated spec + set the minimal fields `candidate-selection` reads to
make the item eligible; honor the assignee gate (SC6); no-op when not approved
(SC5) or default-off (SC7). Unit-test against a fake roadmap store.

### Task 4: `triage approve` command + pickup verification

**Depends on:** Task 3 | **Files:** CLI | **Category:** impl
Batched human go/no-go over ready candidates; on approve, mark. Verify (test +
manual) the item then flows through the _existing_ orchestrator pickup — no new
path.

### Task 5: `[checkpoint:human-verify]` — supervised dispatch e2e

**Depends on:** Task 4 | **Files:** none | **Category:** integration
End-to-end on one real trivial item: report → brainstorm → approve → orchestrator
dispatches → PR appears. Confirm SC1–SC7 and that claim-safety/dup-dispatch
protections are intact. Human decides whether to proceed to P4.

## Sequencing

T1 → T2 → T3 → T4 → T5. Gate (T2) is pure and lands first; marking (T3) is the only
orchestrator write.

## Traceability

SC1–SC2 → T3/T4; SC3–SC5 → T2; SC6 → T3; SC7 → T1/T3; all → T5. Maps to proposal
§"Dispatch path" + §"autonomy ratchet" (stage 1) + D3, D10, D14.

## Concerns

- **Reuse, don't fork, the dispatch path.** The duplicate-dispatch hazard is real
  (see memory `orchestrator-duplicate-dispatch`) — a second path would double the
  risk. Marking-then-existing-pickup keeps a single audited route.
- The marker must not collide with the spec-less→human gate; the safe design is
  "spec present ⇒ gate satisfied on merit," not a special bypass flag.
- Keep stage pinned at 1 here; any auto-advance logic belongs to Phase 4 where the
  evidence to justify it exists.
