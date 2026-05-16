# Plan: Hermes Phase 0 — Phase 6: Reference Slack Bridge

**Date:** 2026-05-15
**Spec:** `docs/changes/hermes-phase-0-gateway-api/proposal.md` (Phase 6 / §850, complexity: low)
**Parent meta-spec:** `docs/changes/hermes-adoption/proposal.md`
**Roadmap item:** `Hermes Phase 0.1` (deferred carry-forward from Phase 0; original Phase 0 ship marked done at commit `83469fd6`)
**Phase 3 plan (HMAC + event contract reference):** `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-3-webhook-signing-plan.md`
**Phase 5 plan (`telemetry.*` fanout reference):** `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-14-phase-5-telemetry-export-plan.md`
**Starting commit:** `b1747f6f216b18e2c21c54cbcf1ffbd3a79102de`
**Session:** `changes--hermes-phase-0-gateway-api--proposal`
**Tasks:** 11
**Checkpoints:** 3 (`human-verify` after Task 7 signer property test, `human-action` for the live tunnel run at Task 10, `decision` at Task 11 for contract-gap disposition)
**Estimated time:** ~58 minutes implementation + 30-60 minutes manual end-to-end run (Task 10)
**Integration Tier:** medium

## Goal

Ship `examples/slack-echo-bridge/` as a standalone, externally-installable Node project that subscribes to `maintenance.completed` webhooks from a running harness orchestrator, verifies `X-Harness-Signature: sha256=<hex>` HMAC SHA-256 signatures via constant-time compare, and posts a formatted message to a Slack channel via `chat.postMessage`. The bridge MUST live outside the pnpm workspace (no `@harness-engineering/*` imports, no monorepo path dependencies) — it is the canonical end-to-end proof that an external author can consume the Phase 0 gateway API using only the published wire contract. This phase satisfies the anti-success-criterion §707 ("Reference bridge author reports the API contract is unusable") by producing the bridge, and it satisfies the Phase 0 success gates at §672 ("reference bridge built against the API") and §685 ("External test consumer exists"). Any API contract friction discovered during the manual tunnel run (Task 10) is filed as `phase-0-contract-gap` issues and either resolved or explicitly deferred with rationale in this plan's `decisions[]` before exit.

## Observable Truths (Acceptance Criteria)

1. **The system shall present `examples/slack-echo-bridge/` as a self-contained Node project** with its own `package.json`, `tsconfig.json`, `README.md`, and source tree under `src/` — installable via `cd examples/slack-echo-bridge && npm install` on a clean machine with no harness-engineering checkout in scope. Verified by manual `npm install` + `npm run typecheck` + `npm test` in Task 10's checkpoint.

2. **The bridge package.json shall declare zero `@harness-engineering/*` dependencies, zero `workspace:*` protocol entries, and zero `file:../../packages/*` paths.** Its runtime depends only on Node 20+ stdlib (`node:crypto`, `node:http`) plus `@slack/web-api`; its dev deps are `typescript`, `vitest`, `@types/node`. Verified by Task 1's `package.json` shape test + an `npm pack --dry-run` smoke check in Task 11.

3. **When the bridge HTTP listener receives `POST /webhooks/maintenance-completed` with a valid `X-Harness-Signature` header,** the system shall parse the JSON body as a `GatewayEvent`-shaped envelope (`{id, type, timestamp, data}`), call the Slack client with a formatted message that includes the maintenance task id and outcome, and respond `200 { ok: true }` within 5 s. Verified by `__tests__/webhook-handler.test.ts` (happy path with mocked Slack client).

4. **If the `X-Harness-Signature` header is missing OR malformed OR does not match `HMAC-SHA256(HARNESS_WEBHOOK_SECRET, rawBody)` computed via constant-time compare,** then the system shall respond `401 { error: "signature mismatch" }` and shall NOT invoke the Slack client. Verified by `__tests__/signer.test.ts` (4 cases: missing header, malformed header, length-mismatch hex, wrong-secret) AND `__tests__/webhook-handler.test.ts` (assert Slack client called 0 times on invalid signature).

5. **The signer module shall use `crypto.timingSafeEqual` for hex comparison and shall reject pairs of unequal byte length before calling `timingSafeEqual`** (since `timingSafeEqual` throws on mismatched lengths). Verified by `__tests__/signer.test.ts`'s length-mismatch case (asserts function returns `false`, does not throw).

6. **When the Slack `chat.postMessage` call fails** (network error, 4xx/5xx from Slack, `ok: false` in the response body), the system shall surface the verbatim Slack error in a structured log line at `error` level (`{level:'error', event:'slack.postMessage.failed', slackError, deliveryId, eventType}`) and shall return `502 { error: "slack delivery failed", detail: <slackError> }` to the orchestrator. Verified by `__tests__/webhook-handler.test.ts` (Slack-failure case).

7. **When the orchestrator retries a delivery for the same event** (same `X-Harness-Delivery-Id` header), the bridge SHALL accept the retry — Phase 6 does NOT implement idempotency suppression. The bridge's contract with the orchestrator is "5xx means retry"; idempotency is the orchestrator's job (Phase 4 retry ladder). Documented in README; not behavior-tested. (Idempotency is explicitly deferred — see Uncertainties.)

8. **When the bridge process receives SIGTERM,** the system shall stop accepting new HTTP connections, allow in-flight handlers up to 5 s to complete, and exit `0`. Verified by `__tests__/webhook-handler.test.ts` (graceful-shutdown test).

9. **The bridge README shall document** (a) the three required env vars `HARNESS_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`; (b) the local-run quickstart (clone OR copy directory, `npm install`, `npm start`); (c) a worked end-to-end example using a tunnel (Tailscale, Cloudflare Tunnel, or ngrok) referencing the canonical `docs/guides/gateway-tunnel.md` location (the guide itself is a Phase 0.2 deliverable — the bridge README references it by path even if the guide is not yet authored); (d) the 5-line HMAC verification snippet from `signer.ts` lines 8-14 so an author can crib the signing model into another language. Verified manually at Task 8's checkpoint.

10. **When `npm test` is run from `examples/slack-echo-bridge/`,** the system shall execute the full test suite (signer + webhook-handler) under `vitest run` against Node 20+ with zero workspace-protocol resolution and shall report green. Verified by Task 10's `npm test` invocation on a clean install.

11. **A real end-to-end run shall succeed:** the bridge subscribed to a live orchestrator via tunnel, a triggered `maintenance.completed` event delivers a signed POST to the bridge, the bridge verifies the HMAC, posts to the configured Slack channel, and the message is visible to a human observer. Verified at Task 10's `[checkpoint:human-action]`. This IS the Phase 6 exit gate (§870).

12. **Every API-contract friction point discovered during the live run shall be filed as a GitHub issue labeled `phase-0-contract-gap`** with a one-paragraph reproduction. Each filed issue is either resolved before Phase 6 closes OR explicitly deferred with a rationale entry in this plan's `decisions[]` (Task 11). Verified at Task 11's `[checkpoint:decision]`.

13. **For every Phase 6 task,** the system shall pass `harness validate` and `harness check-deps` at commit time. The bridge directory itself is OUTSIDE the workspace, so `harness validate` will not lint inside it — but the workspace itself must remain clean.

## Uncertainties

- **[ASSUMPTION] The `examples/` directory is NOT in the pnpm workspace.** Verified: `pnpm-workspace.yaml` includes only `packages/*`, `docs`, `agents/skills`. The bridge therefore lives at `examples/slack-echo-bridge/` with no workspace coupling and uses `npm` (not `pnpm`) for install commands in its README, matching the existing `examples/hello-world/` precedent (npm scripts, no pnpm-lock). Rejected: adding `examples/*` to the pnpm workspace — would defeat the "externally installable" goal and couple a teaching example to the monorepo's internal dependency graph.

- **[ASSUMPTION] Slack client library: `@slack/web-api`.** Slack's official Node SDK; one transitive dependency surface; supports `chat.postMessage` directly. Rejected: hand-rolled `fetch` against the Slack web API — would force the bridge to vendor Slack auth/retry semantics and increase the README's surface. The SDK is widely adopted and the bridge's README explicitly calls out that an author swapping it for `fetch` is fine.

- **[ASSUMPTION] HTTP framework: Node stdlib `http.createServer`, no Express/Fastify.** The bridge is ~150 LoC total; pulling in a framework would bury the simple "raw-body capture → verify → dispatch" flow that authors are supposed to crib. Rejected: Express — adds a transitive dep tree and obscures the raw-body capture detail (`req.on('data')`) that HMAC verification requires.

- **[ASSUMPTION] Raw-body capture pattern.** The handler reads `req` as a stream into a `Buffer`, computes HMAC over the exact bytes received, THEN `JSON.parse`s. JSON-then-stringify-then-HMAC would break verification because object-key ordering or whitespace in the orchestrator's `JSON.stringify(event)` is not guaranteed-preserving across a parse round-trip. Mirror pattern: `packages/orchestrator/src/gateway/webhooks/delivery.ts` signs `JSON.stringify(event)` — the bridge MUST verify the verbatim incoming buffer, not a re-stringification.

- **[ASSUMPTION] Event-type filtering.** The bridge subscribes ONLY to `maintenance.completed`; it does not handle `maintenance:error`, `maintenance:started`, or `telemetry.*`. The bridge responds 400 to non-`maintenance.completed` POSTs (a misconfiguration signal back to the operator who subscribed it to the wrong topic). Rejected: a multi-topic dispatch table — premature for a single-purpose reference; the README documents how an author adds topics.

- **[ASSUMPTION] Slack message shape.** A simple text message: `Maintenance task '<taskId>' completed: <status> (<findings count> findings, <fixed count> fixed)`. Pulls fields from `GatewayEvent.data` (which the orchestrator populates from the `MaintenanceResult` shape — see `orchestrator.ts:681`). The README explicitly tells authors the data shape is the same `MaintenanceResult` the orchestrator broadcasts internally, with a worked example payload pinned. Rejected: Slack Block Kit / interactive components — adds Slack-API surface area that competes with the "show the HMAC verification" purpose of the example.

- **[ASSUMPTION] No idempotency suppression in the bridge.** The orchestrator's Phase 4 retry ladder will replay the same `dlv_<hex>` Delivery-Id on transient failure. A naive Slack-poster will then post duplicate messages. The README documents this as a known property of the reference: "If you care about exactly-once Slack messages, store the `X-Harness-Delivery-Id` and drop duplicates yourself." Rejected: a Map-backed dedup cache in the reference — would mask the actual contract and add a state-leak (cache eviction policy, memory bound) for teaching purposes that should belong in real bridges, not the reference.

- **[ASSUMPTION] The bridge's webhook subscription is created out-of-band** (`harness gateway` CLI or `POST /api/v1/webhooks`), not by the bridge itself. The README's quickstart walks an operator through: (1) start the orchestrator, (2) create a token with `subscribe-webhook` scope, (3) `POST /api/v1/webhooks { url: 'https://<tunnel-host>/webhooks/maintenance-completed', events: ['maintenance.completed'], secret: '<HARNESS_WEBHOOK_SECRET>' }` — note the secret is supplied by the operator and matches the bridge's env var. Wait — the orchestrator GENERATES the secret server-side (Phase 3 spec §791 and `webhooks.ts` line 23: "generate a 32-byte secret server-side, base64url (~44 chars)"). The README MUST tell the operator to (a) call the API, (b) capture the one-shot `secret` field from the response, (c) export it as `HARNESS_WEBHOOK_SECRET` before starting the bridge. This is the load-bearing operator workflow detail; getting it wrong defeats verification.

- **[ASSUMPTION] Test runner.** `vitest run` — already the harness convention; Node 20+ compatible; no test runner dep beyond `vitest`. Rejected: Node's built-in `node --test` — would split the harness ecosystem into "examples use node:test, packages use vitest" with no operator-visible benefit.

- **[BLOCKING — RESOLVED inline] Bridge's package name and publish disposition.** The bridge is a _reference_ not a _package_. `package.json` MUST set `"name": "@harness-engineering/example-slack-echo-bridge"` (scoped, descriptive) AND `"private": true` AND `"version": "0.0.0"`. Rejected: publishing to npm — the bridge is an in-repo teaching reference; publishing would commit harness-engineering to maintaining it as a runtime dependency. Future Phase 0.x can break this out into a separate repo if external authors fork it heavily; for now it lives in-tree.

- **[DEFERRABLE] `docs/guides/gateway-tunnel.md` does not yet exist** (verified: `ls docs/guides/gateway-tunnel.md` → not found). The bridge README references it by path; the guide is a Phase 0.2 deliverable. If the README link is dead at Phase 6 close, an inline NOTE makes that explicit ("Tunnel guide forthcoming as part of Hermes Phase 0.2 — for now, see Tailscale/Cloudflare docs directly"). No blocker.

- **[DEFERRABLE] CHANGELOG entry.** Phase 6 lands a CHANGELOG entry under `Added` describing the reference bridge as the canonical external test consumer. Task 11 includes it.

- **[DEFERRABLE] Manual tunnel-run reproducibility.** Task 10 is a live human-driven run. The test plan does NOT automate "spin up a tunnel via Tailscale CLI" — that's a Phase 0.2 deliverable. The checkpoint records the operator's verification artifact (Slack message screenshot path or `ts` of the Slack post) in the handoff notes.

## Skill Annotations Active

From `docs/changes/hermes-phase-0-gateway-api/SKILLS.md` (Phase 0 program-wide):

- **Apply tier:** `ts-zod-integration` (Tasks 2 — type the GatewayEvent body), `node-crypto-patterns` (Task 4 — signer / constant-time compare) — note: SKILLS.md lists `node-crypto-patterns` in Reference; promoting to Apply for this phase because HMAC is the load-bearing correctness property.
- **Reference tier:** `events-event-schema` (Tasks 2, 5 — `GatewayEvent` envelope consumption), `ts-testing-types` (Tasks 4, 6 — typed test fixtures), `microservices-api-gateway` (Task 8 — README's tunnel pattern positioning), `owasp-security-headers` (Task 4 — defense-in-depth note in README on reverse-proxy headers).

## File Map

**CREATE (15) — all under `examples/slack-echo-bridge/`:**

- `examples/slack-echo-bridge/package.json` — standalone Node project, no workspace deps, scoped private package
- `examples/slack-echo-bridge/tsconfig.json` — ES2022, NodeNext module, strict, declaration off
- `examples/slack-echo-bridge/.gitignore` — `node_modules/`, `dist/`, `.env`
- `examples/slack-echo-bridge/.env.example` — three env-var template with comments
- `examples/slack-echo-bridge/README.md` — env vars, quickstart, tunnel pointer, 5-line HMAC snippet, known properties
- `examples/slack-echo-bridge/src/types.ts` — local `GatewayEvent` shape (mirrors `packages/types/src/webhooks.ts` lines 35-42 — duplicated by design, NOT imported)
- `examples/slack-echo-bridge/src/signer.ts` — `verify(secret, rawBody, headerSig): boolean` using `crypto.timingSafeEqual`
- `examples/slack-echo-bridge/src/slack-client.ts` — thin wrapper around `@slack/web-api`'s `WebClient.chat.postMessage`
- `examples/slack-echo-bridge/src/webhook-handler.ts` — HTTP server factory; raw-body capture; signer → slack-client wire-up; structured logs; SIGTERM handler
- `examples/slack-echo-bridge/src/index.ts` — env-var validation + `webhook-handler.createServer(...)` + `listen()` + SIGTERM wiring
- `examples/slack-echo-bridge/src/logger.ts` — minimal JSON-line structured logger (`{level, event, ...fields}`)
- `examples/slack-echo-bridge/__tests__/signer.test.ts` — 5 cases: valid, wrong-secret, missing-header, malformed-header, length-mismatch
- `examples/slack-echo-bridge/__tests__/webhook-handler.test.ts` — full HTTP flow with mocked Slack client (happy / invalid-sig / Slack-fails / SIGTERM)
- `examples/slack-echo-bridge/__tests__/fixtures.ts` — shared event fixture + secret + sign-helper for tests (NOT exported from src/)
- `examples/slack-echo-bridge/vitest.config.ts` — `node` environment, glob `__tests__/**/*.test.ts`

**MODIFY (3):**

- `.gitignore` (repo root) — add `examples/slack-echo-bridge/.env` to the existing block so an operator's local-run secrets don't get committed
- `README.md` (repo root) — under the existing "Key features" Gateway API bullet, append a sentence pointing at `examples/slack-echo-bridge/` as the canonical external test consumer
- `CHANGELOG.md` — under `## [Unreleased]` → `### Added`, prepend a Phase 6 entry describing the reference bridge

**Evidence (file:line for the patterns this plan builds on):**

- `packages/orchestrator/src/gateway/webhooks/signer.ts:1-31` — canonical `sign()` / `verify()` shape using `createHmac` + `timingSafeEqual`; bridge MUST mirror byte-for-byte (the bridge's `verify` is a server-side analog of orchestrator's signing).
- `packages/orchestrator/src/gateway/webhooks/signer.ts:8-14` — the 5-line bridge-verification snippet that the bridge README quotes verbatim. Cited.
- `packages/types/src/webhooks.ts:35-42` — `GatewayEventSchema` shape: `{id, type, timestamp, data, correlationId?}`. The bridge's `types.ts` mirrors this WITHOUT importing — it's a wire-contract duplication, intentional.
- `packages/orchestrator/src/gateway/webhooks/delivery.ts:54-62` — `JSON.stringify(event)` is the signed payload; the bridge MUST HMAC-verify the raw incoming buffer (NOT a re-stringification).
- `packages/orchestrator/src/orchestrator.ts:680-681` — `broadcastMaintenance('maintenance:completed', result)` + `this.emit('maintenance:completed', result)`. The `result` is a `MaintenanceResult`-shaped object — the README documents this field list with a worked example.
- `packages/orchestrator/src/gateway/webhooks/events.ts:42-48` — colon-to-dot normalization: orchestrator emits `maintenance:completed`, webhook delivery type is `maintenance.completed`. The bridge filters on the DOT form because that's what arrives on the wire.
- `examples/hello-world/package.json` — precedent for `npm` (not `pnpm`) scripts in examples; precedent for `"private": true`; precedent for vitest dev-dep only.
- `examples/hello-world/tsconfig.json` — precedent for ES2022 + ESNext + bundler moduleResolution; bridge uses NodeNext instead (it's a runtime, not a library — needs Node-native module resolution).
- `.gitignore` lines covering `.harness/webhooks.json`, `tokens.json`, `audit.log` — precedent for one cohesive block for runtime-secret artifacts; bridge `.env` joins that block.

## Skeleton

1. Scaffold standalone project: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `vitest.config.ts` (1 task, ~5 min) — decision-agnostic prelude
2. Bridge-local `types.ts` mirroring `GatewayEvent` (1 task, ~3 min)
3. `logger.ts` minimal JSON-line structured logger (1 task, ~3 min)
4. `signer.ts` HMAC SHA-256 verify with constant-time compare (1 task, ~6 min)
5. `__tests__/fixtures.ts` shared test fixtures (1 task, ~3 min)
6. `__tests__/signer.test.ts` 5-case property test `[checkpoint:human-verify after Task 6]` (1 task, ~6 min)
7. `slack-client.ts` Slack `chat.postMessage` wrapper (1 task, ~4 min)
8. `webhook-handler.ts` HTTP server factory + raw-body + SIGTERM (1 task, ~8 min)
9. `__tests__/webhook-handler.test.ts` full flow with mocked Slack (1 task, ~7 min)
10. `index.ts` + `README.md` + `.env.example` polish (1 task, ~6 min) `[checkpoint:human-action: live tunnel run]`
11. Repo-root `.gitignore`, `README.md`, `CHANGELOG.md` updates + `phase-0-contract-gap` issue disposition + final phase-gate (1 task, ~7 min) `[checkpoint:decision: confirm zero unresolved contract gaps OR document deferrals]`

**Estimated total:** 11 tasks, ~58 minutes implementation + 30-60 min manual tunnel run at Task 10.
_Skeleton approval gate: standard mode + task count < 8 → skipped per Rigor Levels table. Skeleton is included for handoff readability._

## Tasks

### Task 1: Scaffold `examples/slack-echo-bridge/` as a standalone Node project

**Depends on:** none | **Files:** `examples/slack-echo-bridge/package.json`, `examples/slack-echo-bridge/tsconfig.json`, `examples/slack-echo-bridge/.gitignore`, `examples/slack-echo-bridge/.env.example`, `examples/slack-echo-bridge/vitest.config.ts` | **Time:** ~5 min
**Skills:** `microservices-api-gateway` (reference)

1. Create `examples/slack-echo-bridge/package.json`:

   ```json
   {
     "name": "@harness-engineering/example-slack-echo-bridge",
     "version": "0.0.0",
     "private": true,
     "description": "Reference Slack bridge for harness Gateway API webhooks — verifies HMAC SHA-256, posts to Slack on maintenance.completed.",
     "type": "module",
     "main": "dist/index.js",
     "scripts": {
       "build": "tsc",
       "start": "node dist/index.js",
       "dev": "tsx src/index.ts",
       "test": "vitest run",
       "typecheck": "tsc --noEmit"
     },
     "engines": {
       "node": ">=20"
     },
     "dependencies": {
       "@slack/web-api": "^7.0.0"
     },
     "devDependencies": {
       "@types/node": "^22.0.0",
       "tsx": "^4.0.0",
       "typescript": "^5.9.0",
       "vitest": "^4.0.0"
     }
   }
   ```

2. Create `examples/slack-echo-bridge/tsconfig.json`:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "resolveJsonModule": true,
       "outDir": "dist",
       "rootDir": "src",
       "declaration": false,
       "sourceMap": true
     },
     "include": ["src", "__tests__"],
     "exclude": ["node_modules", "dist"]
   }
   ```

3. Create `examples/slack-echo-bridge/.gitignore`:

   ```
   node_modules/
   dist/
   .env
   *.log
   ```

4. Create `examples/slack-echo-bridge/.env.example`:

   ```bash
   # Required: secret shared with the harness orchestrator's webhook subscription.
   # Capture this from the one-time `secret` field in POST /api/v1/webhooks response.
   HARNESS_WEBHOOK_SECRET=replace-me-base64url-secret-from-orchestrator-response

   # Required: Slack bot token with chat:write scope.
   # https://api.slack.com/authentication/token-types#bot
   SLACK_BOT_TOKEN=xoxb-replace-me

   # Required: Slack channel ID (NOT name — find via channel details → "About").
   SLACK_CHANNEL=C0000000000

   # Optional: HTTP port the bridge listens on. Default: 3000.
   PORT=3000
   ```

5. Create `examples/slack-echo-bridge/vitest.config.ts`:

   ```ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       environment: 'node',
       include: ['__tests__/**/*.test.ts'],
     },
   });
   ```

6. Run from repo root: `harness validate` — must pass. The bridge directory is outside the workspace; harness does not lint inside it.
7. Run from repo root: `harness check-deps` — must pass.
8. Commit: `feat(examples): scaffold slack-echo-bridge standalone project (Phase 6 Task 1)`

**Verification:** `cd examples/slack-echo-bridge && cat package.json | grep -E 'workspace:|file:\.\./'` returns ZERO matches — confirms the bridge is workspace-free.

---

### Task 2: Define the bridge-local `GatewayEvent` type

**Depends on:** Task 1 | **Files:** `examples/slack-echo-bridge/src/types.ts` | **Time:** ~3 min
**Skills:** `events-event-schema` (reference), `ts-zod-integration` (apply — informational, no zod runtime here)

1. Create `examples/slack-echo-bridge/src/types.ts`:

   ```ts
   /**
    * Wire-contract types for harness Gateway API webhook deliveries.
    *
    * INTENTIONALLY duplicated from packages/types/src/webhooks.ts:35-42 —
    * this bridge MUST be installable by an external author with no
    * harness-engineering source in scope. The duplication is the cost of
    * proving the wire contract is sufficient.
    *
    * If the orchestrator's GatewayEvent shape evolves, this file MUST be
    * updated and the README's example payload regenerated. Drift is caught
    * by webhook-handler.test.ts's parse step.
    */

   /** A single envelope delivered to the bridge URL. */
   export interface GatewayEvent {
     /** Unique delivery envelope id: "evt_" + hex. Also sent as X-Harness-Delivery-Id. */
     id: string;
     /** Event type: "maintenance.completed" for this bridge. */
     type: string;
     /** ISO-8601 timestamp at orchestrator emit time. */
     timestamp: string;
     /** Event-specific payload. For maintenance.completed: a MaintenanceResult. */
     data: unknown;
     /** Optional correlation id linking related events (e.g., a maintenance run + its children). */
     correlationId?: string;
   }

   /**
    * Shape of `data` for `maintenance.completed` events.
    *
    * Source: packages/orchestrator/src/orchestrator.ts:672-681 emits the
    * MaintenanceResult verbatim. The fields below are the load-bearing
    * subset; additional fields are tolerated (the bridge does not validate
    * unknown keys).
    */
   export interface MaintenanceCompletedData {
     taskId: string;
     status: 'success' | 'failure' | string;
     findings?: Array<{ severity?: string; message?: string }>;
     fixed?: Array<unknown>;
   }
   ```

2. Run: `cd examples/slack-echo-bridge && npm install` (one-time install to set up `node_modules` for typecheck) — must succeed with zero `workspace:` resolutions.
3. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
4. Run from repo root: `harness validate` — must pass.
5. Commit: `feat(examples): add GatewayEvent wire-contract types to slack-echo-bridge (Phase 6 Task 2)`

**Verification:** Bridge's `types.ts` has no `import` from `@harness-engineering/*`. Confirmed by `grep -r '@harness-engineering' examples/slack-echo-bridge/src/` returning empty.

---

### Task 3: Add `logger.ts` — minimal JSON-line structured logger

**Depends on:** Task 1 | **Files:** `examples/slack-echo-bridge/src/logger.ts` | **Time:** ~3 min

1. Create `examples/slack-echo-bridge/src/logger.ts`:

   ```ts
   /**
    * Minimal JSON-line logger. One log record per line, machine-readable.
    *
    * Why not pino/winston: the bridge is a teaching reference. Adding a
    * logging framework would obscure the structured-log discipline that
    * we want authors to crib (level, event, context fields).
    *
    * Authors swapping this for pino/winston is fine and documented in
    * README "Customizing the bridge".
    */

   type Level = 'info' | 'warn' | 'error';

   function emit(level: Level, event: string, fields: Record<string, unknown>): void {
     const record = { level, event, ts: new Date().toISOString(), ...fields };
     const stream = level === 'error' ? process.stderr : process.stdout;
     stream.write(`${JSON.stringify(record)}\n`);
   }

   export const log = {
     info: (event: string, fields: Record<string, unknown> = {}): void =>
       emit('info', event, fields),
     warn: (event: string, fields: Record<string, unknown> = {}): void =>
       emit('warn', event, fields),
     error: (event: string, fields: Record<string, unknown> = {}): void =>
       emit('error', event, fields),
   };
   ```

2. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
3. Run from repo root: `harness validate` — must pass.
4. Commit: `feat(examples): add JSON-line logger to slack-echo-bridge (Phase 6 Task 3)`

**Verification:** Logger emits one JSON record per call; no transitive deps.

---

### Task 4: Implement `signer.ts` — HMAC SHA-256 verify with constant-time compare

**Depends on:** Task 1 | **Files:** `examples/slack-echo-bridge/src/signer.ts` | **Time:** ~6 min
**Skills:** `node-crypto-patterns` (apply), `owasp-security-headers` (reference)

1. Create `examples/slack-echo-bridge/src/signer.ts`:

   ```ts
   import { createHmac, timingSafeEqual } from 'node:crypto';

   /**
    * HMAC SHA-256 verification for harness Gateway API webhook deliveries.
    *
    * The orchestrator signs each delivery with:
    *   X-Harness-Signature: sha256=<lowercase-hex>
    * where signature = HMAC-SHA256(secret, rawBody).
    *
    * Source-of-truth: packages/orchestrator/src/gateway/webhooks/signer.ts
    * (cited in README §"Verifying signatures").
    *
    * The 5-line verification snippet that the spec §792 promised:
    *
    *   const expected = 'sha256=' + crypto
    *     .createHmac('sha256', secret)
    *     .update(rawBody)
    *     .digest('hex');
    *   if (!crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected))) reject();
    *
    * `rawBody` MUST be the verbatim bytes of the request body — NOT a
    * JSON.parse → JSON.stringify round-trip (whitespace / key-order are not
    * preserved through that round-trip and the HMAC will mismatch).
    */
   export function verify(secret: string, rawBody: Buffer, presented: string | undefined): boolean {
     if (typeof presented !== 'string' || presented.length === 0) return false;
     if (!presented.startsWith('sha256=')) return false;

     const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
     const a = Buffer.from(expected);
     const b = Buffer.from(presented);

     // timingSafeEqual throws on length mismatch; check length first so the
     // function returns a boolean for ANY input (no thrown TypeError surface
     // the caller has to handle).
     if (a.length !== b.length) return false;

     try {
       return timingSafeEqual(a, b);
     } catch {
       return false;
     }
   }
   ```

2. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
3. Run from repo root: `harness validate` — must pass.
4. Commit: `feat(examples): add HMAC SHA-256 verify with constant-time compare to slack-echo-bridge (Phase 6 Task 4)`

**Verification:** `signer.ts` uses ONLY `node:crypto` stdlib; the 5-line snippet promised by spec §792 is documented in the JSDoc.

---

### Task 5: Add `__tests__/fixtures.ts` — shared event fixture + sign helper

**Depends on:** Task 4 | **Files:** `examples/slack-echo-bridge/__tests__/fixtures.ts` | **Time:** ~3 min
**Skills:** `ts-testing-types` (reference)

1. Create `examples/slack-echo-bridge/__tests__/fixtures.ts`:

   ```ts
   import { createHmac } from 'node:crypto';
   import type { GatewayEvent } from '../src/types.js';

   export const TEST_SECRET = 'test-secret-32-bytes-of-entropy!';

   export function makeMaintenanceCompletedEvent(): GatewayEvent {
     return {
       id: 'evt_0123456789abcdef',
       type: 'maintenance.completed',
       timestamp: '2026-05-15T12:00:00.000Z',
       data: {
         taskId: 'rule-coverage-scan',
         status: 'success',
         findings: [{ severity: 'info', message: '12 rules covered' }],
         fixed: [],
       },
     };
   }

   /** Produce the X-Harness-Signature header value the orchestrator would send for `body`. */
   export function signBody(secret: string, body: Buffer | string): string {
     const buf = typeof body === 'string' ? Buffer.from(body) : body;
     return `sha256=${createHmac('sha256', secret).update(buf).digest('hex')}`;
   }
   ```

2. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
3. Run from repo root: `harness validate` — must pass.
4. Commit: `test(examples): add shared test fixtures to slack-echo-bridge (Phase 6 Task 5)`

**Verification:** Fixture event has the exact shape that `webhook-handler.test.ts` will round-trip through `signer.verify`.

---

### Task 6: TDD — `__tests__/signer.test.ts` covers 5 cases (valid / wrong-secret / missing / malformed / length-mismatch)

**Depends on:** Tasks 4, 5 | **Files:** `examples/slack-echo-bridge/__tests__/signer.test.ts` | **Time:** ~6 min
**Skills:** `node-crypto-patterns` (apply), `ts-testing-types` (reference)

1. Create `examples/slack-echo-bridge/__tests__/signer.test.ts`:

   ```ts
   import { describe, expect, it } from 'vitest';
   import { verify } from '../src/signer.js';
   import { TEST_SECRET, signBody } from './fixtures.js';

   describe('signer.verify', () => {
     const body = Buffer.from('{"id":"evt_1","type":"maintenance.completed"}');

     it('accepts a valid signature', () => {
       const sig = signBody(TEST_SECRET, body);
       expect(verify(TEST_SECRET, body, sig)).toBe(true);
     });

     it('rejects a signature computed with the wrong secret', () => {
       const sig = signBody('wrong-secret-32-bytes-of-entropy!', body);
       expect(verify(TEST_SECRET, body, sig)).toBe(false);
     });

     it('rejects when the header is undefined', () => {
       expect(verify(TEST_SECRET, body, undefined)).toBe(false);
     });

     it('rejects when the header is malformed (no sha256= prefix)', () => {
       expect(verify(TEST_SECRET, body, 'deadbeef')).toBe(false);
     });

     it('rejects on length mismatch without throwing', () => {
       // shorter than the expected 71 chars; timingSafeEqual would throw,
       // verify() must catch the length guard and return false.
       expect(verify(TEST_SECRET, body, 'sha256=abc')).toBe(false);
     });

     it('rejects when the rawBody is mutated by one byte', () => {
       const sig = signBody(TEST_SECRET, body);
       const tampered = Buffer.from(body);
       tampered[0] = tampered[0] ^ 0x01;
       expect(verify(TEST_SECRET, tampered, sig)).toBe(false);
     });
   });
   ```

2. Run: `cd examples/slack-echo-bridge && npx vitest run __tests__/signer.test.ts` — observe all 6 cases pass (the 5 spec cases + the tampered-body case).
3. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
4. Run from repo root: `harness validate` — must pass.
5. **`[checkpoint:human-verify]`** — Operator confirms the signer test output shows 6 green checks INCLUDING the explicit length-mismatch case (the load-bearing safety property). Operator records the exact `vitest run` output line count in handoff notes.
6. Commit: `test(examples): cover signer with 6 cases including length-mismatch property (Phase 6 Task 6)`

**Verification:** All 6 signer tests pass; the length-mismatch case explicitly exercises the `if (a.length !== b.length) return false;` guard.

---

### Task 7: Implement `slack-client.ts` — `chat.postMessage` wrapper

**Depends on:** Task 1 | **Files:** `examples/slack-echo-bridge/src/slack-client.ts` | **Time:** ~4 min

1. Create `examples/slack-echo-bridge/src/slack-client.ts`:

   ```ts
   import { WebClient } from '@slack/web-api';
   import type { MaintenanceCompletedData } from './types.js';

   /**
    * Thin wrapper around Slack's WebClient.chat.postMessage.
    *
    * Why a wrapper at all: webhook-handler.test.ts mocks THIS, not the
    * raw WebClient. The wrapper is the seam between "HTTP handler logic"
    * and "Slack-API surface area" — keeping it narrow makes the handler
    * test independent of @slack/web-api's internals.
    *
    * Slack errors surface verbatim — we do NOT translate them. The
    * orchestrator's webhook delivery worker treats 5xx as retryable; the
    * caller is responsible for choosing 5xx vs 4xx based on the Slack
    * error category.
    */

   export interface SlackPoster {
     postMaintenanceCompleted(data: MaintenanceCompletedData): Promise<void>;
   }

   export function createSlackPoster(opts: { token: string; channel: string }): SlackPoster {
     const client = new WebClient(opts.token);
     return {
       async postMaintenanceCompleted(data: MaintenanceCompletedData): Promise<void> {
         const findings = data.findings?.length ?? 0;
         const fixed = data.fixed?.length ?? 0;
         const text = `Maintenance task \`${data.taskId}\` completed: *${data.status}* (${findings} findings, ${fixed} fixed)`;
         const res = await client.chat.postMessage({ channel: opts.channel, text });
         if (!res.ok) {
           // The SDK throws on transport errors; this catches the `{ ok: false }` rare path.
           throw new Error(`slack chat.postMessage returned ok=false: ${String(res.error)}`);
         }
       },
     };
   }
   ```

2. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
3. Run from repo root: `harness validate` — must pass.
4. Commit: `feat(examples): add Slack chat.postMessage wrapper to slack-echo-bridge (Phase 6 Task 7)`

**Verification:** `slack-client.ts` exposes a `SlackPoster` interface that the handler test can mock without touching `@slack/web-api`.

---

### Task 8: Implement `webhook-handler.ts` — HTTP server, raw-body capture, signature verify, SIGTERM

**Depends on:** Tasks 2, 3, 4, 7 | **Files:** `examples/slack-echo-bridge/src/webhook-handler.ts` | **Time:** ~8 min
**Skills:** `microservices-api-gateway` (reference)

1. Create `examples/slack-echo-bridge/src/webhook-handler.ts`:

   ```ts
   import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
   import { verify } from './signer.js';
   import { log } from './logger.js';
   import type { GatewayEvent, MaintenanceCompletedData } from './types.js';
   import type { SlackPoster } from './slack-client.js';

   export interface HandlerOptions {
     secret: string;
     slack: SlackPoster;
     /** Path the orchestrator subscription is configured to POST to. Default: /webhooks/maintenance-completed */
     path?: string;
     /** Max ms to allow in-flight handlers during graceful shutdown. Default: 5000. */
     shutdownTimeoutMs?: number;
   }

   /**
    * Build a Node http.Server that:
    *   - accepts POST <path> only
    *   - reads the raw body into a Buffer
    *   - verifies X-Harness-Signature via HMAC SHA-256
    *   - filters to type === 'maintenance.completed'
    *   - dispatches to Slack
    *   - logs every step at info/warn/error
    *
    * The factory returns the server WITHOUT calling listen(); the caller
    * picks the port. SIGTERM wiring is the CALLER's responsibility (index.ts).
    */
   export function createServer_(opts: HandlerOptions): Server {
     const path = opts.path ?? '/webhooks/maintenance-completed';

     async function readBody(req: IncomingMessage): Promise<Buffer> {
       const chunks: Buffer[] = [];
       for await (const chunk of req) {
         chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
       }
       return Buffer.concat(chunks);
     }

     function sendJson(res: ServerResponse, status: number, body: unknown): void {
       const payload = JSON.stringify(body);
       res.writeHead(status, { 'content-type': 'application/json' });
       res.end(payload);
     }

     return createServer((req, res) => {
       void (async () => {
         if (req.method !== 'POST' || req.url !== path) {
           sendJson(res, 404, { error: 'not found' });
           return;
         }
         const deliveryId = String(req.headers['x-harness-delivery-id'] ?? '');
         const eventType = String(req.headers['x-harness-event-type'] ?? '');
         const sigHeader = req.headers['x-harness-signature'];
         const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

         try {
           const rawBody = await readBody(req);

           if (!verify(opts.secret, rawBody, sig)) {
             log.warn('webhook.signature.mismatch', { deliveryId, eventType });
             sendJson(res, 401, { error: 'signature mismatch' });
             return;
           }

           let event: GatewayEvent;
           try {
             event = JSON.parse(rawBody.toString('utf8')) as GatewayEvent;
           } catch (err) {
             log.warn('webhook.body.parse_failed', { deliveryId, error: String(err) });
             sendJson(res, 400, { error: 'invalid json body' });
             return;
           }

           if (event.type !== 'maintenance.completed') {
             log.warn('webhook.event.unsupported', { deliveryId, eventType: event.type });
             sendJson(res, 400, { error: `unsupported event type: ${event.type}` });
             return;
           }

           log.info('webhook.received', { deliveryId, eventType: event.type, id: event.id });

           try {
             await opts.slack.postMaintenanceCompleted(event.data as MaintenanceCompletedData);
             log.info('webhook.delivered', { deliveryId, id: event.id });
             sendJson(res, 200, { ok: true });
           } catch (err) {
             log.error('slack.postMessage.failed', {
               deliveryId,
               eventType: event.type,
               slackError: String(err),
             });
             sendJson(res, 502, { error: 'slack delivery failed', detail: String(err) });
           }
         } catch (err) {
           log.error('webhook.unexpected_error', { deliveryId, error: String(err) });
           sendJson(res, 500, { error: 'internal error' });
         }
       })();
     });
   }

   // Re-export with the natural name for callers; the trailing underscore on
   // the implementation avoids shadowing the imported `createServer`.
   export { createServer_ as createWebhookServer };

   /**
    * Wire SIGTERM / SIGINT to a graceful shutdown: stop accepting new
    * connections, wait up to shutdownTimeoutMs for in-flight to drain,
    * then exit 0.
    */
   export function installShutdownHandlers(server: Server, shutdownTimeoutMs = 5_000): void {
     const shutdown = (signal: string): void => {
       log.info('shutdown.signal', { signal });
       server.close(() => {
         log.info('shutdown.complete', {});
         process.exit(0);
       });
       setTimeout(() => {
         log.warn('shutdown.timeout_forced_exit', { shutdownTimeoutMs });
         process.exit(0);
       }, shutdownTimeoutMs).unref();
     };
     process.on('SIGTERM', () => shutdown('SIGTERM'));
     process.on('SIGINT', () => shutdown('SIGINT'));
   }
   ```

2. Run: `cd examples/slack-echo-bridge && npm run typecheck` — must pass.
3. Run from repo root: `harness validate` — must pass.
4. Commit: `feat(examples): add webhook HTTP handler with raw-body HMAC verify + SIGTERM (Phase 6 Task 8)`

**Verification:** `webhook-handler.ts` reads raw body BEFORE parsing JSON (the load-bearing HMAC-correctness property); filters non-`maintenance.completed` types with 400; surfaces Slack errors as 502 with verbatim detail.

---

### Task 9: TDD — `__tests__/webhook-handler.test.ts` covers full HTTP flow

**Depends on:** Tasks 5, 8 | **Files:** `examples/slack-echo-bridge/__tests__/webhook-handler.test.ts` | **Time:** ~7 min
**Skills:** `ts-testing-types` (reference)

1. Create `examples/slack-echo-bridge/__tests__/webhook-handler.test.ts`:

   ```ts
   import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
   import type { AddressInfo } from 'node:net';
   import type { Server } from 'node:http';
   import { createWebhookServer, installShutdownHandlers } from '../src/webhook-handler.js';
   import type { SlackPoster } from '../src/slack-client.js';
   import { TEST_SECRET, makeMaintenanceCompletedEvent, signBody } from './fixtures.js';

   function startOnPort0(server: Server): Promise<number> {
     return new Promise((resolve) => {
       server.listen(0, '127.0.0.1', () => {
         resolve((server.address() as AddressInfo).port);
       });
     });
   }

   function stop(server: Server): Promise<void> {
     return new Promise((resolve) => server.close(() => resolve()));
   }

   describe('webhook-handler', () => {
     let slack: SlackPoster & { postMaintenanceCompleted: ReturnType<typeof vi.fn> };
     let server: Server;
     let port: number;

     beforeEach(async () => {
       slack = { postMaintenanceCompleted: vi.fn(async () => undefined) };
       server = createWebhookServer({ secret: TEST_SECRET, slack });
       port = await startOnPort0(server);
     });

     afterEach(async () => {
       await stop(server);
       vi.restoreAllMocks();
     });

     async function post(
       headers: Record<string, string>,
       body: string
     ): Promise<{ status: number; json: unknown }> {
       const res = await fetch(`http://127.0.0.1:${port}/webhooks/maintenance-completed`, {
         method: 'POST',
         headers: { 'content-type': 'application/json', ...headers },
         body,
       });
       const json = await res.json().catch(() => null);
       return { status: res.status, json };
     }

     it('accepts a valid signed delivery and calls Slack', async () => {
       const event = makeMaintenanceCompletedEvent();
       const body = JSON.stringify(event);
       const sig = signBody(TEST_SECRET, body);
       const { status, json } = await post(
         {
           'x-harness-signature': sig,
           'x-harness-delivery-id': 'dlv_test',
           'x-harness-event-type': event.type,
         },
         body
       );
       expect(status).toBe(200);
       expect(json).toEqual({ ok: true });
       expect(slack.postMaintenanceCompleted).toHaveBeenCalledOnce();
     });

     it('rejects invalid signatures with 401 and does NOT call Slack', async () => {
       const event = makeMaintenanceCompletedEvent();
       const body = JSON.stringify(event);
       const { status, json } = await post(
         { 'x-harness-signature': 'sha256=deadbeef', 'x-harness-event-type': event.type },
         body
       );
       expect(status).toBe(401);
       expect(json).toEqual({ error: 'signature mismatch' });
       expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
     });

     it('rejects unsupported event types with 400', async () => {
       const event = { ...makeMaintenanceCompletedEvent(), type: 'maintenance.error' };
       const body = JSON.stringify(event);
       const sig = signBody(TEST_SECRET, body);
       const { status } = await post(
         { 'x-harness-signature': sig, 'x-harness-event-type': event.type },
         body
       );
       expect(status).toBe(400);
       expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
     });

     it('returns 502 with verbatim Slack error when chat.postMessage throws', async () => {
       slack.postMaintenanceCompleted.mockRejectedValueOnce(new Error('rate_limited'));
       const event = makeMaintenanceCompletedEvent();
       const body = JSON.stringify(event);
       const sig = signBody(TEST_SECRET, body);
       const { status, json } = await post(
         { 'x-harness-signature': sig, 'x-harness-event-type': event.type },
         body
       );
       expect(status).toBe(502);
       expect(json).toMatchObject({
         error: 'slack delivery failed',
         detail: expect.stringContaining('rate_limited'),
       });
     });

     it('returns 404 for unrelated paths', async () => {
       const res = await fetch(`http://127.0.0.1:${port}/random`, { method: 'POST' });
       expect(res.status).toBe(404);
       expect(slack.postMaintenanceCompleted).not.toHaveBeenCalled();
     });

     it('installShutdownHandlers wires SIGTERM/SIGINT without throwing', () => {
       // Smoke: we cannot actually emit SIGTERM in-test without killing the
       // vitest process. Assert the function is invokable and does not throw.
       expect(() => installShutdownHandlers(server, 1)).not.toThrow();
     });
   });
   ```

2. Run: `cd examples/slack-echo-bridge && npx vitest run __tests__/webhook-handler.test.ts` — observe all 6 cases pass.
3. Run: `cd examples/slack-echo-bridge && npm test` — full suite green (signer + handler = 12 tests).
4. Run from repo root: `harness validate` — must pass.
5. Commit: `test(examples): cover slack-echo-bridge webhook handler full HTTP flow (Phase 6 Task 9)`

**Verification:** Full test suite (signer + webhook-handler) passes on a clean machine via `npm test`; happy/invalid-sig/unsupported-type/Slack-fails/404/SIGTERM-smoke all green.

---

### Task 10: Wire `index.ts`, finalize `README.md`, run the live tunnel end-to-end

**Depends on:** Tasks 6, 9 | **Files:** `examples/slack-echo-bridge/src/index.ts`, `examples/slack-echo-bridge/README.md` | **Time:** ~6 min implementation + 30-60 min manual run
**Skills:** `microservices-api-gateway` (reference), `owasp-security-headers` (reference)

1. Create `examples/slack-echo-bridge/src/index.ts`:

   ```ts
   import { createSlackPoster } from './slack-client.js';
   import { createWebhookServer, installShutdownHandlers } from './webhook-handler.js';
   import { log } from './logger.js';

   function requireEnv(name: string): string {
     const v = process.env[name];
     if (typeof v !== 'string' || v.length === 0) {
       process.stderr.write(`missing required env var: ${name}\n`);
       process.exit(1);
     }
     return v;
   }

   function main(): void {
     const secret = requireEnv('HARNESS_WEBHOOK_SECRET');
     const slackToken = requireEnv('SLACK_BOT_TOKEN');
     const slackChannel = requireEnv('SLACK_CHANNEL');
     const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);

     const slack = createSlackPoster({ token: slackToken, channel: slackChannel });
     const server = createWebhookServer({ secret, slack });
     installShutdownHandlers(server);

     server.listen(port, () => {
       log.info('bridge.listening', { port, path: '/webhooks/maintenance-completed' });
     });
   }

   main();
   ```

2. Create `examples/slack-echo-bridge/README.md`:

   ````markdown
   # Slack Echo Bridge — Reference Consumer for the harness Gateway API

   A standalone Node service that subscribes to `maintenance.completed` webhooks from a running harness orchestrator, verifies the `X-Harness-Signature` HMAC SHA-256 signature, and posts a formatted message to a Slack channel.

   This is the **canonical reference consumer** for the harness Gateway API (Phase 0). It exists to prove that an external author — with no harness-engineering source checkout — can build a working bridge using only the published wire contract.

   ## What this is NOT

   - Not a production bridge (no idempotency suppression — duplicate Slack messages on orchestrator retry are possible by design)
   - Not a generic webhook framework (single event type, single Slack channel)
   - Not part of the harness pnpm workspace (intentionally standalone)

   ## Quickstart

   ```bash
   cd examples/slack-echo-bridge
   cp .env.example .env
   # edit .env — see "Environment variables" below
   npm install
   npm run build
   npm start
   ```

   Then in a separate shell, register the subscription with your harness orchestrator:

   ```bash
   # 1. Get an auth token with subscribe-webhook scope:
   harness gateway token create --name slack-bridge --scopes subscribe-webhook

   # 2. Tell the orchestrator to POST to your bridge:
   curl -X POST http://localhost:3000/api/v1/webhooks \
     -H "authorization: Bearer <tok_…>" \
     -H "content-type: application/json" \
     -d '{
       "url": "https://<your-tunnel-host>/webhooks/maintenance-completed",
       "events": ["maintenance.completed"]
     }'
   # → returns { id: "whk_…", secret: "<base64url-secret>", … }

   # 3. Copy the `secret` field into HARNESS_WEBHOOK_SECRET in .env, then restart the bridge.
   ```

   **The orchestrator generates the secret on `POST /api/v1/webhooks`. The bridge does not choose it. Capture the one-time `secret` field from the response and export it as `HARNESS_WEBHOOK_SECRET` before starting the bridge.**

   ## Environment variables

   | Name                     | Required | Description                                                                                                                              |
   | ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
   | `HARNESS_WEBHOOK_SECRET` | yes      | Opaque base64url (~44 chars) returned **once** by `POST /api/v1/webhooks`. Bridges that lose it must delete + recreate the subscription. |
   | `SLACK_BOT_TOKEN`        | yes      | Slack bot token with `chat:write` scope. See https://api.slack.com/authentication/token-types#bot.                                       |
   | `SLACK_CHANNEL`          | yes      | Slack channel **ID** (not name — find it via channel details → "About").                                                                 |
   | `PORT`                   | no       | HTTP port the bridge listens on. Default: `3000`.                                                                                        |

   ## Verifying signatures (the 5-line snippet)

   Every delivery carries `X-Harness-Signature: sha256=<lowercase-hex>` where the signature is `HMAC-SHA256(secret, rawBody)`. To verify in any language with HMAC stdlib:

   ```ts
   import { createHmac, timingSafeEqual } from 'node:crypto';

   const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
   if (!timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected))) reject();
   ```

   **`rawBody` MUST be the verbatim bytes of the request.** A `JSON.parse → JSON.stringify` round-trip will break verification (whitespace and key order are not preserved). The bridge in this directory reads the body with `req.on('data')` chunks → `Buffer.concat`, NOT via a JSON-body-parser middleware.

   See `src/signer.ts` for the full implementation.

   ## Exposing the bridge to the internet

   The orchestrator runs on `127.0.0.1` by default and will only deliver to `https://` URLs. To accept deliveries from a live orchestrator on a developer machine, expose the bridge via a tunnel. See `docs/guides/gateway-tunnel.md` for the canonical setups (Tailscale, Cloudflare Tunnel, ngrok).

   > _Note: `docs/guides/gateway-tunnel.md` is a forthcoming Hermes Phase 0.2 deliverable. Until then, use Tailscale or Cloudflare Tunnel directly per their own docs._

   ## Known properties (intentional)

   - **No idempotency suppression.** If the orchestrator retries (Phase 4 retry ladder), the bridge will post duplicate Slack messages. If you need exactly-once Slack delivery, store seen `X-Harness-Delivery-Id` values yourself.
   - **Single event type.** This bridge handles `maintenance.completed` only; other event types receive 400. To handle more, edit `webhook-handler.ts`'s type filter.
   - **Verbatim Slack errors.** Slack API errors (rate-limit, channel-not-found, token-revoked) surface in the response body to the orchestrator. The orchestrator's Phase 4 delivery worker retries 5xx with exponential backoff; 4xx is treated as terminal failure.

   ## Customizing the bridge

   The bridge is ~150 LoC of idiomatic Node. Common edits:

   - **Add an event type:** edit the `event.type !== 'maintenance.completed'` filter in `src/webhook-handler.ts`.
   - **Change the Slack message:** edit `createSlackPoster` in `src/slack-client.ts`.
   - **Swap the logger:** the structured-logger seam is `src/logger.ts` — drop in pino / winston / your favorite.
   - **Use Express or Fastify:** keep `verify()` from `src/signer.ts` and the raw-body capture pattern; the rest is yours.

   ## Tests

   ```bash
   npm test
   ```

   Twelve tests covering signature verification (6 cases) and HTTP flow (6 cases). All run under Node 20+ via vitest with no harness-engineering source dependency.

   ## License

   Same license as the parent repository — see the root `LICENSE`.
   ````

3. Run: `cd examples/slack-echo-bridge && npm install` (re-run to materialize any final lockfile/state).
4. Run: `cd examples/slack-echo-bridge && npm run build && npm test && npm run typecheck` — must all pass.
5. **`[checkpoint:human-action]`** — Live end-to-end run:
   - **a)** Start the orchestrator locally (`pnpm --filter @harness-engineering/orchestrator start` or via the usual harness-engineering dev workflow).
   - **b)** Issue a token: `harness gateway token create --name slack-bridge --scopes subscribe-webhook`. Save the token.
   - **c)** Start a tunnel (Tailscale, Cloudflare Tunnel, or ngrok). Note the public HTTPS URL.
   - **d)** Create a webhook subscription via `curl POST /api/v1/webhooks` with the tunnel URL + `events: ['maintenance.completed']`. Capture the one-shot `secret`.
   - **e)** Export `HARNESS_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`. Start the bridge.
   - **f)** Trigger a maintenance run (`curl POST /api/v1/jobs/maintenance { taskId: 'rule-coverage-scan' }` or whichever fast-completing maintenance task is available).
   - **g)** Observe (i) bridge logs `webhook.received` + `webhook.delivered`, (ii) Slack channel receives the message.
   - **h)** Record verification artifacts in handoff notes: bridge log lines (timestamp + delivery-id), Slack message screenshot path, total wall-clock time.
   - **i)** For every API friction point hit during the run (unclear error response, missing CLI help, undocumented header behavior, etc.), open a GitHub issue with label `phase-0-contract-gap` containing a one-paragraph reproduction. Note each issue id in the handoff `concerns[]` (carried into Task 11 disposition).
6. Run from repo root: `harness validate` — must pass.
7. Commit: `feat(examples): wire slack-echo-bridge entry point + README with tunnel quickstart (Phase 6 Task 10)`

**Verification:** The live end-to-end run completes: a real `maintenance.completed` event delivers a signed POST, the bridge verifies HMAC, posts to the configured Slack channel, and the message is visible. This IS the Phase 6 exit gate proof (§870).

---

### Task 11: Repo-root wiring updates + `phase-0-contract-gap` disposition + final phase-gate

**Depends on:** Task 10 | **Files:** `.gitignore`, `README.md`, `CHANGELOG.md` | **Time:** ~7 min

1. Open `.gitignore` (repo root). Find the existing block that excludes `**/.harness/webhooks.json`, `**/.harness/tokens.json`, `**/.harness/audit.log`. Append on a new line within that block (or adjacent block):

   ```
   examples/slack-echo-bridge/.env
   ```

   Rationale: an operator running the bridge locally will populate `.env` with real Slack tokens and the harness webhook secret. Keep those out of git the same way runtime auth artifacts are.

2. Open the repo-root `README.md`. Locate the "Key features" section's Gateway API bullet (added by prior Phase 0 slices). Append at the end of that bullet:

   > See [`examples/slack-echo-bridge/`](examples/slack-echo-bridge/) for the canonical reference consumer — a standalone Node bridge that verifies HMAC signatures and posts to Slack on `maintenance.completed`.

3. Open `CHANGELOG.md`. Under `## [Unreleased]` → `### Added`, prepend a new entry (above the Phase 5 entry):

   ```
   - **Orchestrator Gateway API — Phase 6 reference Slack bridge** — Ships `examples/slack-echo-bridge/` as the canonical external test consumer for the Phase 0 gateway API. Standalone Node project (NOT in the pnpm workspace) — installable by an external author with `npm install` against published `@slack/web-api` only; zero harness-engineering source dependency. The bridge HTTP listener (`src/webhook-handler.ts`) captures the raw request body before JSON parsing (the load-bearing HMAC-correctness property), verifies `X-Harness-Signature: sha256=<hex>` via `node:crypto`'s `createHmac` + `timingSafeEqual` with a length-mismatch guard (`src/signer.ts`), filters to `event.type === 'maintenance.completed'`, and dispatches to a thin `WebClient.chat.postMessage` wrapper (`src/slack-client.ts`) with a Slack-error-verbatim surface (502 detail on transport failure). The README documents the env-var contract (`HARNESS_WEBHOOK_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`), the operator workflow for capturing the one-time secret from `POST /api/v1/webhooks`, the 5-line HMAC-verify snippet authors can crib into other languages, and the intentional known properties (no idempotency suppression, single event type, verbatim Slack errors). 12 vitest cases cover signer (5 spec cases + tamper) and HTTP flow (happy, invalid-sig, unsupported-type, Slack-fails, 404, SIGTERM smoke). Closes the §672 ("reference bridge built") and §685 ("external test consumer exists") success gates for the Hermes Phase 0 program. (`examples/slack-echo-bridge`)
   ```

4. **`[checkpoint:decision]`** — Disposition of `phase-0-contract-gap` issues filed during Task 10's live run:
   - **(A) Zero issues filed** → record "no contract gaps discovered" in handoff `decisions[]` and proceed to step 5.
   - **(B) Issues filed AND resolved before this checkpoint** → record the resolved-issue ids in `decisions[]` and proceed.
   - **(C) Issues filed AND deferred** → for each deferred issue, record `{ issueId, summary, rationale, deferredTo: '<phase-0.x or backlog>' }` in `decisions[]`. Deferral is acceptable; silent dropping is NOT. Each deferral must name a follow-up target.

5. Final phase-gate from repo root:

   ```
   harness validate
   harness check-deps
   ```

   Both must pass clean.

6. Run the full repo test suite from repo root to confirm no regressions:

   ```
   pnpm test
   ```

   All packages green. The bridge itself is outside the workspace so its tests do NOT run here — that's expected. The bridge tests were run under `npm test` in Task 10.

7. Commit:

   ```
   chore(phase-6): wire reference Slack bridge into repo-root docs + gitignore + changelog (Phase 6 Task 11)

   - .gitignore: exclude examples/slack-echo-bridge/.env
   - README.md: link the reference bridge from the Gateway API bullet
   - CHANGELOG.md: Phase 6 entry under [Unreleased] → Added
   - phase-0-contract-gap disposition recorded in plan decisions[]
   ```

**Verification:** Phase 6 exit gate (§870) satisfied: real `maintenance.completed` webhook delivered, HMAC verified, Slack message visible (Task 10 artifact); contract-gap issues either resolved or explicitly deferred with rationale (this task's checkpoint). Success criteria §672 + §685 closed.

---

## Integration Points (derived from spec §850-870 + Step N finalization)

- **Entry Points:** `examples/slack-echo-bridge/` directory creation (Task 1). No new CLI command, no new MCP tool, no new orchestrator route — the bridge consumes existing Phase 1-5 surface.
- **Registrations Required:** None at the orchestrator layer. The bridge is consumed externally via the existing `POST /api/v1/webhooks` API.
- **Documentation Updates:** Repo-root `README.md` Gateway API bullet linkage (Task 11); `CHANGELOG.md` Phase 6 entry (Task 11); the bridge's own `README.md` is the canonical authoritative reference (Task 10). The forthcoming `docs/guides/gateway-tunnel.md` (Phase 0.2) will cite this bridge as its end-to-end example — that future plan owns the link, not this one.
- **Architectural Decisions:** None requiring a new ADR. The bridge mirrors the wire contract defined in ADR 0011 (`docs/knowledge/decisions/0011-orchestrator-gateway-api-contract.md`) — promotion of that ADR from `in-progress` to `accepted` is gated on this phase landing (per Phase 3 changelog footnote).
- **Knowledge Impact:** The bridge becomes a concrete `business_concept` node (reference-consumer pattern for gateway-api). The knowledge pipeline (`harness:knowledge-pipeline`) will pick it up on the next finalization run; no manual extraction needed.

## Soundness Review Gate

Before this plan is approved for execution, run `harness:soundness-review --mode plan` against this document. Address any blocking findings; iterate until converge with 0 blockers.

## Handoff to Execution

Upon human approval of this plan, autopilot routes through APPROVE_PLAN → EXECUTE. The handoff payload includes:

- `planPath`: `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-15-phase-6-reference-slack-bridge-plan.md`
- `taskCount`: 11
- `checkpointCount`: 3
- `concerns`: [] (no blockers surfaced during planning; the live tunnel run at Task 10 is the only step that may surface external blockers, captured as `phase-0-contract-gap` issues with disposition at Task 11)
- `successGates`: spec §672, §685, §870

## Gates (this plan's exit criteria)

- [ ] Plan written to `docs/changes/hermes-phase-0-gateway-api/plans/2026-05-15-phase-6-reference-slack-bridge-plan.md`
- [ ] `harness validate` passes
- [ ] `harness check-deps` passes
- [ ] Every observable truth traces to at least one task
- [ ] Every code-producing task includes a test or verification step
- [ ] Every task includes exact file paths, exact code (or exact verification commands for non-code tasks), and exact commit message
- [ ] Checkpoints marked: 1× `human-verify` (Task 6), 1× `human-action` (Task 10), 1× `decision` (Task 11)
- [ ] Iron Law satisfied: every task fits in one context window (2-5 min implementation; Task 10's manual run is a checkpoint, not implementation)
- [ ] Human review + approval before autopilot enters EXECUTE
