---
number: 0011
title: Operator-initiated pool mutation as auto-approved proposals
date: 2026-07-08
status: accepted
tier: medium
source: docs/changes/lmlm-dashboard-pool-mutation/proposal.md
---

## Context

The LMLM dashboard needed direct **Install** and **Remove** actions so the
operator can promote a recommended model into the pool and demote (evict) a pool
member without hand-editing config or dropping to the CLI.

The dashboard already had exactly one pool-mutation channel: the proposal
approve/reject path (`onApproveModelProposal`), reached from the Recommendations
card. That path is not a thin wrapper — it streams the `ollama pull`, enforces
`PoolManager.canInstall()` (disk-budget + org allowlist), honors the
`isModelInUse()` evict-deferral (an in-use model is marked `pendingEviction`,
never evicted mid-request), persists an audit record, and broadcasts on the
`local-models:pool` WebSocket topic.

Two shapes were considered for the new actions:

1. **Direct pool routes** — new endpoints call `PoolManager.install/evict`
   directly. Conceptually simplest, but it re-implements progress, audit, and —
   critically — the in-use eviction deferral, and it introduces a **second**
   pool-mutation channel that future changes must keep in sync.
2. **Auto-approved proposals** — the new endpoints build a `kind:'model'`
   proposal (`add` for install, `evict` for remove), persist it via
   `createModelProposal`, then run the exact same `onApproveModelProposal` core
   the approve route uses.

## Decision

Operator-initiated Install and Remove are modeled as **user-initiated,
auto-approved model proposals**. The convenience routes
(`POST /api/v1/local-models/pool/install`, `.../pool/remove`) create a proposal
and immediately approve it through `onApproveModelProposal`; they add no parallel
mutation logic.

Consequences of routing through the shared core:

- The pool guards (`not_allowed`, `budget_exceeded`) are enforced once; the routes
  map those codes to `409`.
- The `isModelInUse` deferral is inherited: an in-use Remove returns a `deferred`
  disposition (`202`) and the drain evicts it after the current run.
- Every operator action writes the same proposal/audit record an autonomous
  approval would, so the decision history is uniform.
- Proposals remain the **single** pool-mutation mechanism on the dashboard
  (preserving the D-P8-2 invariant); the convenience routes are a new _entry
  point_ to that mechanism, not a new mechanism.

Byte-level `ollama pull` progress is **not** wired to the WebSocket in this
iteration (the approve core does not forward the installer's `onEvent`). Install
awaits the pull synchronously — matching the existing approve-an-add flow — and
the UI shows an indeterminate "Installing…" state until the pool refetches.
Streaming progress is a deferred enhancement.

## Consequences

**Positive:**

- No duplicated guard / deferral / audit logic; one code path governs both
  autonomous and operator-initiated mutation.
- The in-use safety property (never evict mid-request) holds automatically for
  the dashboard Remove button.
- Uniform audit trail across autonomous and manual actions.

**Negative:**

- A user-initiated action carries slight proposal ceremony (a proposal record is
  created and immediately approved) rather than a bare mutation call.
- Synchronous install holds the HTTP connection for the duration of the pull
  (consistent with the existing approve flow, but a long-lived request for
  multi-GB models). Async install + streamed progress is deferred.

**Neutral:**

- The convenience routes reuse the `manage-proposals` auth scope — identical to
  approve/reject — so no new authorization surface is introduced.

## Related

- [`docs/changes/lmlm-dashboard-pool-mutation/proposal.md`](../../changes/lmlm-dashboard-pool-mutation/proposal.md)
- [ADR 0004: Local availability disables rather than escalates](./0004-local-availability-disables-not-escalates.md)
