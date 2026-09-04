# Plan: Waypoint sdlc.\* event emission and spool (opt-in)

Spec: `docs/changes/waypoint-sdlc-emission/proposal.md` · Upstream item:
pnyon/pnyon#124 · Contract: pnyon `docs/architecture/waypoint/sdlc-event-schema.md`.

## Goal

Land the additive, opt-in `sdlc.*` emission layer end-to-end: contract types,
bounded JSONL spool, config-gated emitter, hooks at all four emission-point
families, `sdlc.*` gateway topics, and the fleet-artifact/observability CLI —
with the non-adopter invariance contract proven by tests.

## Scope Boundary

IN: emission + spool + topics + tests + docs. OUT: shipper-to-cloud (pnyon
owns ingest), `RoadmapTrackerClient` kind `pnyon` and any tracker
adapter/registry file (parallel lane), file-less-mode tracker-path emission,
fleet SKILL.md prose changes (plugin regen blast radius), dashboard signoff
route emission (same event is already emitted on the MCP path; follow-up).

## Observable Truths (Acceptance Criteria)

- SC1–SC6 as enumerated in the proposal's Success Criteria section.
- `pnpm --filter` typecheck/test green for types, core, cli, orchestrator;
  lint + format green; changeset present; barrels regenerated.

## File Map

| File                                                                                           | Change                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/types/src/waypoint.ts`                                                               | NEW — contract types + `WaypointConfigSchema` |
| `packages/types/src/index.ts`                                                                  | export block                                  |
| `packages/core/src/waypoint/{ulid,validate,scrub,spool,config-loader,emitter,events,index}.ts` | NEW — emission layer                          |
| `packages/core/src/roadmap/assignee-lifecycle.ts`                                              | hook 3 mutators                               |
| `packages/core/src/index.ts`                                                                   | regenerated barrel                            |
| `packages/cli/src/mcp/utils/waypoint-emission.ts`                                              | NEW — verdict emission                        |
| `packages/cli/src/mcp/tools/{interaction,outcome-eval,acceptance-eval,uat-signoff,roadmap}.ts` | hooks                                         |
| `packages/cli/src/config/schema.ts`                                                            | `waypoint` passthrough key                    |
| `packages/cli/src/commands/waypoint.ts` (+ `_registry.ts` regen)                               | NEW — CLI                                     |
| `packages/orchestrator/src/gateway/webhooks/events.ts`                                         | +19 `sdlc.*.v1` topics                        |
| `packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts`                                | NEW — bus bridge                              |
| `packages/orchestrator/src/orchestrator.ts`                                                    | wire + teardown                               |
| `.gitignore`                                                                                   | `**/.harness/spool/`                          |
| `.changeset/waypoint-sdlc-emission.md`                                                         | minor ×4                                      |
| `docs/knowledge/orchestrator/webhook-fanout.md`                                                | topic-family note                             |

## Tasks

### Task 1 (TDD): Contract types + pure lib (SC6 groundwork)

`waypoint.ts` types; ULID factory (monotonic, injected ports); per-field
validator over the closed vocabulary; best-effort scrub. Tests:
`ulid.test.ts`, `validate.test.ts`, `scrub.test.ts`.

### Task 2 (TDD): FileSpool + segment readers (SC6)

Bounded JSONL segment with drop-oldest + sidecar `droppedEvents`;
`readSpoolSegments`; ULID-ordered `mergeSegments`; I/O failures returned,
never thrown. Tests: `spool.test.ts`.

### Task 3 (TDD): Config loader + emitter + singleton (SC1)

`loadWaypointConfig` (absent → `Ok({})`); `WaypointEmitter` (envelope
stamping, listener fan-out, failure ledger); `initWaypointEmitter`
(absent sink → null, no filesystem effect); memoized
`ensureWaypointEmitter`; `emitSdlc` null-object no-op. Tests:
`config-loader.test.ts`, `emitter.test.ts` (invariance block first).

### Task 4 (TDD): Mapping helpers + mutator hooks (SC2, D4/D5)

`events.ts` helpers; hook `claim`/`release`/`setStatus` on committed
mutations only. Tests: `events.test.ts`,
`tests/roadmap/assignee-lifecycle-waypoint.test.ts`; pre-existing
`assignee-lifecycle.test.ts` must pass unmodified.

### Task 5 (TDD): CLI hooks (SC3)

`waypoint-emission.ts` (+`specSlug`); wire `handleTransition`,
`handleOutcomeEval`, `handleAcceptanceEval`, `handleUatSignoff`,
`handleManageRoadmap`; `waypoint` config key. Tests:
`waypoint-emission.test.ts`.

### Task 6 (TDD): `harness waypoint` command (SC4)

`record-provenance` / `record-handoff` (via `validateFleetHandoffRecord`) /
`status`; `_registry.ts` regen. Tests: `tests/commands/waypoint.test.ts`.

### Task 7 (TDD): Gateway topics + bridge (SC5)

Spread `SDLC_EVENT_TYPES_V1` into `WEBHOOK_TOPICS`; `waypoint-bridge.ts`;
orchestrator wire + stop() teardown. Tests: `waypoint-bridge.test.ts`;
pre-existing `events.test.ts` unmodified.

### Task 8: Docs + gates

Changeset, `.gitignore`, knowledge-doc note, proposal/plan/provenance
artifacts; run typecheck/tests/lint/format/generators.

## Sequencing Notes

1→2→3 strictly ordered (each consumes the prior); 4/5/6 parallel after 3;
7 after 3; 8 last.

## Integration Tier

Medium: cross-package (types→core→cli/orchestrator) with regenerated barrels
and a changeset.

## Checkpoints

`[checkpoint:human-verify]` — the PR itself: upstream maintainer review is
the gate (additive posture, vocabulary mapping D5, and the D6 topic-list
decision are the judgment calls to confirm).

## Traceability

PRD stories (pnyon `docs/product-requirements/waypoint-harness-adaptation-sdlc-event-emission-and-spool/prd.md`):
S1→SC1/Task 3; S2→SC2/Task 4; S3→SC3/Task 5; S4→SC4/Task 6; S5→SC5/Task 7;
S7 (Could)→`harness waypoint status` (Task 6). S6 (upstream coordination) is
the filed issue + this PR.
