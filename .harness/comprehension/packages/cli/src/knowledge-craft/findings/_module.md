---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/findings'
sourceHash: 'ed9911d3063d87d533b27481b9c9697e2db031b814a930e9e27592f3aded14b6'
compiledAt: '2026-08-28T01:22:09.232Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

The `knowledge-craft/findings` module defines the output schemas for the knowledge-craft LLM critique skill, which audits knowledge entries for quality. It exports three core types: KnowledgeFinding (individual critique tagged with KNOW-R\d{3} code and 3-axis scoring from ADR 0019), KnowledgeCraftSummary (run metadata with LLM costs and file counts), and KnowledgeCraftOutput (complete result pairing findings with summary). The module re-exports the canonical 3-axis primitives (Tier, Impact, Confidence) from shared craft axes, embedding a portable model used across all craft skills.

## Invariants

- Finding codes must match KNOW-R\d{3} namespace for stable identification across runs and integrations
- Phase is locked to 'critique' in v1; future phases require schema evolution
- Tier, Impact, Confidence are canonical 3-axis craft model (ADR 0019) shared across all craft skills; CONFIDENCE_RANK enforces consistent numeric ordering
- File findings require both absolute path and relative-to-docs/knowledge/ path for correct display and tracing
- cite.rubricId must reference a real KnowledgeRubric; links findings to rubric metadata (title, source, version) for audit trails
- Priority in derived field enables deterministic downstream filtering and sorting without re-scoring
- Two-step collect/finalize flow persists promptRecords to .harness/craft/runs/<runId>.json to correlate LLM responses back to target+rubric pairs
- InSessionLlmProvider throws on every call; runKnowledgeCraft (inline path) must reject in-session provider upfront to prevent silent zero-findings runs

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```
