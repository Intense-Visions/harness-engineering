---
schemaVersion: 1
module: 'packages/intelligence/tests'
sourceHash: '41078c91923515d44d18df7defc5f54ffefa2a5ddbdefb7f5b6b2851abbca0c2'
compiledAt: '2026-08-28T01:22:11.869Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['adapter.test.ts', 'pipeline.test.ts']
---

## Summary

`packages/intelligence/tests` validates two core components: an Issue-to-RawWorkItem adapter and an escalation-aware preprocessing pipeline. The adapter tests verify field mapping and robust null/empty handling, particularly filtering null IDs from `blockedBy` arrays into `linkedItems`. The pipeline tests verify tier-based stage gating—autoExecute tiers skip all LLM analysis, signalGated runs SEL enrichment + CML scoring + signal derivation, alwaysHuman runs SEL + CML but skips signals. The pipeline preserves issue identity and can accept optional distinct PESL providers (SC34/SC35).

## Invariants

- Issue id and title must pass through the pipeline unchanged and appear in output spec/results
- blockedBy entries with id: null must be filtered out; only non-null IDs propagate to linkedItems
- autoExecute tiers skip spec, score, and signals (zero LLM calls); signalGated runs SEL + CML + signals; alwaysHuman runs SEL + CML but skips signals
- When peslProvider is supplied, PeslSimulator uses the distinct provider; when omitted, it reuses the SEL provider
- pipeline.simulate() delegates to PeslSimulator and never issues additional LLM calls if the input spec/score came from preprocessing in the same call
- Adapter must populate metadata dict with identifier, priority, state, branchName, URL, and timestamps; null/undefined fields must be handled gracefully

## Interface Contract

```ts

```

## Dependency Slice

```
import { toRawWorkItem } from '../src/adapter.js'
import { AnalysisProvider } from '../src/analysis-provider/interface.js'
import { IntelligencePipeline } from '../src/pipeline.js'
import { GraphStore } from '@harness-engineering/graph'
import { EscalationConfig, Issue } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
