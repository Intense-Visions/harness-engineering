---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/findings'
sourceHash: '2570b8f9d83bb0974b7d05b6bdced57bc1862ce399348224428c6920071cb2b7'
compiledAt: '2026-08-28T01:22:09.406Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

`spec-craft/findings` is the finding schema module defining the output contract for spec-craft's critique phase. It exports three core interfaces: SpecFinding (individual critiques anchored to file/section/line, scored on three axes: Tier/Impact/Confidence, with SPEC-R\d{3} codes and derived priority), SpecCraftSummary (run metadata: phase, mode, duration, LLM costs, coverage), and SpecCraftOutput (the complete report). The module re-exports Tier/Impact/Confidence from the shared craft axes library, establishing a unified 3-axis finding model across all craft pipeline phases.

## Invariants

- Phase is frozen in v1: SpecFinding.phase is always 'critique'; no POLISH phase yet exists
- Code format is stable: SPEC-R\d{3} namespace is reserved for spec-craft findings; no other format is valid
- Line numbering is 1-indexed: target.line uses 1-indexed notation, critical for editor integration and citations
- Section is verbatim H2 text: target.section is the original heading text, not normalized or slugified
- Priority is derived: derived.priority is computed from the 3-axis score, not set by callers
- 3-axis model is shared: Tier/Impact/Confidence are imported from shared craft module; changes propagate to all craft phases

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
