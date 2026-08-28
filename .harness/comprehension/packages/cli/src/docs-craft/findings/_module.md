---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/findings'
sourceHash: 'c2bd14d554009c657e1b19867929c552b18b196ec22a4634f7c8a71d9fd20f68'
compiledAt: '2026-08-28T01:22:09.161Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

The `docs-craft/findings` module defines the schema for documentation quality findings emitted by the docs-craft skill. It exports three interfaces: `DocsFinding` (a single critique judgment anchored to a doc file, using the shared 3-axis system: Tier, Impact, Confidence), `DocsCraftSummary` (run metadata including rubrics applied, LLM costs, and file counts), and `DocsCraftOutput` (the bundled result). This module is a structural twin of design-craft's CraftFinding, supporting the multi-craft pipeline initiative. It provides the type layer for the LLM ceiling of documentation quality checking, complementing rule-based floor checks like docs-pipeline and detect-doc-drift.

## Invariants

- Code field matches DOCS-R\d{3} regex for stable finding identification across runs
- Phase is locked to 'critique' in v1; POLISH and BENCHMARK phases deferred pending schema extensions
- Tier, Impact, and Confidence are re-exported from shared craft module—these three axes are canonical across all craft skills (design/docs/knowledge)
- Each finding targets exactly one doc file + DocKind pair; findings without a target location are filtered out during critique
- Derived priority field is always populated by critique engine before a finding is added to output; used for downstream sorting and filtering
- DocsCraftSummary fields mode and phaseRun are fixed values ('fast' and ['critique']) to ensure deterministic run summaries
- LLM call tracking (provider, model, count, costUsd) must be accurate for cost projection and budget enforcement
- InSessionLlmProvider must use two-step collect/finalize flow; inline entry is forbidden and throws with a helpful error message

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { DocKind } from '../catalog/rubrics/types.js'
```
