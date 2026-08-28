---
schemaVersion: 1
module: 'packages/intelligence/tests/sel'
sourceHash: '9abd19464d4ea2894608a909f65e4f5c14f28b22af277a40d556ee509283127c'
compiledAt: '2026-08-28T01:22:11.916Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['enricher.test.ts', 'graph-validator.test.ts']
---

## Summary

The `packages/intelligence/tests/sel` module validates the semantic-enrichment layer, which bridges raw work items to structured analysis. It comprises two test suites: `enricher.test.ts` tests the `enrich()` function—given a raw work item, LLM provider, and graph validator, it produces a fully enriched work item with intent, requirements, affected systems, and complexity hints. `graph-validator.test.ts` tests the `GraphValidator` class, which resolves human-readable system names to precise graph nodes with owner, test coverage, and transitive dependencies. The enricher delegates system resolution to the validator rather than trusting the LLM's raw output; unknowns degrade gracefully to null graphNodeId with confidence 0.

## Invariants

- Enrichment preserves identity: id and title pass through unchanged from raw item to enriched output
- Graph validator is authoritative: enricher routes all affected-system names through GraphValidator.validate() and uses its enriched output, never the LLM's raw system objects
- Unknown systems are explicit: systems not in the graph get graphNodeId=null, confidence=0, and nulled owner/transitiveDeps/testCoverage—never omitted or faked
- Partial matches don't degrade: validator processes mixed found/unfound systems independently; unknown systems don't corrupt known ones
- Transitive deps are computed: validator chains dependency edges via CascadeSimulator and returns non-empty transitiveDeps array for known systems
- File nodes are the fallback: if no module node matches a name, validator falls back to file nodes with the same confidence logic
- Missing metadata doesn't break: null owner, missing test coverage, or missing description all degrade gracefully (return null/zero, not crash)
- Empty input is safe: validate([]) returns []; null description triggers LLM to populate unknowns field
- Schema compliance is strict: enriched output has all required fields (intent, summary, affectedSystems with specific shape, functionalRequirements, etc.) with correct type and cardinality

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisProvider, AnalysisResponse } from '../../src/analysis-provider/interface.js'
import { enrich } from '../../src/sel/enricher.js'
import { GraphValidator } from '../../src/sel/graph-validator.js'
import { SELResponse } from '../../src/sel/prompts.js'
import { AffectedSystem, RawWorkItem } from '../../src/types.js'
import { GraphEdge, GraphNode, GraphStore } from '@harness-engineering/graph'
import { describe, expect, it, vi } from 'vitest'
```
