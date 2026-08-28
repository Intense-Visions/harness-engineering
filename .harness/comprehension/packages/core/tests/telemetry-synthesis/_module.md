---
schemaVersion: 1
module: 'packages/core/tests/telemetry-synthesis'
sourceHash: 'aec26ea9181bd8282e0efe5b1b52890bb44ce96846b714e6085edf1c11ac9df6'
compiledAt: '2026-08-28T01:22:11.109Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['synthesize.test.ts']
---

## Summary

**packages/core/tests/telemetry-synthesis** validates the composition of heterogeneous telemetry data from five sources—adoption records, usage records, code-health insights, skill-effectiveness scores, and execution-outcome graph nodes—into a unified `TelemetrySynthesis` report. The module tests `composeSynthesis()`, a pure aggregator that produces a unified headline and per-source sections, with a core design principle that each source independently reports presence/absence and that absent sources yield `null` headline fields, never zero or fabricated values. Supports date windowing (default 30 days, nullable for all-time), explicit skip functionality, and markdown rendering with an absent-source footer.

## Invariants

- Source presence gates headline fields: if sources.X.present === false, then headline.correspondingField === null
- Unknown pricing propagates to null: if any usage record lacks costMicroUSD, sources.usage.totalCostMicroUSD becomes null, cascading to headline.totalCostUsd
- Empty outcomes means absent, not zero-rate: empty outcomeNodes array results in sources.outcomes.present = false, not a zero-rate outcome section
- Outcome verdict→result fallback: graph nodes without explicit verdict can map result === 'success' to SATISFIED
- Windowing is uniform: adoption records, usage records, and outcome nodes all filter by the same now and windowDays
- Markdown trailing newline invariant: output ends with exactly \n, never \n\n or without one
- Absent footer only when sources are absent: the Sources with no data section appears iff at least one source is absent
- Skip marks present:false with reason: explicitly skipped sections set present: false and reason: 'skipped', not omitting them from output structure

## Interface Contract

```ts

```

## Dependency Slice

```
import { OutcomeNodeLike, SynthesisInputs, composeSynthesis, renderSynthesisMarkdown } from '../../src/telemetry-synthesis/index.js'
import { EffectivenessSection, InsightsReport, SkillInvocationRecord, UsageRecord } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
