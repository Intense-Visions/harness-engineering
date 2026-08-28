---
schemaVersion: 1
module: 'packages/core/src/compaction/strategies'
sourceHash: '38895774efff9c2b5bf01cafed76e15103cd3bf302edbf4fe65d5bc8d8895f50'
compiledAt: '2026-08-28T01:22:10.302Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['structural.ts', 'truncation.ts']
---

## Summary

StructuralStrategy and TruncationStrategy are two JSON/text compaction approaches in this module. Structural removes nulls, undefined, empty collections, and whitespace from JSON without losing information—non-JSON passes through. Truncation stays within a token budget (default 4000) by priority-scoring lines (file paths +40, errors +35, identifiers +20, short lines +10), keeping high-priority lines first, truncating rather than skipping long lines, and restoring original order for readability. Both implement CompactionStrategy interface with name, lossy flag, and apply() method.

## Invariants

- Structural strategy must gracefully handle non-JSON: invalid JSON returns unchanged; only valid JSON is cleaned.
- Single-item array collapse is information-preserving: [value] → value is structural simplification, not data loss.
- Truncation line scoring is deterministic: ties break toward earlier position for stable top-section bias.
- Truncation never outputs negative budget state: remaining char budget guarded with Math.max(..., 0).
- Truncation marker cost capped at 50% of budget: Math.min(TRUNCATION_MARKER.length, charBudget / 2).
- Truncation marker only appends when it fits: never truncates body to force-fit marker.
- Truncation restores original line order after selection: lines re-sorted by original index for readability.
- Token-to-char conversion uniform across strategies: 4 chars-per-token constant affects all budget math.
- Truncation classified as lossless at pipeline level despite cutting content (Decision 2 in spec).
- Structural whitespace normalization is aggressive: \s+ → space + trim; intentional for JSON payload reduction.

## Interface Contract

```ts
export DEFAULT_TOKEN_BUDGET
export StructuralStrategy
export TruncationStrategy
```

## Dependency Slice

```
import { CompactionStrategy } from './structural'
```
