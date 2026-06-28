---
number: 0051
title: Slug Identity and External-ID Durable Sync Key
date: 2026-06-28
status: accepted
tier: large
source: docs/changes/roadmap-shard-store/proposal.md
---

## Context

A sharded roadmap needs a stable name for each row's file, and the sync/auto-done
machinery needs a stable key to match a roadmap row to its GitHub issue. These are
not the same identity, and conflating them breaks at the edges:

- The **slug** exists before any issue does. The Intake/brainstorming flow writes a
  new row (and, in sharded mode, a new `docs/roadmap.d/<slug>.md` shard) at the
  moment a feature is proposed — often before a GitHub issue has been created.
- The **issue number** is assigned by GitHub later, is immutable once assigned, and
  survives a row being renamed. It is the only durable cross-system handle.

## Decision

Records **D2** from the spec's Decisions table (canonical text lives there; this
ADR is the pointer).

> **Slug is the local identity; the GitHub issue number (stored as `External-ID`)
> is the durable cross-system sync key.**

- Shards are named `docs/roadmap.d/<slug>.md`; the slug is the file's local identity
  and the in-repo handle every harness tool uses.
- The GitHub issue number is stored _inside_ the row as `External-ID`. It is the
  mapping that sync and auto-done depend on: a closed/merged issue is resolved back
  to its shard via `External-ID`, never via slug or title.
- `parseExternalId` / `buildExternalId` are the single format authority for that
  field — no tool hand-parses the `External-ID` string.

## Consequences

- **Rename-safety.** Renaming a row (new slug, new shard filename) does not break
  sync, because the cross-system identity (`External-ID`) is unchanged. Conversely,
  re-pointing a row at a different issue is an `External-ID` change, not a rename.
- **Intake works before an issue exists.** A freshly proposed row has a slug and a
  shard immediately; `External-ID` is filled in when the issue is created, and sync
  is a no-op until then.
- **Auto-done is deterministic.** The merge-triggered reconciler maps a closed issue
  to exactly one shard through `External-ID` (see
  [`merge-triggered-auto-done.md`](../roadmap/merge-triggered-auto-done.md)); a
  missing or duplicate `External-ID` is a detectable, warned condition rather than a
  silent mis-match.

See also: the knowledge entry
[`slug-issue-identity.md`](../roadmap/slug-issue-identity.md) and the companion ADR
[0050](0050-roadmap-read-source-invariant.md).
