# Agent Effectiveness Introspection

**Date:** 2026-04-16
**Status:** Draft
**Identifier:** agent-effectiveness--ce3e7868
**Keywords:** agent-effectiveness, persona-routing, blind-spot, outcome, effectiveness-score, introspection

## Overview

Harness already ingests `ExecutionOutcome` nodes into the knowledge graph when an agent finishes an issue, and `computeHistoricalComplexity` computes a smoothed failure rate _per system_. What's missing is the cross-cut that lets us answer questions like:

- "Is the `task-executor` persona consistently failing on issues that touch `module:payments`?"
- "Which persona has the best track record on `module:api`?"
- "Where are our blind spots — systems where _every_ persona tends to fail?"

This proposal adds **Agent Effectiveness Introspection**: a new intelligence module that tracks per-persona accuracy across domains, surfaces consistent failure patterns, and recommends alternative personas for a given issue's affected systems.

### Goals

1. Attribute outcomes to the persona that produced them (tag ExecutionOutcomes with `agentPersona`).
2. Compute effectiveness scores for `(persona, system)` pairs using smoothed success rates.
3. Detect blind spots: `(persona, system)` pairs with high failure density once a minimum sample size is reached.
4. Recommend the best-suited persona for a new issue given its affected systems and prior outcomes.
5. Expose the new API from `@harness-engineering/intelligence` alongside the existing outcome/complexity modules.

### Non-Goals

- Persistent per-persona ranking across projects (rankings live in the graph already; we just query them).
- Automatic persona mutation (switching live agents mid-run). This proposal focuses on _recommendation_; actual switching is orchestrator policy.
- New graph node/edge types. We store `agentPersona` in `execution_outcome` metadata — no schema change.
- Dashboards/UI (future work; this adds the data layer only).
- Changing `ExecutionOutcome.result` beyond `success | failure` (no partial outcomes, no fault categorisation).

## Decisions

| Decision                            | Choice                                                                              | Rationale                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Where to attribute persona          | Optional field `agentPersona` on `ExecutionOutcome`, stored in node metadata        | Backward compatible; no schema migration required; leverages existing ingestion path                |
| Domain granularity                  | Graph node ID of an affected system (module/file/class/etc.)                        | We already ingest these; no new classification layer needed                                         |
| Scoring function                    | Laplace-smoothed success rate: `(successes + α) / (successes + failures + 2α)`, α=1 | Matches the bias/shape of `computeHistoricalComplexity`; one-success-no-failures yields ~0.67 not 1 |
| Blind-spot threshold                | Configurable `minFailures` (default 2) and `minFailureRate` (default 0.5)           | Avoids flagging single-incident noise                                                               |
| Recommendation input                | List of graph node IDs (the affected systems from the enriched spec)                | Feeds naturally from SEL → effectiveness scoring → orchestrator policy                              |
| Recommendation aggregation          | Average of per-system smoothed success rates for each candidate persona             | Systems with no history contribute the neutral prior, preventing over-confidence                    |
| Module location                     | `packages/intelligence/src/effectiveness/`                                          | Sits alongside `outcome/`, `cml/`; this module is about post-execution insight, not planning        |
| Layer/forbidden-import implications | None — `intelligence` is outside the harness.config.json layer graph                | No architecture changes required                                                                    |

## Technical Design

### 1. Extended `ExecutionOutcome`

Add an optional field (kept at the end so struct is backward compatible):

```typescript
export interface ExecutionOutcome {
  // ...existing fields...
  /** Persona that produced this outcome (e.g., 'task-executor'). Optional for back-compat. */
  agentPersona?: string;
}
```

`ExecutionOutcomeConnector.ingest` passes `agentPersona` into node metadata when present:

```typescript
metadata: {
  // ...existing fields...
  ...(outcome.agentPersona !== undefined && { agentPersona: outcome.agentPersona }),
},
```

No new node/edge types, no schema version bump.

### 2. New module: `effectiveness/`

```
packages/intelligence/src/effectiveness/
├── types.ts      # PersonaEffectivenessScore, BlindSpot, PersonaRecommendation
└── scorer.ts     # computePersonaEffectiveness, detectBlindSpots, recommendPersona
```

#### Types

```typescript
export interface PersonaEffectivenessScore {
  persona: string;
  systemNodeId: string;
  successes: number;
  failures: number;
  /** Laplace-smoothed success rate in [0, 1]. */
  successRate: number;
  /** Total observations (successes + failures). */
  sampleSize: number;
}

export interface BlindSpot {
  persona: string;
  systemNodeId: string;
  failures: number;
  successes: number;
  failureRate: number;
}

export interface PersonaRecommendation {
  persona: string;
  /** Mean smoothed success rate across the requested systems. */
  score: number;
  /** Number of systems for which we have any observation for this persona. */
  coveredSystems: number;
  /** Number of systems the persona has zero history on. */
  unknownSystems: number;
  /** Total outcomes for this persona across the requested systems. */
  totalSamples: number;
}
```

#### Functions

```typescript
export function computePersonaEffectiveness(
  store: GraphStore,
  opts?: { persona?: string; systemNodeId?: string }
): PersonaEffectivenessScore[];

export function detectBlindSpots(
  store: GraphStore,
  opts?: {
    persona?: string;
    minFailures?: number; // default 2
    minFailureRate?: number; // default 0.5
  }
): BlindSpot[];

export function recommendPersona(
  store: GraphStore,
  opts: {
    systemNodeIds: string[];
    /** If omitted, infer the candidate set from the graph. */
    candidatePersonas?: string[];
    /** Minimum total samples for a persona to be considered. Default 0 (include all). */
    minSamples?: number;
  }
): PersonaRecommendation[];
```

Internals:

- Walk `execution_outcome` nodes via `findNodes({ type: 'execution_outcome' })`.
- Group by `(persona, system)` where `persona = node.metadata.agentPersona` (outcomes without persona are ignored for these calculations — they still feed `computeHistoricalComplexity`).
- `successRate = (successes + 1) / (successes + failures + 2)`.
- `detectBlindSpots` operates on _raw_ failure rate `failures / (failures + successes)` so thresholds are intuitive; requires `failures >= minFailures` AND raw rate >= `minFailureRate`.
- `recommendPersona` averages per-system smoothed rates; a persona with no history for a system contributes the neutral prior `0.5`. Results sort by score descending, ties broken by `totalSamples` descending.

### 3. Public API

`packages/intelligence/src/index.ts` gains:

```typescript
export {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from './effectiveness/scorer.js';
export type {
  PersonaEffectivenessScore,
  BlindSpot,
  PersonaRecommendation,
} from './effectiveness/types.js';
```

### 4. File Layout

```
CREATE packages/intelligence/src/effectiveness/types.ts
CREATE packages/intelligence/src/effectiveness/scorer.ts
CREATE packages/intelligence/tests/effectiveness/scorer.test.ts
MODIFY packages/intelligence/src/outcome/types.ts            (add agentPersona)
MODIFY packages/intelligence/src/outcome/connector.ts        (propagate agentPersona)
MODIFY packages/intelligence/tests/outcome/connector.test.ts (cover agentPersona)
MODIFY packages/intelligence/src/index.ts                    (re-exports)
CREATE .harness/learnings.md                                 (append-only log)
```

## Success Criteria

1. **Persona attribution** — ingesting an `ExecutionOutcome` with `agentPersona: 'task-executor'` results in the graph node having `metadata.agentPersona === 'task-executor'`. Omitting the field leaves metadata unchanged.
2. **Per-pair scoring** — `computePersonaEffectiveness` returns one entry per `(persona, systemNodeId)` pair with non-zero observations, and `successRate` matches the Laplace-smoothed formula.
3. **Filtering** — passing `persona` or `systemNodeId` options narrows the returned set.
4. **Blind spot detection** — `detectBlindSpots` returns `(persona, system)` pairs that meet _both_ the `minFailures` and `minFailureRate` thresholds; below either threshold, nothing is returned.
5. **Recommendation** — `recommendPersona({ systemNodeIds })` returns candidates sorted by average smoothed success rate; personas with no observations on any of the requested systems still appear but score exactly `0.5`; personas with observations outrank uninformed priors on at least one system.
6. **Backward compatibility** — existing outcome connector tests continue to pass without modification (except where we deliberately extend them).
7. **Public API** — new functions and types are exported from `@harness-engineering/intelligence` and re-compiled without TypeScript errors.
8. **`harness validate`** — passes after the change.

## Implementation Order

1. Extend `ExecutionOutcome` type; update connector to propagate `agentPersona`; extend existing connector tests.
2. Add `effectiveness/types.ts` and `effectiveness/scorer.ts` with tests (TDD).
3. Wire re-exports in `packages/intelligence/src/index.ts`.
4. Run `pnpm --filter @harness-engineering/intelligence test`, `pnpm --filter @harness-engineering/intelligence build`.
5. Run `pnpm harness validate` (or equivalent) at the workspace root.
6. Append learnings; commit and open PR.
