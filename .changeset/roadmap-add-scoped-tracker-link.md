---
'@harness-engineering/types': patch
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Scope `manage_roadmap add` to the row it adds, and link that row to its own
tracking issue.

Adding one roadmap row used to trigger a whole-repository bidirectional
reconcile against the tracker, so a local one-row write rewrote _other_ rows
with tracker state — and the new row itself was serialized without the
`Assignee` / `Priority` / `External-ID` triple, so nothing joined it to the
issue that had just been created for it. The two faults were opposite ends of
the same seam: added rows only looked healthy because the full sync
subsequently stamped `externalId` onto them, so excluding `add` from external
sync outright would have made the second fault fire on every add.

`add` now performs a row-scoped push instead. New core export
`syncRowToExternal(projectRoot, adapter, config, featureName, options?)`:
push-only, single row, dedup-aware, and fail-closed — if `fetchAllTickets`
fails it performs no create, because degrading to an empty dedup index would
mint exactly the duplicate issue this fix prevents. It runs no inbound pull
and does not stamp `last_synced`: a one-row push is not a reconcile.

Inbound sync is hardened independently, because `sync --apply` and state
transitions still run the full reconcile:

- An absent tracker assignee no longer clears a local one. An unassigned issue
  is the default state of every issue, not an authoritative empty value.
- Consequently, any inbound move of an _assigned_ row away from `in-progress`
  now routes through `setStatus`, so the assignee is released through the
  lifecycle authority and `assignee ≠ null ⟺ in-progress` still holds.
- A merely-`OPEN` issue no longer overwrites a local `backlog` status. The
  guard is gated on the absence of a disambiguating status label rather than
  on the resolved status, because a direct `open → planned` mapping resolves a
  bare issue and an explicitly `planned`-labelled one identically. An explicit
  `planned` label still promotes.
- Both suppressions are reported in the new `SyncResult.suppressedInbound`
  rather than silently dropped.

The `add` response gains a `link` key describing the outcome. A missing token
or a failed link is reported in the response text but does **not** mark the
response as an error: the row was written and is locally valid, and flagging a
failure would invite a retry that mints a duplicate issue.

The roadmap serializer is unchanged. Stamping `externalId` alone flips the
extended-field predicate, so all three lines appear because the fields are
real — not because the serializer pads them.

Refs #1285, #1286.
