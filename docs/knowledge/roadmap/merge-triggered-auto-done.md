---
type: business_process
domain: roadmap
tags: [auto-done, reconcile, pull-request, merge, external-id]
---

# Merge-Triggered Auto-Done

When a pull request merges and closes a roadmap-linked GitHub issue, the
corresponding roadmap row flips to `done` automatically. Agents no longer hand-mark
rows done — they reach `done` as a consequence of the work merging.

This records **D6** from the spec's Decisions table.

## The two paths

- **CI Action (authoritative).** On PR merge, a GitHub Action reads the PR's
  `closingIssuesReferences`, maps each closed issue to its shard via `External-ID`,
  and flips exactly that row to `done`. It is the source of truth because the GitHub
  GraphQL `closingIssuesReferences` edge tells it precisely which issues the merge
  closed.
- **Offline fallback (`harness roadmap reconcile`).** For environments without the
  Action, the CLI reconciles closed issues to `done` from a supplied issue list. It
  is idempotent — a second run reports "already done" and changes nothing.

Both resolve rows through `External-ID` (see
[`slug-issue-identity.md`](slug-issue-identity.md)), and per the assignee-lifecycle
the row's `assignee` is cleared when it reaches `done` (RMH005: a non-in-progress
row must not be assigned).

## Why it is conflict-free — and the one shared file

Each roadmap row is its own shard file, so two PRs flipping two different rows to
`done` touch two different files and never conflict. That is the per-row
conflict-free guarantee.

**C3 — the honest edge.** A status change that records assignment activity (a claim,
a release, or the auto-done that clears the assignee) also appends an assignment
record, which is written to the shared `_meta.md`, and the aggregate is regenerated.
So while _feature shards_ are conflict-free, the auto-done reconciler and the
orchestrator's claim/release flow both write `_meta.md` — the one shared file in the
sharded layout. The conflict-free guarantee is per-row, not for the shared meta;
concurrent meta writers can still contend. This is a known, documented limit, not an
oversight.

## Offline `state_reason` caveat

The offline CLI maps a raw "closed" issue to `done`. GitHub distinguishes _why_ an
issue closed via `state_reason` (`completed` vs `not_planned`), but the offline path
does not currently have `state_reason`, so it could flip a `wontfix` /
`not_planned`-closed row to `done`. The Action path is authoritative and does not
have this ambiguity (it acts on `closingIssuesReferences`, i.e. issues the merge
actually completed). A follow-up to expose `state_reason` to the offline path is
filed; until then, prefer the Action path and treat offline reconcile output as
advisory for non-`completed` closures.

## Cross-links

- ADR [0051](../decisions/0051-slug-identity-external-id-sync-key.md) — `External-ID`
  as the durable sync key the reconciler depends on.
- [`roadmap-store-abstraction.md`](roadmap-store-abstraction.md) — per-shard writes
  and `_meta.md`.
- [`read-source-invariant.md`](read-source-invariant.md) — why the regenerated
  aggregate is only a view.
