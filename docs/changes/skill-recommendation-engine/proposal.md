# Skill Recommendation Engine

**Keywords:** recommendation, health-scoring, decision-tree, skill-dispatch, coupling, complexity, violations, sequencing, codebase-health

## Overview

Maps codebase health characteristics to optimal skill sequences via a three-layer engine: hard rule matching, weighted health scoring, and dependency-aware sequencing. A standalone `RecommendationEngine` consumes health snapshots (from `assess_project`, `detect_anomalies`, graph adapters) and skill metadata (including new `addresses` fields in `skill.yaml`) to produce sequenced, urgency-tagged skill workflows. Surfaced via `harness recommend` CLI command and `recommend_skills` MCP tool. Passively enhances `search_skills` when a fresh health snapshot exists (git-aware staleness).

### Goals

1. **Health-aware skill recommendations** — map violation types, anomaly scores, and metric thresholds to the skills that address them
2. **Three-layer engine** — hard rules for critical signals, weighted scoring for ranking, topological sequencing for ordering
3. **Dual surface** — `harness recommend` CLI + `recommend_skills` MCP tool sharing the same core
4. **Passive search boost** — `search_skills` blends health signals when a cached snapshot is fresh (same git HEAD or < 1 hour)
5. **Skill-declared mappings** — new `addresses` field in `skill.yaml` lets skills declare what health signals they address
6. **Sequenced output** — recommendations ordered by `depends_on` + diagnostic→fix→validate heuristic, with `[CRITICAL]` tags for hard-rule triggers

### Out of Scope

- Learning from outcomes (that's item 2.7 / D4 — Intelligent Skill Dispatch / Self-Improving Agent Skills)
- Auto-execution of recommended skills (recommendations are advisory; CLI prompt routes to skill invocation but does not auto-run)
- Custom user-defined rules (v1 uses skill-declared `addresses` fields only)
- Multi-project recommendations (single project scope)

## Decisions

| #   | Decision                                                                          | Rationale                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hybrid trigger: on-demand `harness recommend` + passive boost in `search_skills`  | Full analysis is expensive; passive path uses cached data. On-demand is authoritative, passive is a bonus.                                                                                                          |
| D2  | Hybrid rule + score: hard rules for critical signals, weighted scores for ranking | Hard rules catch critical issues (like constraint `error` thresholds); soft scores handle nuanced ranking (like constraint `warn` thresholds). Two-tier approach matches how harness already thinks about severity. |
| D3  | Skill-declared `addresses` field in `skill.yaml` for health signal mappings       | Colocated with skill metadata (like `keywords`, `stack_signals`). Index builder already reads skill.yaml. Centralized fallback table covers skills not yet updated.                                                 |
| D4  | Sequenced workflow output with urgency markers                                    | Users need both "what skills" and "what order." Topological sort via `depends_on` + diagnostic→fix→validate heuristic. Critical items tagged `[CRITICAL]`.                                                          |
| D5  | CLI + MCP tool surfaces sharing `RecommendationEngine` core                       | Matches established pattern (snapshot/predict, impact-preview). Thin wrappers over shared core.                                                                                                                     |
| D6  | Git-aware cache staleness with time fallback                                      | `.harness/health-snapshot.json` invalidated when HEAD changes or age > 1 hour. One `git rev-parse HEAD` call — trivial cost, prevents stale passive recommendations.                                                |
| D7  | Three-layer architecture: Rule Matcher → Health Scorer → Sequencer                | Clean separation of concerns. Each layer independently testable. Avoids coupling text-matching with health analysis. Keeps door open for 2.7 without over-engineering.                                              |
| D8  | Centralized fallback rules for bundled skills without `addresses` fields          | Ensures recommendations work immediately for existing skills before all `skill.yaml` files are updated. Fallback table in `recommendation-rules.ts`. Skill-declared `addresses` takes precedence.                   |

## Technical Design

### 1. Skill Metadata Extension (`skill.yaml`)

New optional `addresses` field:

```yaml
# Example: harness-enforce-architecture skill.yaml
addresses:
  - signal: circular-deps
    hard: true # Hard rule — always recommend when detected
  - signal: layer-violations
    hard: true
  - signal: high-coupling
    metric: fanOut
    threshold: 20
    weight: 0.8 # Soft score contribution
  - signal: high-coupling
    metric: couplingRatio
    threshold: 0.7
    weight: 0.6
```

Schema additions to `SkillMetadataSchema`:

```typescript
interface SkillAddress {
  signal: string; // Health signal identifier
  hard?: boolean; // If true, always recommend when signal is detected
  metric?: string; // Specific metric name (e.g., "fanOut", "cyclomaticComplexity")
  threshold?: number; // Metric value that triggers this address
  weight?: number; // 0-1 soft score contribution (default 0.5, applied by scorer when omitted)
}
```

Standardized signal identifiers:

- `circular-deps` — circular dependency detected
- `layer-violations` — forbidden import / layer boundary breach
- `high-coupling` — coupling metrics exceeding thresholds
- `high-complexity` — complexity metrics exceeding thresholds
- `low-coverage` — test coverage below target
- `dead-code` — unused exports, dead files, orphaned deps
- `drift` — stale references, broken imports
- `security-findings` — security scanner findings
- `doc-gaps` — undocumented modules/functions
- `perf-regression` — performance budget violations
- `anomaly-outlier` — statistical Z-score outlier in graph
- `articulation-point` — single point of failure in dependency graph

### 2. Health Snapshot (`packages/cli/src/skill/health-snapshot.ts`)

```typescript
interface HealthSnapshot {
  capturedAt: string; // ISO timestamp
  gitHead: string; // commit SHA at capture time
  projectPath: string;

  checks: {
    deps: { passed: boolean; issueCount: number; circularDeps: number; layerViolations: number };
    entropy: { passed: boolean; deadExports: number; deadFiles: number; driftCount: number };
    security: { passed: boolean; findingCount: number; criticalCount: number };
    perf: { passed: boolean; violationCount: number };
    docs: { passed: boolean; undocumentedCount: number };
    lint: { passed: boolean; issueCount: number };
  };

  metrics: {
    avgFanOut: number;
    maxFanOut: number;
    avgCyclomaticComplexity: number;
    maxCyclomaticComplexity: number;
    avgCouplingRatio: number;
    testCoverage: number | null; // null if not available
    anomalyOutlierCount: number;
    articulationPointCount: number;
  };

  signals: string[]; // Active signal identifiers derived from checks + metrics
}
```

**Capture flow:**

1. Run `assess_project` checks in parallel for summary pass/fail and issue counts
2. Run `check_dependencies` directly (not via `assess_project` summary) to get granular `circularDeps` and `layerViolations` counts from the violations array
3. Run `detect_anomalies` for graph metrics; aggregate coupling/complexity averages from `GraphCouplingAdapter` and `GraphComplexityAdapter` output (new aggregation logic, not provided by existing tools)
4. Derive active signals from thresholds (e.g., `circularDeps > 0` → signal `circular-deps`)
5. Write to `.harness/health-snapshot.json`

**Staleness check:**

```typescript
function isSnapshotFresh(snapshot: HealthSnapshot, projectPath: string): boolean {
  try {
    const currentHead = execSync('git rev-parse HEAD', { cwd: projectPath }).toString().trim();
    if (snapshot.gitHead === currentHead) return true;
  } catch {
    // Non-git directory — fall through to time-based staleness
  }
  const age = Date.now() - new Date(snapshot.capturedAt).getTime();
  return age < 3_600_000; // 1 hour fallback
}
```

### 3. RecommendationEngine (`packages/cli/src/skill/recommendation-engine.ts`)

```typescript
interface Recommendation {
  skillName: string;
  score: number; // 0-1 composite score
  urgency: 'critical' | 'recommended' | 'nice-to-have';
  reasons: string[]; // Human-readable explanations
  sequence: number; // Position in recommended workflow order
  triggeredBy: string[]; // Signal identifiers that triggered this
}

interface RecommendationResult {
  recommendations: Recommendation[];
  snapshot: HealthSnapshot;
  sequenceReasoning: string; // Explanation of ordering logic
}
```

**Layer 1 — Rule Matcher:**

```typescript
function matchHardRules(snapshot: HealthSnapshot, skillIndex: SkillAddressIndex): Recommendation[] {
  // For each active signal in snapshot.signals:
  //   Find skills with addresses where hard: true AND signal matches
  //   Create Recommendation with urgency: 'critical', score: 1.0
  // Return all critical recommendations
}
```

**Layer 2 — Health Scorer:**

```typescript
function scoreByHealth(snapshot: HealthSnapshot, skillIndex: SkillAddressIndex): Recommendation[] {
  // For each skill with addresses entries (non-hard):
  //   For each address that matches an active signal:
  //     Compute distance = (actual metric value - threshold) / threshold
  //     Contribution = address.weight * clamp(distance, 0, 1)
  //   Aggregate contributions across all matching addresses
  //   Normalize to 0-1 score
  //   Classify urgency: score >= 0.7 → 'recommended', else → 'nice-to-have'
  // Return scored recommendations
}
```

**Layer 3 — Sequencer:**

```typescript
function sequenceRecommendations(
  recommendations: Recommendation[],
  skillDeps: Map<string, string[]>
): Recommendation[] {
  // NOTE: depends_on is not currently in SkillIndexEntry — index builder must be
  // extended to propagate depends_on into the index alongside addresses.
  // 1. Build dependency graph from depends_on fields
  // 2. Topological sort (Kahn's algorithm)
  // 3. Within same dependency level, apply heuristic ordering:
  //    - diagnostic skills first (keywords: "health", "detect", "analyze", "audit")
  //    - fix skills second (keywords: "enforce", "cleanup", "fix", "refactor")
  //    - validation skills last (keywords: "verify", "test", "tdd", "review")
  // 4. Assign sequence numbers
  // Return ordered recommendations
}
```

**Merge with fallback rules:**

```typescript
// recommendation-rules.ts — fallback for skills without addresses fields
const FALLBACK_RULES: Record<string, SkillAddress[]> = {
  'harness-enforce-architecture': [
    { signal: 'circular-deps', hard: true },
    { signal: 'layer-violations', hard: true },
    { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
  ],
  'harness-dependency-health': [
    { signal: 'high-coupling', metric: 'fanOut', threshold: 15, weight: 0.7 },
    { signal: 'anomaly-outlier', weight: 0.6 },
  ],
  'harness-tdd': [{ signal: 'low-coverage', weight: 0.9 }],
  'harness-codebase-cleanup': [
    { signal: 'dead-code', weight: 0.8 },
    { signal: 'drift', weight: 0.6 },
  ],
  'harness-security-scan': [{ signal: 'security-findings', hard: true }],
  // ... additional entries for remaining bundled skills
};
```

### 4. Passive Search Boost (`packages/cli/src/skill/dispatcher.ts`)

Extend existing `scoreSkill()`:

```typescript
// NOTE: existing signature is scoreSkill(entry, queryTerms, profile, recentFiles, skillName).
// healthSnapshot is appended as 6th parameter to avoid breaking the existing call site.
function scoreSkill(skill, queryTerms, profile, recentFiles, skillName, healthSnapshot?): number {
  // Existing scoring (unchanged):
  let score = 0.35 * keyword + 0.2 * name + 0.1 * desc + 0.2 * stack + 0.15 * recency;

  // Health boost (when snapshot is fresh):
  if (healthSnapshot) {
    const healthScore = computeHealthScore(skill, healthSnapshot);
    // Blend: 70% original, 30% health
    score = 0.7 * score + 0.3 * healthScore;
  }

  return score;
}
```

### 5. CLI Surface (`packages/cli/src/commands/recommend.ts`)

```
$ harness recommend

Analyzing codebase health...

Recommended workflow (3 skills):

  [CRITICAL] 1. harness-enforce-architecture
     → 3 circular dependencies detected in services/

  2. harness-dependency-health (0.78)
     → avg fanOut 24 exceeds threshold 20; 2 anomaly outliers

  3. harness-tdd (0.65)
     → test coverage 48% below 60% target

Sequence reasoning: Diagnose and fix structural issues (1→2) before
backfilling tests on stabilized code (3).

Invoke first skill? (y/pick/n)
```

Options:

- `--json` — machine-readable output for scripting
- `--no-cache` — force fresh health snapshot even if cache is fresh
- `--top N` — limit to N recommendations (default 5)

### 6. MCP Tool Surface (`packages/cli/src/mcp/tools/recommend-skills.ts`)

```typescript
export const recommendSkillsDefinition = {
  name: 'recommend_skills',
  description: 'Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.',
  inputSchema: {
    path: string,              // Project root
    noCache?: boolean,         // Force fresh snapshot
    top?: number,              // Max recommendations (default 5)
  }
};
```

Returns `RecommendationResult` as structured JSON.

### 7. File Layout

```
packages/cli/src/skill/
  recommendation-engine.ts      # RecommendationEngine (layers 1-3)
  recommendation-rules.ts       # Fallback rules for bundled skills
  health-snapshot.ts            # Snapshot capture, caching, staleness
  recommendation-types.ts       # Shared types

packages/cli/src/commands/
  recommend.ts                  # CLI command

packages/cli/src/mcp/tools/
  recommend-skills.ts           # MCP tool wrapper
```

Modified files:

```
packages/cli/src/skill/schema.ts       # SkillAddress type, addresses field
packages/cli/src/skill/dispatcher.ts   # Health boost in scoreSkill()
packages/cli/src/skill/index-builder.ts # Index addresses + depends_on fields
agents/skills/**/skill.yaml            # ~15-20 skills get addresses fields
```

## Success Criteria

1. `harness recommend` CLI command produces a sequenced skill workflow from codebase health analysis
2. `recommend_skills` MCP tool returns structured `RecommendationResult` JSON consumable by agents
3. Hard rules fire for all critical signals — circular deps, layer violations, and security findings always produce `[CRITICAL]` recommendations
4. Soft scoring ranks skills by metric distance from thresholds, weighted by skill-declared `addresses` entries
5. Sequencer orders recommendations via topological sort on `depends_on` + diagnostic→fix→validate heuristic
6. Health snapshot cached to `.harness/health-snapshot.json` with git SHA; staleness checked by HEAD comparison + 1-hour fallback
7. `search_skills` blends health scores (30% weight) when a fresh snapshot exists, with no added latency when no snapshot is available
8. `skill.yaml` schema extended with optional `addresses` field; at least 15 bundled skills updated with mappings
9. Fallback rules in `recommendation-rules.ts` cover all bundled skills that lack `addresses` fields
10. `--json`, `--no-cache`, and `--top N` CLI flags work as specified
11. `harness validate` passes after all changes

## Implementation Order

1. **Types and schema** — `recommendation-types.ts`, `SkillAddress` schema extension in `skill/schema.ts`, health snapshot types
2. **Health snapshot capture** — `health-snapshot.ts` with `assess_project` + `detect_anomalies` integration, signal derivation, git-aware caching
3. **Recommendation engine core** — `recommendation-engine.ts` with three layers (rule matcher, health scorer, sequencer), fallback rules table
4. **Skill metadata updates** — Add `addresses` fields to ~15-20 bundled skill.yaml files, update index builder to index both `addresses` and `depends_on` into `SkillIndexEntry`
5. **CLI + MCP surfaces** — `harness recommend` command, `recommend_skills` MCP tool definition and handler
6. **Passive search boost** — Extend `dispatcher.scoreSkill()` with optional health snapshot blending
7. **Tests** — Unit tests for each layer, integration test for full pipeline, snapshot staleness tests
