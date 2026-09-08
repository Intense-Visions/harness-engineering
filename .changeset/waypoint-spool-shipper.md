---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add `harness waypoint ship` — send spooled `sdlc.*` events to a Waypoint ledger

Harness's `sdlc.*` emission layer was complete and wired, and every event it
produced stopped at a file on disk: `spool.ts` named the shipper "(out-of-scope)".
ADR-0047 requires emitters to append to a local spool **and ship with
retry/backoff**. This is that missing half.

- `shipSpool()` reads unshipped spool lines in ULID order, POSTs them as a JSON
  array to `/outpost/<outpost>/project/<project>/events`, and advances a
  checkpoint from the endpoint's per-event `results`.
- New `waypoint.sink.ship` config block (`url`, `outpost`, `project`,
  `batchSize`). It is a **sibling** of `transport`, not a replacement: events
  are spooled first and shipped after, so shipping is added to spooling rather
  than chosen instead of it. Absent `ship` means no network calls at all.
- `outpost` and `project` are both required and never derived. Two repos sharing
  a basename would otherwise write into one ledger, and an append to a
  hash-chained log cannot be taken back.
- The credential comes from `PNYON_WAYPOINT_INGEST_TOKEN` only, never from
  `harness.config.json`, so it cannot be committed.
- The spool is never truncated or deleted — ADR-0047 guarantees adopters keep a
  local copy of their exhaust, so progress is tracked in a sibling
  `.shipped.json` instead.
- Permanently-refused events (`invalid`, `scrub-rejected`) advance the
  checkpoint and are appended to `rejected.jsonl` with their reason. Blocking on
  them would re-send them forever; dropping them silently would bury a scrubber
  signal the adopter needs to see.
- Retries use exponential backoff on network errors and 5xx. A 400 or 401 is a
  configuration fault and is never retried — the error names the endpoint and
  which knob to turn.
- `harness waypoint status` now reports unshipped and permanently-refused counts.

Verified against the running staging service, not only against a mock: the
constructed URL returns `401` with a wrong token — proving the route resolves and
auth is enforced — where the previously-assumed `/v1/items` contract returns
`404` on the same host. An `accepted` write still needs the operator-held token.
