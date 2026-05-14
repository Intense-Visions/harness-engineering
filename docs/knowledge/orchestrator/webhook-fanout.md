---
type: business_process
domain: orchestrator
tags: [webhooks, hmac, fanout, delivery, event-bus, phase-3, phase-4]
phase: hermes-phase-0-phase-3
status: in-progress
---

# Webhook Fan-Out Pipeline

Phase 3 of Hermes Phase 0 introduces **out-of-process, HMAC-authenticated event delivery** — persistent webhook subscriptions that the orchestrator fans out to on every matching event-bus emit. This document is the dedicated business-process node for the fan-out pipeline; its parent is [`gateway-api.md`](./gateway-api.md) (the umbrella contract node). Phase 4 will expand this document significantly when the durable queue, retry ladder, and DLQ land — the Phase 3 surface intentionally pins the API shape Phase 4 will extend.

## Pipeline overview

```
┌──────────────────┐  emit(topic, payload)  ┌──────────────────┐
│  Orchestrator    │ ─────────────────────► │  wireWebhook-    │
│  (EventEmitter)  │                        │  Fanout listener │
└──────────────────┘                        └────────┬─────────┘
                                                     │  normalize topic (colon→dot)
                                                     │  store.listForEvent(eventType)
                                                     ▼
                                            ┌──────────────────┐
                                            │  segment-glob    │
                                            │  match per sub   │
                                            └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │ WebhookDelivery  │
                                            │ .deliver(sub,evt)│
                                            └────────┬─────────┘
                                                     │  POST sub.url
                                                     │  + 4 canonical headers
                                                     │  + HMAC SHA-256 sig
                                                     ▼
                                            ┌──────────────────┐
                                            │  Bridge endpoint │
                                            └──────────────────┘
```

Three pieces compose the pipeline: the `WebhookStore` (persistence layer), the `wireWebhookFanout` listener (subscription-aware bus subscriber), and the `WebhookDelivery` worker (signed HTTP POST). The three are wired together in `OrchestratorServer.start()` (`packages/orchestrator/src/orchestrator.ts:412-427`) and torn down via `webhookFanoutOff()` on stop.

## Subscription lifecycle

A subscription is identified by an opaque `sub_<16-hex>` id and has the public shape:

```ts
{
  id: string;          // sub_<16-hex>
  tokenId: string;     // the bearer-token that created this subscription
  url: string;         // https:// only
  events: string[];    // non-empty list of segment-glob patterns
  createdAt: string;   // ISO-8601
}
```

The internal shape adds `secret: string` (32 random bytes hex-encoded, plaintext at rest — see ADR 0011 § "Webhook secret storage model (Phase 3)" for the threat-model justification).

### Create

`POST /api/v1/webhooks` (scope `subscribe-webhook`) → `WebhookStore.create({ tokenId, url, events })`. The store generates the secret server-side, persists the new record to `.harness/webhooks.json` (atomic write + `fs.chmod(path, 0o600)`), emits `webhook.subscription.created` on the bus (so SSE subscribers see new subscriptions in real time), and returns the **single** plaintext-secret view (`{id, tokenId, url, events, secret, createdAt}`). The secret is never re-disclosed by any subsequent API call.

URL validation rejects `http://` URLs with 422 at the route layer (`packages/orchestrator/src/server/routes/v1/webhooks.ts`). The store layer accepts any string — the integration test (`webhooks-integration.test.ts`) seeds subscriptions through `store.create` directly to exercise delivery + signature without going through registration validation.

**Unauth-dev mutate warn-once.** When the orchestrator is operating in `unauth-dev` mode (tokens.json empty AND `HARNESS_API_TOKEN` unset), the first webhook-create request fires a one-time `console.warn` per process advising the operator that an unauthenticated webhook is being created. Subsequent creates do not warn. (Closes Phase 2 cycle-1 SUG-5 — same warn-once pattern as token-create.)

### Delete (revoke)

`DELETE /api/v1/webhooks/{id}` (scope `subscribe-webhook`) → `WebhookStore.delete(id)`. The store removes the record, persists, and emits `webhook.subscription.deleted`. Future bus events do not deliver to the revoked subscription. Revocation latency is bounded by the in-memory filter — the integration test pins **zero deliveries within 200 ms** after delete (well under the spec's 1-second tolerance) because `listForEvent` runs synchronously on every emit.

### List

`GET /api/v1/webhooks` (scope `subscribe-webhook`) → `WebhookStore.list()`. Returns **all** subscriptions regardless of the requesting token's ID — any holder of the `subscribe-webhook` scope can see every subscription (Phase 3 simplification; per-token filtering deferred to Phase 4). Secrets are stripped from every response item. The response shape is asserted **two ways** (DELTA-SUG-2 belt-and-braces): positive Object.keys allow-list (`['id', 'tokenId', 'url', 'events', 'createdAt']` exactly) and a JSON-stringify negative regex `/secret/i` so any future leak would fail both checks.

Similarly, `DELETE /api/v1/webhooks/:id` does not check ownership — any holder of `subscribe-webhook` scope can delete any subscription regardless of which token created it. This is a Phase 4 tightening item.

**Phase 4 carry-forward:** Phase 4 should add per-token ownership enforcement to `GET` (filter results to the requesting token's subscriptions) and `DELETE` (reject deletes where the requesting token did not create the subscription).

## Topic registry and normalization

The fan-out subscribes to a fixed set of orchestrator event-bus topics, declared in `WEBHOOK_TOPICS` (`packages/orchestrator/src/gateway/webhooks/events.ts`):

| Topic emitted by orchestrator  | Normalized event type          |
| ------------------------------ | ------------------------------ |
| `maintenance:started`          | `maintenance.started`          |
| `maintenance:completed`        | `maintenance.completed`        |
| `maintenance:error`            | `maintenance.error`            |
| `maintenance:baseref_fallback` | `maintenance.baseref_fallback` |
| `interaction.created`          | `interaction.created`          |
| `interaction.resolved`         | `interaction.resolved`         |
| `state_change`                 | `state_change`                 |
| `agent_event`                  | `agent_event`                  |
| `local-model:status`           | `local-model.status`           |

The colon-to-dot normalization (`events.ts:47`) is a transitional layer — orchestrator topics with colon separators predate the webhook surface and live in older callsites. New topics added in Phase 3+ should be dotted at the source so the normalization layer can be retired once the colon-form topics fade.

The two **subscription-lifecycle** topics emitted BY the fan-out (`webhook.subscription.created`, `webhook.subscription.deleted`) are not in `WEBHOOK_TOPICS` — they are observed on the SSE event channel (so dashboards see new subscriptions live) but the fan-out itself does NOT re-fan them out to webhooks (that would create a delivery loop where every subscription is notified of every other subscription's lifecycle).

## Segment-glob matching

`eventMatches(pattern, type)` in `packages/orchestrator/src/gateway/webhooks/signer.ts:43-51`. Intentionally narrow surface:

- Both pattern and type are split on `.`.
- Segment count must match (no `**` recursive wildcard).
- Each segment is either a literal match or a `*` (single-segment wildcard).

| Pattern         | Matches                                                                                             | Does NOT match                          |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `interaction.*` | `interaction.created`, `interaction.resolved`                                                       | `interaction.foo.bar` (3 segments vs 2) |
| `maintenance.*` | `maintenance.started`, `maintenance.completed`, `maintenance.error`, `maintenance.baseref_fallback` | `maintenance` (1 vs 2 segments)         |
| `*`             | `agent_event`, `state_change`                                                                       | `interaction.created` (2 segments)      |
| `*.*`           | any 2-segment type                                                                                  | any 1-segment or 3+-segment type        |
| `agent_event`   | `agent_event` exactly                                                                               | any other                               |

Minimatch features (`**`, `?`, brace expansion, character classes) are intentionally out of scope. If a future phase needs richer matching (e.g., negation patterns), revisit.

## Delivery worker

`WebhookDelivery.deliver(sub, event)` in `packages/orchestrator/src/gateway/webhooks/delivery.ts`. Each call POSTs the serialized `GatewayEvent` envelope to `sub.url` with four canonical headers:

| Header                  | Format                                                 |
| ----------------------- | ------------------------------------------------------ |
| `Content-Type`          | `application/json`                                     |
| `X-Harness-Delivery-Id` | `dlv_<8-byte-hex>` (per-delivery, not per-sub)         |
| `X-Harness-Event-Type`  | The normalized event type (e.g. `maintenance.started`) |
| `X-Harness-Signature`   | `sha256=<lowercase-hex>` of HMAC-SHA256(secret, body)  |
| `X-Harness-Timestamp`   | Unix millis at delivery emit (`String(Date.now())`)    |

**Body-verbatim signing.** The signature is computed against the exact bytes POSTed — bridges MUST verify against the raw body BEFORE parsing JSON. The integration test at `webhooks-integration.test.ts:40-51` records what the orchestrator POSTed and recomputes the HMAC against that recorded buffer to prove the contract holds.

**Timeout.** 3 seconds per delivery (`delivery.ts:22`, configurable via `DeliveryOptions.timeoutMs` for testing). Beyond timeout: `AbortController.abort()` cancels the fetch and the worker logs + drops.

**Failure handling (Phase 3 — best-effort).**

- Non-2xx response → `console.warn('[webhook] drop sub=<id> delivery=<id> status=<code> (Phase 3: no retry)')`.
- Network error / abort → `console.warn('[webhook] drop sub=<id> delivery=<id> error=<msg> (Phase 3: no retry)')`.

Failures do not throw, do not retry, do not enqueue. Phase 4 will replace this with a durable queue (see "Phase 4 extension points" below).

## Wiring into the orchestrator

`OrchestratorServer.start()` constructs the store + delivery worker as locals (not stored on `this` — Task 14 dropped the unused private fields after typecheck flagged them as `TS6133 declared but never read`). The fan-out returns an `off()` callback that drops every bus listener cleanly; it is stored as `this.webhookFanoutOff` and called on `stop()`:

```ts
const webhookStore = new WebhookStore(path.join(this.harnessDir, 'webhooks.json'));
const webhookDelivery = new WebhookDelivery();
this.webhookFanoutOff = wireWebhookFanout({
  bus: this.orchestrator, // Orchestrator extends EventEmitter
  store: webhookStore,
  delivery: webhookDelivery,
});
// ...passed into the route layer as deps.webhooks
```

The route handlers receive `{ store, delivery }` through `ServerDependencies.webhooks` — optional so `FakeOrchestrator`-based tests can pass no webhooks dep and the route table short-circuits to false on those request paths.

**Single-bus invariant.** The fan-out subscribes to `this.orchestrator`, which is the same emitter the SSE handler uses and the same emitter `InteractionQueue` receives via constructor injection. All three observers (SSE listeners, fan-out, WebSocket broadcaster) share one bus. `Orchestrator.constructor` calls `this.setMaxListeners(50)` to absorb the multi-observer subscribe-on-connect pattern (Node's default ceiling is 10).

## Test surface

Three test files cover the pipeline end-to-end:

| File                                                            | Coverage                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/orchestrator/src/gateway/webhooks/store.test.ts`      | 6 tests — create/get/list/delete/listForEvent/mode-0o600                                      |
| `packages/orchestrator/src/gateway/webhooks/signer.test.ts`     | 9 tests — sign/verify/timing-safe/glob-match                                                  |
| `packages/orchestrator/src/gateway/webhooks/delivery.test.ts`   | 3 tests — POST shape/timeout/error-handling                                                   |
| `packages/orchestrator/src/gateway/webhooks/events.test.ts`     | 2 tests — wire/normalize                                                                      |
| `packages/orchestrator/src/server/routes/v1/webhooks.test.ts`   | 8 tests — POST/DELETE/GET/422/secret-once/redact/warn-once                                    |
| `packages/orchestrator/src/server/webhooks-integration.test.ts` | 2 tests — full HMAC round-trip on real local HTTP receiver; DELETE stops fan-out within 200ms |

The integration test is the spec exit-gate proof for Phase 3 — it spins a real `http.createServer`, captures POSTs the orchestrator emits in response to a `maintenance:completed` bus event, and verifies the HMAC signature against the captured body using a ~5-line `verifyHmac` helper that any bridge can copy verbatim.

## Phase 4 extension points

Phase 4 will replace the in-memory delivery worker with a durable queue. The `WebhookDelivery.deliver(sub, event)` signature is intentionally what Phase 4 will subclass — additive only, no breaking changes to callers:

1. **SQLite-backed delivery queue.** Pending deliveries persist to `.harness/webhook-deliveries.db` so process restart does not drop in-flight deliveries. Schema: `(id, sub_id, event_type, body, headers_json, attempt_count, next_attempt_at, last_error, status)`.
2. **Exponential-backoff retry ladder.** Per spec D7: `1s / 5s / 25s / 2m / 10m / 1h` with ±20% jitter. After the 6th failed attempt, the delivery moves to the dead-letter queue.
3. **Dead-letter queue.** A separate table for deliveries that exhausted their retry budget. Operators can replay DLQ entries via a Phase 4 CLI command (`harness webhook replay <delivery-id>`). Subscriptions whose recent DLQ rate exceeds a threshold may be auto-paused.
4. **Drain-on-shutdown.** SIGTERM holds the process open until either the in-flight delivery completes or a 30-second drain window expires (configurable). Pending queue entries persist regardless; only in-flight HTTP calls drain.
5. **`Last-Event-ID` reconnection for SSE.** Same persistence layer the webhook queue introduces; SSE clients reconnecting send `Last-Event-ID: evt_<hex>` and the server replays missed frames from the persisted bus stream.

When Phase 4 ships, this document expands with the per-piece queue contracts, the retry-ladder rationale, the DLQ replay UX, and the drain-window operational guidance.

## Phase 4 — Delivery Durability

Delivery is now SQLite-backed (`better-sqlite3`, WAL mode). The queue lives at
`.harness/webhook-queue.sqlite` (mode 0600 is not enforced by SQLite itself —
operators should restrict permissions on the `.harness/` directory).

The Phase 4 retry ladder is **tighter** than the "extension points" sketch above:
`1s / 4s / 16s / 64s / 256s` (~5 minutes total). The Phase 0 proposal locked this
during planning to bound the worst-case time-to-DLQ at ~5 min so operators see
bridge problems within one alert window. The dead-letter threshold is the 6th
failed attempt.

Other deltas from the extension-points sketch:

- **File name** is `webhook-queue.sqlite` (not `webhook-deliveries.db`); the
  spec + plan converged on this name and the CLI assumes it.
- **CLI command** is `harness gateway deliveries list|retry|purge` (not
  `harness webhook replay`); deliveries are scoped under the gateway
  subcommand alongside `gateway token`.
- **Schema** is denormalized to a single `webhook_deliveries` table —
  dead-lettered rows live in the same table with `status = 'dead'`. No
  separate DLQ table; `purge --dead-only` and `list --status dead` are
  scope filters on the same rows.
- **Signing** is performed at delivery time by re-reading `sub.secret` from
  the WebhookStore (not stored in the queue row). Retries produce the same
  signature because secrets are immutable — rotation requires DELETE +
  recreate.

### Retry ladder

| Attempt | Delay before retry                   |
| ------- | ------------------------------------ |
| 1       | 1s                                   |
| 2       | 4s                                   |
| 3       | 16s                                  |
| 4       | 64s                                  |
| 5       | 256s (~4 min 16s)                    |
| 6       | DLQ (`status='dead'`, never retried) |

### Lease semantics (in_flight)

The queue uses a five-state machine: `pending → in_flight → delivered`, or
`pending → in_flight → failed → in_flight → … → dead`. The `in_flight` state
is a **lease**: `WebhookQueue.claim(now, limit)` runs a transaction that
selects deliverable rows AND marks them `in_flight` atomically, so overlapping
ticks (poll interval 500ms, HTTP timeout up to 5s) cannot double-claim the
same row. Without this lease, the same delivery would be POSTed multiple
times to the bridge.

On startup, `WebhookQueue.recoverInFlight()` resets any stranded `in_flight`
rows back to `failed` so the next tick picks them up. The semantics are
at-most-once-per-process and at-least-once across restarts (a row whose POST
succeeded but whose `markDelivered` was lost will be re-delivered — bridges
MUST be idempotent on `X-Harness-Delivery-Id`).

`stats()` reports five counters: `{ pending, inFlight, failed, dead,
delivered }`. The `GET /api/v1/webhooks/queue/stats` endpoint and the
dashboard surface all five.

### Concurrency cap

`maxConcurrentPerSub` (default 4) limits in-flight HTTP calls per
subscription. The semaphore is held in memory on the `WebhookDelivery`
instance, not persisted to SQLite — restarting the orchestrator effectively
resets the cap. This is acceptable because the cap is a flow-control device,
not a correctness invariant.

### Drain semantics

`WebhookDelivery.stop()` clears the polling timer, sets `draining = true`,
then awaits up to `drainTimeoutMs` (default 30s) for in-flight deliveries to
complete. Pending rows stay in the queue; only the executing HTTP calls
drain. The orchestrator's `stop()` awaits this drain before closing the
SQLite handle (`queue.close()`) so the WAL never sees a half-written row.

### CLI

```bash
# Inspect: newest 200 rows, optionally filtered by status or subscription.
harness gateway deliveries list [--status dead] [--subscription whk_...]

# Recover: reset a dead row to pending so the worker re-attempts it on the
# next tick. No-op (returns false, exit 1) if the row isn't in dead status.
harness gateway deliveries retry <delivery-id>

# Maintenance: bulk delete. --dead-only keeps the live queue intact;
# --older-than <ms> deletes delivered rows older than that age.
harness gateway deliveries purge [--dead-only] [--older-than <ms>]
```

Path override: `HARNESS_WEBHOOK_QUEUE_PATH` env var; defaults to
`.harness/webhook-queue.sqlite` under CWD. The CLI opens the file directly
so recovery commands work when the orchestrator is down.

### Dashboard

The `/webhooks` page polls `GET /api/v1/webhooks/queue/stats` at 1s and
renders a 5-cell panel (Pending, Retrying, In flight, Dead, Delivered). The
dead-row cell switches to a red highlight when `dead > 0`. Source of truth
is the SQLite queue; the panel never disagrees with the CLI's `list` output.

### Carry-forwards (Phase 4 → Phase 5)

- GET /api/v1/webhooks per-token filtering (list returns all subs for any
  `subscribe-webhook` token; no ownership filter yet).
- DELETE /api/v1/webhooks/:id ownership check (any `subscribe-webhook` token
  can delete any sub).
- DNS-rebinding risk on URL validator (syntactic guard only;
  resolution-time checking not yet implemented).
- `.harness/webhook-queue.sqlite` permissions — suggest `chmod 600` in
  ops guides; SQLite itself does not enforce mode 0600.

## Related

- Parent: [`docs/knowledge/orchestrator/gateway-api.md`](./gateway-api.md)
- ADR: [`docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md`](../decisions/0011-orchestrator-gateway-api-contract.md) — see § "Webhook secret storage model (Phase 3)"
- Phase 3 plan: [`docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-3-webhook-signing-plan.md`](../../changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-3-webhook-signing-plan.md)
- Spec: [`docs/changes/hermes-phase-0-gateway-api/proposal.md`](../../changes/hermes-phase-0-gateway-api/proposal.md)
