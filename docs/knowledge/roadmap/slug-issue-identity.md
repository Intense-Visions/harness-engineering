---
type: business_rule
domain: roadmap
tags: [slug, external-id, github-issues, identity, sync]
---

# Slug ↔ Issue Identity

A roadmap row carries two distinct identities, and keeping them distinct is what
makes sharding, rename-safety, and sync work:

- **Slug — the local identity.** The slug names the shard file
  (`docs/roadmap.d/<slug>.md`) and is the in-repo handle every harness tool uses to
  address a row. It exists from the moment a feature is proposed.
- **`External-ID` — the cross-system sync key.** The GitHub issue number, stored
  inside the row as `External-ID`. It is immutable once assigned and is the durable
  key that maps a roadmap row to its issue across systems.

## The Intake case: slug before issue

The slug is created _before_ the issue exists. When brainstorming/intake promotes a
proposal, it writes a new row — and in sharded mode a new `<slug>.md` shard —
immediately. The GitHub issue (and therefore `External-ID`) is created later. Until
then the row simply has no `External-ID`, and sync is a no-op for it. This ordering
is why the slug, not the issue number, is the file's name and local identity.

## Resolution always goes through `External-ID`

Both directions of sync and merge-triggered auto-done resolve a row to its issue (or
back) through `External-ID` — never through the slug or the title:

- Auto-done: a closed/merged issue → the one shard whose `External-ID` matches → flip
  to `done`.
- Sync: a row with an `External-ID` is reconciled against that issue; a row without
  one is a candidate for issue creation.

`parseExternalId` / `buildExternalId` are the single format authority for the field;
no tool hand-parses it. A missing or duplicate `External-ID` is a detectable, warned
condition (Phase 5 added a duplicate-`External-ID` reconcile warning) rather than a
silent mismatch.

## Rename-safety

Because cross-system identity lives in `External-ID`, renaming a row (new slug, new
shard filename) does not break its link to the issue. Conversely, re-pointing a row
at a different issue is an `External-ID` change, not a rename. Local renames and
cross-system identity are independent concerns.

## Cross-links

- ADR [0051](../decisions/0051-slug-identity-external-id-sync-key.md) — the decision.
- [`merge-triggered-auto-done.md`](merge-triggered-auto-done.md) — the reconciler
  that depends on `External-ID`.
- [`roadmap-store-abstraction.md`](roadmap-store-abstraction.md) — shard layout.
