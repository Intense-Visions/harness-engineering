# Plan: Phase 1 — Basal/anabolic spend classifier + ranked-waste report

**Date:** 2026-08-31 | **Spec:** docs/changes/basal-token-metabolism-1628/proposal.md | **Tasks:** 6 | **Time:** ~35 min | **Integration Tier:** small | **Rigor:** standard

## Goal

Land a pure `packages/core` module that classifies telemetry-attributed token
bursts as **basal** / **anabolic** / **unattributable** by outcome linkage,
emits the **basal-share metric** (with declared denominator + unattributable
bucket) and a **ranked maintenance-waste list**, plus an adapter over the
existing `UsageRecord` + `SkillInvocationRecord` telemetry and a classifier
evaluator with published confusion rates. Wire a read-only `harness burn metabolism`
CLI. Budget/governor gate wiring is DEFERRED (see spec non-goals).

## Scope

Classifier + report + adapter + evaluator + CLI report command + tests ONLY.
No budget gate, no dashboard, no digest alarm, no superlinearity alarm.

## Source-of-truth findings (verified)

- `SkillInvocationRecord` (`packages/types/src/adoption.ts:50`) is the outcome
  surface: `outcome: 'completed'|'failed'|'abandoned'`, `failureCategory`,
  `phasesReached`, `skill` (= workflow class), `session`, `duration`.
- `UsageRecord` (`packages/types/src/usage.ts:10`) carries `tokens.totalTokens`
  keyed by `sessionId` — the real token magnitude. Multiple invocations share a
  session, so session tokens are apportioned across that session's invocations
  by `duration` weight (declared `tokenSource: 'measured'`); when no usage
  record matches a session, fall back to `duration` as the burn proxy
  (`tokenSource: 'duration-proxy'`).
- `TrajectoryBuilder` (`packages/core/src/telemetry/trajectory.ts`) already
  joins adoption ↔ token spend by session — reuse that join shape.

## Tasks (implementation order)

1. **Types + classifier core** — `packages/core/src/metabolism/classify.ts`:
   `SpendClass`, `SpendEvent`, `MetabolismConfig` (with `maintenanceClasses`
   default set), pure `classifySpend(event, config)`. TDD: `classify.test.ts`
   covering explicit `producedArtifact`, maintenance-class override, each
   `outcome` mapping, and missing-signal → `unattributable`.
2. **Report builder** — `packages/core/src/metabolism/report.ts`:
   `buildMetabolismReport(events, config)` → `MetabolismReport` with
   `totalTokens`, `basalTokens`, `anabolicTokens`, `unattributableTokens`,
   `basalShare`, `denominatorTokens`, `unattributableShare`,
   `byWorkflowClass[]`, `rankedWaste[]` (basal burn grouped by
   `maintenanceLoop ?? workflowClass`, descending, deterministic tiebreak).
   TDD: `report.test.ts` — empty ledger → zeroed report (never throws), denom
   declared, seeded wasteful loop ranks first.
3. **Telemetry adapter** — `packages/core/src/metabolism/adapter.ts`:
   `buildSpendLedgerFromTelemetry({ invocations, usageRecords,
maintenanceClasses })` → `SpendEvent[]`; duration-weighted session-token
   apportionment with declared `tokenSource`. TDD: `adapter.test.ts` — join by
   session, apportionment sums back to session total, proxy fallback.
4. **Classifier evaluator** — `packages/core/src/metabolism/evaluate.ts`:
   `evaluateClassifier(labeled, config)` → confusion matrix + per-class
   precision/recall + overall accuracy. TDD: `evaluate.test.ts` on a
   hand-labeled fixture with published rates.
5. **Barrel + core export** — `packages/core/src/metabolism/index.ts`; add
   `export * from './metabolism'` to `packages/core/src/index.ts`.
6. **CLI** — `packages/cli/src/commands/metabolism.ts` `createMetabolismCommand`
   (`report` subcommand + `--json`), register in `_registry.ts`. Reads
   `readAdoptionRecords` + `readCostRecords`, builds ledger + report, prints a
   scannable table and a ranked-waste section; `--json` emits the full report.
   Graceful "no telemetry" message. Regenerate reference docs.

## Verification

- `pnpm --filter @harness-engineering/core test` green for the 4 new suites.
- `node packages/cli/dist/bin/harness.js metabolism report --json` on this repo
  returns a well-formed report (dogfood).
- Confusion-rate fixture asserts published accuracy on the labeled sample.
- Ranked-waste fixture asserts the seeded wasteful loop is `rankedWaste[0]`.

## Deferred (tracked on #1628 via `Refs`)

Budget/governor gate consuming basal-share; dashboard trend + compression-family
annotations; digest superlinearity alarm.
