---
title: Waypoint sdlc.* event emission and repo-local spool (opt-in)
status: draft
keywords: waypoint, sdlc-events, cloudevents, spool, roadmap-mutators, emit-interaction, verdicts, fleet-artifacts, gateway-webhooks, opt-in
---

# Waypoint `sdlc.*` event emission and repo-local spool (opt-in)

Upstream implementation of pnyon roadmap item _"Waypoint harness adaptation —
sdlc event emission and spool"_ (pnyon/pnyon#124; pnyon ADR-0047). Waypoint is
a pnyon-hosted, event-sourced SDLC ledger: every board, lane, and digest is a
deterministic reduction over an append-only stream of `sdlc.*` events. Its
hard precondition is that harness emits those events — today the webhook bus
carries only `interaction.*`, `maintenance.*`, `proposal.*`, and
`webhook.subscription.*` topics, and roadmap mutations emit nothing anywhere.

## Overview & Goals

Add an **additive, opt-in** emission layer: when (and only when)
`harness.config.json` declares a `waypoint.sink`, the four existing evidence
feeds each append one pinned `sdlc.*.v1` event to a repo-local spool:

1. **Sanctioned roadmap mutators** — `setStatus` / `claim` / `release`
   (`packages/core/src/roadmap/assignee-lifecycle.ts`, the status-change
   chokepoint).
2. **Skill phase transitions** — the `emit_interaction` transition path
   (`packages/cli/src/mcp/tools/interaction.ts` `handleTransition`), carrying
   its `qualityGate` payload verbatim.
3. **Eval/UAT verdict persistence** — `outcome_eval`, `acceptance_eval`, and
   `uat_signoff` MCP handlers, surfacing the existing verdicts (emission, not
   new judgment).
4. **Fleet artifact writes** — `provenance.json` / `FleetHandoffRecord`,
   which are authored by fleet skill agents (no TS writer exists), via a new
   sanctioned `harness waypoint record-provenance|record-handoff` CLI seam.

Plus: the closed 19-type `sdlc.*.v1` vocabulary registered on the gateway
webhook bus (existing `GatewayEvent` envelope + `WebhookQueue` retry
machinery), and `harness waypoint status` for spool observability.

**The hard invariant (Unwanted-EARS, PRD Story 1):** _if no Waypoint sink is
configured, then the system shall not change any existing harness behavior_ —
no new files under the working tree, no new network calls, no new required
config keys, no change to any command's output or exit code, and every
pre-existing test suite passes unmodified.

**Non-goals:** the shipper-to-cloud (pnyon owns ingest; spooled events are the
contract boundary), the `RoadmapTrackerClient` kind `pnyon` (sibling
adaptation item — tracker adapter/registry files deliberately untouched),
file-less-mode tracker-path emission (follow-up; see Decisions), new
statuses/judgment, and any erosion of the human PR gate.

## Contract (normative, external)

The event schema, vocabulary, and spool format are pinned by pnyon's
`docs/architecture/waypoint/sdlc-event-schema.md` (shipped in pnyon PR #136)
and re-pinned in code here as `SDLC_EVENT_TYPES_V1` in
`packages/types/src/waypoint.ts`:

- **Envelope:** CloudEvents 1.0 JSON binding + Waypoint extensions
  (`actor` duality — agent events MUST carry `onBehalfOf`; optional `grade`
  V0–V3; optional `causes` ULID links).
- **Identity:** client-minted ULID per event — the idempotency/dedup key;
  monotonic per process, lexicographic order = creation order.
- **Vocabulary:** closed set of 19 `sdlc.<category>.<predicate>.v1` types
  across 10 categories; validation rejects anything else. Incompatible
  changes mint `.v2` alongside; `.v1` is never mutated.
- **Spool:** UTF-8 JSONL, one envelope per line; one segment per writing
  process (`.harness/spool/sdlc-<ulid>.jsonl`, no locks); bounded at 10 000
  events/segment default with **drop-oldest** and a persistent
  `droppedEvents` counter (sidecar `sdlc-<ulid>.meta.json`); appending never
  throws and never fails the originating operation; client-side best-effort
  secret scrub before the line is written (authoritative scrub is
  ingest-side).

## Decisions made

- **D1 — Placement: core module + types contract, not a plugin.** The types
  live in `packages/types/src/waypoint.ts` (imports only zod, like
  `fleet-handoff.ts`); the pure lib + file spool + emitter live in
  `packages/core/src/waypoint/`. Mutator-level hook points favor core (the
  PRD's open question 2); the opt-in posture is preserved by config gating,
  not packaging.
- **D2 — Config: `waypoint` key, `pulse` pattern.** Real schema
  (`WaypointConfigSchema`) in types; core-side `loadWaypointConfig`
  mirroring `loadNotificationsConfig` (absent file/key → `Ok({})` → layer
  disabled); CLI `HarnessConfigSchema` declares `waypoint` as a tolerant
  passthrough so the stripped-key warning (#862) never fires.
- **D3 — Installable process-wide emitter, lazy `ensure` at handler seams.**
  The mutators are pure functions without a project root, so emission routes
  through a module singleton (`emitSdlc`, null → guaranteed no-op).
  Handler-shaped call sites that know the root (`manage_roadmap`,
  `emit_interaction`, the eval/UAT tools, `harness waypoint`, the
  orchestrator server block) call the memoized `ensureWaypointEmitter(root)`
  — one config read per process, only on those paths.
- **D4 — Emit on committed mutations only.** A first-claim-wins rejection, a
  same-owner idempotent re-claim, and a same-status `setStatus` commit
  nothing and emit nothing — "exactly one event per committed mutation".
- **D5 — Vocabulary mapping** (documented projection, no new judgment):
  `setStatus`→`intent.updated` (`done`→`intent.closed`); `claim`→
  `claim.opened`; `release`→`claim.released`; phase transition→
  `build.finished` (subject `phase/<completedPhase>`, `qualityGate` in
  `data`); verdicts→`verify.graded` with grade projection acceptance
  MEASURABLE→V1, outcome SATISFIED→V2, UAT ACCEPTED→V3, else V0 (UAT events
  carry a human actor); provenance write→`build.finished`; handoff `done`→
  `review.requested` (the item now awaits the human PR gate), other
  dispositions→`intent.updated` with the blocker.
- **D6 — Gateway topics: register the closed v1 list verbatim.**
  `WEBHOOK_TOPICS` gains all 19 concrete types (spread from
  `SDLC_EVENT_TYPES_V1`, so the lists cannot drift). Types are 4 segments;
  the segment-glob matcher means subscribers use exact types or
  `sdlc.*.*.*`. No wildcard-exclusion (unlike `telemetry.*`): the events
  only exist on opted-in repos, so legacy `*.*` subscribers are structurally
  unaffected (segment counts differ).
- **D7 — Bus bridge lives in the orchestrator.** Core cannot import the
  orchestrator (layer rules); the emitter exposes `onEvent`, and
  `wireWaypointSdlcBridge` republishes spooled events onto the orchestrator
  bus (spool-first: the durable append happens before any listener runs).
  `NOTIFICATION_TOPICS` / `SSE_TOPICS` / telemetry fan-out are deliberately
  NOT extended (per-destination opt-in is their documented design; webhooks
  are the PRD's named destination).
- **D8 — Fleet artifacts get a CLI seam, not a file watcher.** No TS code
  writes `provenance.json` or handoff records (fleet skill agents author
  them), so `harness waypoint record-provenance/record-handoff` is the
  sanctioned call — validation via the existing
  `validateFleetHandoffRecord`; a no-sink invocation exits 0 with an
  explanatory note so fleets may call it unconditionally. Wiring the fleet
  SKILL.md prose to invoke it is a follow-up (plugin regeneration blast
  radius).
- **D9 — Emission failures are recorded, never thrown.** Invalid events and
  I/O failures land on the emitter's `emissionFailures` (and the append
  result); the originating harness operation always completes (PRD Story 1
  criterion 3).

## Technical design

New modules:

- `packages/types/src/waypoint.ts` — `SDLC_EVENT_TYPES_V1`, `SdlcEvent`,
  `SdlcActor`, grades, validation/append/segment result types,
  `WaypointConfigSchema` (zod).
- `packages/core/src/waypoint/` — `ulid.ts` (monotonic factory, injected
  ports), `validate.ts` (per-field diagnostics, closed vocabulary),
  `scrub.ts` (best-effort secret redaction of `data` strings), `spool.ts`
  (`FileSpool` bounded JSONL writer + `readSpoolSegments` + `mergeSegments`),
  `config-loader.ts`, `emitter.ts` (`WaypointEmitter`, singleton install,
  `ensureWaypointEmitter`, `emitSdlc`), `events.ts` (one mapping helper per
  emission family).
- `packages/cli/src/mcp/utils/waypoint-emission.ts` — verdict emission for
  the three eval/UAT handlers (+ `specSlug`).
- `packages/cli/src/commands/waypoint.ts` — `record-provenance`,
  `record-handoff`, `status`.
- `packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts` —
  `wireWaypointSdlcBridge`.

Hooked existing files (all additive):
`packages/core/src/roadmap/assignee-lifecycle.ts` (3 mutators),
`packages/cli/src/mcp/tools/interaction.ts` (`handleTransition`),
`packages/cli/src/mcp/tools/{outcome-eval,acceptance-eval,uat-signoff}.ts`,
`packages/cli/src/mcp/tools/roadmap.ts` (`ensureWaypointEmitter` before
dispatch), `packages/cli/src/config/schema.ts` (`waypoint` passthrough key),
`packages/orchestrator/src/gateway/webhooks/events.ts` (topic list),
`packages/orchestrator/src/orchestrator.ts` (bridge wire + teardown),
`.gitignore` (`**/.harness/spool/`).

## Integration Points

- **Webhook fan-out** — `wireWebhookFanout` picks up the new topics
  unchanged; delivery keeps `WebhookQueue` retry semantics
  (`RETRY_DELAYS_MS`, `MAX_ATTEMPTS=5`) and HMAC signing.
- **`subscribe_webhook` MCP tool** — accepts `sdlc.*.*.*` and exact-type
  patterns with zero changes (glob matching is store-side).
- **Fleet pipelines** — call `harness waypoint record-provenance
docs/changes/<slug>/provenance.json` and `… record-handoff <file>` after
  writing artifacts (unconditionally safe).
- **pnyon ingest (external)** — consumes the spool per the schema doc §7.3;
  merge order is ULID; `id` is the dedup key.

## Success Criteria

1. **SC1 — Non-adopter invariance:** with no `waypoint.sink`, no
   `.harness/spool/` is ever created, `emitSdlc` returns null, mutators are
   byte-identical to prior behavior, and the pre-existing
   assignee-lifecycle, gateway webhook, interaction, and roadmap suites pass
   unmodified. (Tests: `emitter.test.ts` invariance describe-block,
   `assignee-lifecycle-waypoint.test.ts` no-sink block,
   `waypoint-bridge.test.ts` no-op case, `waypoint.test.ts` no-sink case.)
2. **SC2 — Mutator emission:** each committed `setStatus`/`claim`/`release`
   spools exactly one correctly-typed, schema-valid event; no-op calls spool
   nothing. (Test: `assignee-lifecycle-waypoint.test.ts`.)
3. **SC3 — Transition + verdict emission:** a transition through
   `emit_interaction` spools one `build.finished` preserving `qualityGate`;
   each persisted outcome/acceptance/UAT verdict spools one `verify.graded`
   with the documented grade projection and (for UAT) a human actor.
   (Tests: `events.test.ts`, `waypoint-emission.test.ts`.)
4. **SC4 — Fleet artifact emission:** `record-provenance` and
   `record-handoff` spool exactly one event per artifact with
   reconstruction-sufficient `data`; invalid records are rejected with exit
   code 1 and spool nothing. (Test: `tests/commands/waypoint.test.ts`.)
5. **SC5 — Gateway topics:** an `sdlc.*.*.*` (or exact-type) subscription
   receives bridged events in the `GatewayEvent` envelope through the
   existing fan-out; existing topics behave identically (existing
   `events.test.ts` passes unmodified). (Test: `waypoint-bridge.test.ts`.)
6. **SC6 — Spool format:** segments are plain JSONL parseable by any
   standard parser; the bound drops oldest and persists `droppedEvents`;
   appends never throw. (Test: `spool.test.ts`.)

## Implementation Order

### Phase 1: Contract + spool + emitter (types, core) <!-- complexity: medium -->

Types, ULID/validate/scrub ports, `FileSpool`, config loader, emitter +
singleton, mapping helpers, full unit coverage.

### Phase 2: Emission hooks (core, cli) <!-- complexity: medium -->

Mutator hooks, `emit_interaction` transition hook, verdict-handler hooks,
`manage_roadmap` ensure, config schema key, `harness waypoint` command.

### Phase 3: Gateway topics + bridge (orchestrator) <!-- complexity: small -->

`WEBHOOK_TOPICS` extension, `wireWaypointSdlcBridge`, orchestrator wire +
teardown, fan-out tests.
