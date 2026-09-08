# The Waypoint spool shipper — the last mile from a local JSONL file to a live ledger

**Keywords:** waypoint, sdlc-emission, spool, shipper, ingest, pnyon, adr-0047, cold-start

> **STATUS: AWAITING SIGN-OFF. No implementation has begun.**
>
> The brainstorming Iron Law is that no code precedes human approval. Six decision forks are
> listed below; each carries a recommendation and the evidence behind it. **D1, D2 and D5 change
> the adopter-visible contract**, so they are the ones worth reading closely.

## Overview

Harness's `sdlc.*` emission layer is built, tested, and wired — and every event it produces stops
at a file on disk.

`packages/core/src/waypoint/` ships the emitter, spool, envelope, validation, scrubbing, and ULID
identity. Emission points are live in the MCP tools (roadmap, uat-signoff, acceptance-eval,
outcome-eval, interaction). `harness waypoint` exposes `record-provenance`, `record-handoff`, and
`status`. What it does not expose is any way to send an event anywhere. `spool.ts:182` says so
outright: `mergeSegments` "ships with the **(out-of-scope) shipper**."

ADR-0047 requires the other half: "Every emitter appends to a local repo-side JSONL spool first
**and ships with retry/backoff**, so harness works offline and adopters retain a local copy of
their exhaust." The spool is done. The shipping is not.

**The consequence is already visible in production.** Waypoint's wave forecasts cannot leave
cold start, because the ledger never accumulates the V2/V3 verification evidence that would end
it — and that evidence comes from harness eval verdicts, which spool locally and never ship.
GitHub webhooks are the only live ingestion path, and they cannot produce a verification grade.
This is not a new feature request; it is the missing connection between two systems that are
both already running.

Scope: **one component**. Read the spool, POST batches to a live endpoint, checkpoint what landed,
report honestly. No changes to emission, no changes to pnyon.

## What already exists on each side

Both ends are built. Neither is speculative — the endpoint below was probed live on 2026-09-07.

**Harness (read half, done):**

| Piece                         | Location                         | Note                                                    |
| ----------------------------- | -------------------------------- | ------------------------------------------------------- |
| `readSpoolSegments(spoolDir)` | `core/src/waypoint/spool.ts:152` | per-writer JSONL segments                               |
| `mergeSegments(segments)`     | `core/src/waypoint/spool.ts:186` | ULID-ordered merge, written _for_ this shipper          |
| `SdlcSpoolSegmentSnapshot`    | `types/src/waypoint.ts:164`      | `{ segmentId, lines, droppedEvents }`                   |
| `WaypointSinkConfig`          | `types/src/waypoint.ts`          | `transport: z.literal('spool')`, `source`, `onBehalfOf` |

**pnyon (write half, live):**

```
POST /outpost/<outpostId>/project/<projectId>/events
  header: x-pnyon-ingest-token: <token>     (constant-time compare; absent/blank ⇒ 401 on every POST)
  body:   [ <SdlcEvent>, ... ]              (a JSON array — batch is native, not a wrapper)

200 → { results: [{ id, result }], accepted, duplicate, invalid, scrubRejected, autoTrain }
      result ∈ "accepted" | "duplicate" | "invalid" | "scrub-rejected"
400 → { error: "body must be a JSON array of events" }
401 → { error: "unauthorized" }
```

Source: `pnyon src/services/waypoint/waypoint-gateway.ts:150-183`,
`ingest-service.ts:83-95`, `routes.ts`. Verified live:
`…/outpost/pnyon/project/pnyon/board` → `200`.

The response is **per-event**, which is what makes honest checkpointing possible: the shipper
never has to guess which events in a batch landed.

## Decisions

### D1 — Shipping is an addition to spooling, not an alternative transport

`transport` is `z.literal('spool')`. Adding shipping could widen it to `'spool' | 'pnyon'`, or
leave it alone and add a sibling block.

**Recommendation: a sibling `ship` block; `transport` stays `'spool'`.**

```jsonc
"waypoint": {
  "sink": {
    "transport": "spool",
    "ship": {
      "url": "https://waypoint-staging.pnyon.com",
      "outpost": "pnyon",
      "project": "pnyon"
      // token: PNYON_WAYPOINT_INGEST_TOKEN env, never committed
    }
  }
}
```

ADR-0047 says events are spooled **first** and _then_ shipped. Modelling shipping as an
alternative transport would encode the opposite — that you choose one or the other — and would
make "spool then ship" unrepresentable. It would also let a config edit silently stop writing the
adopter's local copy, which ADR-0047 guarantees them.

Absent `ship` ⇒ today's behaviour exactly. The non-adopter invariance contract (PRD Story 1) is
untouched: no `waypoint.sink`, no files, no I/O, no change.

### D2 — Project scope is configured, never derived

Every pnyon route needs `outpost` **and** `project`. Harness's config carries an Outpost inside
the `source` URI (`harness://outpost/<uuid>/repo/<name>`) and has no notion of a project at all.

Options: derive `project` from the repo basename; parse it out of `source`; require it explicitly.

**Recommendation: require both explicitly in the `ship` block.**

Deriving from a basename means two repos named `api` in different orgs write into the same
ledger. Writes are appends to a hash-chained, append-only log — a mis-scoped write cannot be
taken back, only compensated. A required field costs one line of config and removes the whole
class. Parsing `source` is worse than either: it silently couples an identity string to a routing
decision, so editing a display value would re-route production writes.

**This is a genuine fork if you intend the Outpost UUID in `source` to be authoritative** — say
so and the shipper reads it, but I would still require `project` separately.

### D3 — Checkpoint, never truncate

Nothing tracks what has been shipped. Options: (a) a checkpoint file; (b) delete or truncate
shipped lines; (c) re-ship everything and lean on server-side dedup.

**Recommendation: (a), a checkpoint file. Explicitly not (b).**

ADR-0047 promises adopters "retain a local copy of their exhaust." A shipper that truncates
converts the spool from _the adopter's own record_ into _a transmit queue_, silently deleting the
thing the ADR guaranteed. It is also unrecoverable if the ledger is ever re-projected.

(c) is safe — ULIDs are the idempotency key and re-sends return `duplicate` — but it re-uploads
the entire history on every run, which is O(total) forever and makes the honest `status` output
meaningless.

Proposed: `.harness/spool/.shipped.json`, mapping `segmentId → last shipped ULID`. Per-segment
because segments are per-writer and advance independently. ULID-keyed because ULIDs are
time-ordered, so "everything after this one" is a well-defined resume point without line offsets
that shift when a segment is rewritten at the cap.

### D4 — A permanently-rejected event advances the checkpoint and is recorded, never retried forever

`invalid` and `scrub-rejected` are terminal: the same bytes will be rejected identically on every
retry. If the checkpoint only advances on `accepted`, one malformed event wedges the pipeline
permanently and every later event silently stops shipping.

**Recommendation: treat `accepted` and `duplicate` as landed; treat `invalid` and
`scrub-rejected` as terminal — advance past them, append them to
`.harness/spool/rejected.jsonl` with the server's reason, and surface the count loudly in
`harness waypoint status`.**

Both halves matter. Blocking forever is the classic queue-wedge bug. Dropping silently is worse,
because `scrub-rejected` means the scrubber caught something — a signal the adopter needs to see,
not a statistic to bury. Neither a wedged pipeline nor a silent drop is acceptable; the
dead-letter file is what makes advancing safe.

### D5 — Explicit `harness waypoint ship` first; no automatic background flush

Options: an explicit command; an automatic flush on emit; both.

**Recommendation: explicit command only, this slice.**

An automatic flush puts a network call on the hot path of every sanctioned mutator — the exact
operations that must not slow down or acquire a new failure mode. It also makes the
non-adopter invariance contract harder to hold, and it is untestable without either a live
service or a much larger fake. An explicit command is observable, scriptable, cron-able, and
composes with CI. Auto-flush can be added later on top of a shipper that is already proven; it
cannot easily be removed once operations depend on it.

`harness waypoint ship [--dry-run] [--json] [--limit N]` — `--dry-run` reports what _would_ ship
without a single write, mirroring the backfill-CLI posture.

### D6 — Retry only what retrying can fix

**Recommendation:** exponential backoff with jitter on network errors and 5xx. **No retry on 400
or 401** — a malformed body or a bad token is a configuration fault, and retrying it turns a
clear, immediate error message into a slow one. Fail loudly, name the endpoint and which of
`ship.url` / `ship.outpost` / `ship.project` / the token is implicated.

Batch size default 500 events, `--limit` to override. Partial batch success is already handled:
the per-event `results` array tells the shipper exactly how far to advance.

## Success criteria

- **SC-1** WHEN `waypoint.sink.ship` is absent, THE SYSTEM SHALL behave exactly as today — no
  network calls, no new files, and `harness waypoint ship` exits 0 with an explanatory note.
- **SC-2** WHEN spooled events exist and the endpoint is reachable, THE SYSTEM SHALL POST them as
  a JSON array to `/outpost/<outpost>/project/<project>/events` and advance the checkpoint past
  every event reported `accepted` or `duplicate`.
- **SC-3** WHEN the shipper runs twice with no new events, THE SECOND run SHALL send no events
  and report zero shipped.
- **SC-4** WHERE the server reports an event `invalid` or `scrub-rejected`, THE SYSTEM SHALL
  advance past it, record it with its reason in `rejected.jsonl`, and report the count — never
  block the queue and never drop it silently.
- **SC-5** WHEN the endpoint returns 401 or 400, THE SYSTEM SHALL fail loudly without retrying
  and without advancing the checkpoint.
- **SC-6** THE SYSTEM SHALL never delete or truncate a spool segment.
- **SC-7** WHEN a partial batch succeeds, THE SYSTEM SHALL resume from the first unlanded event
  on the next run, sending no landed event a second time.
- **SC-8** `harness waypoint status` SHALL report unshipped count, last shipped ULID, and
  rejected count alongside its existing spool health.

## Assumptions

- **A1** The live contract is as probed on 2026-09-07 and pinned above. If pnyon's route space
  changes, this spec's §"What already exists" is the thing to re-verify first — the mismatch it
  replaces (harness #1816/#1977 against a `/v1/items` API that returns 404) is exactly what
  happens when a client is written against an assumed contract. **This spec pins a contract that
  was verified live, not one declared normative for someone else's service.**
- **A2** `PNYON_WAYPOINT_INGEST_TOKEN` is the operator-set secret on the pnyon side; the harness
  side reads its own env var and never commits a token.
- **A3** Ingest is idempotent on client-generated ULIDs (ADR-0047), so at-least-once delivery is
  safe and no server coordination is required.

## Implementation order

1. `ship` config block + loader (D1, D2) — SC-1.
2. Checkpoint store: read, advance, persist (D3) — SC-3, SC-6, SC-7.
3. HTTP client + batching against a mock of the contract above (D6) — SC-2, SC-5.
4. Terminal-rejection handling + `rejected.jsonl` (D4) — SC-4.
5. `harness waypoint ship` wiring + `status` extension (D5) — SC-8.
6. **Live proof against `waypoint-staging.pnyon.com`, reported with real counts.** Not optional:
   a mock-only pass is precisely how #1816 and #1977 both came to be complete, green, and
   unreachable.

## Evidence

- ADR-0047 (accepted) — spool-then-ship with retry/backoff; adopters retain their exhaust.
- Proposed ADR-0052 — pnyon owns the item model; harness emits rather than writing items. This
  shipper is the emission path that ADR names, and does not depend on 0052 being accepted:
  ADR-0047 already requires it.
- `spool.ts:182` — the shipper named as out-of-scope, with `mergeSegments` written to serve it.
- `waypoint-gateway.ts:150-183`, `ingest-service.ts:83-95` — the endpoint and report shape.
- Live probe 2026-09-07: `…/board` → 200; `/v1/items` → 404.
