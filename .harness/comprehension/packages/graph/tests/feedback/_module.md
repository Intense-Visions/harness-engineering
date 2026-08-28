---
schemaVersion: 1
module: 'packages/graph/tests/feedback'
sourceHash: '075b12770d7e24484a2f81da3fe37f2e40fc0633d2831f2f4f694a46d2f5289b'
compiledAt: '2026-08-28T01:22:11.706Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['GraphFeedbackAdapter.test.ts']
---

## Summary

The `packages/graph/tests/feedback` module tests `GraphFeedbackAdapter`, a graph analysis component that computes impact metrics from a code dependency graph. It provides two main capabilities: (1) `computeImpactData` analyzes how code changes ripple through the system by identifying test files that cover changed files, documentation files that document them, and counting downstream dependents via inbound imports; (2) `computeHarnessCheckData` produces graph-wide health metrics including node/edge counts, undocumented files, unreachable nodes, and architectural constraint violations. The test suite uses a seeded GraphStore with sample files, imports, tests, and documentation edges to verify correctness across happy paths and edge cases.

## Invariants

- Test file identification relies on path pattern: files containing 'test' are test files; non-test importers never count as affected tests
- Entry point special case: index.ts files always excluded from unreachable-node counts, even without inbound imports
- Impact scope aggregates across multiple changed files by summing inbound import counts without deduplication
- Graph distinguishes three edge type semantics: imports (dependency), documents (coverage), violates (constraint breach)
- Files and documents absent from graph return zeroed impact (empty arrays, zero counts) rather than error or null
- Empty changedFiles list yields zeroed impact data uniformly across all output fields
- Coverage vs. impact are separated: affectedTests only counts test files; non-test importers contribute to impactScope but not test coverage

## Interface Contract

```ts

```

## Dependency Slice

```
import { GraphFeedbackAdapter, GraphHarnessCheckData, GraphImpactData } from '../../src/feedback/GraphFeedbackAdapter.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
