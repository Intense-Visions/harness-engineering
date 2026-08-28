---
schemaVersion: 1
module: 'packages/cli/src/security-craft/catalog/rubrics'
sourceHash: 'ebb76c44bbbece3f4bb8eb6d211a2bb7ac379c0970a1e5fb75c760175da6711c'
compiledAt: '2026-08-28T01:22:09.340Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'assumed-adversary-realistic.ts',
    'authz-before-action.ts',
    'data-flow-annotated.ts',
    'defense-in-depth.ts',
    'fail-closed-not-open.ts',
    'index.ts',
    'least-authority-honored.ts',
    'secret-handling-shape.ts',
    'trust-boundary-respected.ts',
    'types.ts',
  ]
---

## Summary

The `rubrics` module defines the v1 seed catalog of security rubrics — 8 SecurityRubric objects (SEED_RUBRICS) that form the baseline for security-craft's code review pipeline. Each rubric pairs a security best practice (trust-boundary respect, least authority, defense-in-depth, threat-model fit, data-flow visibility, fail-closed behavior, secret handling, authorization ordering) with applicable signal kinds, academic sources (OWASP, CWE, STRIDE, Saltzer & Schroeder), and telemetry tracking. Critique uses rubricApplies() to gate application per (file, signal), reducing false positives by running only relevant rubrics. This is a "living catalog" (ADR 0020) designed for forward extension while v1 remains stable.

## Invariants

- Immutable v1 baseline: SEED_RUBRICS is readonly; the 8 rubrics (SEC-R001–SEC-R008) are frozen identities
- Signal-driven selectivity: Every rubric declares appliesToSignals — critiquer routes by detected signal kind to avoid inapplicable critique
- Sourced not invented: Each rubric cites established literature (academic papers, standards bodies, threat-modeling frameworks), not repo opinion
- rubricApplies is the gate: Module exports the function that determines relevance; critique never applies a rubric without consulting it
- Observable telemetry: Each rubric tracks signal.invocations and signal.suppressedAt for observability across runs
- Forward-compatible shape: The SecurityRubric interface is designed to accept future fields (version tracking, deprecated flags, confidence tiers) without breaking v1 consumers

## Interface Contract

```ts
export SEED_RUBRICS
export SecurityRubric
export rubricApplies
```

## Dependency Slice

```
import { SignalKind } from '../../findings/schema.js'
import { assumedAdversaryRealisticRubric } from './assumed-adversary-realistic.js'
import { authzBeforeActionRubric } from './authz-before-action.js'
import { dataFlowAnnotatedRubric } from './data-flow-annotated.js'
import { defenseInDepthRubric } from './defense-in-depth.js'
import { failClosedNotOpenRubric } from './fail-closed-not-open.js'
import { leastAuthorityHonoredRubric } from './least-authority-honored.js'
import { secretHandlingShapeRubric } from './secret-handling-shape.js'
import { trustBoundaryRespectedRubric } from './trust-boundary-respected.js'
import { SecurityRubric } from './types.js'
```
