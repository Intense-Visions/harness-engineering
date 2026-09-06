---
number: 0120
title: Waypoint sdlc.* emission is a core module + types contract, with the bus bridge in the orchestrator
date: 2026-09-05
status: proposed
tier: large
source: docs/changes/waypoint-sdlc-emission/proposal.md
---

## Context

> **Retrospective record.** This ADR backfills a decision that is **already
> shipped**. It documents what was decided and why during the
> `waypoint-sdlc-emission` build — it is not a proposal for new work. Every
> claim below was re-verified against the code on `main` at `5cd661d74` before
> being written down (citations in **References**). Where the shipped code
> refines the proposal's wording, the code is recorded as authoritative and the
> difference is called out.

Waypoint is a pnyon-hosted, event-sourced SDLC ledger: every board, lane, and
digest there is a deterministic reduction over an append-only stream of `sdlc.*`
events. Its hard precondition is that **harness emits those events**. Before this
work the gateway webhook bus carried only `interaction.*`, `maintenance.*`,
`proposal.*`, and `webhook.subscription.*` topics, and roadmap mutations emitted
nothing anywhere.

The build added an additive, opt-in emission layer: when — and only when —
`harness.config.json` declares a `waypoint.sink`, four existing evidence feeds
(sanctioned roadmap mutators, skill phase transitions, eval/UAT verdict
persistence, fleet artifact writes) each append one pinned `sdlc.<category>.<predicate>.v1`
event to a repo-local JSONL spool under `.harness/spool/`. The event schema, the
closed 19-type vocabulary, and the spool format are pinned externally by pnyon's
`sdlc-event-schema.md` and re-pinned in code as `SDLC_EVENT_TYPES_V1`.

Two constraints shaped every structural choice:

1. **The non-adopter invariant (PRD Story 1).** With no sink configured, nothing
   changes: no new files under the working tree, no new network calls, no new
   required config keys, no change to any command's output or exit code, and
   every pre-existing test suite passes unmodified. This is a hard invariant, not
   a goal — it is what makes the layer safe to ship into every adopter repo at
   once.
2. **The emission points are the lowest-level chokepoints, not the handlers.**
   The status-change chokepoint is `setStatus`/`claim`/`release` in
   `packages/core/src/roadmap/assignee-lifecycle.ts` — _pure functions that never
   receive a project root_. Anything that emits there cannot resolve config from
   its arguments.

Those two facts, together with the repo's declared layer rules
(`harness.config.json` grants the `core` layer `["types", "graph"]` and nothing
more — the orchestrator is strictly above core), forced the placement and
layering decisions this ADR records.

## Decision

The Waypoint emission layer ships as a **core module plus a types contract**, gated
by config rather than by packaging, with the transport bridge held above the layer
boundary in the orchestrator.

- **Placement — core module + types contract, not a plugin.** The wire contract
  (`SDLC_EVENT_TYPES_V1`, `SdlcEvent`, `SdlcActor`, grades, result types,
  `WaypointConfigSchema`) lives in `packages/types/src/waypoint.ts`, whose only
  import is `zod` — the same shape as the neighbouring `fleet-handoff.ts`. The
  pure library (ULID, validation, scrub), the file spool, the config loader, and
  the emitter live in `packages/core/src/waypoint/`. A plugin was the live
  alternative and was rejected: the emission points are _mutator-level_ pure
  functions inside core, and a plugin can only hook what is exposed to it —
  reaching `assignee-lifecycle.ts` from a plugin would have meant inventing a
  general mutator-hook surface to serve one consumer. **The opt-in posture is
  preserved by config gating, not by packaging**: with no `waypoint.sink`,
  `emitSdlc` returns `null` before doing any work at all.

- **Installable process-wide emitter with lazy `ensure` at handler seams.**
  Because the mutators are pure and root-less, emission routes through a module
  singleton: every emission point calls `emitSdlc`, which no-ops when no emitter
  is installed. Call sites that _are_ handler-shaped and do know the project root
  (`manage_roadmap`, `emit_interaction`, the eval/UAT MCP tools, the `harness
waypoint` command, the orchestrator server block) call the memoized
  `ensureWaypointEmitter(root)` — at most one config read per root per process,
  and only on those paths. Threading a root through the mutator signatures was
  the alternative; it was rejected as a breaking change to pure functions in
  service of an opt-in feature.

- **Emit on committed mutations only — "exactly one event per committed
  mutation".** Emission is placed _after_ the commit decision, never at the
  attempt. A first-claim-wins rejection returns before any emit; a same-owner
  re-claim emits only if the status actually flipped; a same-status `setStatus`
  emits nothing. Emitting on attempt was the cheaper hook and was rejected
  because the ledger downstream is a _reduction_: an event for a mutation that
  did not happen is not noise, it is a wrong board.
  _Code-over-proposal refinement:_ the proposal describes "a same-owner
  idempotent re-claim" as emitting nothing. The shipped rule is finer and
  strictly consistent with the stated invariant — idempotency is judged
  per-committed-field, so a same-owner re-claim that _does_ flip the status from
  `planned` to `in-progress` is a committed mutation and emits exactly one
  `sdlc.claim.opened.v1`.

- **Vocabulary mapping is a documented projection, never new judgment.** Roadmap
  `setStatus` → `sdlc.intent.updated.v1` (`done` → `sdlc.intent.closed.v1`);
  `claim` → `sdlc.claim.opened.v1`; `release` → `sdlc.claim.released.v1`; a skill
  phase transition → `sdlc.build.finished.v1` carrying its `qualityGate` payload
  verbatim; persisted verdicts → `sdlc.verify.graded.v1` under a fixed grade
  projection (acceptance `MEASURABLE`→V1, outcome `SATISFIED`→V2, UAT
  `ACCEPTED`→V3, anything else→V0, with UAT events carrying a human actor); a
  fleet `provenance.json` write → `sdlc.build.finished.v1`; a fleet handoff with
  `status: done` → `sdlc.review.requested.v1` (the item now awaits the human PR
  gate), any other disposition → `sdlc.intent.updated.v1` with the blocker. The
  layer _surfaces_ verdicts that already exist; it introduces no new statuses and
  no new judgment.

- **The bus bridge lives in the orchestrator, because core cannot import it.**
  The layer rules make `core → orchestrator` a violation, so the emitter cannot
  publish onto the orchestrator's event bus directly. Instead the emitter exposes
  a listener seam, `onEvent`, and `wireWaypointSdlcBridge` — an orchestrator-side
  function — republishes each spooled event onto the gateway bus under the
  event's own pinned type, where the existing `wireWebhookFanout` wraps it in a
  `GatewayEvent` and delivers it with unchanged `WebhookQueue` retry and HMAC
  semantics. **Ordering is spool-first: the durable append happens before any
  listener runs**, so a slow, failing, or absent subscriber can never block the
  local write or lose the durable copy. Relaxing the layer rule for this one
  import was the alternative and was rejected — the bridge is transport, and
  transport belongs above core.

- **Register the closed v1 list verbatim on the gateway.** `WEBHOOK_TOPICS`
  spreads `SDLC_EVENT_TYPES_V1` rather than restating it, so the two lists cannot
  drift. The types are four segments, so subscribers match exact types or
  `sdlc.*.*.*`; legacy `*.*` subscribers are structurally unaffected by segment
  count, which is why no wildcard-exclusion was needed.

- **Emission failures are recorded, never thrown.** Invalid events and I/O
  failures land on the emitter's `emissionFailures` and in the append result;
  a listener that throws is swallowed. The originating harness operation always
  completes.

## Consequences

- **Adopters who do not opt in are byte-identical.** With no `waypoint.sink`, no
  spool directory is created, `emitSdlc` short-circuits to `null`, and the
  mutators behave exactly as before — the invariant is enforced at the one
  singleton read rather than scattered across every call site.

- **Core carries a subsystem it cannot fully exercise.** The emitter's most
  interesting consumer (webhook fan-out) lives two layers up, so core's own tests
  cover the spool and the `onEvent` seam while end-to-end delivery is proved in
  the orchestrator's bridge tests. This is the accepted cost of respecting the
  layer rule instead of relaxing it.

- **`onEvent` is now a load-bearing public seam.** Any future transport
  (dashboard SSE, telemetry, a cloud shipper) attaches there rather than inside
  core. `NOTIFICATION_TOPICS`, `SSE_TOPICS`, and telemetry fan-out were
  deliberately _not_ extended — per-destination opt-in is their documented design
  and webhooks are the only named destination.

- **Spool-first makes the local copy the source of truth.** Delivery is
  best-effort on top of a durable append, so a subscriber outage degrades to
  "events are still on disk", and pnyon's ingest — which dedups on the ULID `id`
  and merges in ULID order — recovers without harness replay logic.

- **The vocabulary is pinned and closed, so it can only grow by minting `.v2`.**
  Validation rejects anything outside the 19 types; an incompatible change ships
  alongside rather than mutating `.v1`. That is a deliberate rigidity: the ledger
  downstream reduces over history, and a mutated `.v1` would silently rewrite the
  past.

- **Emit-on-commit ties the event stream to the mutator's commit semantics.** Any
  future change to what counts as a committed mutation changes the emitted
  stream. The per-committed-field idempotency rule above is therefore part of the
  contract, not an implementation detail.

- **Fleet artifacts still require an explicit call.** No TypeScript writes
  `provenance.json` or handoff records — fleet skill agents author them — so
  `harness waypoint record-provenance|record-handoff` is the sanctioned seam, and
  it exits 0 with an explanatory note when no sink is configured so fleets may
  call it unconditionally. Wiring the fleet SKILL.md prose to actually invoke it
  was deferred (plugin-regeneration blast radius), so that feed is opt-in twice
  until the follow-up lands.

## Assumptions made

- **This is a retrospective backfill of shipped behavior.** The decision was
  taken and implemented during the `waypoint-sdlc-emission` build; this record
  documents it after the fact. The D1–D9 "Decisions made" section of the source
  proposal is the primary evidence, and the shipped code at `5cd661d74` is the
  authority where the two differ.
- Status is deliberately `proposed`, not `accepted`: a human sign-off pass owns
  the promotion, even though the behavior already ships.
- The external contract (CloudEvents envelope, 19-type vocabulary, spool format)
  is assumed stable as pinned by pnyon's `sdlc-event-schema.md`; this ADR records
  harness's structural response to that contract, not the contract itself.
- The shipper-to-cloud, the `pnyon` tracker-client kind, and file-less-mode
  tracker-path emission remain out of scope; the spool is the contract boundary.

## References

Verified against the worktree at pinned base `5cd661d74`:

- Source proposal: [`docs/changes/waypoint-sdlc-emission/proposal.md`](../../changes/waypoint-sdlc-emission/proposal.md) — "Decisions made" D1–D9.
- Placement / types contract: `packages/types/src/waypoint.ts:18` (sole import is `zod`), `:46` (`SDLC_EVENT_TYPES_V1`, 19 entries), `:208` (`WaypointConfigSchema`).
- Core module: `packages/core/src/waypoint/` — `emitter.ts`, `spool.ts`, `events.ts`, `validate.ts`, `scrub.ts`, `ulid.ts`, `config-loader.ts`.
- Spool-first ordering: `packages/core/src/waypoint/emitter.ts:150-164` — `emit()` calls `safeAppend` at `:152` and only then iterates `this.listeners` at `:157`.
- Listener seam and no-op singleton: `packages/core/src/waypoint/emitter.ts:173` (`onEvent`), `:179` (`emissionFailures`), `:248` (`emitSdlc` returns `null` when no emitter is installed), `:266` (`ensureWaypointEmitter`, memoized per root, never throws).
- Layer rule forcing the bridge upward: `harness.config.json:20-23` — layer `core` has `allowedDependencies: ["types", "graph"]`.
- Bridge in the orchestrator: `packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts:30-41` (`wireWaypointSdlcBridge` republishes onto the bus via `emitter.onEvent`), with the no-sink no-op teardown at `:34-37`.
- Orchestrator wiring/teardown: `packages/orchestrator/src/orchestrator.ts:1414` (wire), `:5109-5111` (teardown).
- Gateway topic registration: `packages/orchestrator/src/gateway/webhooks/events.ts:3,31` — `...SDLC_EVENT_TYPES_V1` spread into `WEBHOOK_TOPICS`.
- Emit-on-commit: `packages/core/src/roadmap/assignee-lifecycle.ts:126-132` (first-claim-wins returns with no emit), `:139` (same-owner re-claim emits only when `statusChanged`), `:153`, `:170`, `:177`, `:203` (`previousStatus !== status` guard).
- Vocabulary mapping: `packages/core/src/waypoint/events.ts:48` (`intent.closed`/`intent.updated`), `:58` (`claim.opened`), `:71` (`claim.released`), `:103` (`build.finished` for phase transitions), `:140-142` + `:150` (grade projection), `:157` (`verify.graded`), `:184` (provenance → `build.finished`), `:204` (handoff `done` → `review.requested`).
- House-style siblings: [`0061-lmlm-package-boundary-and-native-ranking-port.md`](0061-lmlm-package-boundary-and-native-ranking-port.md) (the retrospective-backfill precedent), [`0107-comprehension-committed-git-versioned-substrate.md`](0107-comprehension-committed-git-versioned-substrate.md), [`0116-single-writer-semantic-comprehension.md`](0116-single-writer-semantic-comprehension.md).
- External contract: pnyon `docs/architecture/waypoint/sdlc-event-schema.md` (pnyon PR #136); upstream item pnyon/pnyon#124, pnyon ADR-0047.
