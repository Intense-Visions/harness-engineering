---
title: Waypoint tracker kind — `pnyon` RoadmapTrackerClient adapter + tracker-kind registry
issue: 1815
slug: waypoint-tracker-kind-pnyon
status: implemented
tier: medium
keywords:
  - roadmap
  - tracker
  - file-less
  - pnyon
  - waypoint
  - registry
  - TRACKER_CONFLICT
  - evidence-ledger
---

# Waypoint tracker kind — `pnyon`

> Open the file-less tracker seam: a `PnyonTrackerAdapter` implementing the
> existing `RoadmapTrackerClient` interface against a documented Waypoint HTTP
> API contract, plus a tracker-kind registry so
> `loadTrackerClientConfigFromProject` resolves registered non-GitHub kinds
> instead of hard-rejecting them. GitHub behavior preserved byte-for-byte;
> the adapter performs zero GitHub writes.

## Overview and goals

Downstream: pnyon/pnyon#125 ("Waypoint harness adaptation — pnyon
RoadmapTrackerClient kind"). pnyon ADR-0047 accepts **Waypoint** — a hosted,
multi-tenant, event-sourced SDLC ledger — as pnyon's roadmap provider,
consumed by harness **through the existing file-less tracker seam**: the
`RoadmapTrackerClient` interface
(`packages/core/src/roadmap/tracker/client.ts` — fetchAll / fetchById /
fetchByStatus / create / update / claim / release / complete / appendHistory /
fetchHistory), ETag caching, and the synthesized `ConflictError` code
`TRACKER_CONFLICT`.

The seam exists but is closed in two places:

1. `createTrackerClient` (`packages/core/src/roadmap/tracker/factory.ts`)
   hardcodes exactly two kinds: `github-issues` and `linear`.
2. `loadTrackerClientConfigFromProject`
   (`packages/core/src/roadmap/load-tracker-client-config.ts`) hard-rejects
   any `roadmap.tracker.kind` other than `"github"`.

**Goals (this slice):**

1. **`PnyonTrackerAdapter`** in core beside the existing adapters
   (`packages/core/src/roadmap/tracker/adapters/pnyon.ts`), implementing the
   existing interface against a documented Waypoint HTTP API contract defined
   as a typed client module
   (`packages/core/src/roadmap/tracker/adapters/waypoint-http.ts`):
   - **Claims map to `sdlc.claim` event semantics.** `claim` issues a
     `sdlc.claim.opened.v1` command; `release` a `sdlc.claim.released.v1`;
     `complete` a `sdlc.intent.closed.v1`. All mutations carry an
     **event-version precondition**; a stale version is rejected server-side
     (HTTP 409) and surfaced as `ConflictError` code `TRACKER_CONFLICT` —
     the exact contract consumers handle today. First-claim-wins CAS survives
     the backend swap.
   - **History rides the evidence ledger.** `appendHistory` appends an
     evidence entry via the command API; `fetchHistory` reads the ledger back
     ordered.
   - **Zero GitHub writes.** The adapter performs no GitHub API calls of any
     kind. Machine actors are never pushed to GitHub's assignee field
     (harness #640): in pnyon mode the GitHub projection (issues, labels,
     human-reserved assignee field) is **Waypoint-side scope**, downstream of
     the ledger — never the adapter's.
2. **Tracker-kind registry**
   (`packages/core/src/roadmap/tracker/registry.ts`): registered kinds carry
   a project-config loader and a client factory hook.
   `loadTrackerClientConfigFromProject` keeps its `github` path **byte-for-
   byte** and consults the registry for other kinds; unregistered kinds are
   rejected with an error listing the registered kinds. `createTrackerClient`
   keeps its `github-issues` and `linear` branches untouched and falls back to
   the registry before its final "Unsupported tracker kind" error — so future
   kinds plug in with no factory modification.
3. **Contract tests** against an in-memory mock Waypoint API fixture covering
   every interface method, conflict synthesis, claim idempotency, ETag reuse,
   the no-GitHub-dependency audit, and file-less handler semantics (groom
   unsupported → error; sync → no-op), mirroring the existing file-less
   handler expectations.

**Non-goals (owned elsewhere; deliberately untouched here):**

- `sdlc.*` event **emission**, gateway webhook topics, spool shipping — the
  sibling pnyon adaptation (FR-9.1), built in a parallel lane. This change
  does not touch emission/gateway/webhook-topic files.
- The Waypoint service itself and its GitHub downstream projection — pnyon
  scope. This spec pins the API contract the service must satisfy.
- The file-backed sync engine (`roadmap.tracker.kind: "github"` + statusMap;
  `loadTrackerSyncConfig`) — unchanged; it returns `null` for pnyon configs,
  correctly disabling the GitHub sync engine in pnyon mode.
- Cast/multi-assignee fields on RoadmapFeature; pilot/fleet scoring changes.

## Waypoint HTTP API contract (normative for the service)

The typed client module `waypoint-http.ts` **is** the documented contract.
The real Waypoint service ships later in pnyon (ASSUMPTION A1); it must
satisfy these shapes. Base URL is `roadmap.tracker.url` (the per-Outpost API
base, e.g. `https://waypoint.pnyon.com/o/<outpost-id>`). Auth is
`Authorization: Bearer <token>` (config `token` or `PNYON_TOKEN` env).

| Operation       | HTTP                                  | Notes                                                                                                             |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| List items      | `GET /v1/items`                       | `?status=a,b` filter; `If-None-Match` honored, `ETag` returned; 304 on unchanged                                  |
| Read item       | `GET /v1/items/{id}`                  | 404 → null; `If-None-Match`/`ETag`/304 as above                                                                   |
| Create item     | `POST /v1/items`                      | body: NewFeatureInput projection; appends `sdlc.intent.created.v1`; returns the item                              |
| Mutate item     | `POST /v1/items/{id}/commands`        | body: `{ type, expectedVersion, patch? \| actor? }`; 409 `version_conflict` carries `{ currentVersion, current }` |
| Append evidence | `POST /v1/items/{id}/evidence`        | body: HistoryEvent projection; returns 204/200                                                                    |
| Read evidence   | `GET /v1/items/{id}/evidence?limit=N` | ordered oldest→newest `{ events: [...] }`                                                                         |

**Item shape** (`WaypointItem`): `{ id (ULID), name, status (harness
six-status projection), summary, spec, plans, blockedBy, assignee, priority,
milestone, createdAt, updatedAt, version (event version, monotonically
increasing per appended event) }`. External id: `pnyon:<ULID>`.

**Command types** map onto the pinned `sdlc.*.v1` vocabulary
(pnyon `docs/architecture/waypoint/sdlc-event-schema.md`):
`update` → `sdlc.intent.updated.v1`; `claim` → `sdlc.claim.opened.v1`;
`release` → `sdlc.claim.released.v1`; `complete` → `sdlc.intent.closed.v1`.

**Conflict semantics:** every command carries `expectedVersion`. When the
item's current version differs, the server appends **nothing** and returns
409 with the current item; the adapter synthesizes
`ConflictError('TRACKER_CONFLICT')` whose diff compares the intended patch
against the server's current state (via the shared `refetchAndCompare`
policy) and whose `serverUpdatedAt` is the current item's `updatedAt`.
Conflicts are never retried destructively — exactly one event lands for the
winning mutation.

**Claim idempotency:** `sdlc.claim.opened.v1` for an item **already claimed
by the same assignee** is a server-side no-op success (idempotent — returns
the current item, appends no event). A claim while claimed by a **different**
assignee is a 409 conflict regardless of version.

**ETag/version duality:** the HTTP `ETag` for a single item is its event
version (stringified). `ifMatch` on the interface therefore doubles as the
`expectedVersion` precondition. When `ifMatch` is omitted the adapter fetches
the current version first and uses it — the server-side precondition still
closes the read-modify-write race (the loser gets 409).

## Design

```
load-tracker-client-config.ts ──(kind !== 'github')──▶ registry.loadProjectConfig
createTrackerClient (factory.ts) ──(unknown kind)────▶ registry.create
registry.ts ── registers builtin 'pnyon' ────────────▶ adapters/pnyon.ts
adapters/pnyon.ts (PnyonTrackerAdapter) ─────────────▶ adapters/waypoint-http.ts (typed contract)
```

- `registry.ts` is generic (imports only `client.ts` types + `Result`); no
  import cycle: `factory.ts → registry.ts → adapters/pnyon.ts → client.ts`.
- `PnyonTrackerClientConfig { kind: 'pnyon'; url; token?; etagStore? }` is
  declared in `adapters/pnyon.ts` and added to factory's
  `TrackerClientConfig` union (type-only change there).
- CLI `TrackerConfigSchema` becomes a discriminated union: the existing
  `github` object schema **unchanged**, plus a `pnyon` variant
  `{ kind: 'pnyon', url: string (URL), token?: string }` — so
  `harness validate` accepts pnyon configs instead of failing the literal.
- File-less `manage_roadmap` semantics need no per-adapter work — the
  file-less handler already translates actions generically; contract tests
  prove `groom → error("only supported in file-based roadmap mode")` and
  `sync → no-op` through a `PnyonTrackerAdapter` instance.

## Success criteria

- **SC1 (registry opening):** `loadTrackerClientConfigFromProject` returns
  `Ok({ kind: 'pnyon', url, token? })` for a valid pnyon config; missing
  `url` fails at load time naming the missing field; unregistered kinds
  (e.g. `jira`) fail with an error listing registered kinds. All existing
  loader tests pass unmodified (github byte-for-byte).
- **SC2 (factory):** `createTrackerClient({ kind: 'pnyon', url, token })`
  returns a `PnyonTrackerAdapter`; missing token (config + env) is an
  actionable `Err`; existing `github-issues`/`linear`/unsupported-kind tests
  pass unmodified.
- **SC3 (interface parity):** every `RoadmapTrackerClient` method round-trips
  against the in-memory mock Waypoint API (create → fetchAll/fetchById/
  fetchByStatus → update → claim → release → complete → appendHistory →
  fetchHistory ≥10 entries order-preserved).
- **SC4 (conflict contract):** a stale-version mutation and a racing second
  claimant each surface `ConflictError` with `code === 'TRACKER_CONFLICT'`,
  a populated diff, and no destructive retry (mock ledger shows exactly one
  event for the winner).
- **SC5 (claim idempotency):** re-claiming with the same assignee succeeds
  without appending a second claim event.
- **SC6 (ETag):** an unchanged `fetchAll`/`fetchById` reuses the cached
  representation via `If-None-Match`/304 (request-count asserted).
- **SC7 (no GitHub writes, #640):** the adapter modules import nothing
  GitHub-related and the mock transport observes only `url`-rooted requests
  during a full method sweep — machine claims exist only in Waypoint.
- **SC8 (file-less semantics):** through the file-less `manage_roadmap`
  handler with a pnyon adapter, `groom` errors as unsupported and `sync` is
  the documented no-op, matching existing file-less expectations.
- **SC9 (repo gates):** typecheck, lint, affected tests + coverage ratchet,
  barrels/docs/tool-catalog checks, and `harness ci check` all green; a
  changeset covers the published packages touched.

## Assumptions

- **A1 (service ships later):** no live Waypoint service exists yet; the
  typed client module in this change is the normative API contract the
  pnyon-side service must satisfy. Contract tests run against an in-memory
  mock implementing this spec.
- **A2 (six-status projection):** the read API serves harness's six-status
  projection directly in `status` (Waypoint's seven-lane reducer output maps
  losslessly per ADR-0047); `blocked`/`needs-human` arrive as statuses, not
  computed flags, at this seam.
- **A3 (actor duality is server-side):** the adapter sends the assignee/actor
  as an opaque principal string; agent-vs-human duality (`onBehalfOf`) is
  resolved by the service from the authenticated token, not modeled at this
  seam.
- **A4 (token env):** `PNYON_TOKEN` is the env fallback for the adapter
  credential, mirroring `GITHUB_TOKEN`/`LINEAR_API_KEY`.
- **A5 (linear stays loader-invisible):** `loadTrackerClientConfigFromProject`
  continues not to resolve `linear` (as today); only `pnyon` is registered as
  a builtin. Registering linear is a separate decision.

## Evidence

- pnyon/pnyon#125; pnyon PRD
  `docs/product-requirements/waypoint-harness-adaptation-pnyon-roadmaptrackerclient-kind/prd.md`
  (US-1…US-7); pnyon ADR-0047; pnyon
  `docs/architecture/waypoint/sdlc-event-schema.md` (envelope, `sdlc.*.v1`
  vocabulary, ULID identity).
- harness seam: `packages/core/src/roadmap/tracker/client.ts` (interface +
  `ConflictError`/`TRACKER_CONFLICT`), `factory.ts`, `conflict.ts`
  (`refetchAndCompare`), `load-tracker-client-config.ts`,
  `packages/cli/src/mcp/tools/roadmap-file-less.ts` (groom/sync semantics).
- harness #640 (machine actors vs GitHub assignee field), #1285/#1327/#839
  (destructive bidirectional-sync trail motivating projection-only GitHub).
