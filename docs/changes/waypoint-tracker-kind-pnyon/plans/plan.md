# Plan — Waypoint tracker kind `pnyon` (#1815)

Spec: `docs/changes/waypoint-tracker-kind-pnyon/proposal.md`
Closing keywords: `Closes #1815`; downstream `Closes pnyon/pnyon#125`.

## Phase 1 — Typed Waypoint API contract (core)

- **T1.1** `packages/core/src/roadmap/tracker/adapters/waypoint-http.ts` —
  typed client for the documented contract: `WaypointItem`,
  `WaypointCommand`, `WaypointEvidenceEntry`, `WaypointHttp`
  (`listItems(statuses?, ifNoneMatch?)`, `getItem(id, ifNoneMatch?)`,
  `createItem(input)`, `postCommand(id, command)` → discriminated
  `applied | version_conflict`, `appendEvidence(id, entry)`,
  `listEvidence(id, limit?)`). Bearer auth; injectable `fetchFn`;
  structured `WaypointHttpError` for non-2xx/304/409.

## Phase 2 — PnyonTrackerAdapter (core)

- **T2.1** `packages/core/src/roadmap/tracker/adapters/pnyon.ts` —
  `PnyonTrackerAdapter implements RoadmapTrackerClient`,
  `PnyonTrackerOptions { url, token, fetchFn?, etagStore? }`,
  `PnyonTrackerClientConfig { kind: 'pnyon', url, token?, etagStore? }`.
  - externalId `pnyon:<id>`; ETagStore reuse (`feature:`/`list:all` keys,
    write-path invalidation) mirroring the GitHub adapter.
  - `update/claim/release/complete` → commands with `expectedVersion` =
    `ifMatch` ?? freshly fetched version; 409 → `ConflictError`
    (`TRACKER_CONFLICT`) with `refetchAndCompare`-derived diff and
    `serverUpdatedAt`.
  - `appendHistory`/`fetchHistory` → evidence ledger endpoints.

## Phase 3 — Registry + loader + factory opening (core)

- **T3.1** `packages/core/src/roadmap/tracker/registry.ts` — generic
  `TrackerKindRegistration { kind, loadProjectConfig, create }` +
  `registerTrackerKind` / `getTrackerKindRegistration` /
  `listRegisteredTrackerKinds`; registers builtin `pnyon`.
- **T3.2** `load-tracker-client-config.ts` — `github` path byte-for-byte;
  other kinds consult the registry (`loadProjectConfig(tracker, root)`);
  unregistered → Err listing `"github"` + registered kinds.
- **T3.3** `factory.ts` — add `PnyonTrackerClientConfig` to the union
  (type import from `adapters/pnyon`); after the existing two branches,
  fall back to `registry.create`; final Err unchanged for unregistered.
- **T3.4** `tracker/index.ts` barrel — append (not reorder) pnyon +
  registry exports; run `pnpm generate:barrels` + `--check`.

## Phase 4 — CLI config schema (additive)

- **T4.1** `packages/cli/src/config/schema.ts` — `TrackerConfigSchema`
  becomes a discriminated union on `kind`: existing github object schema
  unchanged + `PnyonTrackerConfigSchema { kind: 'pnyon', url: url(),
token?: string }`.

## Phase 5 — Contract tests

- **T5.1** `packages/core/tests/roadmap/tracker/adapters/waypoint-mock.ts`
  — in-memory mock Waypoint API implementing the contract (items, event
  versions, per-item evidence ledgers, ETag/304, 409 version_conflict,
  same-assignee claim idempotency) as an injectable `fetchFn` + inspection
  surface (`ledger(id)`, `requestCount`).
- **T5.2** `.../pnyon.test.ts` — SC3 method sweep, SC4 conflict + race,
  SC5 claim idempotency, SC6 ETag/304 request counts, SC7 dependency +
  request-host audit, loader/factory SCs (SC1/SC2), registry unit tests.
- **T5.3** `packages/cli/tests/mcp/tools/roadmap.file-less-pnyon.test.ts`
  — SC8 groom/sync semantics through `handleManageRoadmapFileLess` with a
  `PnyonTrackerAdapter` over the mock; plus schema-accepts-pnyon test.

## Phase 6 — Integration & gates

- **T6.1** Changeset (minor: core, cli). Barrels/docs/tool-catalog checks.
- **T6.2** `provenance.json` for this change dir.
- **T6.3** Full local gates: build, affected typecheck/tests + coverage
  ratchet, prettier, `harness ci check` via hooks (no `--no-verify`).

## Verification (WIRED)

Trace: `harness.config.json { roadmap: { mode: 'file-less', tracker:
{ kind: 'pnyon', url } } }` → `loadTrackerClientConfigFromProject` →
registry `loadProjectConfig` → `TrackerClientConfig` union →
`createTrackerClient` → registry `create` → `PnyonTrackerAdapter` →
`WaypointHttp` → (mock) Waypoint API; file-less `manage_roadmap` actions
translate through the untouched generic handler.
