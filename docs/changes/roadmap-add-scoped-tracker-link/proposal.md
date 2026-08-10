# Scoped tracker linking for `manage_roadmap add`

**Status:** approved (revision 2 — after soundness review)
**Type:** bug fix (two coupled defects)
**Tier:** medium
**Tracking:** #1285, #1286
**Keywords:** roadmap-sync, tracker-adapter, external-id, sharded-roadmap, blast-radius, unattended-agents, fullSync, mcp-tool

## Overview

`manage_roadmap add` inserts one roadmap row. Today that single insert triggers a
**whole-repository bidirectional reconcile** against the GitHub tracker, and the row it
just inserted is written **without the fields that link it to its own tracking issue**.
The two faults are opposite ends of the same broken seam, and neither can be fixed alone:

- **#1285 (writes too much):** adding one row rewrites _other_ rows, clobbering
  human-set values with tracker state.
- **#1286 (writes too little):** the _new_ row is serialized truncated — no
  `Assignee` / `Priority` / `External-ID` — so nothing joins it to the issue that was
  just created for it.

They are coupled by a load-bearing accident: **the only reason added rows normally look
healthy is that the #1285 full sync subsequently stamps `externalId` onto them.** Fixing
#1285 naively — excluding `add` from external sync — would make #1286 fire on _every_
add, and would also silently drop the auto-creation of the tracking issue, which is
relied-on behaviour. This spec therefore replaces the full sync on `add` with a
**row-scoped push**, rather than removing it.

### Goals

1. The `manage_roadmap add` entry point must not modify any row other than the one being
   added.
2. `manage_roadmap add` must still create the tracking issue and must leave the new row
   carrying its `External-ID`.
3. When linking cannot be completed, the caller must be told, not left with a
   silently-unlinked row.
4. Independently of `add`, the inbound sync mapping must stop treating tracker
   _absence of opinion_ as authoritative truth.

### Non-goals

- Changing the roadmap markdown format or the legacy-omission serializer contract.
- Re-scoping `update` / `remove` / `promote` off `fullSync` (see Follow-ups).
- Re-scoping `autoSyncRoadmap`, which `manage_state` calls on state transitions (see
  Follow-ups). Goal 1 is scoped to the `manage_roadmap add` entry point only.
- Any change to the file-less roadmap mode.
- Network-touching tests.

## Evidence

| Claim                                                                                                                    | Evidence                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add` falls through to a full bidirectional sync                                                                         | `packages/cli/src/mcp/tools/roadmap.ts:757-764` — `shouldTriggerExternalSync` excludes `response.isError`, read-only actions, `sync` without `apply`, and `groom`; everything else `return true`                                                                             |
| …which calls `fullSync` over every row                                                                                   | `packages/cli/src/mcp/tools/roadmap-auto-sync.ts:62,88`; `packages/core/src/roadmap/sync-engine.ts:368` `fullSync` loads the whole store, pushes, pulls, and writes back every changed row                                                                                   |
| Empty tracker assignee clobbers a local assignee                                                                         | `packages/core/src/roadmap/sync-engine.ts:243` — `if (!localMachineClaim && ticketState.assignee !== feature.assignee) feature.assignee = ticketState.assignee;` with no null guard                                                                                          |
| `backlog` is clobbered by a merely-`OPEN` issue                                                                          | `sync-engine.ts:259` guards `feature.status === 'blocked' && newStatus === 'planned'` but **not** `backlog`; `packages/core/src/roadmap/status-rank.ts` ranks `backlog: 0` below `planned: 1`, so `isRegression` treats the clobber as a legal promotion and lets it through |
| This repo resolves every open issue to `planned` by a **direct** key                                                     | `harness.config.json` `reverseStatusMap: { open: planned, closed: done }`; `resolveReverseStatus` (`packages/core/src/roadmap/tracker-sync.ts:107-109`) matches the direct key first and never reaches the compound branch                                                   |
| The new row is written with all extended fields null                                                                     | `packages/cli/src/mcp/tools/roadmap.ts:266-316` — `buildFeatureFromInput` sets `assignee`/`priority`/`externalId`/`updatedAt` to `null`; `handleAdd` persists with no tracker round-trip                                                                                     |
| …and the serializer then omits the whole triple                                                                          | `packages/core/src/roadmap/serialize.ts:79-85` — `serializeExtendedLines` returns `[]` when all four are null                                                                                                                                                                |
| That omission is **deliberate and covered**, not a bug                                                                   | `packages/core/tests/roadmap/serialize-extended.test.ts` — "omits new fields when all are null (legacy output)" plus two `parse → serialize` **byte-identity** round-trip tests (`EXTENDED_FIELDS_MD` contains an all-null backlog row; `VALID_ROADMAP_MD` is all-legacy)    |
| A missing `External-ID` permanently strands the row                                                                      | merge-triggered auto-done joins rows to closed issues on `External-ID` (`packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts`)                                                                                                                                          |
| `fullSync` is mutex-serialized by a synchronous swap + `await`, so a second acquirer queues FIFO rather than deadlocking | `sync-engine.ts:368-379,452-454`; `_resetSyncMutex()` exported for tests                                                                                                                                                                                                     |
| `applyRoadmapDiff` is genuinely row-scoped                                                                               | `packages/core/src/roadmap/store/apply-diff.ts:76-103` — slug-indexed, `patchFeature` per changed row, no-op for unchanged rows                                                                                                                                              |
| `syncToExternal` mutates features in place and never clones or re-keys them                                              | `sync-engine.ts:164-220`, `resolveExternalId` at `:105,:123` assigns `feature.externalId` directly                                                                                                                                                                           |
| The engine's own convention is that a suppressed action must be **reported**, never silently dropped                     | `sync-engine.ts:90-91` — "Both guards report rather than silently drop: a withheld create lands in `skippedCreates` … never nowhere"; `skippedCreates` / `skippedStateChanges` exist for this                                                                                |
| RMH005 (`assignee ≠ null ⟺ in-progress`) is an **error**-severity health rule                                            | `packages/core/src/roadmap/health.ts:81,142`; `assigneeInvariantHolds` at `packages/core/src/roadmap/assignee-lifecycle.ts:52-54`                                                                                                                                            |
| CLI tests can already spy the auto-sync module namespace                                                                 | `packages/cli/tests/mcp/tools/roadmap.sharded.test.ts:98`, `roadmap.test.ts:704` — `vi.spyOn(autoSync, 'triggerExternalSync')` works because `roadmap.ts:17` uses a named import                                                                                             |
| Reuse-over-reimplement is the local convention                                                                           | `packages/core/src/roadmap/serialize.ts` — `serializeFeature` is "Exported so the shard file format can reuse the exact same row emission (spec: reuse, do not reimplement)"                                                                                                 |
| Strategy grounding                                                                                                       | `STRATEGY.md#key-metrics` — _Holiday Confidence_: "if the senior disappears for two weeks, what holds?" A tool that corrupts roadmap rows unattended is a direct hit on that metric; `manage_roadmap` runs unattended inside the `-fleet` family                             |

## Decisions made

### D1 — `add` stops triggering `fullSync`; it performs a row-scoped push instead

`shouldTriggerExternalSync` returns `false` for `add`. **`handleAdd` itself** performs the
scoped push (see D5 for why the ownership sits there and not in the dispatcher).

_Rationale:_ this is the same principle the `groom` exclusion already states in a comment
— "a local reorganization … Mirroring it would read [the wrong set of] rows" — applied to
`add`. Blast radius becomes proportional to the operation.

**Rejected — option (ii), `add` does no external work at all.** It would regress
auto-creation of the tracking issue, which callers depend on, and would guarantee #1286
on every add.

### D2 — new core export `syncRowToExternal(...)`: push-only, one row, dedup-aware, fail-closed

```
syncRowToExternal(projectRoot, adapter, config, featureName, options?) => Promise<SyncResult>
```

- Takes the **same module mutex** as `fullSync`, so a scoped push and a full sync can
  never interleave their writebacks. _Scope note:_ `handleAdd`'s own `persistRoadmap`
  write happens **outside** the mutex, so a concurrent `fullSync` can still slip between
  the row write and the scoped push. Closing that window would mean holding the lock
  across the whole `add`, which is out of scope. What actually removes the #1286 symptom
  is that the `externalId` stamp is now in-process and deterministic — not the mutex.
- Loads via `resolveRoadmapStore` (so it works in both sharded and monolith mode).
- Locates the feature by **case-insensitive name**, matching the rest of the tool. Zero
  matches, or more than one match, is an error in the returned `SyncResult` and performs
  no writes — it never throws. (`applyRoadmapDiff` keys by slug and `Err`s on slug
  collision; refusing an ambiguous name up front keeps the two identity notions from
  meeting.)
- **Fetches all tickets** solely to build the dedup index, so a re-add of an existing
  title links to the existing issue rather than minting a duplicate. Fetching is a read;
  it cannot mutate other rows. **Fail-closed:** if `fetchAllTickets` fails, the function
  records the error and performs **no create** — the alternative (`fullSync`'s behaviour
  of degrading to an empty dedup index) would mint exactly the duplicate issue this fix
  exists to prevent.
- Delegates to the existing `syncToExternal` over a **single-row roadmap projection that
  shares feature object identity** with the loaded roadmap. `syncToExternal` mutates
  features in place, so the `externalId` it stamps lands on the real row. This is reuse,
  not reimplementation — the create/dedup/guard/report semantics stay in one place.
- **Runs no inbound pull.** Nothing external can overwrite any local field on this path.
- Writes back via `applyRoadmapDiff(store, before, after)`.
- **Does not stamp `last_synced`.** A scoped push is not a reconcile; `last_synced` means
  "the whole roadmap was last reconciled against the tracker", and bumping it from a
  one-row push would assert a reconcile that never happened. This is a deliberate
  behaviour change from the `fullSync`-on-`add` status quo.

**`SyncResult` fields meaningful on this path:** `created`, `updated`, `errors`,
`skippedCreates`, `suppressedInbound` (always empty — no pull runs), and
`examined.ticketsFetched`. `examined.roadmapRows` is `1` by construction (the projection),
which differs in meaning from `fullSync`'s whole-roadmap denominator. `planned.*` and
`dryRun` behave as in `syncToExternal`.

### D3 — harden the inbound mapping in `applyTicketToFeature` (defence in depth)

Three coupled changes. All suppressions honour the existing `forceSync` escape hatch, so
"human always wins unless explicitly overridden" is preserved.

**(a) Absent tracker assignee is not an opinion.** A `null` `ticketState.assignee` must not
clear a non-null local assignee. Tracker→local _assignment_ (null → someone) and
reassignment are unaffected, and `forceSync` still clears.

**(b) Guard (a) requires widening the status routing, or it breaks RMH005.** The bare
status write at `sync-engine.ts:271` documents its own precondition — "the assignee block
above already reconciled the assignee from external". Guard (a) deletes that precondition.
Concrete failure: local row `in-progress` / `assignee: '@alice'`, ticket `closed` with no
assignee → today the assignee is cleared then status becomes `done`; with guard (a) alone
the row would end up **`done` while still assigned**, violating RMH005, which is an
**error**-severity health rule that fails `harness validate` — on the very rows the guard
was meant to protect. The routing condition therefore widens from `localMachineClaim` to
**any non-null assignee**: on any inbound status change to an assigned row, the write goes
through `setStatus` so the assignee is released through the lifecycle authority.

The widened condition does **not** require the row to have been `in-progress`, so a
`planned` row that already carries an assignee — an existing RMH005 violation — is repaired
here too. That is deliberate. But it must not be silent: because the widened branch now
**overlaps** the assignee block (under `localMachineClaim` the two were mutually exclusive),
`setStatus` can discard an assignee the assignee block just wrote. The routing therefore
reconciles `assignmentChanges` with the value that actually landed — amending the pending
entry to `to: null`, or pushing `{ from: <released>, to: null }` when the assignee block
suppressed its own write. `assignmentChanges` flows unfiltered into the `--json` CI
artifact, so an unreconciled entry would publish an assignee that is null on disk.

**(c) A merely-`OPEN` issue must not overwrite local `backlog` — gated on label
provenance.** `backlog` and `planned` are both open states; a bare `OPEN` cannot
distinguish them. But the suppression must fire _only_ when the tracker genuinely has no
opinion. `resolveReverseStatus` collapses provenance — it returns a bare `FeatureStatus`
and matches its direct key (`open → planned`) **before** the compound branch, so this
repo's own config never reaches compound resolution at all. A naive
`status === 'backlog' && newStatus === 'planned'` guard would therefore also suppress an
explicit `planned` label, which _is_ an opinion.

The guard is instead gated on the **absence of any disambiguating status label** on the
ticket (`in-progress`, `blocked`, `planned`, `needs-human` — the same set
`resolveReverseStatus` uses). An explicit `planned` label still promotes a `backlog` row.

_Accepted trade-off:_ the pre-existing `blocked` guard on the same line has the identical
provenance blindness. This spec does not change it — altering `blocked`'s behaviour is out
of scope and would be an unrequested regression risk. The new `backlog` guard is written
label-aware because that is what its own rationale requires.

**(d) Suppressions are reported.** The module's stated convention is that a withheld
action lands somewhere, never nowhere. `SyncResult` gains
`suppressedInbound: Array<{ feature: string; field: 'assignee' | 'status'; from: string | null; to: string | null; reason: string }>`,
populated by (a) and (c). Without it, an operator debugging "why didn't my GitHub unassign
take effect" gets silence.

This whole decision stands on its own even after D1: `sync --apply` and `autoSyncRoadmap`
still call `fullSync`, and `update` / `remove` / `promote` still route through
`triggerExternalSync`.

### D4 — do **not** change `serializeExtendedLines`

The all-null omission is deliberate, documented, and pinned by three tests including two
byte-identity round-trips. Emitting the triple unconditionally would break
`parse → serialize` identity for every legacy roadmap and churn every adopter project's
roadmap files on the next write, to fix a symptom whose actual cause is that `add` never
populated `externalId`. D2 makes the stamp deterministic and in-process, and stamping
`externalId` alone flips `hasExtended`, so all three lines appear — the fields are present
because they are _real_, not because the serializer pads them.

### D5 — `handleAdd` owns the push and the response annotation; a failed link is reported, not swallowed

`triggerExternalSync` is fire-and-forget by design and swallows everything. The scoped push
instead reports its outcome.

**Ownership sits in `handleAdd`, not the dispatcher.** `handleAdd` already holds the
roadmap object and knows the feature name, and it must annotate the response _before_
serializing it — if the dispatcher ran the push afterwards it would mutate a
freshly-loaded copy while the already-serialized response still showed
`externalId: null`, defeating the observability this decision exists for.

The response envelope follows the existing `claimRefusedResponse` convention
(`roadmap.ts:341`, `{ ...roadmap, claimed, message }`): the roadmap shape is spread and a
sibling key is added, so every consumer reading `.milestones` / `.assignmentHistory` is
unaffected.

```
type RowLinkOutcome =
  | { kind: 'not-configured' }                 // no tracker in harness.config.json
  | { kind: 'no-token' }                       // tracker configured, GITHUB_TOKEN absent
  | { kind: 'linked'; externalId: string }
  | { kind: 'failed'; reason: string };
```

- `{ kind: 'linked' }` is derived from **`feature.externalId`** after the push — the only
  field correct on both the create path (where `resolveExternalId` returns `false` and the
  id lands in `result.created`) and the dedup path (where it lands in `result.updated`).
- `not-configured` is the silent, expected case for projects with no tracker.
- **`no-token` and `failed` are surfaced in the response text and the response is NOT
  marked `isError`.** The row _was_ written and is locally valid; only the tracker link is
  missing. Marking it an error would tell callers the add failed, inviting a retry that
  mints a duplicate issue — the exact failure #1286 exists to prevent. Loud-but-not-fatal
  is the correct severity.
- **Create-succeeded-but-writeback-failed** is an explicit case, not an accident: it
  returns `{ kind: 'failed' }` with the orphaned `externalId` named in `reason`, so the
  operator can repair by hand. A retry of the same `add` is self-healing rather than
  duplicating, because the dedup index now matches the created ticket's title.

## Technical design

### Files touched

| File                                              | Change                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/tracker-sync.ts`              | add `suppressedInbound` to `SyncResult`                                                                                      |
| `packages/core/src/roadmap/sync-engine.ts`        | add `syncRowToExternal`; guards (a)/(b)/(c)/(d) in `applyTicketToFeature`; populate `suppressedInbound` in `emptySyncResult` |
| `packages/core/src/roadmap/index.ts` (barrel)     | export `syncRowToExternal`                                                                                                   |
| `packages/cli/src/mcp/tools/roadmap-auto-sync.ts` | add `triggerScopedExternalSync` with an adapter-factory seam                                                                 |
| `packages/cli/src/mcp/tools/roadmap.ts`           | `shouldTriggerExternalSync` returns `false` for `add`; `handleAdd` runs the scoped push and annotates the response           |

### The adapter-injection seam (required for testability)

`triggerExternalSync` resolves `GITHUB_TOKEN` and constructs `GitHubIssuesSyncAdapter`
internally, with no seam — which is why nothing today can drive that path against a fake
tracker. The new function takes a defaulted factory so a stub adapter can be injected
without mocking the `@harness-engineering/core` barrel:

```
export async function triggerScopedExternalSync(
  projectPath: string,
  featureName: string,
  deps?: { makeAdapter?: (token: string, config: TrackerSyncConfig) => TrackerSyncAdapter }
): Promise<RowLinkOutcome>
```

Production callers omit `deps`. Without this, SC2/SC6/SC8 are not provable.

## Integration points

- **Entry Points:** `manage_roadmap` MCP tool, `add` action — behaviour change plus one
  additive response key, no input-schema change. New public core export
  `syncRowToExternal`.
- **Registrations Required:** barrel export from `packages/core/src/roadmap/index.ts`;
  regenerate generated reference docs if the export surface is documented. `packages/core`
  must be **rebuilt** before the CLI test suite runs — `packages/cli/vitest.config.mts`
  declares no alias, so `@harness-engineering/core` resolves through the `node_modules`
  symlink to `packages/core/dist`.
- **Documentation Updates:** changeset. The MCP tool description must not cite issue
  numbers — internal refs stay in the changeset and PR body only.
- **Architectural Decisions:** none rise to a standalone ADR. D1 applies an existing,
  already-articulated principle (the `groom` exclusion) rather than establishing a new
  one; D3 tightens existing guards.
- **Knowledge Impact:** "operation blast radius must be proportional to the operation" —
  a local write must not trigger a global reconcile. Also: "tracker silence is not tracker
  opinion" — an absent field is missing information, not an authoritative empty value.

## Success criteria

SC1, SC3, SC4, SC5, SC7, SC8, SC9, SC10, SC11, SC12 are provable with a stub
`TrackerSyncAdapter` and no network. SC2 and SC6 additionally require the
`deps.makeAdapter` seam above; that is the seam's entire justification.

| #    | Criterion (EARS)                                                                                                                                                                                                                                                                         | Proves                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| SC1  | When `add` completes successfully, the system shall not call `triggerExternalSync`.                                                                                                                                                                                                      | #1285                  |
| SC2  | When a row is added, via the scoped path with a stub tracker that reports (i) an unrelated row's issue as having no assignee while the local row has one, and (ii) an unrelated `backlog` row's issue as bare `OPEN`, the system shall leave both unrelated rows byte-identical on disk. | #1285 end-to-end       |
| SC3  | If a tracker ticket reports no assignee and `forceSync` is not set, then the system shall not clear a non-null local assignee.                                                                                                                                                           | #1285 (a)              |
| SC4  | If a tracker ticket is `OPEN` and carries **no** disambiguating status label and `forceSync` is not set, then the system shall not overwrite a local `backlog` status.                                                                                                                   | #1285 (c)              |
| SC5  | When `forceSync` is set, the system shall still apply both overwrites in SC3 and SC4.                                                                                                                                                                                                    | escape hatch intact    |
| SC6  | When `add` runs against a configured stub tracker, the created row shall carry a non-null `External-ID`, and the serialized shard shall contain the `Assignee` / `Priority` / `External-ID` lines.                                                                                       | #1286                  |
| SC7  | When `syncRowToExternal` runs, the adapter shall receive no write call carrying any `externalId` other than the added row's, and at most one `createTicket` call.                                                                                                                        | #1285 + #1286          |
| SC8  | If a row's title already matches an existing labelled ticket, then `syncRowToExternal` shall link to it and shall not call `createTicket`.                                                                                                                                               | duplicate-issue safety |
| SC9  | If the tracker is configured but linking fails, then the `add` response shall report the failure and shall not be marked `isError`.                                                                                                                                                      | D5                     |
| SC10 | Existing serializer round-trip and legacy-omission tests shall continue to pass unmodified.                                                                                                                                                                                              | D4                     |
| SC11 | When a ticket is `OPEN` and carries an explicit `planned` label, the system shall promote a local `backlog` row to `planned`.                                                                                                                                                            | D3(c) provenance       |
| SC12 | When inbound sync suppresses an assignee clear or a `backlog` overwrite, the system shall record it in `SyncResult.suppressedInbound`.                                                                                                                                                   | D3(d)                  |
| SC13 | If `fetchAllTickets` fails, then `syncRowToExternal` shall call neither `createTicket` nor `updateTicket` and shall report the error.                                                                                                                                                    | D2 fail-closed         |
| SC14 | When inbound sync applies a status change to an assigned, non-machine-claimed row, the resulting row shall satisfy `assignee ≠ null ⟺ in-progress`.                                                                                                                                      | D3(b) / RMH005         |
| SC15 | When the widened `setStatus` routing releases an assignee, `SyncResult.assignmentChanges` shall report `to: null` for that feature — never the intermediate value the assignee block computed.                                                                                           | D3(b) report fidelity  |

## Implementation order

1. **Core guards (D3 a–d)** — `applyTicketToFeature`, the widened `setStatus` routing, the
   `suppressedInbound` type + population. Tests SC3, SC4, SC5, SC11, SC12, SC14.
2. **Core scoped push (D2)** — `syncRowToExternal` + barrel export. Tests SC7, SC8, SC13.
3. **Rebuild `packages/core`** so the CLI suite resolves the new export through `dist`.
4. **CLI wiring (D1, D5)** — `shouldTriggerExternalSync`, `triggerScopedExternalSync` with
   the seam, `handleAdd` push + response annotation. Tests SC1, SC2, SC6, SC9.
5. **Changeset + full verification** — lint, typecheck, build, `prettier --check`,
   `harness validate`, docs build. Confirm SC10 (existing tests untouched and passing).

## Follow-ups (out of scope)

- `update`, `remove`, and `promote` still route through `triggerExternalSync` → `fullSync`
  and retain a whole-repo blast radius. D3 blunts the damage; scoping them is the sequel.
- `autoSyncRoadmap` → `fullSync` fires from six call sites in
  `packages/cli/src/mcp/tools/state.ts`, so a state transition immediately after an `add`
  still triggers a whole-repo reconcile. Goal 1 does not cover it.
- The pre-existing `blocked` → `planned` guard shares D3(c)'s provenance blindness and
  should be made label-aware for symmetry.
- `roadmapHealth` could grow an advisory for rows with no `External-ID` while a tracker is
  configured. Deliberately not bundled here (YAGNI for this fix).
- In monolith mode an `add` now performs two whole-file rewrites (the row write, then the
  scoped push's writeback). Harmless but not ideal; sharded mode patches one shard.
