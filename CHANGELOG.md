# Changelog

All notable changes to this project will be documented in this file.

This project uses [Changesets](https://github.com/changesets/changesets) for versioning.

## [Unreleased]

### Added

- **Orchestrator Gateway API — Phase 6 reference Slack bridge** — Ships `examples/slack-echo-bridge/` as the canonical external test consumer for the Phase 0 gateway API. Standalone Node project (NOT in the pnpm workspace) — installable by an external author with `npm install` against published `@slack/web-api` only; zero harness-engineering source dependency. The bridge HTTP listener (`src/webhook-handler.ts`) captures the raw request body before JSON parsing (the load-bearing HMAC-correctness property), verifies `X-Harness-Signature: sha256=<hex>` via `node:crypto`'s `createHmac` + `timingSafeEqual` with a length-mismatch guard (`src/signer.ts`), filters to `event.type === 'maintenance.completed'`, and dispatches to a thin `WebClient.chat.postMessage` wrapper (`src/slack-client.ts`) with a Slack-error-verbatim surface (502 detail on transport failure). The README documents the env-var contract (`HARNESS_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`), the operator workflow for capturing the one-time secret from `POST /api/v1/webhooks`, the 5-line HMAC-verify snippet authors can crib into other languages, and the intentional known properties (no idempotency suppression, single event type, verbatim Slack errors). 14 vitest cases cover the HTTP flow with the HMAC recomputed exactly as the orchestrator does — `__tests__/fixtures.ts:signBody` mirrors `packages/orchestrator/src/gateway/webhooks/signer.ts` byte-for-byte: signer correctness (6 cases — happy, length-mismatch, tamper, wrong-secret, malformed-header, undefined-header) and HTTP semantics (8 cases — happy, invalid-sig, unsupported-type, Slack-fails, invalid-json-body, 404, oversized-body 413, SIGTERM smoke). **Code complete; live end-to-end run against a real orchestrator + Slack workspace deferred — operational verification of spec §870 exit gate pending.** Closes the §672 ("reference bridge built") and §685 ("external test consumer exists") success gates for the Hermes Phase 0 program (code-level); §870 (operational) carries forward as open verification. (`examples/slack-echo-bridge`)
- **Orchestrator Gateway API — Phase 5 telemetry export (OTLP/HTTP + cache stats + telemetry.\* fanout)** — Ships an in-tree, hand-rolled OpenTelemetry exporter that publishes three trace kinds (`maintenance_run`, `skill_invocation`, `dispatch_decision`) to a configurable OTel collector endpoint, plus a corresponding `telemetry.*` webhook fanout and a prompt-cache insights widget. The exporter (`packages/core/src/telemetry/exporter/otlp-http.ts`) is fire-and-forget — `push(span)` is synchronous O(1), the buffer flushes on a 2 s timer (default) or when `batchSize` (default 64) is hit, and failed flushes retry 3 times with 1 s/2 s/4 s backoff before dropping the batch with a single `console.warn`. `enabled: false` converts `push()` into a constant-time no-op; measured p99 added overhead at dispatch is well below 1 ms against an unreachable endpoint (worst case). Zero new runtime dependencies — wire format is the OTLP/HTTP v1.0.0 JSON envelope (`{ resourceSpans: [{ resource, scopeSpans: [{ scope: {name: 'harness'}, spans }] }] }`) with stringly-typed nanosecond timestamps. **Telemetry fanout module** (`packages/orchestrator/src/gateway/telemetry/fanout.ts`) subscribes to `maintenance:started`, `maintenance:completed`, `maintenance:error`, `skill_invocation`, `dispatch:decision` and emits both an OTel span AND a corresponding `GatewayEvent` with the `telemetry.<topic>` type — trace correlation via an in-memory `ActiveRunRegistry` so child events (skill_invocation, dispatch_decision) inherit the parent maintenance run's `traceId` and set `parentSpanId = maintenance_run.spanId`. **Wildcard exclusion** — `eventMatches` in `packages/orchestrator/src/gateway/webhooks/signer.ts` now refuses to match `telemetry.*` events against `*.*` patterns; operators must opt in explicitly with `events: ['telemetry.*']` or a specific topic. Pre-existing `interaction.*` / `maintenance.*` subscriptions are unaffected. **Prompt-cache metrics** — `CacheMetricsRecorder` (`packages/core/src/telemetry/cache-metrics.ts`) is a 1000-record ring buffer; `ClaudeBackend` records on every Anthropic response. New route `GET /api/v1/telemetry/cache/stats` (scope `read-telemetry`, registered in `v1-bridge-routes.ts`) returns `{totalRequests, hits, misses, hitRate, byBackend, windowStartedAt}`; 503 when no recorder is wired. New dashboard page `/insights/cache` (also reachable at `/s/insights-cache`) polls the endpoint at 5 s and renders a hit-rate big number, a dependency-free SVG sparkline of the last 60 samples, a per-backend breakdown table, and a "No prompt-cache activity recorded yet" empty state. **Config schema** (`packages/cli/src/config/schema.ts`) accepts `telemetry.export.otlp = { endpoint, enabled?, headers?, flushIntervalMs?, batchSize? }`; `WorkflowConfig.telemetry?: { export?: { otlp?: OTLPExportConfig } }` threads it through to the orchestrator. **Wiring** — `Orchestrator` constructs `CacheMetricsRecorder` unconditionally (so the factory can pass it to any Anthropic-capable backend), instantiates `OTLPExporter` only when the config supplies an endpoint, and wires `wireTelemetryFanout({bus, exporter, webhookDelivery, store})`. `start()` calls `exporter.start()`; `stop()` removes the fanout listeners, awaits `exporter.stop()` (which flushes remaining buffered spans), then drains the webhook worker. **Tests** — 4 fanout tests assert OTel+webhook fan-out, `*.*` exclusion, traceId/parentSpanId correlation, and unsub teardown; integration test `telemetry-end-to-end.test.ts` drives a 4-event sequence through a real in-process OTLP receiver and asserts the receiver got correlated spans + 4 webhook deliveries on the `telemetry.*` sub; latency test `telemetry-latency.test.ts` runs 200 mock dispatches and asserts p99 delta < 5 ms vs disabled-exporter baseline; E2E smoke `telemetry-otel-collector.e2e.test.ts` (gated behind `HARNESS_E2E=1`) spins `otel/opentelemetry-collector-contrib` via `testcontainers` (new devDependency) with a logging-pipeline config and greps the container logs for our trace names. New CLI route in `v1-bridge-routes.ts`; new SystemPage `insights-cache` in the dashboard router; new ADR [0012](docs/knowledge/decisions/0012-telemetry-export-otlp-http.md) covers the transport choice (hand-rolled OTLP/HTTP JSON vs official SDK vs gRPC); new knowledge doc [`docs/knowledge/orchestrator/telemetry-export.md`](docs/knowledge/orchestrator/telemetry-export.md) documents trace kinds, attribute keys (`harness.skill`, `harness.outcome`, `harness.turns`, `harness.tool_calls`, `harness.tokens.input/output`, `harness.cache.hit/miss`), correlation model, OTLP envelope shape, and config example; the sibling [`webhook-fanout.md`](docs/knowledge/orchestrator/webhook-fanout.md) gains a "Telemetry events on the fanout (Phase 5)" subsection documenting the `*.*` exclusion + opt-in patterns; [`gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md) gains a Telemetry section pointing at the knowledge doc and documenting the new `/api/v1/telemetry/cache/stats` endpoint. (`@harness-engineering/orchestrator`, `@harness-engineering/core`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
- **Orchestrator Gateway API — Phase 4 delivery durability** — Webhook delivery moves from Phase 3's in-memory best-effort `deliver()` to a SQLite-backed queue worker. `WebhookQueue` (`packages/orchestrator/src/gateway/webhooks/queue.ts`) opens `.harness/webhook-queue.sqlite` in WAL mode (`pragma('journal_mode = WAL')` + `synchronous = NORMAL`), schema is `STRICT` with a partial index `idx_deliverable` on `(status, nextAttemptAt) WHERE status IN ('pending', 'failed')` so the tick scan never reads delivered or dead rows. The `WebhookDelivery` constructor now takes `{queue, store, timeoutMs?, fetchImpl?, tickIntervalMs?, maxConcurrentPerSub?, drainTimeoutMs?}`; `enqueue(sub, event)` inserts a row (`dlv_<8-byte-hex>` id, body serialized but unsigned), and `start()` runs a `setInterval` tick loop that pulls pending/failed rows whose `nextAttemptAt <= Date.now()`, dispatches under a per-subscription concurrency semaphore (`maxConcurrentPerSub = 4` default), signs at delivery time by re-reading `sub.secret` (signing is idempotent — secrets rotate only via DELETE+recreate), and either marks delivered or fails into the retry ladder `[1s, 4s, 16s, 64s, 256s]` with dead-letter at the 6th failure (`MAX_ATTEMPTS = 5`). `stop()` flips a `draining` flag, clears the interval, and polls the `inFlight` map every 100ms up to `drainTimeoutMs` (30s default) so SIGTERM never abandons in-flight POSTs. Deleted subscriptions dead-letter their queued rows on the next tick (`'subscription deleted'` `lastError`). `Orchestrator.start()` instantiates the queue, calls `delivery.start()`; `Orchestrator.stop()` awaits `delivery.stop()` then `queue.close()`. New REST route `GET /api/v1/webhooks/queue/stats` (scope `subscribe-webhook`, registered in `v1-bridge-routes.ts`) returns `{pending, failed, dead, delivered}` from `queue.stats()` — a single aggregate `COUNT(*) GROUP BY status` query. New CLI command group `harness gateway deliveries list|retry|purge` (`packages/cli/src/commands/gateway/deliveries.ts`) opens the queue at `process.env['HARNESS_WEBHOOK_QUEUE_PATH'] ?? .harness/webhook-queue.sqlite`; `list` accepts `--status` and `--subscription` filters, `retry <id>` resets a dead row to `pending`, `purge` accepts `--dead-only` and `--older-than <ms>`. The dashboard `/s/webhooks` page polls the stats endpoint at 1s and renders a 4-cell panel (`Pending` / `Retrying` / `Dead` / `Delivered`) with the `Dead` cell turning red when non-zero. `WebhookQueue`, `QueueStats`, `QueueRow`, `MAX_ATTEMPTS`, `RETRY_DELAYS_MS`, `QueueInsertInput` are exported from `@harness-engineering/orchestrator` so external tooling can open the same SQLite file. `WebhookDelivery` type and `WebhookDeliveryStatus` enum land in `@harness-engineering/types` as the shape contract. Durability is proven by the integration test that opens two `WebhookQueue` instances against the same `.sqlite` path across a `close()`+`new` boundary and asserts the row survives — the WAL pragma is the load-bearing property, not a mock. New dependency: `better-sqlite3 ^12.10.0` (synchronous binding chosen over async libsql to simplify the drain loop). See [`docs/knowledge/orchestrator/webhook-fanout.md`](docs/knowledge/orchestrator/webhook-fanout.md) § "Phase 4 — Delivery Durability" for the retry-ladder table, CLI surface, and Phase 4 → Phase 5 carry-forwards (per-token GET filtering, DELETE ownership check, DNS-rebinding URL validation, `.sqlite` file permissions). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
- **Orchestrator Gateway API — Phase 3 webhook subscriptions + HMAC signing (in-memory delivery)** — Three new routes under `/api/v1/webhooks` (handlers in `packages/orchestrator/src/server/routes/v1/webhooks.ts`): `POST /api/v1/webhooks` creates a subscription, validates `https://`-only URLs (rejects `http://` with 422), generates a 32-byte base64url secret server-side, persists, and returns the **one-time** plaintext view `{id, tokenId, url, events, secret, createdAt}`; `DELETE /api/v1/webhooks/{id}` revokes (fan-out cutoff within ~200ms — synchronous filter runs on every emit); `GET /api/v1/webhooks` lists secret-redacted subscriptions for the bearer's tokenId (response shape pinned via positive Object.keys allow-list assertion + JSON-stringify negative `/secret/i` regex — belt-and-braces). All three require the `subscribe-webhook` scope. HMAC SHA-256 signing in `packages/orchestrator/src/gateway/webhooks/signer.ts` produces `X-Harness-Signature: sha256=<lowercase-hex>` over the verbatim request body; each delivery POSTs serialized `GatewayEvent` envelopes with the canonical 4-header set (`X-Harness-Signature`, `X-Harness-Delivery-Id` (`dlv_<8-byte-hex>`), `X-Harness-Event-Type`, `X-Harness-Timestamp`). Bridges verify with a ~5-line stdlib snippet (`createHmac('sha256', secret).update(rawBody).digest('hex')` + `timingSafeEqual`); the integration test at `packages/orchestrator/src/server/webhooks-integration.test.ts:40-51` recomputes the HMAC against the recorded POST buffer and IS the spec exit-gate proof. `WebhookStore` (`packages/orchestrator/src/gateway/webhooks/store.ts`) persists subscriptions to `.harness/webhooks.json` with `fs.chmod(path, 0o600)` after every write — secrets plaintext at rest per ADR 0011 § "Webhook secret storage model (Phase 3)" (industry pattern at single-tenant scope: infrastructure-layer encryption via FDE, not application-layer; 3 alternatives rejected with rationale — app-layer encryption, HKDF-derived key, OS keychain; future escape hatch is external-secrets-backend wrap at the deployment layer for hosted/multi-tenant runtime). Rotation is delete-and-recreate. Event-bus fan-out in `packages/orchestrator/src/gateway/webhooks/events.ts` subscribes to 9 orchestrator topics with colon-to-dot normalization (`maintenance:started` → `maintenance.started`) so subscriptions can match the dotted form; segment-glob filter (`eventMatches` in `signer.ts:43-51`) is intentionally narrow (no `**`, no minimatch features). **Phase 3 delivery is in-memory, best-effort, 3-second timeout, no retry, no DLQ** — Phase 4 lands the durable counterpart (SQLite queue, exponential-backoff retry ladder, dead-letter queue, drain-on-shutdown) using the same `WebhookDelivery.deliver(sub, event)` API shape so the swap is purely additive. Two new SSE topics fan out subscription-lifecycle events (`webhook.subscription.created`, `webhook.subscription.deleted`) bringing the SSE topic count to 11. New MCP tool `subscribe_webhook` at tier-1 (`packages/cli/src/mcp/tools/webhook-tools.ts`, registered in `tool-tiers.ts:58` under `STANDARD_EXTRA`). New dashboard page at `/s/webhooks` (`packages/dashboard/src/client/pages/Webhooks.tsx`) with list/create/revoke UI and one-shot secret reveal; registered as 12th entry in `SYSTEM_PAGES`. OpenAPI 3.1.0 artifact bumped to v0.3.0 and extended to **18 paths** (3 auth + 3 bridge + 10 documented legacy aliases + 2 webhook). `.gitignore` excludes `**/.harness/webhooks.json` alongside `tokens.json` and `audit.log` so the three runtime secret artifacts share one block. **Bonus fixes landed in the same phase:** `V1_BRIDGE_ROUTES` shared registry in `packages/orchestrator/src/server/v1-bridge-routes.ts` is the single source of truth that both `buildApiRoutes()` and `scopes.ts` consume (closes Phase 2 cycle-2 DELTA-SUG-1); first webhook-create in unauth-dev mode fires a one-time `console.warn` per process (closes Phase 2 cycle-1 SUG-5); allow-list GET-shape assertion is positive (Object.keys exact equality) AND negative (JSON-stringify `/secret/i` regex) — belt-and-braces (closes Phase 2 cycle-2 DELTA-SUG-2). See [`docs/knowledge/orchestrator/gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md) (extended Phase 3 sections — webhook subscriptions, HMAC signing, event-bus fan-out, dashboard page), the sibling [`docs/knowledge/orchestrator/webhook-fanout.md`](docs/knowledge/orchestrator/webhook-fanout.md) (dedicated business-process node — subscription lifecycle, topic registry, segment-glob semantics, delivery worker contract, Phase 4 extension points), and [ADR 0011](docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md) (status remains `in-progress`, promotion to `accepted` deferred to Phase 4 durable delivery + Phase 5 telemetry export). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
- **Orchestrator Gateway API — Phase 2 versioned API surface + bridge primitives** — `/api/v1/*` aliases for the twelve wrappable legacy routes (interactions, plans, analyze, analyses, roadmap-actions, dispatch-actions, local-model, local-models, maintenance, streams, sessions, chat-proxy) plus an inlined `/api/v1/state` shortcut; legacy `/api/<name>` responses carry `Deprecation: 2027-05-14` (override via `HARNESS_DEPRECATION_DATE`), and the gating logic keys off the pre-rewrite URL captured in `dispatchAuthedRequest` so v1 responses are never marked deprecated. Three new bridge-primitive endpoints land natively under `/api/v1/`: `POST /api/v1/jobs/maintenance` (scope `trigger-job`, body `{taskId}`, dispatches via `Orchestrator.dispatchAdHoc`; 200/404/409); `POST /api/v1/interactions/{id}/resolve` (scope `resolve-interaction`, invokes `InteractionQueue.updateStatus(id, 'resolved')`; 200/404/409); `GET /api/v1/events` (scope `read-telemetry`, Server-Sent Events stream of the orchestrator event bus with `evt_<hex>` cursor IDs, 15-second heartbeat, `X-Accel-Buffering: no` to defeat proxy buffering, on-close listener cleanup). `InteractionQueue.constructor(dir, emitter?)` accepts the orchestrator (`extends EventEmitter`) as a bus so `push()` and `updateStatus(id, 'resolved')` emit `interaction.created` / `interaction.resolved` topics alongside the existing WebSocket broadcast — dual-channel fan-out is intentional, no rip-out of the WS path. Nine event topics flow through SSE (`state_change`, `agent_event`, `interaction.created`, `interaction.resolved`, `maintenance:started`, `maintenance:completed`, `maintenance:error`, `maintenance:baseref_fallback`, `local-model:status`); `Orchestrator.setMaxListeners(50)` absorbs the subscribe-on-connect pattern against Node's default ceiling of 10. Two new MCP tools registered in `packages/cli/src/mcp/tools/gateway-tools.ts`: `trigger_maintenance_job` (tier-1, `standard+`) and `list_gateway_tokens` (tier-0, `core+`); `subscribe_webhook` intentionally not registered (Phase 3) and tool-tiers tests assert its absence. OpenAPI 3.1.0 artifact at `docs/api/openapi.yaml` extended to 16 paths (3 auth + 3 bridge + 10 documented legacy aliases); CI `openapi-drift-check.yml` workflow covers the full artifact; the openapi:generate emitter is byte-identical across re-runs. Slash-command generator regenerates per-host plugin manifests covering the Phase 2 surface for claude-code, gemini-cli, cursor, and codex (opencode platform not in-repo — carry-forward). Bonus fixes landed in the same phase: audit log now captures the wire-final status via `res.on('finish')` so `void handleX(...); return true` patterns no longer record the default 200 instead of the real 422 / 4xx; two circular dependencies between `packages/orchestrator/src/gateway/*` and `packages/orchestrator/src/server/*` closed in commit `3736eac5` (shared types routed through `packages/types/`). See [`docs/knowledge/orchestrator/gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md) (Phase 2 sections on versioning, bridge primitives, SSE event bus) and [ADR 0011](docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md) (status remains `in-progress`, promotion to `accepted` deferred to Phase 3 webhooks). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
- **Orchestrator Gateway API — Phase 1 auth foundation** — Token-scoped bearer auth replaces the single `HARNESS_API_TOKEN` shared-secret model. `TokenStore` persists bcryptjs-hashed token secrets (cost 12) to `.harness/tokens.json` with atomic write-and-rename; `tok_<16-hex-id>.<base64url-secret>` tokens are minted once and never recoverable. Pinned `SCOPE_VOCABULARY` (`admin`, `trigger-job`, `read-status`, `resolve-interaction`, `subscribe-webhook`, `modify-roadmap`, `read-telemetry`) drives `requiredScopeForRoute` mapping for all `/api/*` routes including the previously unauth'd `/api/state`. Append-only `AuditLogger` writes JSONL entries `{timestamp, tokenId, tenantId?, route, method, status}` to `.harness/audit.log` — payload content is never recorded; write failures degrade silently. New CLI subcommand group `harness gateway token create|list|revoke` for token administration. New dashboard page at `/s/tokens` with list/create/revoke UI surfacing one-time secret reveal; the dashboard does not mount a parallel `TokenStore` — token CRUD lives on the orchestrator at `/api/v1/auth/*` (handlers in `packages/orchestrator/src/server/routes/auth.ts`) and the dashboard proxies the `/api/v1` prefix via `orchestrator-proxy.ts`, preserving the single-writer invariant on `.harness/tokens.json` and routing all token-CRUD traffic through the orchestrator's auth + scope gate. Legacy `HARNESS_API_TOKEN` env-var continues to authenticate as a synthetic admin token (backward-compat invariant). Localhost-dev fallback: if `.harness/tokens.json` is empty AND `HARNESS_API_TOKEN` is unset, all requests resolve as admin with `X-Harness-Auth-Mode: unauth-dev` set on every response plus a one-time `console.warn`. Initial OpenAPI 3.1.0 artifact vendored at `docs/api/openapi.yaml` (covering the three auth-admin routes), generated from Zod schemas via `@asteasolutions/zod-to-openapi`; new `openapi:generate` orchestrator script + `.github/workflows/openapi-drift-check.yml` CI job enforce that the artifact never lags the code. See [`docs/knowledge/orchestrator/gateway-api.md`](docs/knowledge/orchestrator/gateway-api.md) and [ADR 0011](docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/cli`, `@harness-engineering/dashboard`)
- **Local model fallback for the orchestrator** — `agent.localModel` accepts an array of model names; `LocalModelResolver` probes the configured local backend on a fixed interval and resolves the first available model from the list. `getModel` callback threaded through `LocalBackend` and `PiBackend` so backends read the resolved model per-session instead of from raw config. Resolver status broadcast via `local-model:status` WebSocket and exposed at `GET /api/v1/local-model/status`. Dashboard surfaces an unhealthy-resolver banner on the Orchestrator page via the `useLocalModelStatus` hook. (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/dashboard`)
- **Multi-backend routing for the orchestrator** — `agent.backends` (named map of backend definitions) and `agent.routing` (per-use-case selection of backend names). Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Promotes `local` / `pi` to first-class named backends; multi-local configs supported with one `LocalModelResolver` per backend. New `GET /api/v1/local-models/status` endpoint returns `NamedLocalModelStatus[]`; dashboard renders one banner per unhealthy local backend. Single-runner dispatch via per-issue `OrchestratorBackendFactory` replaces the dual-runner split. Distinct intelligence-pipeline providers per layer (`peslProvider` constructor option). See [`docs/guides/multi-backend-routing.md`](docs/guides/multi-backend-routing.md), [ADR 0005](docs/knowledge/decisions/0005-named-backends-map.md), [ADR 0006](docs/knowledge/decisions/0006-single-runner-orchestrator-dispatch.md), [ADR 0007](docs/knowledge/decisions/0007-multi-provider-intelligence-pipeline.md). (`@harness-engineering/orchestrator`, `@harness-engineering/types`, `@harness-engineering/intelligence`, `@harness-engineering/dashboard`)
- **Knowledge document materialization** — `KnowledgeDocMaterializer` generates markdown knowledge docs from graph gap analysis, wired into the pipeline convergence loop with differential gap tracking. CLI displays materialization results and differential gaps in `knowledge-pipeline` output. Dashboard registers knowledge pipeline in skill constants. (`@harness-engineering/graph@0.6.0`, `@harness-engineering/cli@1.27.0`, `@harness-engineering/dashboard@0.2.2`)
- **Adoption telemetry** — `harness adoption` command group (skills, recent, skill) for viewing skill usage metrics. `adoption-tracker` stop hook records invocations to `.harness/metrics/adoption.jsonl`. New `adoption` config key to disable tracking. (`@harness-engineering/cli`, `@harness-engineering/core`, `@harness-engineering/types`)
- **Central telemetry** — `harness telemetry` command group (identify, status) for managing anonymous usage analytics. `telemetry-reporter` stop hook sends events to PostHog. Consent via `DO_NOT_TRACK=1`, `HARNESS_TELEMETRY_OPTOUT=1`, or `telemetry.enabled: false`. (`@harness-engineering/cli`, `@harness-engineering/core`, `@harness-engineering/types`)
- **Session cleanup** — `harness cleanup-sessions` command removes stale `.harness/sessions/` directories older than 24 hours with `--dry-run` support. (`@harness-engineering/cli`)
- **Agent config validation** — `harness validate --agent-configs` with agnix binary integration and built-in TypeScript fallback rules (`HARNESS-AC-*`). Supports `--strict`, `--agnix-bin`, `--json`. (`@harness-engineering/cli@1.25.0`, `@harness-engineering/core@0.22.0`)
- **Security rule tests** — Unit tests for 9 security rule categories: crypto, deserialization, express, go, network, node, path-traversal, react, xss. (`@harness-engineering/core@0.22.0`)

### Fixed

- **Orchestrator Gateway API — Phase 1 review-fix cycle 2** — Closed a critical query-string scope bypass on `/api/v1/auth/*`: `dispatchAuthedRequest` previously passed `req.url` (which includes the query string) to `requiredScopeForRoute`, whose admin-route matchers use exact path equality — so `POST /api/v1/auth/token?x=1` returned `required = null`, the default-permit conjunction in the dispatch then short-circuited, and a `read-status` bearer could mint admin-scoped tokens. Two complementary fixes: (a) `http.ts` now strips the query string before scope lookup, matching the URL normalization already used by `audit()` and `handleAuthRoute`; (b) the null-required check is now default-deny (`if (!required || !hasScope(...))`), aligning with ADR 0011 line 30 and `scopes.ts:26`. `TokenStore.persist()` now writes via temp-file + `fs.rename` for crash-consistent atomic write-and-rename, matching this changelog's documented behavior. Six parametrized regression tests in `packages/orchestrator/src/server/routes/auth.test.ts` cover query-string variants on all three admin-gated routes plus an unknown-route default-deny case. (`@harness-engineering/orchestrator`)
- **`harness init` ignores team-shared policy and security history** — `ensureHarnessGitignore` wholesale-ignored `.harness/hooks/` and `.harness/security/`, so a fresh clone ran without policy hooks (`block-no-verify`, `protect-config`, `quality-gate`, …) and with no shared security trend ledger until someone re-ran `harness init`. The bug was paired with a latent leak: `findingLifecycles[].file` stored whatever path the scanner emitted, and `check-security` globs with `absolute: true`, so committing `timeline.json` would have shipped every developer's home-directory username and produced merge conflicts on every cross-machine scan. Fixed in two layers — the gitignore template now drops `hooks/` and replaces `security/` with `security/*` + `!security/timeline.json`; `SecurityTimelineManager.capture()` and `updateLifecycles()` relativize `finding.file` against `rootDir` before computing `findingId` (so IDs are machine-stable across clones); `load()` migrates legacy absolute paths under `rootDir` to repo-relative form on first read and re-saves. Paths that escape `rootDir` are passed through unchanged so we never silently misattribute findings outside the project. (`@harness-engineering/core`, `@harness-engineering/cli`) ([#270](https://github.com/Intense-Visions/harness-engineering/issues/270))
- **`check-arch --update-baseline` strips tracked metrics** — `harness check-arch --update-baseline` previously rewrote `.harness/arch/baselines.json` from scratch using only the categories present in the current run's `runAll()` output, so any tracked category that the run did not emit (collector silently returning `[]`, transient failure, filtered run) was permanently dropped from the baseline. The `.husky/pre-commit` hook auto-stages the regenerated file, so the loss could land in a normal commit unnoticed. New `ArchBaselineManager.update()` method merges fresh results onto the on-disk baseline (present categories overwrite, absent categories preserved), mirroring the merge-on-write pattern in `packages/core/src/performance/baseline-manager.ts`. The `--update-baseline` branch in `runCheckArch` now goes through `manager.update(...)` instead of `capture()` + `save()`. (`@harness-engineering/core`, `@harness-engineering/cli`) ([#268](https://github.com/Intense-Visions/harness-engineering/issues/268))
- **Init scaffolds into existing projects** — `harness init` no longer creates project scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects pre-existing projects by checking for common build/config files (build.gradle, package.json, go.mod, etc.) and only writes harness config files (harness.config.json, AGENTS.md). Also adds build.gradle/build.gradle.kts to the package config skip set. (`@harness-engineering/cli`) ([#235](https://github.com/Intense-Visions/harness-engineering/issues/235))
- **Hook refresh fails after install** — `resolveHookSourceDir()` used a relative path (`../../hooks`) that only worked in the dev source layout; after tsup bundling, `__dirname` points to `dist/` and the path resolved outside the package. Additionally, `copy-assets.mjs` never copied `src/hooks/*.js` scripts into `dist/`. Fixed by adding a bundled-layout candidate path and copying hook scripts during build. (`@harness-engineering/cli@1.25.1`)
- **Rate-limiter stack overflow** — Replace `Math.min(...spread)` with `reduce` to prevent stack overflow on large timestamp arrays. Ensure delays are always >= 1ms. (`@harness-engineering/orchestrator@0.2.8`)
- **Container security defaults** — Default container network to `none` instead of `host`; block `--privileged`, `--cap-add`, `--security-opt`, `--pid`, `--ipc`, `--userns` flags. (`@harness-engineering/orchestrator@0.2.8`)
- **Stale claim detection** — Missing `updatedAt` timestamp now treated as stale (was incorrectly treated as fresh). (`@harness-engineering/orchestrator@0.2.8`)
- **Scheduler lastRunMinute** — Only record `lastRunMinute` on task success, preventing failed tasks from being skipped on next interval. (`@harness-engineering/orchestrator@0.2.8`)
- **Task-runner error handling** — Add try-catch for `ensureBranch`, `ensurePR`, and agent dispatch to prevent unhandled rejections from losing agent work. (`@harness-engineering/orchestrator@0.2.8`)
- **PR-manager rebase recovery** — Resilient `rebase --abort` with `reset --hard` fallback when no rebase is in progress. (`@harness-engineering/orchestrator@0.2.8`)
- **contextBudget edge cases** — Handle zero total tokens and zero `originalSum` during ratio redistribution. (`@harness-engineering/core@0.22.0`)
- **npm audit parsing** — Parse `npm audit` stdout on non-zero exit (audit exits non-zero when vulnerabilities exist). (`@harness-engineering/core@0.22.0`)
- **StepResult type cycle** — Break circular import between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`. (`@harness-engineering/cli@1.25.0`)
- **Dashboard localStorage crash** — Guard `localStorage.getItem()` in `useChatPanel` module init to prevent crash in test environments where `window` exists but `localStorage` is not a function. (`@harness-engineering/dashboard`)

### Changed

- **Legacy orchestrator agent config deprecated** — `agent.backend` and `agent.localBackend` continue to work via an in-memory migration shim that synthesizes `agent.backends.primary` and `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Orchestrator emits a one-time `warn`-level log at startup naming each deprecated field present. Hard removal lands in a follow-up release per the deprecation timeline. (`@harness-engineering/orchestrator`)
- **Orchestrator decomposition** — Extract intelligence pipeline runner (461 lines) and completion handler (218 lines) from the 1,882-line `orchestrator.ts` into dedicated modules, reducing it to 1,313 lines. Replace hidden barrel imports with direct module imports for explicit dependency chains. (`@harness-engineering/orchestrator`)
- **Core barrel auto-generation** — Add `scripts/generate-core-barrel.mjs` to auto-generate `packages/core/src/index.ts` from directory structure, with `--check` mode for CI. Wired into `pnpm run generate:barrels`. (`@harness-engineering/core`)
- **PRDetector extraction** — PR detection logic extracted from `Orchestrator` into standalone `PRDetector` module with throttled concurrency. (`@harness-engineering/orchestrator@0.2.8`)

## 0.14.1 — 2026-04-07

### Fixed

- **Blocked status corruption in external sync** — `syncFromExternal` silently flipped manually-set `blocked` features to `planned` because GitHub Issues "open" mapped to "planned" and `STATUS_RANK` treated both as lateral (rank 1). Added guard to skip `blocked → planned` transitions unless `forceSync` is set. (`@harness-engineering/core@0.21.1`)

### Changed

- **Complexity reduction** — Refactored `prediction-engine`, `aggregator`, `traceability` command, `Traceability` query, and `GraphStore` to reduce cyclomatic complexity. (`@harness-engineering/core@0.21.1`, `@harness-engineering/cli@1.23.2`, `@harness-engineering/graph@0.4.1`)
- **Dead code removal** — Removed orphaned `impact-lab-generator` module, moved misplaced test file. (`@harness-engineering/core@0.21.1`)
- **Dashboard SSE fixes** — Improved server-sent events reliability and server context handling. (`@harness-engineering/dashboard@0.1.1`)

## 0.14.0 — 2026-04-05

### Fixed

- **Roadmap pilot sync gap** — The roadmap pilot skill assigned features by calling `assignFeature()` directly and writing `roadmap.md` manually, bypassing the `manage_roadmap` MCP tool where `triggerExternalSync` is wired. GitHub Issues were never updated on assignment. (`@harness-engineering/cli@1.23.0`)

### Added

- **`assignee` field on `manage_roadmap update`** — The `update` action now accepts an `assignee` parameter, delegating to `assignFeature()` for proper assignment history tracking. External sync fires automatically via the existing mutation hook. (`@harness-engineering/cli@1.23.0`)

### Changed

- **Skill fallback sync warnings** — All 8 MCP-fallback paths across 5 skills (brainstorming, execution, autopilot, roadmap, roadmap-pilot) now warn when external sync is skipped due to MCP unavailability and advise running `manage_roadmap sync` when MCP is restored.

## 0.13.0 — 2026-04-04

### Added

- **Predictive Architecture Failure** — Weighted linear regression extrapolates decay trends per metric category with recency bias. `PredictionEngine` produces per-category forecasts at configurable horizons with tiered confidence (high/medium/low). `SpecImpactEstimator` extracts structural signals from specs to produce roadmap-aware adjusted forecasts. New `harness predict` CLI command and `predict_failures` MCP tool. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **Spec-to-Implementation Traceability** — Requirement nodes, `requires`/`verified_by`/`tested_by` edges, `RequirementIngestor`, coverage matrix CLI (`harness traceability`) and MCP tool (`check_traceability`). Hybrid test linking with confidence signals. (`@harness-engineering/graph@0.4.0`, `@harness-engineering/cli@1.22.0`)
- **Architecture Decay Timeline** — `TimelineManager` captures time-series architectural health snapshots. Composite 0–100 stability score across 7 metric categories. `harness snapshot capture|trends|list` CLI commands and `get_decay_trends` MCP tool. Weekly CI workflow. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **Skill Recommendation Engine** — Three-layer recommendation: hard-rule matching, weighted health scoring, topological sequencing. `captureHealthSnapshot` orchestrator with graph metrics. `harness recommend` CLI command and `recommend_skills` MCP tool. Health-aware `search_skills` passive boost. (`@harness-engineering/core@0.20.0`, `@harness-engineering/cli@1.22.0`)
- **CI traceability check** — New `traceability` check added to CI orchestrator (9 checks total). (`@harness-engineering/core@0.20.0`)

### Fixed

- **Typecheck errors** in predict CLI and MCP tool (`exactOptionalPropertyTypes` compliance).
- **Doc drift** — Updated version numbers in API docs (cli, core, types), corrected MCP tool count (52), skills count (81), and graph node/edge type counts (30/25) across README, getting-started, and features-overview guides.

## 0.12.1 — 2026-04-04

### Fixed

- **Injection scanner false positives** — The sentinel injection guard no longer scans output from trusted harness MCP tools (`run_skill`, `gather_context`, etc.), preventing false INJ-CTX-003 and INJ-PERM-003 taints on legitimate skill documentation. Input scanning is preserved for all tools. (`@harness-engineering/cli@1.20.1`)

## 0.12.0 — 2026-04-04

### Added

- **Assignee push on sync** — `createTicket` and `updateTicket` now include the `assignees` field in GitHub API payloads, keeping roadmap assignees in sync with GitHub Issue assignees bidirectionally.
- **Auto-populate assignee** — `syncToExternal` fetches the authenticated user's GitHub login via `GET /user` and auto-assigns features with no assignee. Cached per adapter instance.
- **`getAuthenticatedUser()`** — New method on `TrackerSyncAdapter` interface and `GitHubIssuesSyncAdapter` implementation. Returns `@login` format.

### Fixed

- **Project `.env` loading for MCP sync** — `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not in the environment, fixing token discovery when the MCP server's working directory differs from the project.

## 0.11.0 — 2026-04-03

### Added

- **External tracker sync** — Bidirectional sync between `roadmap.md` and GitHub Issues via `TrackerSyncAdapter` interface. Split authority model: roadmap owns planning fields, external service owns execution/assignment. Sync fires automatically on all 6 state transitions.
- **GitHub Issues adapter** — Full `GitHubIssuesSyncAdapter` implementation with label-based status disambiguation, pagination, and error collection. Configurable via `roadmap.tracker` in `harness.config.json`.
- **Sync engine** — `syncToExternal` (push), `syncFromExternal` (pull with directional guard), `fullSync` (mutex-serialized read-push-pull-write cycle). External assignee wins; status regressions blocked unless `forceSync`.
- **Roadmap pilot skill** — AI-assisted next-item selection via `harness-roadmap-pilot`. Two-tier scoring: explicit priority first (P0–P3), then weighted position (0.5) / dependents (0.3) / affinity (0.2). Routes to brainstorming or autopilot based on spec existence.
- **Assignment with affinity** — `Assignee`, `Priority`, and `External-ID` fields on roadmap features. Assignment history section in `roadmap.md` with affinity-based routing. Reassignment produces two-record audit trail.
- **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in `@harness-engineering/types`.
- **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` with Zod validation for tracker configuration.
- **Shared status ranking** — Extracted `STATUS_RANK` and `isRegression` to `status-rank.ts`, shared by local and external sync paths.
- **State transition hooks** — 4 new lifecycle actions (`task-start`, `task-complete`, `phase-start`, `phase-complete`) in `manage_state`, each triggering `autoSyncRoadmap` with optional external sync.

### Fixed

- `parseAssignmentHistory` now bounds to next H2 heading, preventing content bleed
- `resolveReverseStatus` moved from GitHub adapter to adapter-agnostic `tracker-sync.ts`
- `reverseStatusMap` optionality aligned between TypeScript type and Zod schema
- `loadTrackerConfig` validates via `TrackerConfigSchema.safeParse` instead of raw assertion
- Unknown blockers in pilot scoring treated as resolved (external dependencies)
- Feature construction in `roadmap.ts` includes new required fields

## 0.10.0 — 2026-04-01

### Added

- **Multi-platform MCP support** — Codex CLI and Cursor join Claude Code as supported AI agent platforms. `harness setup-mcp` auto-detects and configures each platform. Slash command generation now produces platform-specific output for all three.
- **Cursor tool picker** — Interactive `--pick` flag with `@clack/prompts` for selecting which MCP tools to expose to Cursor. `--yes` flag for non-interactive CI usage with curated defaults.
- **Codex TOML integration** — `writeTomlMcpEntry` utility for writing MCP server config to `.codex/config.toml`.
- **Sentinel prompt injection defense** — `sentinel-pre` and `sentinel-post` hook scripts scan tool inputs/outputs for injection patterns, block destructive operations during tainted sessions. Added to strict hook profile.
- **Usage analytics** — Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation types, `--include-claude-sessions` flag for `harness usage`.
- **Security scanner hardening** — Session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules, false-positive verification gate with `parseHarnessIgnore` helper.
- **Cost tracking types** — `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types in `@harness-engineering/types`.
- **Orchestrator sentinel integration** — Sentinel config scanning wired into the dispatch pipeline.

### Fixed

- Lint errors in hook scripts (no-misleading-character-class, unused imports, `any` types)
- Cost-tracker hook field naming alignment (snake_case → camelCase)
- Test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts, gate test timeout
- Doc drift: version numbers, tool counts, and skill counts synchronized across docs

## 0.9.0 — 2026-03-30

### Added

- **Code navigation module** — AST-powered outline extraction, cross-file symbol search, and bounded unfold with tree-sitter parser cache. 3 new MCP tools: `code_outline`, `code_search`, `code_unfold` (49 total).
- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with minimal/standard/strict profile tiers. CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks.
- **Structured event log** — JSONL append-only event timeline with content-hash deduplication, integrated into `gather_context`.
- **Extended security scanner** — 18 new rules: 7 agent-config (SEC-AGT-001–007), 5 MCP (SEC-MCP-001–005), 6 secret detection (SEC-SEC-006–011). New `agent-config` and `mcp` security categories with `fileGlob` filtering.
- **Learnings enhancements** — Hash-based content deduplication, frontmatter annotations, progressive disclosure with depth parameter, index entry extraction, and session learning promotion.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **CI pipeline hardening** — Coverage ratchet, benchmark regression gate, codecov integration, and post-publish smoke test workflow.

### Changed

- Progressive disclosure in `gather_context` via new `depth` parameter for layered context retrieval.
- Autopilot DONE state now promotes session learnings and suggests global learnings pruning.
- Autopilot APPROVE_PLAN replaced mandatory pause with conditional signal-based gate.
- Autopilot FINAL_REVIEW dispatch and findings handling integrated into phase lifecycle.

### Fixed

- Shell injection and `-n` flag bypass in hook scripts.
- `execFileSync` consistency and MCP-003 wildcard handling in security/hooks.
- O(1) dedup and redundant I/O in events and learnings modules.
- Roadmap sync guard replaced with directional protection and auto-sync.
- `promoteSessionLearnings` idempotency guard and budgeted learnings deduplication.
- `scanContent` docs, AGT-007 confidence, and regex precision in security scanner.

## 0.8.0 — 2026-03-27

### Added

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS, and existing Next.js). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag for `harness init`** — Explicit language selection with conflict validation. MCP `init_project` tool also accepts `language` parameter.
- **Framework conventions in AGENTS.md** — `harness init` appends framework-specific conventions to existing AGENTS.md files and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New actions for session-scoped accumulative state: read, append, status update, and archive operations with read-before-write safety.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **Evidence gate for code review** — Coverage checking and uncited finding tagging in the review pipeline. `EvidenceCoverageReport` type, `tagUncitedFindings()`, and pipeline orchestrator integration with coverage reporting in output formatters.

### Changed

- Reduced cyclomatic complexity across all packages via function extraction and handler decomposition.
- Template schema expanded with `language`, `tooling`, and `detect` fields.
- `HarnessConfigSchema` template field extended with `language` and `tooling`.
- Package config skip logic added for non-JS existing projects.

### Fixed

- `detectFramework` file descriptor leak — wrapped in try/finally to prevent fd exhaustion.
- Evidence gate regex now supports `@` in scoped package paths (e.g., `@org/package`).
- `exactOptionalPropertyTypes` compliance in review conditional spread.
- Cross-device session archive with copy+remove fallback when `fs.rename` fails across filesystems.
- Enum constraints added to session section and status MCP schema properties.
- CI check warnings for entry points and doc coverage resolved.
- Platform-parity test normalization for cross-platform compatibility.

## 0.7.0 — 2026-03-27

### Added

- **Three-tier skill system** — 79 skills organized into Tier 1 (11 workflow), Tier 2 (19 maintenance), Tier 3 (43 domain), plus 6 internal skills. Includes skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **30 new domain skills** — Tier 3 catalog covering API testing, chaos engineering, container security, data pipeline validation, DB migration safety, dependency license audit, feature flags, GraphQL schema review, incident response, infrastructure drift, ML ops, mobile testing, monorepo health, mutation testing, observability, OpenAPI validation, privacy compliance, queue health, rate limit design, real-time sync, schema evolution, search relevance, service mesh review, state machine verification, supply chain security, terraform review, visual regression, and WebSocket protocol testing.
- **`search_skills` MCP tool** — Search and discover skills from the catalog (46 total MCP tools).
- **`require-path-normalization` ESLint rule** — Requires path normalization for cross-platform compatibility.
- **`toPosix()` utility** — New helper in `@harness-engineering/core` for consistent cross-platform path separators.
- **`@harness-engineering/orchestrator` README** — Architecture diagram, quick start guide, core concepts, and API reference.

### Changed

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Check orchestrator refactor** — Extracted 8 handler functions from `runSingleCheck` switch statement, reducing cyclomatic complexity from 63 to ~10 per function.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Cross-platform path normalization** — `path.relative()` outputs normalized to POSIX separators across architecture collectors, constraint validators, doc coverage, context generators, entropy detectors, review scoper, glob helper, and CLI path utilities.
- Architecture baseline updated for pre-commit hook integration and refactored function signatures.
- Pre-commit hook now runs `harness check-arch` for earlier failure detection.
- Pre-push hook now runs `typecheck`.

### Fixed

- `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- Restored gemini-cli symlinks broken by tier classification.
- Core `VERSION` constant updated from 0.11.0 to 0.13.0.
- README tool count corrected (47→46), skill count corrected (49→79), ESLint rule count corrected (10→11).
- AGENTS.md skill breakdown corrected ("49 core + 30 domain" → "36 core + 43 domain"), `docs/specs/` → `docs/changes/`, `docs/api/` description updated, module boundaries expanded to all 7 packages.
- ESLint plugin README updated with 3 missing cross-platform rules.

## 0.6.0 — 2026-03-26

### Added

- **Efficient Context Pipeline** — Reduce token waste across the harness workflow while preserving quality.
  - **Session-scoped state**: All state files isolated per session under `.harness/sessions/<slug>/`, enabling parallel Claude Code windows without conflicts.
  - **Token-budgeted learnings**: `loadBudgetedLearnings()` with two-tier loading (session first, global second), recency sorting, relevance scoring, and configurable token budget.
  - **Session summaries**: Lightweight cold-start context (~200 tokens) via `writeSessionSummary()`, `loadSessionSummary()`, `listActiveSessions()`.
  - **Learnings pruning**: `harness learnings prune` command analyzes patterns, presents improvement proposals, and archives old entries.
  - **Lean agent dispatch**: Autopilot agents load their own context via `gather_context()` instead of receiving embedded file content.
- **Roadmap parser fix** — `manage_roadmap` no longer clobbers the roadmap file. Parser accepts both `### Feature: X` and `### X` formats.

### Changed

- All core state functions accept optional `session` parameter for session-scoped operation.
- `gather_context`, `manage_state`, and `emit_interaction` MCP tools accept `session` parameter.
- All 5 pipeline skill SKILL.md files updated with session summary write/read steps.
- Roadmap serializer outputs format matching actual roadmap files (no `Feature:`/`Milestone:` prefixes).

### Fixed

- Circular dependency in entropy types module.
- Roadmap parser/serializer format mismatch that caused `manage_roadmap add` to wipe all existing features.

## 0.5.0 — 2026-03-25

### Added

- **Constraint Sharing** — Install and uninstall shared constraint bundles across projects.
  - `harness install-constraints` with conflict detection, dry-run, `--force-local`/`--force-package`.
  - `harness uninstall-constraints` with lockfile-driven rule removal.
  - `removeContributions` function in `@harness-engineering/core` for programmatic rule cleanup.
- **Private Registry Support** — `--registry` flag for `install`, `search`, and `publish` commands with `.npmrc` token reading.
- **Local Install** — `harness install --from <path>` for installing skills from directories or tarballs.
- **Orchestrator Daemon** — New package `@harness-engineering/orchestrator` providing a long-lived daemon for agent lifecycle management.
  - Ink-based TUI and HTTP API for real-time monitoring.
  - Deterministic per-issue workspace management.
  - Pure state-machine core for robust dispatch/reconciliation.
- **Harness Docs Pipeline** — Orchestrated sequential documentation health check (drift, coverage, links).
- **Source Map Reference** — Comprehensive index of all project source files in documentation.

### Changed

- Documentation coverage increased to **84%** across the monorepo.
- Comprehensive JSDoc/TSDoc for core API packages.
- Hardened `@harness-engineering/core` and `@harness-engineering/cli` with resolved lint and type errors.
- Restricted orchestrator observability API to localhost for security.
- Updated `harness.config.json` to reflect actual dependency structure (added orchestrator layer, removed stale mcp-server references).

### Fixed

- `exactOptionalPropertyTypes` violation in CLI install command.
- Broken test imports in `core/test/blueprint/content-pipeline.test.ts`.
- 13 documentation drift items: stale mcp-server references, outdated version numbers, missing ESLint rule docs, undocumented deprecations.

### Deprecated

- `validateAgentsMap()` and `validateKnowledgeMap()` in `@harness-engineering/core` — use `Assembler.checkCoverage()` from `@harness-engineering/graph` instead.

## 0.4.0 — 2026-03-23

### Added

- **MCP server merged into CLI** — `@harness-engineering/mcp-server` absorbed into `@harness-engineering/cli`. A single `npm install -g @harness-engineering/cli` now provides both `harness` and `harness-mcp` binaries. The standalone `@harness-engineering/mcp-server` package is deprecated.
- Lint check in `assess_project` MCP tool with enforcement in execution skill
- Automatic roadmap sync embedded into pipeline skills
- Updated `release-readiness` skill to use `assess_project` with lint

### Fixed

- State cache invalidation on write to prevent stale hits in CI
- Redundant `undefined` removed from optional graph parameters
- `no-explicit-any` casts replaced with typed interfaces in `gather-context`
- Unified `paths.ts` with `findUpFrom` + `process.cwd()` fallback

## 0.3.0 — 2026-03-23

### Added

- **Agent workflow acceleration:** Redesigned `emit_interaction` with structured decision UX — every question now includes pros/cons per option, recommendation with confidence level, risk/effort indicators, and markdown table rendering
- **Composite MCP tools:** `gather_context` (parallel context assembly replacing 5 sequential calls), `assess_project` (parallel health checks replacing 6 sequential calls), `review_changes` (depth-controlled review with quick/standard/deep modes)
- **Batch decision mode** for `emit_interaction` — group low-risk decisions for approval as a set
- **Quality gate** on phase transitions — `emit_interaction` transition type now includes `qualityGate` with per-check pass/fail indicators
- **Response density control** — `mode: 'summary' | 'detailed'` parameter on `query_graph`, `detect_entropy`, `get_relationships`, `get_impact`, `search_similar`, and all composite tools
- **GraphStore singleton cache** with mtime-based invalidation and pending-promise dedup for concurrent access (LRU cap: 8 entries)
- **Learnings/failures index cache** with mtime invalidation and LRU eviction in state-manager
- **Parallelized CI checks** — `check-orchestrator` runs validate first, then 6 remaining checks via `Promise.all`
- **Parallelized mechanical checks** — docs and security checks run in parallel with explicit findings-merge pattern
- **GraphAnomalyAdapter** — Tarjan's articulation point detection, Z-score statistical outlier detection, overlap computation for graph anomaly analysis
- **`detect_anomalies` MCP tool** for graph-based anomaly detection
- 42 MCP tools total (was 40)

### Changed

- **Tool consolidation:** `manage_handoff` absorbed into `manage_state` (new `save-handoff`/`load-handoff` actions), `validate_knowledge_map` absorbed into `check_docs` (new `scope` parameter), `apply_fixes` absorbed into `detect_entropy` (new `autoFix` parameter)
- **All 7 core skills updated** (brainstorming, planning, execution, verification, code-review, autopilot, pre-commit-review) to use structured `InteractionOption` format, composite tools, and `qualityGate` transitions — both claude-code and gemini-cli platforms
- `emit_interaction` Zod schema now enforces structured options with `.min(2).max(10)`, recommendation required when options present, default index bounds check
- Pipe characters in user-supplied text escaped in markdown table rendering
- `review_changes` uses `execFileSync` instead of `execSync` for security hardening
- Zod error messages now include field paths for easier debugging

### Fixed

- Resolved stale `VERSION` constant in core (was `0.8.0`, should be `1.8.1`) causing incorrect update notifications
- Added `on_doc_check` to `ALLOWED_TRIGGERS` so `harness-docs-pipeline` skill validates correctly
- Extracted `packages/cli/src/version.ts` to read CLI version from `package.json` at runtime, preventing future version drift
- Added `./package.json` to CLI exports map for cross-package version resolution
- Updated MCP server to read CLI version from `package.json` with fallback to core `VERSION`
- Deprecated core `VERSION` export — consumers should read from `@harness-engineering/cli/package.json`
- Fixed graph-loader race condition where concurrent loads with different mtimes could cache stale data
- Fixed `gather_context` summary mode graph stripping (was accessing wrong property paths on graph context object)
- Updated README and docs/api MCP tool count to 42

## 0.2.0 — 2026-03-22

### Added

- Full cross-platform support (Windows, macOS, Linux) with mechanical enforcement
- CI matrix expanded to test on all 3 OSes with `fail-fast: false`
- ESLint rules `no-unix-shell-command` and `no-hardcoded-path-separator` for platform enforcement
- Root-level platform parity test suite (918 tests) scanning for 5 anti-pattern categories
- `.gitattributes` with `eol=lf` for consistent line endings on Windows
- Cross-platform Node.js scripts (`scripts/clean.mjs`, `copy-assets.mjs`, `copy-templates.mjs`) replacing Unix shell commands

### Fixed

- Normalized all `path.relative()`/`path.resolve()` outputs to forward slashes across 12 source files for Windows compatibility
- Fixed `fs.chmodSync` crash on Windows with platform guard
- Fixed hardcoded `/src/` path separators in eslint-plugin `path-utils.ts`
- Fixed `CodeIngestor` graph node ID mismatches on Windows (backslash in file IDs)
- Fixed `TemplateEngine` producing backslash `relativePath` values on Windows
- Fixed `check-phase-gate` spec path resolution failing on Windows
- Fixed `validate-findings` exclusion matching on Windows paths
- Fixed `update-checker` state file path resolution on Windows
- Fixed `CriticalPathResolver` returning backslash file paths on Windows
- Fixed dependency graph `nodes`/`edges` path mismatch breaking cycle detection on Windows
- Switched eslint-plugin build from `tsc` to `tsup` for ESM-compatible output

## 0.1.0 — 2026-03-21

### Added

- Initial public release of harness-engineering toolkit
- 7 packages: types, core, cli, eslint-plugin, linter-gen, mcp-server, graph
- 49 agent skills for Claude Code, 50 for Gemini CLI
- 12 agent personas (code-reviewer, architecture-enforcer, task-executor, documentation-maintainer, entropy-cleaner, graph-maintainer, parallel-coordinator, codebase-health-analyst, performance-guardian, security-reviewer, planner, verifier)
- 5 project templates (base, basic, intermediate, advanced, nextjs)
- 3 progressive examples (hello-world, task-api, multi-tenant-api)
- Comprehensive documentation with VitePress site
- `harness-release-readiness` skill — audits npm release readiness, dispatches maintenance skills in parallel, offers auto-fixes, tracks progress across sessions
- `harness-security-scan` skill — lightweight mechanical security scanning
- `harness-autopilot` skill — automated Plan → Implement → Verify → Review cycle
- BenchmarkRunner and ESLint performance rules (8 rules total)
- Progressive performance enforcement system
- Knowledge graph package (`@harness-engineering/graph`) for context assembly
- Usage section in README with code and CLI examples
- `.nvmrc` pinning Node.js to v22
- Performance entry points in `harness.config.json`
- Unified 7-phase code review pipeline with mechanical checks, AI fan-out agents, validation, deduplication, and output formatting
- Roadmap management module with parse, serialize, sync, and MCP tool support
- Background update checker with configurable interval and session notifications
- New MCP tools: `manage_roadmap`, `run_code_review`, `emit_interaction`
- Auto-transition support in skill lifecycle (brainstorming → planning → execution → verification → review)
- Interaction surface abstraction — skills migrated to platform-agnostic patterns
- 10 new skills: harness-soundness-review, harness-codebase-cleanup, harness-i18n, harness-i18n-workflow, harness-i18n-process, harness-roadmap, harness-docs-pipeline, harness-design, harness-design-web, harness-design-mobile
- i18n knowledge base with 20+ locale profiles, framework patterns, and industry verticals
- Entropy cleanup enhancements: dead export, commented-out code, orphaned dependency, and forbidden import fix creators
- `harness-ignore` inline suppression for security false positives
- `ForbiddenImportRule` type with alternative field for constraint enforcement
- Model tier resolver with provider defaults for review pipeline
- CI eligibility gate for review pipeline

### Changed

- **Breaking:** `@harness-engineering/cli` no longer provides the `harness-mcp` binary. Install `@harness-engineering/mcp-server` separately for MCP server support.
- Aligned dependency versions across all packages (`@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3)
- Upgraded `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags

### Fixed

- Break cyclic dependency between `@harness-engineering/cli` and `@harness-engineering/mcp-server` — `pnpm build` now succeeds
- Fix `exactOptionalPropertyTypes` build error in `@harness-engineering/graph` DesignIngestor
- Added missing `license: "MIT"` field to `@harness-engineering/graph` package.json
- Added `.env` to `.gitignore` (previously only `.env*.local` was covered)
- Resolved 12+ documentation drift issues across README, AGENTS.md, docs/api/index.md, and guides
- Added `@harness-engineering/graph` to docs/api/index.md package list
- Enforce path sanitization across all MCP tools and harden crypto
- Resolve TypeScript strict-mode errors and platform parity gaps
- Prevent security agent strings from triggering SEC-INJ-001 scan
- Use atomic write (temp file + rename) to prevent corrupt update-checker state from concurrent writes
