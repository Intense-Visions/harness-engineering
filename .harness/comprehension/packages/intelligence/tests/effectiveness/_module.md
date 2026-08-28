---
schemaVersion: 1
module: 'packages/intelligence/tests/effectiveness'
sourceHash: 'e5e3b0e367b83354baeadb4f5321e091e616cd810a89e1100b7123dfb9172537'
compiledAt: '2026-08-28T01:22:11.894Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['scorer.test.ts', 'skill-scorer.test.ts']
---

## Summary

The **effectiveness** module scores agent persona performance across systems using historical execution outcomes stored in the knowledge graph. Three core functions compute Laplace-smoothed success rates per (persona, system) pair, detect blind spots with dual failure thresholds, and recommend personas for new work based on mean effectiveness across affected systems. All calculations use Laplace smoothing (α=1) to stabilize sparse-data estimates, and outcomes must have both an `agentPersona` tag and `outcome_of` edges to systems to be counted.

## Invariants

- Laplace smoothing (successes + 1) / (total + 2) is mandatory for all success rates — no exceptions, tied to threshold calibration and matches computeHistoricalComplexity bias
- Outcomes lacking outcome_of edges (no affectedSystemNodeIds) are silently dropped; graph attribution is required
- agentPersona metadata is mandatory — outcomes without it or with empty string are skipped entirely
- Blind spots use raw unsmoothed failure rate (failures / total) not Laplace-smoothed, keeping thresholds intuitive
- Both minFailures AND minFailureRate must be satisfied in detectBlindSpots; either threshold alone is insufficient
- Persona and systemNodeId filters are independent and compose orthogonally
- recommendPersona uses neutral prior 0.5 for any persona-system pair with zero history, preventing overconfidence on partial data
- Tie-breaking is deterministic: when scores match within ε=1e-10, secondary sort is by totalSamples descending
- Empty candidate set returns empty recommendations without error
- minSamples in recommendPersona filters at aggregation level — totalSamples counts across all requested systems, not per-system
- Graph traversal is fresh per call; gatherOutcomes is invoked independently for each exported function

## Interface Contract

```ts

```

## Dependency Slice

```
import { computePersonaEffectiveness, detectBlindSpots, recommendPersona } from '../../src/effectiveness/scorer.js'
import { computeSkillEffectiveness, detectAbandonedSkills, detectFailingSkills } from '../../src/effectiveness/skill-scorer.js'
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js'
import { ExecutionOutcome } from '../../src/outcome/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { SkillInvocationRecord } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
