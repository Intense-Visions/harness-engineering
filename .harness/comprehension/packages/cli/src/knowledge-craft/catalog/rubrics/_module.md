---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/catalog/rubrics'
sourceHash: '065b026239560c68b79361a8b2ad85be33e1bcdd1a4ed08ee35ad88a9cc31f94'
compiledAt: '2026-08-28T01:22:09.238Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'carries-forward-decision.ts',
    'deleting-loses-something.ts',
    'earns-graph-place.ts',
    'index.ts',
    'load-bearing-fact.ts',
    'specific-not-generic.ts',
    'stranger-in-6-months.ts',
    'truth-not-derivable.ts',
    'types.ts',
  ]
---

## Summary

This module defines a v1 seed catalog of seven quality rubrics for evaluating knowledge entries in the knowledge-craft pipeline (ADR 0020). Each rubric captures a heuristic for what makes a knowledge entry valuable — what to look for and what anti-patterns to avoid. The rubrics are opinionated quality gates that discourage paraphrase, platitude, transience, and vagueness in favor of load-bearing facts, operational specificity, and durability. Rubrics are designed to be invoked during knowledge-entry review and track signal (invocation counts, suppressions) for tuning. The catalog is extensible — new rubrics can be added by following the KnowledgeRubric type contract.

## Invariants

- Fixed seed set: Exactly seven rubrics (KNOW-R001 through KNOW-R007) exported as SEED_RUBRICS in a stable order. Each rubric has a unique ID and fixed title/description — these are not versioned in the schema but used as-is for consistency across sessions.
- Taxonomy coupling: Rubric KNOW-R003 references the knowledge-graph taxonomy (business_fact, business_rule, business_concept, business_decision). Knowledge entries must satisfy this rubric to earn a graph place — rubrics and taxonomy are load-bearing together.
- Immutable exports: SEED_RUBRICS is a ReadonlyArray<KnowledgeRubric> — the seed set cannot be mutated at runtime. Individual rubric constants are also const-exported, not mutable copies.
- Signal contract: Every rubric carries a signal field (invocations counter + suppressedAt array) for telemetry. This is v1 scaffolding; if signal tracking is added upstream, the shape must remain compatible.
- Contribution provenance: All seed rubrics carry identical contribution metadata (addedAt: '2026-05-26', addedBy: 'seed') — this marks them as the canonical v1 baseline, distinguishing them from user-added rubrics later.
- Version field: Each rubric has version: 1. The schema is forward-compatible (e.g., adding optional fields), but changing version implies a breaking change in semantics and would require a migration strategy.

## Interface Contract

```ts
export KnowledgeRubric
export SEED_RUBRICS
```

## Dependency Slice

```
import { carriesForwardDecisionRubric } from './carries-forward-decision.js'
import { deletingLosesSomethingRubric } from './deleting-loses-something.js'
import { earnsGraphPlaceRubric } from './earns-graph-place.js'
import { loadBearingFactRubric } from './load-bearing-fact.js'
import { specificNotGenericRubric } from './specific-not-generic.js'
import { strangerInSixMonthsRubric } from './stranger-in-6-months.js'
import { truthNotDerivableRubric } from './truth-not-derivable.js'
import { KnowledgeRubric } from './types.js'
```
