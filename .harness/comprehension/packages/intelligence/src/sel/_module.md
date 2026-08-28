---
schemaVersion: 1
module: 'packages/intelligence/src/sel'
sourceHash: '4cdf68bbce7a05e59baef3ca13f357b41ce7b003eca25d6e1c486eaddd20a6fe'
compiledAt: '2026-08-28T01:22:11.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['enricher.ts', 'graph-validator.ts', 'prompts.ts']
---

## Summary

**`packages/intelligence/src/sel`** is a **Spec Enrichment via LLM** (SEL) system that converts raw work items (bug reports, features, tasks) into detailed, graph-validated engineering specifications. It works in two phases: (1) an `AnalysisProvider` analyzes the work item using SEL prompts and produces 13 structured fields (intent, requirements, API/DB changes, risks, assumptions) validated against a Zod schema; (2) a `GraphValidator` cross-references each LLM-identified affected system against the knowledge graph using fuzzy matching, enriching matches with transitive dependencies (via cascade simulation), test coverage counts, and ownership metadata. The module exports the enrichment pipeline (`enrich`), the validator class, and the LLM interaction kit (system prompt, user prompt builder, response schema).

## Invariants

- LLM is the source of truth for 13 enrichment fields (intent, summary, requirements, risks, etc.); the enricher maps LLM output directly to EnrichedSpec fields without secondary interpretation.
- Graph validation is post-hoc and lossy — affected systems from the LLM are validated after LLM analysis; systems with no graph match (score < 0.4) return confidence=0, graphNodeId=null, and empty metadata arrays with no retry or fallback.
- Fuzzy matching cutoff is hard at 0.4 — scores below this threshold are treated as non-match, triggering a null confidence return regardless of proximity.
- Transitive dependency depth is capped at 3 hops via CascadeSimulator (maxDepth: 3, probabilityFloor: 0.1); simulation failures return an empty array, not an exception.
- Test coverage is raw edge count — edges of type 'tested_by' and 'verified_by' from the node are summed as a scalar, not a percentage or ratio.
- Owner metadata is a string or null — if the graph node lacks metadata.owner or it is not a string, the system returns owner: null.
- Node list caching is scoped to one validation pass — module and file node lists are cached during validate() and released immediately after to prevent stale lookups across multiple calls.
- Response schema excludes graph fields — selResponseSchema validates only the LLM's raw output (no graphNodeId, transitiveDeps, testCoverage, or owner); those are computed by the validator.

## Interface Contract

```ts
export GraphValidator
export SEL_SYSTEM_PROMPT
export buildUserPrompt
export enrich
export selResponseSchema
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { AffectedSystem, EnrichedSpec, RawWorkItem } from '../types.js'
import { GraphValidator } from './graph-validator.js'
import { SELResponse, SEL_SYSTEM_PROMPT, buildUserPrompt, selResponseSchema } from './prompts.js'
import { CascadeSimulator, GraphStore } from '@harness-engineering/graph'
import { z } from 'zod'
```
