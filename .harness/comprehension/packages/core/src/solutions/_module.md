---
schemaVersion: 1
module: 'packages/core/src/solutions'
sourceHash: 'd43bd52369df56bf764ea7d8afaafde9d8b3f3a37816f64aba1e4204d6fe75f8'
compiledAt: '2026-08-28T01:22:10.603Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'schema.test.ts', 'schema.ts']
---

## Summary

`packages/core/src/solutions` validates and categorizes solution documentation (bug fixes and knowledge articles) via Zod-enforced frontmatter contracts. It defines a two-track taxonomy: bug-track (9 categories: build-errors, test-failures, runtime-errors, performance-issues, database-issues, security-issues, ui-bugs, integration-issues, logic-errors) and knowledge-track (6 categories: architecture-patterns, design-patterns, tooling-decisions, conventions, dx, best-practices). All solution docs require module, tags, problem_type, last_updated (ISO date), track, and category. The optional enforces field lists rule IDs for provenance tracing per ADR 0100. The module re-exports scan-candidates.

## Invariants

- Discriminated union enforcement: track value strictly determines valid category choices; mixing (e.g., bug-track + architecture-patterns) raises validation error
- ISO date gate: last_updated must match YYYY-MM-DD regex; non-compliant formats fail parse
- Fill-forward compatibility: enforces is optional; legacy docs without it remain valid (no retrofit required)
- Immutable category enums: BUG_TRACK_CATEGORIES and KNOWLEDGE_TRACK_CATEGORIES are const-as-const, preventing runtime drift
- Non-empty string constraints: module and problem_type cannot be blank; tags is always an array (may be empty)
- Optional rule provenance: enforces, when present, must be a string array; non-array values fail type validation

## Interface Contract

```ts
export *
export ALL_SOLUTION_CATEGORIES
export BUG_TRACK_CATEGORIES
export BugTrackCategory
export KNOWLEDGE_TRACK_CATEGORIES
export KnowledgeTrackCategory
export SolutionCategory
export SolutionDocFrontmatter
export SolutionDocFrontmatterSchema
export SolutionTrack
```

## Dependency Slice

```
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES, SolutionDocFrontmatterSchema } from './schema'
import { SolutionDocFrontmatter } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
```
