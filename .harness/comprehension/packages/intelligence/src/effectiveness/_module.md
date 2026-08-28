---
schemaVersion: 1
module: 'packages/intelligence/src/effectiveness'
sourceHash: '902ab95159c04907885c5ba3c22847d253ac52c4d729d1e701aa066407133aa5'
compiledAt: '2026-08-28T01:22:11.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['scorer.ts', 'skill-scorer.ts', 'types.ts']
---

## Summary

This module scores and detects patterns in persona and skill performance by analyzing execution outcomes and adoption records. It uses Bayesian-smoothed success rates (Laplace α=1) to avoid over-confidence on small samples, then applies threshold-based detectors to surface blind spots and failing patterns.

**Personas**: Persona Scorer traverses the graph's execution_outcome nodes (attributed to agentPersona), bucketing outcomes by (persona, systemNodeId) pairs. Exports computePersonaEffectiveness (per-pair smoothed success rates), detectBlindSpots (flags pairs with high raw failure rate and minimum failure count), and recommendPersona (scores personas by mean smoothed rate across a system list, using neutral prior 0.5 for unobserved systems).

**Skills**: Skill Scorer ingests adoption.jsonl records with identical Laplace smoothing. Exports computeSkillEffectiveness (per-skill invocation/completion/failure counts), detectFailingSkills (high raw failure rate + minimum count, with failure-category breakdown), and detectAbandonedSkills (high abandonment rate; counts partial-progress abandonments via phasesReached.length > 0).

## Invariants

- Laplace smoothing (α=1, +2 denominator) is canonical and shared across persona and skill scorers; changes must be synchronized
- Neutral prior 0.5 in recommendations: unobserved systems don't penalize personas, preventing under-weighting sparse data
- Raw vs. smoothed rates: blind-spot and failing-skill detectors use raw rates (intuitive thresholds); recommendations use smoothed rates (robust to small samples)
- Graph/record traversal is unshared: each exported function independently calls gatherOutcomes() or gatherCounts(); no caching across calls
- Personas and skills must be non-empty strings; missing or empty values are silently skipped
- Deterministic stable sorting: all results sorted by primary key (success/failure rate descending), then secondary keys (sample size/count descending)
- Abandoned mid-workflow predicate is intentionally duplicated from @harness-engineering/core to avoid circular dependencies; manual sync required on changes
- Optional inline filtering: computePersonaEffectiveness and computeSkillEffectiveness filter during iteration (not post-filter); returns empty if no matches
- Recommendation minSamples threshold excludes personas below minimum observations to prevent routing on single outliers
- Failure category tracking: detectFailingSkills populates failureCategories map (non-zero keys only) for downstream root-cause analysis

## Interface Contract

```ts
export computePersonaEffectiveness
export computeSkillEffectiveness
export detectAbandonedSkills
export detectBlindSpots
export detectFailingSkills
export recommendPersona
```

## Dependency Slice

```
import { AbandonedSkill, BlindSpot, FailingSkill, PersonaEffectivenessScore, PersonaRecommendation, SkillEffectivenessScore } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import { SkillInvocationRecord } from '@harness-engineering/types'
```
