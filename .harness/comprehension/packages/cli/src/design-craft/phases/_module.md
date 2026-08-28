---
schemaVersion: 1
module: 'packages/cli/src/design-craft/phases'
sourceHash: '73ba2a6cb25061a6c514147ec6c46acd16306070a63d24e0b1d006e4e3cdf991'
compiledAt: '2026-08-28T01:22:09.123Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['award-bar.ts', 'benchmark.ts', 'critique.ts', 'polish.ts']
---

## Summary

The `design-craft/phases` module orchestrates BENCHMARK, CRITIQUE, POLISH, and VISION evaluation phases. It scores components on a 5-dimension radar (philosophicalCoherence, hierarchy, craftExecution, function, innovation) — each 0–100 with its own confidence — and derives machine verdicts (cleared | not-cleared | indeterminate) through mechanical computation, not LLM judgment. The LLM emits only the radar and narrative gaps; TypeScript computes the verdict using exemplar-relative floors, confidence gates, and a responsive mobile override layer. This mirrors the authority model in outcome-eval: human-curated rules, not model hand-waving.

## Invariants

- Per-dimension verdict, not aggregate — every dimension must clear its own floor; hiding a weak axis (e.g., 88–94 overall masking template breakage) is explicitly forbidden
- Exemplar-relative floors with safety guard — floor = max(configFloor, round(fraction × median(exemplar radarReference))); corpus defines the bar, config prevents erosion, median is robust to one weak exemplar
- Low confidence vetoes high score — if any dimension has confidence below confidenceFloor, verdict is indeterminate regardless of scores; prevents certifying uncertainty
- Authority in TypeScript, never the LLM — verdict is computed mechanically from radar + exemplars + config; LLM emits only radar, justifications, and narrative gaps
- Overall score/confidence computed mechanically — mean of five dimension scores (rounded), min of five dimension confidences; locked in Phase 0 schema review to prevent LLM gaming
- Exemplars non-empty per target — runBenchmark only scores targets with ≥1 matching exemplar; empty case falls back to config floor defensively
- Responsive gate can override aesthetic verdict — defects always downgrade to not-cleared; unevaluated gates can downgrade cleared→indeterminate if required; otherwise aesthetic verdict stands
- Responsive gate is attached, not baked — applyResponsiveGate composes after award-bar, keeping both verdicts legible in the result

## Interface Contract

```ts
export DEFAULT_AWARD_BAR_CONFIG
export applyResponsiveGate
export computeAwardBar
export parseBenchmarkResponse
export parseFindingResponse
export parsePolishResponse
export patternIsPlausible
export resolveAwardBarConfig
export runBenchmark
export runCritique
export runPolish
export runVisionBenchmark
export runVisionCritique
```

## Dependency Slice

```
import { ResponsiveGateConfig, ResponsiveGateResult, ResponsiveMetrics, computeResponsiveGate } from '../../responsive/index.js'
import { CONFIDENCE_RANK } from '../../shared/craft/findings/axes.js'
import { ExemplarDefinition } from '../catalog/exemplars/linear-empty-list.js'
import { PatternDefinition } from '../catalog/patterns/spring-physics.js'
import { RubricDefinition } from '../catalog/rubrics/hierarchy-clarity.js'
import { derivePriority } from '../findings/derived.js'
import { AwardBar, AwardBarDimension, AwardVerdict, BenchmarkScore, Confidence, CraftFinding, Impact, RadarDimension, RadarDimensionName, Tier } from '../findings/schema.js'
import { LlmProvider } from '../llm/provider.js'
import { AwardBarConfig, applyResponsiveGate, computeAwardBar } from './award-bar.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
