# Plan: Roadmap Auto-Triage — Phase 1 (Scoping Probe + Triage Report)

## Goal

Ship a **read-only** triage that scores every actionable roadmap item and ranks
dispatchability with a rationale, corroborating four cheap signals. No dispatch,
no code writes. This proves the core claim — that corroborated cheap signal is
trustworthy enough to gate autonomy — at zero execution risk.

## Scope Guards (do NOT do in this plan)

- No dispatch, no marking items for the orchestrator, no writes to `roadmap.md`.
- No autonomous brainstorm (Phase 2), no execution (Phase 3), no post-diff
  retrospective or precedent _recording_ (Phase 4).
- The precedent lever is **degrade-empty only** — it returns `unknown` and never blocks; the
  actual precedent lookup wiring waits until Phase 4 produces outcome data.
- Do not modify AMR's `classifySafe` degrade or the S3-001 pre-diff confidence cap.
- Default-off: no behavior change unless `roadmap.autoTriage.enabled` is set.

## Observable Truths (Acceptance Criteria)

- SC1: Given a roadmap with N actionable items, the probe emits N verdicts, each
  with `{ level, confidence, dispatchable: boolean, levers: {...}, rationale }`.
- SC2: An item whose named entities resolve in the graph gets a real blast-radius
  estimate in `levers.scope`; one whose entities don't resolve is marked
  `dispatchable:false` with reason `unresolved-scope`.
- SC3: An item the semantic read flags with an open decision is `dispatchable:false`
  with reason `open-decision`, regardless of complexity level.
- SC4: With no precedent store present, `levers.precedent` is `unknown` and the
  verdict still resolves (never throws, never blocks on emptiness).
- SC5: Any lever error degrades that lever to `unknown` and is captured in
  `rationale`; the probe never throws out of the top-level call.
- SC6: Output is deterministic given fixed inputs + a stubbed provider (pure core).
- SC7: Ranking uses roadmap-pilot score with **impact as secondary sort** (D4).
- SC8: Default-off ⇒ probe is never invoked; `harness` behavior byte-identical.

## Grounding (evidence: file:line)

- Complexity cascade to reuse: `packages/intelligence/src/complexity/classifier.ts`
  (`classify`), `static-pass.ts` (`runStaticPass`), `types.ts` (`ComplexitySignals`,
  `ComplexityVerdict`, `Phase`).
- Pre-diff signal derivation to mirror:
  `packages/orchestrator/src/agent/complexity-request.ts` (`buildTaskText`,
  `detectMeasurableAcceptance`).
- Wiring pattern to mirror: `packages/orchestrator/src/agent/live-classify.ts`
  (`makeLiveClassify` — pure cascade in intelligence, wired in orchestrator).
- Graph scope (the scope lever): `packages/graph/src/index.ts` (blast-radius / impact /
  context entry points).
- Semantic read provider (semantic-read + open-decisions levers): `AnalysisProvider` interface in
  `packages/intelligence/src/analysis-provider/interface.ts`; built in orchestrator
  via `buildAnalysisProviderForLayer('sel', …)`
  (`packages/orchestrator/src/agent/intelligence-factory.ts:103`).
- Roadmap input: `packages/core/src/roadmap/parse.ts`.
- Pilot ranking to reuse: roadmap-pilot scoring `(impact × confidence) ÷ effort`.

## Architecture (layer-safe)

Pure probe lives in **intelligence** (`packages/intelligence/src/triage/`) — it may
import `types` + `graph` (config allows both) and takes an injected
`AnalysisProvider` (already an intelligence interface). Orchestrator/CLI does the
wiring + roadmap I/O + report rendering. This mirrors AMR's split and keeps the
core logic pure and unit-testable without an Orchestrator.

## File Map

- `packages/intelligence/src/triage/types.ts` — `TriageVerdict`, `LeverResult`,
  `ProbeInput`. **`PrecedentLookup` and the config type are defined in Phase 0**
  (Contracts 1–2); Phase 1 imports and consumes them, never redefines.
- `packages/intelligence/src/triage/probe.ts` — pure `runScopingProbe(input,
provider?, graph?, precedent?)` → `TriageVerdict`. Corroboration + rationale.
- `packages/intelligence/src/triage/probe.test.ts` — SC1–SC7 (TDD).
- `packages/intelligence/src/triage/rank.ts` — pilot score + impact secondary sort.
- `packages/intelligence/src/index.ts` + barrel allowlist
  (`scripts/generate-core-barrel.mjs` equivalent for intelligence, if curated).
- `packages/orchestrator/src/agent/triage-wiring.ts` — build `ProbeInput` from an
  `Issue` (reuse `buildTaskText`), resolve the SEL provider + graph, run the probe.
- `packages/cli/src/commands/routing/…` or a new `triage` command — render the
  read-only report (human + `--json`).
- Config: `roadmap.autoTriage.enabled` (default false) in the workflow schema.

## Uncertainties

- Exact graph entry-point signatures for blast-radius/impact from raw entity
  strings — confirm against `packages/graph/src/index.ts` before Task 3.
- How entity names are extracted from item text for the graph lookup (naive
  symbol/path regex first; NLQ later if needed).
- Whether intelligence has a curated barrel allowlist (like core's) — check before
  exporting.

## Tasks

### Task 1: Triage types (`intelligence/src/triage/types.ts`)

**Depends on:** Phase 0 Tasks 1 & 4 (imports `PrecedentLookup` + config type +
`extractEntities`) | **Files:** `packages/intelligence/src/triage/types.ts`,
`packages/intelligence/src/index.ts` | **Category:** types
Define `LeverResult<T> = { value: T | 'unknown'; reason?: string }`, `TriageVerdict`
(`{ verdict: ComplexityVerdict; dispatchable; levers; rationale }`),
`ProbeInput` (from `RoutingTaskText` + entity handles), and the injected
`GraphScope` seam. **Import** `PrecedentLookup` from Phase 0 (Contract 1) — do not
redefine it here.

### Task 2 (TDD): Probe corroboration spec (`probe.test.ts`)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/triage/probe.test.ts`
**Category:** test
Author SC1–SC6 against a stubbed `AnalysisProvider`, stubbed `GraphScope`, and
absent `PrecedentLookup`. Cover: entities-resolve→scope, entities-miss→
`unresolved-scope`, open-decision→not-dispatchable, lever-throw→`unknown`+captured,
precedent-absent→`unknown`, determinism.

### Task 3 (TDD): `runScopingProbe` (`probe.ts`)

**Depends on:** Task 2 | **Files:** `packages/intelligence/src/triage/probe.ts`
**Category:** impl
Pure function: (1) graph scope estimate → feed real `filesTouched/layersTouched/
blastRadius` into `ComplexitySignals` so `runStaticPass` scores substance not
length; (2) `classify(input, provider)` for the semantic read; (3) open-decisions
from the provider result; (4) precedent via injected lookup or `unknown`.
Corroborate → `dispatchable` only if scope bounded AND level∈{trivial,simple} AND
confidence≥medium AND no open decision AND precedent not-contradicting. Never
throws (per-lever try/catch → `unknown` + rationale).

### Task 4 (TDD): Ranking (`rank.ts`)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/triage/rank.ts`,
`packages/intelligence/src/triage/rank.test.ts` | **Category:** impl+test
Pilot score `(impact × confidence) ÷ effort`, **impact as secondary sort** (SC7).
Pure + unit-tested.

### Task 5: Orchestrator wiring (`triage-wiring.ts`)

**Depends on:** Task 3 | **Files:**
`packages/orchestrator/src/agent/triage-wiring.ts`,
`packages/orchestrator/src/agent/triage-wiring.test.ts` | **Category:** impl
Build `ProbeInput` from an `Issue` (reuse `buildTaskText`), resolve the SEL
`AnalysisProvider` + graph handle, extract candidate entity names, invoke
`runScopingProbe`. Unit-test with an injected provider (no live Orchestrator).

### Task 6: Read-only report command

**Depends on:** Task 4, Task 5, Phase 0 Task 3 (config) | **Files:** new CLI
`triage` command | **Category:** impl
Parse `roadmap.md`, run the probe over actionable items, rank, render human +
`--json`. **Consume** `roadmap.autoTriage.enabled` from the Phase 0 config schema
(do not re-declare it); gated behind the default-false flag (SC8). No writes.

### Task 7: `[checkpoint:human-verify]` — Phase 1 verification

**Depends on:** Task 6 | **Files:** none (verification only) | **Category:**
integration
Run the report against the live roadmap; confirm SC1–SC8; sanity-check that items
a human would call "obviously needs me" land `dispatchable:false` with a legible
reason. Human decides whether to proceed to Phase 2.

## Sequencing

T1 → T2 → T3 (core cascade); T4 parallel after T1; T5 after T3; T6 after T4+T5;
T7 last. Core logic (T1–T4) is pure and lands without touching the orchestrator.

## Traceability

SC1–SC6 → T2/T3; SC7 → T4; SC8 → T6; all → T7. The four levers → proposal §"scoping
probe"; read-only guard → proposal Non-goals + Scope Guards above.

## Concerns

- **The scope lever is the load-bearing upgrade** (it's what replaces the length proxy).
  If graph entity resolution is weak on real items, the probe collapses back
  toward length-only — so T3 must mark `unresolved-scope` as not-dispatchable,
  never silently fall through to the text score.
- Keep the probe pure and provider-injected so it never blocks on a live model in
  tests or in the read-only report.
