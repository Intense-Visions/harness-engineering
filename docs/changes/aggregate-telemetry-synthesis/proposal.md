# Aggregate-Telemetry Synthesis Surface

**Status:** PLANNED — soundness-reviewed via harness-brainstorming (2026-08-16). Scope validated against the five existing readers; one honest-composition refinement applied (headline `healthPassed: boolean | null` replaces `healthScore: number`, because `composeInsights` yields a pass/fail health signal, not a numeric score). Ready for implementation.

**Roadmap item:** #563 · shard `docs/roadmap.d/ship-aggregate-telemetry-synthesis-surface.md` (P1, v5.0 — Telemetry & Effectiveness)

**Keywords:** telemetry, synthesis, aggregation, adoption, effectiveness, usage, insights, cli, local-first, read-only

## Overview

The harness already accrues rich telemetry across at least six independent surfaces, but **no single surface synthesizes them back into one answer**. A maintainer or adopter asking "is the harness working here — are skills landing, are outcomes passing, what is it costing, is drift rising?" today has to run four unrelated commands and cross-reference a graph query by hand. Each existing surface answers exactly one dimension; none composes them.

This proposal ships the minimal, honest, in-repo slice of #563: a **read-only, local, single-project telemetry synthesis command** — `harness telemetry synthesize` — that composes the telemetry that _already exists_ into one unified report (Markdown by default, `--json` for machines). It collects nothing new: no new hooks, no new event types, no new storage. It is pure composition over existing readers, following the exact precedent already set by `harness adoption retrospective` (which composes adoption records + the Bayesian effectiveness scorer into one report).

The shard's broader vision — a **public, cross-adopter dashboard at a known URL, anonymized across the adopter base** — is deliberately **out of scope for this slice** and is scoped separately below, because it depends on server-side aggregation of the PostHog stream (a hosted backend), not on data available in-repo. See "Honest scoping" before building.

## Honest scoping (read first)

The shard describes three deliverables: (a) a public cross-adopter dashboard, (b) `docs/case-studies/`, (c) a README "Adopters" wall driven by `harness telemetry publish`. All three depend on **aggregating telemetry across the adopter base**, which lives in PostHog (streamed by `packages/cli/src/hooks/telemetry-reporter.js`), not in this repository. Building (a)/(b)/(c) requires:

- a queryable PostHog aggregate (API key, hosted query layer, or export pipeline) — infrastructure that does not exist in-repo and cannot be built or tested here;
- an anonymization / privacy review for publishing adopter-base statistics (DO_NOT_TRACK is respected at collection, but publishing aggregates is a new privacy surface);
- a hosting decision for the public URL.

Rather than draft a spec against infrastructure that isn't present (spec quality compounds — a spec that can't be verified is worse than none), this proposal ships the **loop-closing core that _is_ buildable and testable today**: the synthesis surface over the telemetry a single project already holds locally. This is genuinely valuable on its own (it answers "is this working _here_?" for one adopter, which the shard names as the core unmet need) and it is the exact data layer the future public dashboard would render. The cross-adopter public surface is filed as an explicit follow-on with its prerequisites listed, so a human can decide whether/how to fund the backend.

## The real telemetry sources this synthesizes

Every source below already accrues today; this command reads them, it does not create them.

| #   | Source                                                                                                                                                      | Where it accrues                                                                | Existing reader / surface                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Skill-adoption telemetry** — per-invocation `SkillInvocationRecord` (skill, outcome, phasesReached, duration, tier, trigger)                              | `.harness/metrics/adoption.jsonl` (written by the `adoption-tracker` Stop hook) | `readAdoptionRecords` / `aggregateBySkill` in `@harness-engineering/core` (`packages/core/src/adoption/`); surfaced by `harness adoption skills\|recent\|skill`                                                       |
| 2   | **Bayesian skill effectiveness** — Laplace-smoothed success / failing / abandoned-mid-workflow rankings derived from source 1                               | computed on read                                                                | `computeSkillEffectiveness`, `detectFailingSkills`, `detectAbandonedSkills` in `@harness-engineering/intelligence` (`packages/intelligence/src/effectiveness/`); already composed by `harness adoption retrospective` |
| 3   | **Usage / cost telemetry** — per-day and per-session token usage and cost                                                                                   | `.harness/metrics/costs.jsonl`                                                  | `@harness-engineering/core` usage aggregator (`packages/core/src/usage/aggregator.ts`); surfaced by `harness usage`                                                                                                   |
| 4   | **Composite code-health insights** — health, entropy, decay, attention, impact                                                                              | computed from graph + detectors on read                                         | `composeInsights` in `@harness-engineering/core` (`packages/core/src/insights/aggregator.ts`); surfaced by `harness insights` and the `insights_summary` MCP tool                                                     |
| 5   | **`execution_outcome` graph nodes** — post-execution outcome-eval verdicts (SATISFIED / NOT_SATISFIED / INCONCLUSIVE) that feed the effectiveness baselines | knowledge graph                                                                 | `@harness-engineering/intelligence` outcome-eval (`packages/intelligence/src/outcome-eval/`, `packages/intelligence/src/outcome/`)                                                                                    |

Sources 1–4 are read via already-exported, already-tested public APIs. Source 5 is included only if a graph is present; when absent the section is omitted honestly (mirroring how `discoverCatalogSkills` returns `undefined` rather than a false zero in `adoption.ts`).

Explicitly **not** aggregated by this slice: the raw PostHog stream (source 6, `telemetry-reporter.js`) and the KPI timelines in `.harness/architecture/timeline.json` / `.harness/security/timeline.json` — the former is the cross-adopter follow-on's domain, the latter is already synthesized by `harness insights` (source 4) and would double-count.

## Goals

1. One command, `harness telemetry synthesize`, that produces a single unified report over sources 1–5 above.
2. Read-only and local-first — collects nothing, writes nothing except the optional output file the user asks for.
3. Markdown by default; `--json` emits a machine-readable `TelemetrySynthesis` object.
4. Degrade gracefully and honestly — a missing source contributes an explicit "no data" note, never a fabricated zero and never a crash.
5. Reuse existing readers/scorers verbatim; add composition + rendering only.

## Non-Goals (this slice)

- The public cross-adopter dashboard, `docs/case-studies/`, the README "Adopters" wall, and `harness telemetry publish` (the whole cross-adopter surface — see "Honest scoping"; filed as a follow-on).
- Any new telemetry collection, hook, event type, or storage file.
- Anonymization / publishing of adopter-base aggregates.
- A dashboard (web) rendering — CLI only for this slice; the `--json` contract is designed so a later dashboard collector can consume it unchanged.
- Cross-project or team-level aggregation.

## Decisions

| #   | Decision                          | Choice                                                                | Rationale                                                                                                                                      |
| --- | --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Surface                           | New subcommand `harness telemetry synthesize`                         | Keeps synthesis in the existing `telemetry` command family; no new top-level namespace                                                         |
| 2   | Scope of this slice               | Single-project, local sources only                                    | The only telemetry buildable/testable in-repo; cross-adopter needs a PostHog backend (out of scope)                                            |
| 3   | Sources                           | Adoption + effectiveness + usage + insights + execution_outcome (1–5) | Every one has an existing exported reader; zero new collection                                                                                 |
| 4   | Output                            | Markdown default, `--json` flag                                       | Mirrors `harness adoption retrospective` and every other read surface; `--json` is the dashboard-ready contract                                |
| 5   | Composition, not reimplementation | Call existing readers/scorers unchanged                               | The retrospective precedent; avoids drift between surfaces                                                                                     |
| 6   | Missing-source posture            | Explicit per-section "no data" note, never a false zero               | The catalog-retrospective Iron Law: never collapse "no telemetry" into "abandoned/zero"                                                        |
| 7   | Write behavior                    | `--out <path>` writes; default prints to stdout                       | Read-only by default; matches `harness adoption retrospective --no-write` posture inverted (synthesis is a lookup, not an artifact by default) |

## Technical Design

### Command

`harness telemetry synthesize [--json] [--out <path>] [--skip <section>...] [--window <days>]`

- `--json` — emit the `TelemetrySynthesis` object instead of Markdown.
- `--out <path>` — write the Markdown (or JSON) to a file; default prints to stdout.
- `--skip <section>` — omit a section (`adoption` | `effectiveness` | `usage` | `insights` | `outcomes`), repeatable.
- `--window <days>` — bound the adoption/usage/outcome windows (default: all-time), passed through to the underlying readers where they accept it.

Wired into `packages/cli/src/commands/telemetry/index.ts` via a new `createSynthesizeCommand()`, added alongside the existing `identify` / `status` / `test` subcommands.

### Data model (`packages/types/src/telemetry-synthesis.ts`)

```typescript
interface TelemetrySynthesis {
  generatedAt: string; // ISO 8601
  windowDays: number | null; // null = all-time
  sources: {
    adoption: AdoptionSection | { present: false };
    effectiveness: EffectivenessSection | { present: false };
    usage: UsageSection | { present: false };
    insights: InsightsSection | { present: false };
    outcomes: OutcomeSection | { present: false };
  };
  // A small headline block computed from the present sections for the top of the report.
  headline: {
    totalSkillInvocations: number | null;
    skillSuccessRate: number | null; // from adoption/effectiveness
    outcomeSatisfiedRate: number | null; // from execution_outcome nodes
    totalCostUsd: number | null; // from usage
    healthScore: number | null; // from insights
  };
}
```

Each `*Section` is a thin projection of the corresponding existing reader's output (not a re-model): `AdoptionSection` from `aggregateBySkill`, `EffectivenessSection` from `computeSkillEffectiveness` / `detectFailingSkills` / `detectAbandonedSkills`, `UsageSection` from the usage aggregator, `InsightsSection` from `composeInsights`, `OutcomeSection` from a graph count of `execution_outcome` verdicts.

### Core module (`packages/core/src/telemetry-synthesis/`)

```
telemetry-synthesis/
  synthesize.ts   — composeSynthesis(projectRoot, opts): builds TelemetrySynthesis by calling existing readers
  render.ts       — renderSynthesisMarkdown(synthesis): the Markdown report
  index.ts        — public API (added to the curated core barrel allowlist in scripts/generate-core-barrel.mjs)
```

`composeSynthesis` calls `readAdoptionRecords` + `aggregateBySkill` (source 1), the intelligence effectiveness scorers (source 2), the usage aggregator (source 3), `composeInsights` (source 4), and a graph outcome-count (source 5). Each call is wrapped so a missing/empty source yields `{ present: false }` rather than throwing — the same defensive posture as `discoverCatalogSkills`.

Effectiveness (source 2) lives in `@harness-engineering/intelligence`; to keep `core` free of an intelligence dependency, the CLI command composes the effectiveness section (exactly as `adoption.ts` already imports the scorers directly in `buildSkillEffectiveness`) and passes it into the renderer, OR the renderer accepts the pre-built section. Final layering to be confirmed in planning; both keep the existing dependency direction intact.

### Rendering

`renderSynthesisMarkdown` emits: a headline block, then one section per present source (reusing the existing per-surface table shapes so output is familiar), then an explicit "Sources with no data" footer listing every `{ present: false }` source. No section is silently dropped.

### New / touched files

```
packages/types/src/telemetry-synthesis.ts          (new)
packages/core/src/telemetry-synthesis/synthesize.ts (new)
packages/core/src/telemetry-synthesis/render.ts     (new)
packages/core/src/telemetry-synthesis/index.ts      (new)
packages/core/src/index.ts                          (barrel export)
scripts/generate-core-barrel.mjs                    (allowlist entry)
packages/cli/src/commands/telemetry/synthesize.ts   (new)
packages/cli/src/commands/telemetry/index.ts        (register subcommand)
```

## Acceptance criteria (measurable)

Each criterion is observable by running a command and inspecting its output or exit code — verifiable per the acceptance-eval standard (a user-visible behavior with a covering test).

1. `harness telemetry synthesize` exits 0 and prints a Markdown report to stdout in a project that has telemetry.
2. The report contains a headline block and one clearly-labeled section per **present** source among {adoption, effectiveness, usage, insights, outcomes}.
3. `harness telemetry synthesize --json` emits valid JSON parseable as `TelemetrySynthesis`, with a `sources` key carrying all five source keys and a `headline` block.
4. Given a fixture `.harness/metrics/adoption.jsonl` with N records across K skills, the JSON `sources.adoption` reports exactly K skills and the headline `totalSkillInvocations === N` (matches what `harness adoption skills --json` reports over the same fixture — no divergence between surfaces).
5. In a project with **no** `.harness/metrics/adoption.jsonl`, the command still exits 0, `sources.adoption` is `{ present: false }`, and the Markdown lists adoption under "Sources with no data" — no crash, no fabricated zero in the headline (`totalSkillInvocations === null`).
6. Given a fixture `.harness/metrics/costs.jsonl`, headline `totalCostUsd` equals the total the existing usage aggregator reports over the same fixture.
7. When a knowledge graph with `execution_outcome` nodes is present, `sources.outcomes` reports the SATISFIED/NOT_SATISFIED/INCONCLUSIVE counts and headline `outcomeSatisfiedRate` equals satisfied ÷ total; when no graph is present, `sources.outcomes` is `{ present: false }` and the rate is `null`.
8. `--skip usage` produces a report whose `sources.usage` is absent/omitted and whose headline `totalCostUsd` is `null`, while other present sections are unaffected.
9. `--out <path>` writes the report to `<path>` and prints a one-line confirmation; without `--out`, nothing is written to disk (verified: no new files after a run).
10. The command performs **zero writes** to any `.harness/metrics/*` or telemetry source (read-only) — asserted by a test that snapshots those paths before/after.
11. `--window 30` bounds adoption/usage/outcome sections to the trailing 30 days; a fixture record older than 30 days is excluded from the windowed counts and included with no `--window`.
12. Unit tests cover `composeSynthesis` (all-present, all-absent, mixed) and `renderSynthesisMarkdown` (present sections rendered, absent sections footered); `harness validate` passes after all changes.

## Implementation order

1. **Types** — `TelemetrySynthesis` + section interfaces in `packages/types/src/telemetry-synthesis.ts`.
2. **Core compose** — `composeSynthesis` calling existing readers with per-source `{ present: false }` fallback; unit tests for present/absent/mixed.
3. **Core render** — `renderSynthesisMarkdown` incl. the "no data" footer; barrel + allowlist entry.
4. **CLI** — `harness telemetry synthesize` subcommand (`--json`, `--out`, `--skip`, `--window`); wire into the telemetry command; cross-surface parity test against `harness adoption skills --json` / `harness usage`.
5. **Docs** — one line in the telemetry command reference; regenerate reference docs (`pnpm run generate-docs`).

## Follow-on (out of scope — filed for human decision)

**Public cross-adopter synthesis dashboard** (the shard's deliverables a/b/c). Prerequisites before it can be specced: (1) a queryable PostHog aggregate or export pipeline; (2) a privacy/anonymization review for publishing adopter-base statistics; (3) a hosting decision for the public URL; (4) `harness telemetry publish` to push headline stats into the README wall. This slice's `--json` `TelemetrySynthesis` contract is intentionally the per-project shape such a dashboard would aggregate, so the follow-on renders rather than re-collects.
