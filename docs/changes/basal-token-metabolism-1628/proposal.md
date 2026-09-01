# Proposal: Basal token metabolism — classify + ranked-waste report (#1628)

**Route:** feature · **Stage:** brainstorming → autopilot · **Scope:** classify + ranked-waste report ONLY (budget/governor gate wiring DEFERRED)

## Problem

Usage limits are a binding constraint and maintenance burn is its least-visible
component. Token accounting today books every burst identically: re-verification
of unchanged state, CI re-runs, context re-serialization, graph refresh,
idle-loop polling, and re-derivation of already-known facts cost the same on the
ledger as new productive work. There is no split between the spend an organism
burns _just existing_ (basal) and the spend that _builds something new_
(anabolic), so maintenance burn is invisible and therefore unmanaged.

## Confirmed scope (from human CONFIRM)

Build **only** the classifier and the ranked-waste report over EXISTING
telemetry:

- Classify every telemetry-attributed token burst as **basal** (spend that
  produces no new artifact, decision, or verified fact) vs **anabolic** (spend
  that does), with an explicit **unattributable** bucket, per workflow class.
- Emit the **basal-share metric** (with its declared denominator and the
  unattributable bucket).
- Emit a **ranked maintenance-waste list** — which maintenance loop burns the
  most basal spend.

**Explicitly deferred (out of scope for this slice):** wiring basal-share into
any budget/governor gate, dashboard trend rendering, digest alarms, and the
fleet-size superlinearity alarm. Those are a follow-up; this slice is
classification + reporting only. The issue stays open (`Refs #1628`) for manual
reconciliation of the deferred gate-wiring.

## Existing telemetry to extend (not reinvent)

Grepped the spend/token accounting surfaces so this extends them rather than
inventing a parallel one:

- `packages/core/src/usage/` — `UsageRecord` (per-session/day token + cost
  accounting), read via `readCostRecords` / `parseCCRecords` / `aggregateBy*`.
  Carries real token magnitudes keyed by `sessionId`.
- `packages/core/src/adoption/reader.ts` — `SkillInvocationRecord` in
  `.harness/metrics/adoption.jsonl`: `{ skill (workflow class), session,
duration, outcome: completed|failed|abandoned, phasesReached, failureCategory }`.
  This is the **outcome-linkage** surface.
- `packages/core/src/telemetry/trajectory.ts` — already joins adoption records
  with token spend per session; the join model this slice reuses.
- `packages/core/src/telemetry-synthesis/synthesize.ts` — `OutcomeNodeLike`
  (`execution_outcome` verdicts). Precedent for outcome linkage.

## Approach

1. A normalized **`SpendEvent`** — one token burst carrying `{ workflowClass,
tokens, outcome-linkage signals, optional maintenanceLoop label }`.
2. A pure **classifier** `classifySpend(event, config)` deriving basal /
   anabolic / unattributable from outcome linkage:
   - explicit `producedArtifact` wins (true → anabolic, false → basal);
   - known maintenance-loop workflow classes are basal by nature;
   - else derive from `outcome`: `completed` → anabolic, `failed`/`abandoned` →
     basal, missing → unattributable.
3. A **report builder** `buildMetabolismReport(events, config)` emitting
   `basalTokens`, `anabolicTokens`, `unattributableTokens`, `basalShare` with a
   **declared denominator** (`basal + anabolic`, unattributable excluded and
   reported separately), a per-workflow-class breakdown, and a **ranked
   maintenance-waste list** (basal burn grouped by `maintenanceLoop ??
workflowClass`, descending).
4. An **adapter** `buildSpendLedgerFromTelemetry({ invocations, usageRecords,
maintenanceClasses })` that joins real session token totals across each
   session's invocations (duration-weighted, with a declared `tokenSource`) so
   the ranked-waste burn is grounded in measured spend.
5. A **classifier evaluator** `evaluateClassifier(labeled, config)` producing
   confusion rates against a hand-labeled sample (acceptance criterion #1).
6. A read-only CLI surface `harness burn metabolism` (report/`--json`), and a
   by-token-metabolism section in the full `harness burn` report, mirroring
   `harness usage`.

## Acceptance criteria

- [ ] Classifier accuracy validated against a hand-labeled sample with published
      confusion rates (via `evaluateClassifier`, covered by a fixture test).
- [ ] The decomposition correctly ranks a seeded wasteful maintenance loop first
      in fixtures.
- [ ] Basal share, its denominator, and the unattributable bucket are all
      declared in every report object.
- [ ] Pure core module (no new cross-package deps); graceful degradation when a
      telemetry surface is absent (empty ledger → zeroed report, never throws).

## Non-goals

Budget/governor gate wiring; dashboard/digest rendering; fleet superlinearity
alarm; changing how token bursts are _recorded_ upstream.
