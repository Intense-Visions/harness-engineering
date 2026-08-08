---
feature: ulid-identity-sessions-worktrees
status: draft
created: 2026-08-08
roadmap: ulid-identity-for-sessions-and-worktrees
external-id: github:Intense-Visions/harness-engineering#603
keywords:
  - ulid
  - identity
  - session-id
  - worktree-identity
  - immutable-id
  - completion-number
  - collision-free
---

# ULID Identity for Sessions and Worktrees (#603)

## Overview

Harness identifies both **sessions** (`.harness/sessions/<slug>/`) and **worktree-isolated
tasks** (orchestrator worktrees keyed on `issue.identifier`) by a human-authored or
content-derived **slug**. The slug _is_ the identity: it is the directory name, it flows
through the session search index and archive hooks as `sessionId`, and it is what the
dashboard renders. Slugs collide across branches/worktrees, sort badly, and are mutable —
the exact worktree/branch/dashboard disambiguation problem Spec Kitty solved with an
immutable ULID `mission_id` decoupled from a display-only `mission_number` assigned at
merge.

This change adopts the same shape (SPECKITTY-6): every session and every worktree-isolated
task gets an **immutable, collision-free ULID at creation**, and a **human-friendly
sequential number assigned only at completion** (session archive / worktree ship). The ULID
becomes the durable, sortable, collision-free key; the existing slug stays as the
human-facing display label and directory name.

Adapted from `docs/research/spec-kitty-comparison-analysis.md`, adoption SPECKITTY-6.

## Decisions

1. **Additive, non-breaking identity — the ULID is a new field, not a renamed directory.**
   The on-disk directory naming (`.harness/sessions/<slug>/`, worktree
   `<sanitized-identifier>/`) is **unchanged**. The ULID is recorded in a small
   `identity.json` metadata record alongside, and `sessionId`/`identifier` continue to flow
   as the slug for full backward compatibility with the FTS5 session search index, archive
   hooks, and dashboard routes. This deliberately avoids a destructive migration of a
   persisted identity format. (Renaming directories to ULIDs was considered and rejected as
   out-of-scope: it would break every existing `.harness/sessions/*` directory, the search
   index schema, and dashboard `/api/sessions/<id>` routes for no gain the additive record
   does not already deliver.)

2. **Self-contained ULID generator in `@harness-engineering/core` — no new dependency.**
   Add `generateUlid()` beside the existing `generateId()` UUID helper
   (`packages/core/src/shared/uuid.ts` sets the precedent: core self-implements UUID v4 via
   native `crypto` rather than importing the `uuid` package). ULID is a small, stable,
   well-specified format (48-bit millisecond timestamp + 80-bit randomness, Crockford
   base32, 26 chars, lexicographically sortable). A self-contained implementation avoids a
   new runtime dependency (and its supply-chain-audit + dependency-changeset overhead) and
   keeps identity generation in the layer-clean `core/shared` seam importable by every
   higher layer.

3. **Monotonic within a millisecond.** When two ULIDs are generated in the same
   millisecond, the random component is incremented (per the ULID monotonic spec) rather
   than re-randomized, so creation order is preserved by lexical sort — the property that
   makes ULIDs disambiguate concurrent worktrees/sessions.

4. **One identity engine, two thin wirings.** All identity logic (ULID generation, the
   `identity.json` create-if-absent store, and the completion-number allocator) lives in a
   new `packages/core/src/identity/` module. Sessions (`core/state`) and worktree tasks
   (`orchestrator/workspace`) both consume it — the orchestrator may import core, so no
   layer boundary is crossed.

5. **Immutable at creation, number at completion.** `ensureIdentity(file, slug)` writes the
   ULID exactly once and never overwrites an existing record (immutability). The
   human-friendly `number` is `null` until completion, then allocated from a per-domain
   monotonic counter (`assignNumber`) and stamped with `completedAt`. `assignNumber` is
   idempotent — a second call returns the already-assigned number.

6. **Best-effort, never breaks the host operation.** Identity recording is wrapped so a
   failure to write `identity.json` never breaks session state operations or a worktree
   ship. Identity is metadata, not a gate.

## Technical Design

### New types — `packages/types/src/identity.ts`

```
HarnessIdentity {
  ulid: string;              // immutable collision-free ULID, assigned once at creation
  slug: string;              // human-facing label (session slug / worktree identifier)
  domain: 'session' | 'worktree';
  createdAt: string;         // ISO-8601
  number: number | null;     // sequential human-friendly number; null until completion
  completedAt: string | null;// ISO-8601; null until completion
}
```

### New core module — `packages/core/src/identity/`

- `ulid.ts` — `generateUlid(seedTime?: number): string`, `isValidUlid(value: string): boolean`,
  `ulidTime(value: string): number` (decode the timestamp). Monotonic within a millisecond.
- `store.ts` — file-backed, all best-effort:
  - `readIdentity(filePath): HarnessIdentity | null`
  - `ensureIdentity(filePath, { slug, domain }): HarnessIdentity` — create-if-absent; never
    overwrites an existing ULID.
  - `assignNumber(filePath, counterFilePath): HarnessIdentity | null` — allocate the next
    number from the counter and stamp `number`/`completedAt`; idempotent.
  - `nextNumber(counterFilePath): number` — read-increment-write a monotonic integer counter.
- `index.ts` — barrel (regenerated via `pnpm run generate:barrels`).

### Session wiring — `packages/core/src/state/`

- `session-resolver.ts`: when `resolveSessionDir(..., { create: true })` creates the
  directory, best-effort `ensureIdentity(<sessionDir>/identity.json, { slug, domain:
'session' })`. Immutable — subsequent resolves are no-ops.
- `session-archive.ts`: after the archive move succeeds, best-effort `assignNumber` against
  the archived `identity.json` using the counter
  `.harness/archive/sessions/.number-counter`, and extend the `onArchived` hook info with
  `ulid` and `number` (additive fields).

### Worktree wiring — `packages/orchestrator/src/workspace/manager.ts`

- `ensureWorkspace`: on create (and idempotently on reuse), best-effort `ensureIdentity`
  against `<repoRoot>/.harness/worktrees/<sanitized>.json` with `domain: 'worktree'`.
- `shipWorkspace`: on successful ship, best-effort `assignNumber` (idempotent) using the
  counter `<repoRoot>/.harness/worktrees/.number-counter`.
- New public methods `getWorkspaceIdentity(identifier)` and `assignWorkspaceNumber(identifier)`
  so callers/tests can read/assign identity. `.harness/` is gitignored, so identity records
  never dirty the worktree.

## Success Criteria

1. `generateUlid()` returns a 26-char Crockford-base32 string; `isValidUlid()` accepts it
   and rejects malformed input; two ULIDs generated in the same millisecond sort in
   creation order (monotonic).
2. `ensureIdentity` writes `identity.json` once and returns the **same** ULID on a second
   call (immutability), even with a different slug argument.
3. `assignNumber` assigns 1, 2, 3… from an empty counter across successive completions and
   is idempotent per identity (second call returns the same number).
4. Creating a session (`resolveSessionDir` with `create: true`) writes
   `<sessionDir>/identity.json` with a ULID, `number: null`; the directory name is still the
   slug.
5. Archiving a session assigns a completion `number` and `completedAt` to the archived
   identity and surfaces `ulid`/`number` to the `onArchived` hook.
6. `ensureWorkspace` records a worktree identity ULID; `shipWorkspace` assigns a completion
   number; both are best-effort and never break the host operation.
7. All existing session/state/archive/workspace tests still pass (backward compatibility),
   and new unit tests cover the ULID generator, the store, and both wirings.
8. `harness validate`, typecheck, lint, and the full test suite pass; a changeset is added.

## Implementation Order

### Phase 1: Core ULID generator + identity store <!-- complexity: low -->

Add `HarnessIdentity` type, the self-contained `generateUlid`/`isValidUlid`/`ulidTime`
generator, and the file-backed `identity/store.ts` (ensure/assign/read/counter), with full
unit tests. Regenerate barrels. No wiring yet — pure, isolated, fully testable.

### Phase 2: Session identity wiring <!-- complexity: medium -->

Wire `ensureIdentity` into session-dir creation and `assignNumber` into session archive;
extend the `onArchived` hook info additively. Tests for create-time identity and
completion-number-at-archive; confirm existing session tests still pass.

### Phase 3: Worktree-task identity wiring <!-- complexity: medium -->

Wire `ensureIdentity` into `ensureWorkspace` and `assignNumber` into `shipWorkspace`; add
`getWorkspaceIdentity`/`assignWorkspaceNumber`. Tests for create-time and ship-time
identity; confirm existing workspace tests still pass. Add changeset; final `harness
validate`.
