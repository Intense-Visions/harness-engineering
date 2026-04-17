# Persistent Agent Specialization

**Date:** 2026-04-17
**Status:** Draft
**Identifier:** persistent-agent-spe-c1e9e245
**Keywords:** specialization, persona-weighting, temporal-decay, task-type-performance, expertise-scoring, codebase-area, outcome-attribution

## Overview

The existing Agent Effectiveness Introspection module (`packages/intelligence/src/effectiveness/`) tracks per-`(persona, systemNodeId)` success/failure counts and computes Laplace-smoothed success rates. This answers "which persona has the best overall record on a system?" but cannot answer:

- "Is `task-executor` _improving_ at handling `module:payments` issues over time, or regressing?"
- "Which persona is the strongest _bug-fix_ specialist vs. _feature_ specialist?"
- "Has `code-reviewer` developed deep expertise in `module:api` through accumulated experience?"
- "Should we weight recent outcomes more heavily than old ones when recommending a persona?"

This proposal adds **Persistent Agent Specialization**: a module that tracks task-type performance over time, computes specialization scores with temporal decay, and enables dynamic persona weighting. Agents effectively "develop expertise" in specific codebase areas through accumulated experience.

### Goals

1. **Temporal awareness** — Weight recent outcomes more heavily than old ones via exponential decay, so personas that improve are rewarded and those that regress are penalized.
2. **Task-type categorization** — Track performance by task type (feature, bugfix, refactor, docs) in addition to system, enabling task-type specialization.
3. **Specialization scoring** — Compute composite expertise scores that factor in success rate, recency, volume, and consistency.
4. **Expertise levels** — Classify personas into expertise tiers (novice → competent → proficient → expert) per `(system, taskType)` pair based on accumulated experience.
5. **Dynamic persona weighting** — Provide a weighted recommendation function that factors specialization into persona routing decisions.
6. **Specialization profiles** — Persist per-persona specialization snapshots to disk for cross-session continuity.

### Non-Goals

- Automatic persona mutation or mid-run switching (orchestrator policy, not this module).
- New graph node/edge types — specialization data is derived from existing `execution_outcome` nodes.
- UI/dashboard for specialization (future work; this adds the data layer only).
- Changing the existing `computePersonaEffectiveness`, `detectBlindSpots`, or `recommendPersona` APIs (they remain unchanged; this module layers on top).
- Per-project persona customization (profiles are project-scoped by nature of the graph store).

## Decisions

| Decision                                | Choice                                                                                                            | Rationale                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Module location                         | `packages/intelligence/src/specialization/`                                                                       | Parallel to `effectiveness/`; specialization builds on effectiveness but adds temporal and task-type dimensions |
| Temporal decay function                 | Exponential decay: `weight = e^(-λ * ageDays)` with configurable half-life (default 30 days)                      | Well-understood, tunable, matches intuition that recent outcomes matter more                                    |
| Task-type source                        | `ExecutionOutcome` metadata field `taskType` (optional, like `agentPersona`)                                      | Backward compatible; populated by orchestrator from issue labels or enriched spec                               |
| Expertise levels                        | Threshold-based: novice (<5 samples), competent (5-14), proficient (15-29), expert (30+) adjusted by success rate | Simple, interpretable, and tunable per deployment                                                               |
| Specialization score                    | Composite: `0.6 * temporalSuccessRate + 0.25 * consistencyScore + 0.15 * volumeBonus`                             | Balances recent performance, consistency, and experience depth                                                  |
| Profile persistence                     | JSON file at `.harness/specialization-profiles.json`                                                              | Lightweight; avoids graph pollution; trivially loadable by any agent                                            |
| Relationship to existing recommendation | New `weightedRecommendPersona()` wraps `recommendPersona()` and applies specialization multipliers                | Non-breaking; existing API untouched                                                                            |
| Layer/import implications               | None — `intelligence` package, no new cross-package deps                                                          | No architecture changes required                                                                                |

## Technical Design

### 1. Extended `ExecutionOutcome` Metadata

Add an optional `taskType` field alongside existing `agentPersona`:

```typescript
export interface ExecutionOutcome {
  // ...existing fields...
  agentPersona?: string;
  /** Task type categorization (e.g., 'feature', 'bugfix', 'refactor', 'docs'). */
  taskType?: TaskType;
}

export type TaskType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'chore';
```

`ExecutionOutcomeConnector.ingest` propagates `taskType` into node metadata when present.

### 2. New Module: `specialization/`

```
packages/intelligence/src/specialization/
├── types.ts          # SpecializationProfile, ExpertiseLevel, SpecializationScore, etc.
├── scorer.ts         # computeSpecialization, computeExpertiseLevel, weightedRecommendPersona
├── temporal.ts       # Temporal decay functions and weighted aggregation
└── persistence.ts    # Load/save specialization profiles to disk
```

#### Core Types

```typescript
export type ExpertiseLevel = 'novice' | 'competent' | 'proficient' | 'expert';

export interface SpecializationScore {
  /** Temporally-weighted success rate (recent outcomes weighted higher). */
  temporalSuccessRate: number;
  /** Consistency score: 1 - stddev of rolling success windows. */
  consistencyScore: number;
  /** Volume bonus: log-scaled sample count, capped at 1.0. */
  volumeBonus: number;
  /** Composite score: weighted combination of the above. */
  composite: number;
}

export interface SpecializationEntry {
  persona: string;
  systemNodeId: string;
  taskType: TaskType | '*'; // '*' = all task types
  score: SpecializationScore;
  expertiseLevel: ExpertiseLevel;
  sampleSize: number;
  /** ISO timestamp of most recent outcome in this bucket. */
  lastOutcome: string;
}

export interface SpecializationProfile {
  persona: string;
  /** Per-(system, taskType) specialization entries. */
  entries: SpecializationEntry[];
  /** Top areas of expertise (highest composite scores). */
  strengths: SpecializationEntry[];
  /** Areas of consistent failure. */
  weaknesses: SpecializationEntry[];
  /** Overall expertise level across all entries. */
  overallLevel: ExpertiseLevel;
  /** ISO timestamp when this profile was computed. */
  computedAt: string;
}

export interface WeightedRecommendation {
  persona: string;
  /** Base score from existing recommendPersona(). */
  baseScore: number;
  /** Specialization multiplier [0.5, 1.5]. */
  specializationMultiplier: number;
  /** Final weighted score: baseScore * specializationMultiplier. */
  weightedScore: number;
  /** Expertise level for the requested systems/task-type. */
  expertiseLevel: ExpertiseLevel;
  /** Number of requested systems with specialization data. */
  specializedSystems: number;
}
```

#### Temporal Decay (`temporal.ts`)

```typescript
export interface TemporalConfig {
  /** Half-life in days (default 30). After this many days, an outcome's weight is halved. */
  halfLifeDays: number;
  /** Reference timestamp for decay calculation (default: now). */
  referenceTime?: string;
}

/** Compute exponential decay weight for an outcome at a given age. */
export function decayWeight(ageDays: number, halfLifeDays: number): number;

/** Compute temporally-weighted success rate from timestamped outcomes. */
export function temporalSuccessRate(
  outcomes: Array<{ result: 'success' | 'failure'; timestamp: string }>,
  config: TemporalConfig
): number;
```

The decay formula: `weight = e^(-ln(2) / halfLifeDays * ageDays)`. An outcome at exactly `halfLifeDays` old has weight 0.5; at `2 * halfLifeDays` it has weight 0.25.

#### Specialization Scorer (`scorer.ts`)

```typescript
export interface SpecializationOptions {
  /** Filter to a specific persona. */
  persona?: string;
  /** Filter to a specific system. */
  systemNodeId?: string;
  /** Filter to a specific task type. */
  taskType?: TaskType;
  /** Temporal decay config (default: 30-day half-life). */
  temporal?: TemporalConfig;
  /** Minimum sample size to compute specialization (default: 3). */
  minSamples?: number;
}

/** Compute specialization entries for (persona, system, taskType) tuples. */
export function computeSpecialization(
  store: GraphStore,
  opts?: SpecializationOptions
): SpecializationEntry[];

/** Build a full specialization profile for a persona. */
export function buildSpecializationProfile(
  store: GraphStore,
  persona: string,
  opts?: Omit<SpecializationOptions, 'persona'>
): SpecializationProfile;

/** Weighted persona recommendation incorporating specialization scores. */
export function weightedRecommendPersona(
  store: GraphStore,
  opts: {
    systemNodeIds: string[];
    taskType?: TaskType;
    candidatePersonas?: string[];
    minSamples?: number;
    temporal?: TemporalConfig;
  }
): WeightedRecommendation[];
```

#### Expertise Level Classification

```typescript
function computeExpertiseLevel(sampleSize: number, successRate: number): ExpertiseLevel {
  if (sampleSize < 5) return 'novice';
  if (sampleSize < 15) return successRate >= 0.6 ? 'competent' : 'novice';
  if (sampleSize < 30) return successRate >= 0.7 ? 'proficient' : 'competent';
  return successRate >= 0.75 ? 'expert' : 'proficient';
}
```

The thresholds combine volume (enough samples to be statistically meaningful) with quality (high enough success rate to demonstrate mastery).

#### Specialization Score Computation

For a given `(persona, system, taskType)` tuple:

1. **temporalSuccessRate** — Weighted success rate using exponential decay.
2. **consistencyScore** — `1 - normalizedStdDev` of success/failure in rolling windows (window size = 5 outcomes). Rewards consistent performers over streaky ones.
3. **volumeBonus** — `min(1.0, log2(sampleSize + 1) / log2(EXPERT_THRESHOLD + 1))`. Logarithmic to prevent volume from dominating.
4. **composite** — `0.6 * temporalSuccessRate + 0.25 * consistencyScore + 0.15 * volumeBonus`.

#### Weighted Recommendation

`weightedRecommendPersona` works as follows:

1. Call existing `recommendPersona()` to get base scores.
2. For each candidate persona, compute specialization scores for the requested `(systemNodeIds, taskType)`.
3. Derive a `specializationMultiplier` from the mean composite score:
   - `multiplier = 0.5 + composite` (range [0.5, 1.5])
   - Personas with no specialization data get multiplier 1.0 (neutral).
4. `weightedScore = baseScore * specializationMultiplier`.
5. Sort by `weightedScore` descending.

### 3. Profile Persistence (`persistence.ts`)

```typescript
export interface ProfileStore {
  profiles: Record<string, SpecializationProfile>;
  computedAt: string;
  version: 1;
}

/** Load profiles from disk. Returns empty store if file doesn't exist. */
export function loadProfiles(projectRoot: string): ProfileStore;

/** Save profiles to disk at .harness/specialization-profiles.json. */
export function saveProfiles(projectRoot: string, store: ProfileStore): void;

/** Recompute and persist profiles for all personas with outcomes. */
export function refreshProfiles(
  projectRoot: string,
  graphStore: GraphStore,
  opts?: Omit<SpecializationOptions, 'persona'>
): ProfileStore;
```

### 4. Public API

`packages/intelligence/src/index.ts` gains:

```typescript
// Specialization — persistent agent expertise tracking
export {
  computeSpecialization,
  buildSpecializationProfile,
  weightedRecommendPersona,
} from './specialization/scorer.js';
export { decayWeight, temporalSuccessRate } from './specialization/temporal.js';
export { loadProfiles, saveProfiles, refreshProfiles } from './specialization/persistence.js';
export type {
  SpecializationScore,
  SpecializationEntry,
  SpecializationProfile,
  WeightedRecommendation,
  ExpertiseLevel,
  TaskType,
} from './specialization/types.js';
export type { TemporalConfig } from './specialization/temporal.js';
```

### 5. File Layout

```
CREATE  packages/intelligence/src/specialization/types.ts
CREATE  packages/intelligence/src/specialization/temporal.ts
CREATE  packages/intelligence/src/specialization/scorer.ts
CREATE  packages/intelligence/src/specialization/persistence.ts
CREATE  packages/intelligence/tests/specialization/temporal.test.ts
CREATE  packages/intelligence/tests/specialization/scorer.test.ts
CREATE  packages/intelligence/tests/specialization/persistence.test.ts
MODIFY  packages/intelligence/src/outcome/types.ts            (add TaskType, taskType)
MODIFY  packages/intelligence/src/outcome/connector.ts        (propagate taskType)
MODIFY  packages/intelligence/tests/outcome/connector.test.ts (cover taskType)
MODIFY  packages/intelligence/src/index.ts                    (re-exports)
```

## Success Criteria

1. **Task-type attribution** — Ingesting an `ExecutionOutcome` with `taskType: 'bugfix'` results in the graph node having `metadata.taskType === 'bugfix'`. Omitting the field leaves metadata unchanged.
2. **Temporal decay** — `decayWeight(30, 30)` returns `0.5` (half-life); `decayWeight(0, 30)` returns `1.0`; `decayWeight(60, 30)` returns `0.25`.
3. **Temporal success rate** — Recent successes weigh more than old ones; an all-success history with recent failures produces a rate below the flat Laplace rate.
4. **Specialization scoring** — `computeSpecialization` returns entries with `composite` in [0, 1], combining temporal success rate, consistency, and volume.
5. **Expertise levels** — Entries correctly classify as novice/competent/proficient/expert based on sample size and success rate thresholds.
6. **Profile building** — `buildSpecializationProfile` produces a profile with strengths (top 3 by composite) and weaknesses (bottom 3 with >50% failure rate).
7. **Weighted recommendation** — `weightedRecommendPersona` returns candidates where specialized personas score higher than unspecialized ones, all else being equal.
8. **Profile persistence** — `saveProfiles` writes JSON to `.harness/specialization-profiles.json`; `loadProfiles` reads it back identically; missing file returns empty store.
9. **Backward compatibility** — Existing effectiveness tests pass unmodified. Existing `recommendPersona` remains unchanged.
10. **Public API** — All new functions and types exported from `@harness-engineering/intelligence` and compile without TypeScript errors.
11. **`harness validate`** — Passes after the change.

## Implementation Order

1. **Phase 1: Foundation** — Add `TaskType` and `taskType` to `ExecutionOutcome`; update connector; extend connector tests.
2. **Phase 2: Temporal** — Create `specialization/temporal.ts` with decay functions and temporal success rate; full test coverage (TDD).
3. **Phase 3: Scorer** — Create `specialization/types.ts` and `specialization/scorer.ts` with specialization computation, expertise levels, and weighted recommendation; full test coverage (TDD).
4. **Phase 4: Persistence** — Create `specialization/persistence.ts` for profile load/save/refresh; test with temp directories.
5. **Phase 5: Integration** — Wire re-exports in `index.ts`; run full test suite and `harness validate`.
