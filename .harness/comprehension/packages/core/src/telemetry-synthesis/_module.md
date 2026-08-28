---
schemaVersion: 1
module: 'packages/core/src/telemetry-synthesis'
sourceHash: '95c7d053edc03b769ba346dcd0bb2244ac64398b4d8771652d87a2e97c2657bf'
compiledAt: '2026-08-28T01:22:10.634Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'render.ts', 'synthesize.ts']
---

## Summary

**telemetry-synthesis** is a pure composition layer that unifies telemetry from five pre-existing data surfaces (adoption, effectiveness, usage, insights, outcomes) into a single structured `TelemetrySynthesis` report. It reads adoption records, usage records, code-health insights, skill effectiveness projections, and execution-outcome verdicts — then synthesizes them into both structured data and Markdown output. The module is intentionally read-only and pure: all inputs are passed in by the caller, supporting deterministic windowing and unit testing without file I/O. It injects the effectiveness builder and outcome-node type to keep `core` free of `intelligence` and `graph` dependencies. The renderer explicitly reports every absent source with a reason rather than silently dropping sections.

## Invariants

- Purity contract — all telemetry inputs are passed in; the function is deterministic given a fixed `now` date and cannot reach disk or make side effects.
- Layer independence — `core` avoids importing `intelligence` (effectiveness scorer) or `graph` (outcome nodes) by accepting injected `buildEffectiveness` callback and duck-typed `OutcomeNodeLike` interface; layer direction is upheld at the CLI composition root.
- Windowing consistency — the effectiveness section is always built from the already-windowed adoption records, ensuring adoption and effectiveness totals remain aligned (not independently windowed).
- No silent absences — every section in the report is present in `sources` with `present: boolean` and an explicit `reason` when absent; callers and renderers never guess why a section is missing.
- Uniform section shape — adoption, effectiveness, usage, insights, and outcomes all surface as `SynthesisSection<T>` with consistent `{ present, totalInvocations, distinctSkills, successRate }` fields where applicable, enabling uniform rendering logic.
- Top-N reproducibility — ranked lists (top skills, least effective, failing, abandoned) are capped at configurable `topN` (default 10) and sorted deterministically; output is stable across runs with the same input.
- Null-aware formatting — headline metrics safely report `'n/a'` for missing cross-source figures (e.g., health when insights absent), preventing silent zeros or misleading fallback values.

## Interface Contract

```ts
export ComposeSynthesisOptions
export OutcomeNodeLike
export SynthesisInputs
export composeSynthesis
export renderSynthesisMarkdown
```

## Dependency Slice

```
import { aggregateBySkill } from '../adoption/index.js'
import { aggregateByDay } from '../usage/aggregator.js'
import { AdoptionSection, EffectivenessSection, InsightsReport, InsightsSection, OutcomeSection, SkillInvocationRecord, SynthesisSection, TELEMETRY_SYNTHESIS_SECTIONS, TelemetrySynthesis, TelemetrySynthesisSection, UsageRecord, UsageSection } from '@harness-engineering/types'
```
