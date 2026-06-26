---
number: 0045
title: Assignee is an execution claim
date: 2026-06-26
status: accepted
tier: large
source: docs/changes/assignee-execution-lifecycle/proposal.md
---

## Context

The roadmap `assignee` field was overloaded. roadmap-pilot wrote it at _selection_
time (its Phase 4 "ASSIGN" step), while the row stayed `planned`. But the
orchestrator's pickup gate (`candidate-selection.ts` → `isEligible`) reads any
non-self assignee as a claim and silently skips the item — so merely _recommending_
an item made it invisible to autonomous pickup.

A compounding defect lived in the roadmap↔GitHub sync. A machine claim
(`orchestrator-5c895000`) is not a valid GitHub login, so the sync adapter laundered
it to the authenticated _human_ via `getAuthenticatedUser`. Inbound "external wins"
then overwrote the local `orchestrator-*` claim with that human handle, making the
orchestrator drop its own claim on the next tick.

Both bugs shared one root cause: there was no single authority for what `assignee`
_means_, and two GitHub adapters disagreed about how to treat machine ids.

## Decision

**The `assignee` field is an execution claim: it names who is _currently executing_
a feature, set at execution start and cleared otherwise. The invariant is
`assignee ≠ null ⟺ status == in-progress`, owned by one core authority and
mechanically enforced.**

- A new core module, `packages/core/src/roadmap/assignee-lifecycle.ts`, owns the
  invariant (`assigneeInvariantHolds`), the single machine-id predicate
  (`isMachineAssignee`), the transitions (`claim` with first-claim-wins compare-and-set,
  `release`, and the `setStatus` chokepoint that auto-clears on any move away from
  in-progress), and the outbound-sync policy (`pushAssigneeToExternal`).
- **roadmap-pilot stops assigning at selection** — it recommends and transitions only.
- **harness-execution claims at execution start** (`status=in-progress` +
  `assignee=<currentUser>`), and stops with an actionable message when `currentUser`
  cannot be resolved rather than claiming a null owner.
- **Machine claims never touch the GitHub `assignee` field** — the
  `getAuthenticatedUser` launder is removed; a machine claim shows as the existing
  `claimed` comment + in-progress label. Inbound sync never overwrites a live
  `orchestrator-*` claim.
- **RMH005** (error) fails `harness validate` on any feature that breaks the invariant;
  `groom` migrates existing drift (clears stale assignees, demotes orphaned
  in-progress rows).

## Consequences

**Positive:**

- The orchestrator no longer silently skips pilot-touched items — directly advancing
  the Agent Autonomy metric.
- A single source of truth for assignee semantics prevents the two-adapters-disagree
  class of bug from recurring.
- The invariant is enforced by code (RMH005 + the lifecycle chokepoints), not by
  convention.

**Negative / trade-offs:**

- Direct reassignment of a _live_ claim via `manage_roadmap update` is refused
  (first-claim-wins); handing off requires an explicit release first. This is
  intentional — it prevents claim-stealing races.
- The MCP `update` path now forces `in-progress` when an assignee is supplied, so a
  "bare" assignee write is no longer a selection-time annotation.

### Deviation from the spec: coerce, not reject

The proposal's wiring note for the `manage_roadmap update` path said to **reject** a
bare assignee write on a non-`in-progress` status (an invariant guard at the write
path). The implementation instead **coerces**: supplying an assignee _is_ the claim, so
`update` routes it through `claim()`, which sets `status = in-progress` (subject to
first-claim-wins). This was a deliberate choice, accepted in review:

- It is the same mental model as the invariant itself — "an assignee means someone is
  executing" — so the one way to set an assignee (`update … assignee=X`) also makes the
  row `in-progress`, with no second "remember to also set the status" step that could be
  forgotten and trip RMH005.
- It cannot violate the invariant: there is no reachable state where the write succeeds
  and leaves `assignee ≠ null` on a non-`in-progress` row.
- Rejecting would force callers into a two-call dance (`status=in-progress`, then
  `assignee=X`) for the common "claim this" intent, with no safety gain.

Reject-semantics were therefore not implemented; the coerce behavior is the contract,
covered by the MCP roadmap tests.

## Alternatives considered

- **Per-layer guards** (fix each of pilot, sync, and the adapters independently):
  rejected — that is how the original divergence arose. A centralized authority is the
  on-thesis fix.
- **Provision a GitHub bot account** so machine claims are real logins: rejected as
  YAGNI; comment + label already conveys the claim.
