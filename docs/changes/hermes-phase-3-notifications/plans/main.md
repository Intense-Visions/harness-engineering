# Hermes Phase 3 — Implementation Plan

**Spec:** `docs/changes/hermes-phase-3-notifications/proposal.md`

## Task graph

```
T1 (types: notifications.ts)
  ├→ T2 (orchestrator: sink.ts interface)
  │    ├→ T3 (orchestrator: envelope.ts)
  │    ├→ T4 (orchestrator: slack-sink.ts)
  │    └→ T5 (orchestrator: registry.ts)
  │         └→ T6 (orchestrator: events.ts wireNotificationSinks)
  │              └→ T7 (orchestrator: lifecycle integration in orchestrator.ts)
  │                   └→ T8 (orchestrator: re-exports from index.ts)
  ├→ T9 (core: config validator)
  │    └→ T10 (cli: notifications test command)
  │         └→ T11 (cli: register notifications subcommand)
  └→ (parallel) T12 (cli: doctor hardening — 4 new checks + async refactor)

T13 (docs: AGENTS.md + CHANGELOG)
T14 (docs: ADR 0013 + ADR 0014)
T15 (docs: knowledge artifacts)
T16 (verify: harness validate + harness check-arch + harness check-deps)
T17 (verify: harness:verification three-tier)
```

## Tasks

### T1 — Types: notifications.ts

**File:** `packages/types/src/notifications.ts` (new)

Add Zod schemas:

- `NotificationSinkKindSchema = z.enum(['slack'])` (extension point: new sinks add their `kind` literal here).
- `NotificationSeveritySchema = z.enum(['info', 'success', 'warning', 'error'])`.
- `NotificationActionSchema = z.object({ label: z.string().min(1).max(40), url: z.string().url() })`.
- `NotificationEnvelopeSchema` = `{ title: z.string().min(1).max(280), summary: z.string(), severity: severity, actions: z.array(action).max(5).optional(), permalink: z.string().url().optional(), correlationId: z.string().optional() }`.
- `NotificationSinkConfigSchema` = `{ id: kebab-case-string, kind: kind, events: z.array(z.string().min(1)).min(1), wrap_response: z.boolean().default(false), config: z.record(z.string(), z.unknown()) }`.
- `NotificationDeliveryResultSchema` = discriminated union on `ok`.
- `NotificationsConfigSchema` = `{ sinks: z.array(sinkConfig).default([]) }`.

Re-export from `packages/types/src/index.ts` under `// --- Notifications (Hermes Phase 3) ---`.

**Test:** `packages/types/tests/notifications.test.ts` — valid + invalid (kind unknown, action url not url, env config missing id) parse cases.

### T2 — Orchestrator: sink interface

**File:** `packages/orchestrator/src/notifications/sink.ts` (new)

Define `NotificationSink` interface as spec'd in proposal §"`NotificationSink` interface". Includes `NotificationSinkDeliverInput`, `NotificationDeliveryResult` types.

No external dependencies. No tests required (interface-only).

### T3 — Orchestrator: envelope.ts

**File:** `packages/orchestrator/src/notifications/envelope.ts` (new)

Implement:

- `wrapAsEnvelope(event: GatewayEvent): NotificationEnvelope` — per-type dispatcher.
- `ENVELOPE_DERIVERS` map keyed by event-type → `(event) => Partial<NotificationEnvelope>`.
- Fallback: `{title: event.type, summary: stringify(data), severity: 'info'}`.
- Derivers for: `maintenance.started`, `maintenance.completed`, `maintenance.error`, `interaction.created`, `interaction.resolved`, `notification.test`.

**Test:** `packages/orchestrator/tests/notifications/envelope.test.ts` — table-driven: one row per event-type, plus fallback.

### T4 — Orchestrator: slack-sink.ts

**File:** `packages/orchestrator/src/notifications/slack-sink.ts` (new)

Implement `SlackSink` per proposal:

- POST JSON body to webhook URL with `Content-Type: application/json`.
- Body shape: `{text: string, blocks?: KnownBlock[]}` — title becomes `text`; envelope rendering builds simple `section` blocks for summary + `actions` becomes `actions` block with `button` elements.
- AbortController timeout (default 5s).
- Returns `{ok: false, error: 'HTTP 429', httpStatus: 429}` on rate limit; **no retry**.
- Render helpers:
  - `renderEnvelopeAsSlackPayload(env: NotificationEnvelope)` — section block with mrkdwn.
  - `renderRawEventAsSlackPayload(event: GatewayEvent)` — codeblock dump.

**Test:** `packages/orchestrator/tests/notifications/slack-sink.test.ts` — happy path (mock fetch returns 200/ok), 429 (no retry), timeout via AbortController, body shape assertion (envelope vs raw).

### T5 — Orchestrator: registry.ts

**File:** `packages/orchestrator/src/notifications/registry.ts` (new)

`SinkRegistry` class:

- `static fromConfig(config: NotificationsConfig, env: NodeJS.ProcessEnv): SinkRegistry` — instantiates each `NotificationSink` based on `kind`. Throws `SinkConfigError` with operator-actionable message on:
  - unknown `kind`
  - Slack: missing `webhookUrlEnv` resolved value in `env`
- `list(): Array<{config: NotificationSinkConfig; adapter: NotificationSink}>`
- `get(id: string): {config; adapter} | null`
- `dispose(): Promise<void>` — calls each adapter's optional `dispose()`.

**Test:** `packages/orchestrator/tests/notifications/registry.test.ts` — fromConfig happy path, unknown kind, missing env var, dispose calls each.

### T6 — Orchestrator: events.ts wireNotificationSinks

**File:** `packages/orchestrator/src/notifications/events.ts` (new)

Implement `wireNotificationSinks({bus, registry})` per proposal. Returns an unsubscribe function. Catches each `sink.deliver(...)` promise and re-emits as `notification.delivery.failed` on the bus.

Reuses `eventMatches` from `packages/orchestrator/src/gateway/webhooks/signer.ts` for glob matching.

**Test:** `packages/orchestrator/tests/notifications/events.test.ts` — bus emit on each topic, filter-by-events glob, wrap_response toggle, two sinks parallel delivery, slow sink doesn't block other (use a 200ms delay mock + assert other sink delivers within 5ms).

### T7 — Orchestrator: lifecycle integration

**File:** `packages/orchestrator/src/orchestrator.ts` (modified)

Add to `start()`:

- After webhook fanout wiring, load notifications config and wire sinks if any.
- Store `unwireNotifications` + `notificationsRegistry` as instance fields.

Add to `stop()` (or equivalent teardown):

- Call `unwireNotifications?.()` before draining other resources.
- Call `await notificationsRegistry?.dispose()`.

Use the existing event bus reference. If notifications config load fails (e.g., bad `kind`), log + continue startup (the doctor's `harness doctor` will surface the misconfiguration; we don't want notifications failures to brick orchestrator start).

**Test:** `packages/orchestrator/tests/notifications-integration.test.ts` — full lifecycle: start orchestrator with mock fetch + one Slack sink + emit `maintenance:completed` on bus → assert fetch was called with envelope-shaped Slack payload.

### T8 — Orchestrator: re-exports

**File:** `packages/orchestrator/src/index.ts` (modified)

Add re-exports for: `SinkRegistry`, `SlackSink`, `wrapAsEnvelope`, `NotificationSink` (type), `wireNotificationSinks`. Keep alphabetical grouping under a `// Hermes Phase 3` comment.

Also add `packages/orchestrator/src/notifications/index.ts` (new) for internal grouping.

### T9 — Core: config validator

**File:** `packages/core/src/config/notifications.ts` (new)

Function `loadNotificationsConfig(configPath: string): Result<NotificationsConfig, ConfigError>`:

- Read `harness.config.json`.
- Extract `notifications` key (may be absent).
- Validate against `NotificationsConfigSchema`.
- Return `Ok({sinks: []})` if section absent (allows incremental adoption).
- Return descriptive `Err` on parse failure (sink index + field).

Re-export from `packages/core/src/config/index.ts` if it exists, else `packages/core/src/index.ts`.

**Test:** `packages/core/tests/config/notifications.test.ts` — missing section (Ok empty), valid, unknown kind, malformed events.

### T10 — CLI: notifications test command

**File:** `packages/cli/src/commands/notifications/test.ts` (new)
**File:** `packages/cli/src/commands/notifications/index.ts` (new) — subcommand group

`harness notifications test <sink-id>`:

1. Load config from `harness.config.json` (CLI's existing config loader).
2. Synthesize a `GatewayEvent`: `{id: 'evt_test_*', type: 'notification.test', timestamp: now, data: {message: 'Test from harness CLI', triggeredAt: ISO}}`.
3. Build a `SinkRegistry` from config + `process.env`.
4. Look up `<sink-id>`; if not found, exit non-zero with "no sink named '...'; available: [a, b, c]".
5. Call `sink.adapter.deliver({payload: wrap_response ? wrapAsEnvelope(event) : event, wrapped: wrap_response})`.
6. Print outcome (`✓ delivered in 1.4s` / `✗ failed: HTTP 429`).

**Test:** `packages/cli/tests/commands/notifications/test.test.ts` — mock SinkRegistry, success path, unknown sink id.

### T11 — CLI: register notifications subcommand

**File:** `packages/cli/src/commands/_registry.ts` (modified)

Register `createNotificationsCommand()` returning a `Command` with the `test` subcommand attached. Follow existing patterns (e.g., `gateway` subcommand group).

### T12 — CLI: doctor hardening (parallel with T2–T11)

**File:** `packages/cli/src/commands/doctor.ts` (modified)

Steps:

1. Refactor `runDoctor()` to `async function runDoctor(cwd: string): Promise<DoctorResult>` (orchestrator-ping is async).
2. Update `createDoctorCommand()` to `await runDoctor(cwd)`.
3. Add `async function checkOrchestratorPing(cwd: string): Promise<CheckResult>`:
   - Read `HARNESS_API_TOKEN` env or first admin token from `.harness/tokens.json` (best effort; fall back to no auth header).
   - `GET http://localhost:<port>/api/v1/state` with 2s AbortController timeout. Default port from config or env (`HARNESS_ORCHESTRATOR_PORT`).
   - 200 → pass; non-2xx → fail with status code; connection refused / timeout → fail with "orchestrator not reachable".
4. Add `function checkHooksValidity(cwd: string): CheckResult[]`:
   - Read `.harness/hooks/` (gracefully skip if absent).
   - For each file: detect shebang `#!/usr/bin/env node` → `node --check <file>`; `#!/bin/bash` (or `sh`) → `bash -n <file>`; executable bit present but no shebang → presence check only.
   - One CheckResult per hook.
5. Add `function checkBaselineFreshness(cwd: string): CheckResult[]`:
   - For `.harness/arch/baselines.json` and `benchmark-baselines.json` (cwd root): stat mtime. Within TTL (default 30d, override `HARNESS_BASELINE_TTL_DAYS`) → pass; over TTL → warn; missing → info.
6. Add `function checkSessionsIntegrity(cwd: string): CheckResult`:
   - List `.harness/sessions/` (skip → info if absent).
   - For up to N=3 newest directories: try to parse `session-summary.json` (best effort schema validation).
   - All parse → pass; some fail → warn; all fail → fail.
7. Append calls in `runDoctor()` after existing checks.

**Test:** extend `packages/cli/tests/commands/doctor.test.ts`:

- `checkOrchestratorPing`: mock `fetch`, test 200 (pass), 401 (fail), timeout (fail).
- `checkHooksValidity`: fixture dir with one valid + one syntax-broken hook.
- `checkBaselineFreshness`: backdate fixture file mtime.
- `checkSessionsIntegrity`: fixture session dir with one valid + one corrupted summary.

### T13 — Docs: AGENTS.md + CHANGELOG

Update `AGENTS.md`:

- Under "Commands" section, add `harness notifications test <sink-id>` line.
- Under "Doctor" section (create if absent), enumerate new checks.

Update `CHANGELOG.md` under the most recent unreleased version (or add a new unreleased section). Entries:

- "Add `notifications` sink interface and Slack adapter (Hermes Phase 3)."
- "Add envelope wrapping for chat-style notifications (`wrap_response`)."
- "Harden `harness doctor` with orchestrator ping, hook validity, baseline freshness, sessions integrity."
- "Add `harness notifications test <sink-id>` CLI command."

### T14 — Docs: ADRs

**File:** `docs/knowledge/decisions/0013-notification-sink-interface.md` (new)

Frontmatter + sections: Context (CINotifier scope; webhook fanout as foundation), Decision (four pillars from spec D1–D4), Consequences, Alternatives Rejected.

**File:** `docs/knowledge/decisions/0014-doctor-live-state-checks.md` (new)

Frontmatter + sections: Context (presence-only checks lie after Phase 0/1/2 land), Decision (four new checks per D5; no external egress probes), Consequences, Alternatives Rejected.

### T15 — Docs: knowledge artifacts

**File:** `docs/knowledge/orchestrator/notification-sinks.md` (new) — `business_process`, `business_concept`, `business_rule` nodes per spec §"Knowledge Impact".

**File:** `docs/knowledge/cli/doctor-hardening.md` (new) — same shape, for doctor extensions.

Use existing knowledge-doc format (check sibling files in `docs/knowledge/orchestrator/` for the canonical frontmatter/heading shape).

### T16 — Verify: harness validate / check-arch / check-deps

Run from repo root:

```
pnpm install
pnpm -r typecheck
pnpm -r build
pnpm -r test
harness validate
harness check-arch
harness check-deps
```

All must pass before moving to T17.

### T17 — Verify: three-tier verification

Run `harness:verification` (or its mechanical equivalent — checks every Integration Point from the spec):

- **EXISTS** tier: every spec'd file exists.
- **SUBSTANTIVE** tier: every file has non-trivial content (e.g., `sink.ts` exports `NotificationSink`).
- **WIRED** tier: orchestrator lifecycle integrates the registry; events fanout subscribes; CLI registers the subcommand; doctor calls the new checks; ADRs link from each other and from the spec.

Update roadmap: `Hermes Phase 3: Multi-Sink Notifications` moves `planned → in-progress` then `→ done` upon PR merge.

## Risks & mitigations

| Risk                                                                                      | Mitigation                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack rate limit triggers under burst event load                                          | No retry on sink delivery; emit `notification.delivery.failed` for operator visibility; document the 1/sec limit                                                     |
| Doctor's orchestrator-ping causes a false-fail when orchestrator is intentionally stopped | Report as `info` with hint "start orchestrator if needed" rather than `fail` (revisit)                                                                               |
| Async `runDoctor` breaks downstream JSON consumers                                        | Snapshot test ensures JSON output shape is additive only                                                                                                             |
| Lifecycle teardown order races with bus emit                                              | `unwireNotifications` removes listeners first, then registry disposes; no in-flight `deliver()` after listener removal except already-awaited promises (best-effort) |
| `wrapAsEnvelope` derivers miss a new event-type                                           | Fallback case is the safety net; new event types just get a generic title until a deriver is added (additive)                                                        |

## Definition of done

- All 17 tasks complete.
- `pnpm -r test` green across types / core / orchestrator / cli.
- `harness validate` exit 0.
- `harness check-arch` exit 0.
- `harness check-deps` exit 0.
- Both ADRs landed in `docs/knowledge/decisions/`.
- `harness notifications test <sink-id>` runs end-to-end against a mock Slack receiver in the CI integration job.
- Roadmap entry updated to `done` post-merge.
