---
schemaVersion: 1
module: "tests/blueprint"
sourceHash: "158b76e713ba0641cceba72207a063bec7d8066a1afff592169dcf81251feaf5"
compiledAt: "2026-08-28T01:22:12.865Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["impact-lab.test.ts"]
---

## Summary

The `tests/blueprint` module validates the **impact-lab-generator**, a tool that analyzes how changes to a source file ripple through a codebase. Given a file path and an optional custom analyzer, `generateImpactData()` discovers impacted nodes (tests, docs, code, ADRs, configs) and returns them categorized and counted. The module ensures impact queries work with or without a backing graph analyzer (degrading to empty set if unwired), correctly classify nodes into four buckets (tests, docs, code, other), exclude the target file from its own impact set, support async analyzers, and handle unknown types safely.

## Invariants

- Valid empty case: generateImpactData always returns an object with file, impacts (array), counts (categorized tallies), and generatedAt (valid ISO-8601) — even with no analyzer wired
- Self-exclusion: The target file is always filtered out of its own impact set, even if the analyzer returns it
- Category exhaustion: Every impact in the output must carry a category from ['tests', 'docs', 'code', 'other']; no uncategorized impacts leak through
- Count consistency: The sum of counts[category] values across all categories must equal impacts.length
- Async support: Analyzers are awaited; both sync and async signatures work
- Unknown-type safety: categorizeImpact() defaults unknown node types to 'other' instead of erroring
- Analyzer contract: The analyzer function receives the file path as its first argument and may optionally accept a context object

## Interface Contract

```ts

```

## Dependency Slice

```
import { ImpactSourceNode, categorizeImpact, generateImpactData } from '../../packages/core/src/blueprint/impact-lab-generator'
import { describe, expect, it } from 'vitest'
```
