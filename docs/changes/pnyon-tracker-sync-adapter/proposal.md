# A `TrackerSyncAdapter` for Waypoint — making `roadmap sync` drive a pnyon backend

**Keywords:** roadmap-sync, tracker-adapter, pnyon, waypoint, evidence-ledger, comments, issue-1863

> **STATUS: AWAITING SIGN-OFF. No implementation has begun.**
>
> The brainstorming Iron Law is that no code precedes human approval, and EVALUATE is an
> interactive one-question-at-a-time loop. This was drafted while the author was unavailable, so
> that loop could not run. **D1 and D2 below are genuine forks I will not decide alone** — they
> change what Waypoint *is*, not just how this adapter is written. Everything else carries a
> recommendation with the evidence behind it.

## Overview

#1863 has two halves. The first — a refusal that lied about why — shipped in 12.4.0: a
`roadmap.tracker.kind: "pnyon"` block now gets

```
Cannot sync: roadmap.tracker.kind "pnyon" is not supported by `harness roadmap sync`
(supported: github). The block IS present — ...
```

This spec is the second half: making that refusal unnecessary.

The gap is structural, not a missing branch. There are **two adapter families**, and #1816 built
only the first:

| interface | directory | consumers | pnyon impl |
| --- | --- | --- | --- |
| `RoadmapTrackerClient` | `roadmap/tracker/adapters/` | file-less roadmap seam | ✅ `pnyon.ts` |
| `TrackerSyncAdapter` | `roadmap/adapters/` | `roadmap sync`, `reconcile` | ❌ github only |

`TrackerSyncConfig.kind` is literally typed `'github'` ("narrowed to GitHub-only for now") and
`sync-deps.ts` hardcodes `new GitHubIssuesSyncAdapter(...)` with no kind dispatch. So the
registry opened one seam and sync was never wired to the other.

### What already exists in our favour

`PnyonTrackerAdapter` is not a stub. It already speaks the Waypoint HTTP API for the operations
that matter: `createItem`, a versioned `postCommand` path with real optimistic-concurrency
handling (`version_conflict` → refetch-and-compare → idempotent-or-`ConflictError`), and
`appendEvidence` / `listEvidence`. Most of a sync adapter is a translation layer over methods
that are already written and tested.

### Goals

- `harness roadmap sync` drives a Waypoint backend end to end.
- The concurrency story is no weaker than GitHub's: a conflicting write is refused, not clobbered.
- Nothing about the GitHub path changes.

### Non-goals

- Retiring `TrackerSyncAdapter` in favour of `RoadmapTrackerClient`. They have genuinely
  different shapes (tickets-and-comments vs items-and-evidence) and merging them is its own
  project.
- `fetchTicketState` and `assignTicket`. Both are **dead across core and cli** — zero call
  sites. Implementing them would be speculative; they throw a clear "not supported" until
  something needs them.

## Decisions

### D1 — What is a comment on a Waypoint item? **(fork — needs your call)**

`addComment` has 2 live call sites and `fetchComments` 1, so they cannot be skipped. But
Waypoint's evidence stream is a **closed lifecycle vocabulary**:

```ts
type HistoryEventType = 'created' | 'claimed' | 'released' | 'completed' | 'updated' | 'reopened';
```

There is no `commented`. And `TrackerComment` demands `{ id, body, createdAt, author, updatedAt }`
while an evidence entry carries `{ type, actor, at, details? }` — no id, no body.

|  | A) Add `commented` to the vocabulary | B) Smuggle the body into `details` on `updated` | C) Refuse: comments unsupported |
| --- | --- | --- | --- |
| **Honesty** | A comment is a first-class fact | An `updated` event that is not an update | Truthful, and loudly limited |
| **Cost** | Touches the ledger vocabulary + Waypoint | None | None |
| **Effect on sync** | Full parity with GitHub | Full parity, dishonest history | Callers must tolerate refusal |
| **Reversible** | Vocabulary additions are forever | Hard to unpick later | Easy to upgrade to A |

**Recommendation: A, and I would not ship B.** B pollutes an evidence ledger whose entire value
proposition is that every entry means what it says — a `verify.graded` consumer counting
`updated` events would be counting comments. C is defensible as a first step, but two live call
sites would start refusing, and a sync that silently drops human commentary is a data-loss bug
wearing a "limitation" label. A costs a vocabulary addition, which is exactly the kind of thing
worth doing once, deliberately.

**This is your call because it changes the ledger's vocabulary, not just this adapter.**

### D2 — May `roadmap sync` CREATE items in the ledger? **(fork — needs your call)**

`createTicket` has 2 live call sites, and `PnyonTrackerAdapter.create` already exists, so this is
mechanically trivial. The question is whether it *should*.

Waypoint's stated premise is that the board is **computed from evidence, not typed**. A sync that
creates items makes the roadmap file a *writer* to the evidence ledger — the roadmap becomes a
source of truth about work that has not happened yet, alongside the events that record what did.

|  | A) Allow create | B) Pull-only: refuse create |
| --- | --- | --- |
| **Parity** | Same as GitHub sync | Weaker; roadmap rows never reach the tracker |
| **Premise** | Roadmap writes into the evidence ledger | Ledger stays evidence-only |
| **Risk** | A roadmap typo becomes a ledger fact | Adopters must create items elsewhere |

**Recommendation: A, with the create recorded as an intent rather than as evidence of work.**
Waypoint already models `intent.created` as a legitimate origin — items enter from a roadmap
importer today, which is precisely this operation by another name. Refusing it here while the
importer does it anyway would be an inconsistency, not a principle.

**Flagging it because it is the "computed, not typed" line, and you own that line.**

### D3 — Config shape: widen `TrackerSyncConfig` to a discriminated union

`kind: 'github'` becomes `kind: 'github' | 'pnyon'`, with the github-only fields (`repo`,
`labels`, `statusMap`) narrowed to the github member and `url` / `token` to the pnyon member.
The alternative — making every field optional — would let a nonsense config typecheck.

Note this is also why the probe emitted `ignored unknown key 'roadmap.tracker.repo'`: the config
schema already rejects github-shaped keys under a pnyon kind, so the two validators must end up
agreeing. **Recommendation: discriminated union** (confidence: high).

### D4 — Dispatch at `resolveAdapter`, keyed off the same registry

`sync-deps.ts` picks the adapter. It should switch on `config.kind`, not grow a second
hardcoded branch. The accepted-kind list already lives in one place
(`SYNC_SUPPORTED_TRACKER_KINDS`, added in 12.4.0); adding `'pnyon'` there is the single edit that
flips the gate, and the guard/diagnosis pair stays consistent by construction.

### D5 — Status mapping without a `statusMap`

GitHub needs `statusMap` because "open/closed" is all it has. Waypoint carries real roadmap
statuses natively, so the pnyon member needs no map — `featureFromItem` already round-trips
status. **Recommendation: no `statusMap` for pnyon; reject it as an unknown key** (as the schema
already does).

## Technical design

`packages/core/src/roadmap/adapters/pnyon-sync.ts` — a `PnyonSyncAdapter` implementing
`TrackerSyncAdapter` by delegating to `PnyonTrackerAdapter`:

| `TrackerSyncAdapter` | delegates to | note |
| --- | --- | --- |
| `fetchAllTickets` | `fetchAll` | 4 call sites — the hot path |
| `createTicket` | `create` | gated on D2 |
| `updateTicket` | `update` | inherits the existing conflict handling |
| `addComment` | `appendEvidence` | shape depends on D1 |
| `fetchComments` | `listEvidence` | shape depends on D1 |
| `fetchTicketState` | — | unsupported; zero call sites |
| `assignTicket` | — | unsupported; zero call sites |

Conflict semantics come free: `PnyonTrackerAdapter.command` already resolves an expected version,
detects `version_conflict`, refetches, and returns either an idempotent success or a
`ConflictError`. The sync engine's existing conflict path consumes that.

## Success criteria

- **SC-1** WHEN `roadmap.tracker.kind` is `pnyon` and the target is reachable, THE SYSTEM SHALL
  complete `harness roadmap sync` without a configuration refusal.
- **SC-2** WHEN a roadmap row and its Waypoint item both changed since the last sync, THE SYSTEM
  SHALL surface a conflict rather than overwrite either side.
- **SC-3** WHEN sync runs twice with no intervening change, THE SECOND run SHALL write nothing.
- **SC-4** WHERE a `TrackerSyncAdapter` method has no Waypoint equivalent, THE SYSTEM SHALL fail
  with a message naming the operation and the backend, never silently no-op.
- **SC-5** The GitHub sync path SHALL be unchanged — its existing tests pass untouched.
- **SC-6** WHEN a pnyon config carries github-only keys, THE SYSTEM SHALL reject them rather than
  ignore them silently.

## Implementation order

1. D3 config union + `'pnyon'` into `SYNC_SUPPORTED_TRACKER_KINDS` (SC-1, SC-6).
2. `PnyonSyncAdapter` over the delegating methods, minus the D1/D2-gated ones (SC-3, SC-4, SC-5).
3. D4 dispatch in `resolveAdapter`.
4. D1 comments and D2 create, once answered.
5. Conflict coverage (SC-2).

## Open questions

1. **D1** — does Waypoint gain a `commented` evidence type, or does sync refuse comments?
2. **D2** — may `roadmap sync` create ledger items?
3. Should `fetchTicketState` / `assignTicket` be removed from `TrackerSyncAdapter` entirely?
   Both are dead in-tree, and an interface with dead methods forces every future adapter to
   implement them. Out of scope here; worth its own issue.
