# Implementation Plan — Aggregate-Telemetry Synthesis Surface (#563)

**Spec:** `docs/changes/aggregate-telemetry-synthesis/proposal.md` (status: PLANNED)
**Produced by:** harness-autopilot (planning phase), 2026-08-16
**Branch:** `build/telemetry-synthesize-563` (base `main`)

## Objective

Ship `harness telemetry synthesize` — a read-only, local, single-project CLI command that
composes the five telemetry surfaces that already accrue in-repo into one unified report
(Markdown default, `--json` for machines). Pure composition over existing readers; collects
nothing new. Mirrors the `harness adoption retrospective` precedent.

## Grounding — verified reader APIs (from source inspection)

| #   | Source        | Reader (verified signature)                                                                                                                                            | Package                                           |
| --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Adoption      | `readAdoptionRecords(projectRoot): SkillInvocationRecord[]`, `aggregateBySkill(records): SkillAdoptionSummary[]`                                                       | `@harness-engineering/core`                       |
| 2   | Effectiveness | `computeSkillEffectiveness(records)`, `detectFailingSkills(records)`, `detectAbandonedSkills(records)`                                                                 | `@harness-engineering/intelligence`               |
| 3   | Usage/cost    | `readCostRecords(projectRoot): UsageRecord[]`, `aggregateByDay(records): DailyUsage[]` (costMicroUSD)                                                                  | `@harness-engineering/core`                       |
| 4   | Insights      | `composeInsights(projectPath, opts): Promise<InsightsReport>` (health block is pass/fail, not numeric)                                                                 | `@harness-engineering/core`                       |
| 5   | Outcomes      | `store.findNodes({ type: 'execution_outcome' })`; verdict on `metadata.verdict` (SATISFIED/NOT_SATISFIED/INCONCLUSIVE), fallback `metadata.result` (success→SATISFIED) | `@harness-engineering/graph` via `loadGraphStore` |

## Soundness refinement (planning-time)

The spec's headline `healthScore: number | null` cannot be sourced honestly: `composeInsights`
returns `InsightsHealthBlock { passed, signals, summary }` — a pass/fail signal, no numeric
score. Per Decision 6 (never fabricate a value), the headline carries `healthPassed: boolean | null`.
All other headline fields (`totalSkillInvocations`, `skillSuccessRate`, `outcomeSatisfiedRate`,
`totalCostUsd`) are sourced directly. Recorded as an assumption in the PR.

## Layering decision (spec §Core module — "to be confirmed in planning")

Effectiveness (source 2) lives in `@harness-engineering/intelligence`; `core` must not depend on
`intelligence`. Resolution: `composeSynthesis` lives in **core** and accepts the effectiveness
section as an injected input (the same pattern `adoption.ts` uses — it imports the intelligence
scorers at the CLI layer, not in core). The CLI command builds the effectiveness section (dynamic
import of intelligence) and the graph outcome section (dynamic import of graph loader), then passes
both into `composeSynthesis`. This keeps the existing dependency direction intact: core stays free
of intelligence/graph, the CLI is the composition root. Adoption/usage/insights are read directly
inside `composeSynthesis` (all in core).

## Tasks (ordered, TDD)

1. **Types** — `packages/types/src/telemetry-synthesis.ts`: `TelemetrySynthesis`, `TelemetrySynthesisHeadline`,
   `AdoptionSection`, `EffectivenessSection`, `UsageSection`, `InsightsSection`, `OutcomeSection`,
   `SourceAbsent = { present: false }`, `SynthesisSection<T> = T | SourceAbsent`. Export from `packages/types/src/index.ts`.
2. **Core compose** — `packages/core/src/telemetry-synthesis/synthesize.ts`:
   `composeSynthesis(projectRoot, opts)` where opts carries `windowDays`, `skip[]`, and the two
   injected sections (`effectiveness`, `outcomes`). Per-source try/empty → `{ present: false }`.
   Window filtering applied to adoption/usage/outcome record sets before aggregation.
   Unit tests: all-present, all-absent, mixed, windowed.
3. **Core render** — `packages/core/src/telemetry-synthesis/render.ts`:
   `renderSynthesisMarkdown(synthesis)` — headline block, one section per present source, and a
   "Sources with no data" footer listing every absent source. Unit tests: present rendered,
   absent footered.
4. **Barrel** — `packages/core/src/telemetry-synthesis/index.ts` (auto-discovered `export *`); add a
   `DIR_COMMENTS` entry in `scripts/generate-core-barrel.mjs`; run `pnpm run generate:barrels`.
5. **CLI** — `packages/cli/src/commands/telemetry/synthesize.ts`: `createSynthesizeCommand()` with
   `--json`, `--out <path>`, `--skip <section...>`, `--window <days>`. Builds effectiveness + outcome
   sections, calls `composeSynthesis` + `renderSynthesisMarkdown`. Register in
   `packages/cli/src/commands/telemetry/index.ts`. Integration test: exit 0, headline, sections,
   `--json` parity vs `adoption skills --json` and usage total, `--skip usage`, `--out`, read-only
   snapshot, `--window`.
6. **Docs** — `pnpm run generate-docs` (new CLI surface → reference freshness).
7. **Changeset** — `.changeset/*.md`.
8. **Gates** — build CLI, `pnpm format`, tests green, then push through the pre-push gauntlet.

## Acceptance criteria → covering test map

- AC1 exit0+markdown → cli integration `synthesize prints markdown`
- AC2 headline + per-present section → cli integration + render unit
- AC3 `--json` parseable TelemetrySynthesis, all 5 source keys + headline → cli integration `--json`
- AC4 K skills / N invocations parity vs adoption skills → cli integration parity test
- AC5 no adoption file → present:false + footer + null headline → compose unit (absent) + cli
- AC6 cost total parity vs usage aggregator → cli integration cost parity
- AC7 outcomes verdict counts + satisfiedRate; absent graph → present:false → compose unit + cli
- AC8 `--skip usage` omits usage + null cost → cli integration skip test
- AC9 `--out` writes + confirmation; no `--out` writes nothing → cli integration out test
- AC10 zero writes to `.harness/metrics/*` → cli integration read-only snapshot test
- AC11 `--window 30` bounds sections → compose unit windowed + cli
- AC12 unit coverage compose+render; `harness validate` → this plan's unit suites + build gate

## Verification

- Build CLI (`node packages/cli/dist/bin/harness.js telemetry synthesize`) against a temp fixture project.
- Run unit + integration suites green.
- Confirm read-only: snapshot `.harness/metrics/` mtimes before/after.
