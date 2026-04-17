# Constraint Emergence from Patterns

**Keywords:** constraint, emergence, pattern-clustering, violation-history, architecture, MCP, collector

## Overview

Constraint Emergence detects recurring violation patterns and suggests new constraint rules. When N similar violations appear within M weeks, the system clusters them by normalized detail pattern and directory scope, then proposes a `ConstraintRule` with supporting evidence. This lets teams learn architectural norms from actual behavior rather than requiring hand-coded rules upfront.

### Goals

1. When collectors run, the system shall append a timestamped violation snapshot to a persistent history file (`.harness/arch/violation-history.json`)
2. When `detect_constraint_emergence` is called, the system shall cluster violations from history by normalized detail pattern and directory scope
3. When a cluster contains at least `minOccurrences` violations within a `windowWeeks` time window, the system shall suggest a new `ConstraintRule` with confidence tier, supporting evidence, and rationale
4. The MCP tool shall accept optional filters for category, minimum cluster size (default: 3), and time window (default: 4 weeks)

### Non-Goals

- Auto-applying suggested constraints (human decision required)
- ML/NLP-based clustering (structural pattern extraction is sufficient for L1)
- Full violation time-series visualization (Tier 2.3 scope)
- Integration with CI pipelines or verify/review workflows (trivial add-on later)
- Per-rule or per-category window configuration

### Assumptions

- Collectors run regularly enough to populate the history file with meaningful data. Emergence detection is only as good as the history it has.
- The history file is append-only during normal operation. Pruning old entries is handled by a retention policy.
- Pattern normalization uses structural extraction (not semantic similarity).

## Decisions

| Decision              | Choice                                                                                                                               | Rationale                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History storage       | Dedicated `.harness/arch/violation-history.json` file                                                                                | Timeline system tracks aggregate metrics, not individual violations. Graph only has latest state. A dedicated file provides exactly the right granularity without overloading existing abstractions |
| Clustering strategy   | Normalized detail pattern + directory scope                                                                                          | Catches both "many files doing the same thing" (pattern) and "one area violating repeatedly" (scope). Combines two complementary signals                                                            |
| Pattern normalization | Strip file-specific segments from violation details, extract structural pattern (e.g., "X -> Y: file imports file" becomes "X -> Y") | Makes patterns comparable across files while preserving the architectural meaning                                                                                                                   |
| Suggested output      | Enriched objects with ConstraintRule + evidence + confidence                                                                         | Humans need context to decide whether to adopt. Raw rules without evidence are not actionable                                                                                                       |
| Confidence tiers      | low / medium / high based on cluster density and recurrence                                                                          | Helps prioritize suggestions. A pattern seen 10 times in 2 weeks is higher confidence than 3 times in 4 weeks                                                                                       |
| History retention     | 90-day rolling window, configurable                                                                                                  | Prevents unbounded growth. 90 days captures seasonal patterns without excessive storage                                                                                                             |
| Surface area          | MCP tool only (`detect_constraint_emergence`)                                                                                        | Consistent with constraint-deprecation-detection (Tier 2.7). Agents/skills call it programmatically                                                                                                 |

## Technical Design

### New Types

Add to `packages/core/src/architecture/types.ts`:

```typescript
export const ViolationSnapshotSchema = z.object({
  timestamp: z.string().datetime(),
  violations: z.array(ViolationSchema),
});

export type ViolationSnapshot = z.infer<typeof ViolationSnapshotSchema>;

export const ViolationHistorySchema = z.object({
  version: z.literal(1),
  snapshots: z.array(ViolationSnapshotSchema),
});

export type ViolationHistory = z.infer<typeof ViolationHistorySchema>;

export const ConfidenceTierEmergenceSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceTierEmergence = z.infer<typeof ConfidenceTierEmergenceSchema>;

export const EmergentConstraintSuggestionSchema = z.object({
  suggestedRule: ConstraintRuleSchema,
  confidence: ConfidenceTierEmergenceSchema,
  occurrences: z.number(),
  uniqueFiles: z.number(),
  pattern: z.string(),
  sampleViolations: z.array(ViolationSchema),
  rationale: z.string(),
});

export type EmergentConstraintSuggestion = z.infer<typeof EmergentConstraintSuggestionSchema>;

export const EmergenceResultSchema = z.object({
  suggestions: z.array(EmergentConstraintSuggestionSchema),
  totalViolationsAnalyzed: z.number(),
  windowWeeks: z.number(),
  minOccurrences: z.number(),
});

export type EmergenceResult = z.infer<typeof EmergenceResultSchema>;
```

### Violation History Manager

New file: `packages/core/src/architecture/violation-history.ts`

```typescript
export class ViolationHistoryManager {
  constructor(private historyPath: string) {}

  /** Load history from disk, returning empty history if file doesn't exist */
  load(): ViolationHistory;

  /** Append a snapshot of current violations */
  append(violations: Violation[]): void;

  /** Prune snapshots older than retentionDays */
  prune(retentionDays: number): void;
}
```

Responsibilities:

- Read/write `.harness/arch/violation-history.json`
- Append timestamped violation snapshots
- Prune entries beyond retention window

### Pattern Normalization

New file: `packages/core/src/architecture/normalize-pattern.ts`

Normalization rules by category:

- **layer-violations:** `"X -> Y: file imports file"` -> `"X -> Y"` (extract layer pair)
- **circular-deps:** `"A -> B -> C -> A"` -> `"A -> B -> C -> A"` (cycle structure preserved, file paths stripped)
- **complexity:** `"cyclomatic complexity N in functionName"` -> `"cyclomatic-complexity-exceeded"` (threshold violation type)
- **coupling:** `"fan-out N for module"` -> `"fan-out-exceeded"` (threshold type)
- **forbidden-imports:** `"X imports Y"` -> `"X-layer imports Y-layer"` (extract layer pair)
- **module-size:** `"module has N files"` -> `"module-size-exceeded"` (threshold type)
- **dependency-depth:** `"depth N for module"` -> `"depth-exceeded"` (threshold type)

```typescript
export function normalizeViolationPattern(violation: Violation): string;
```

### Directory Scope Extraction

```typescript
export function extractDirectoryScope(filePath: string): string;
```

Returns the parent directory of the violation file (e.g., `"src/services/"` from `"src/services/auth.ts"`). Used alongside pattern normalization for two-dimensional clustering.

### Clustering Engine

New file: `packages/core/src/architecture/cluster-violations.ts`

```typescript
export interface ViolationCluster {
  category: ArchMetricCategory;
  pattern: string;
  scope: string;
  violations: Array<{ violation: Violation; timestamp: string }>;
  uniqueFiles: Set<string>;
}

export function clusterViolations(
  snapshots: ViolationSnapshot[],
  windowWeeks: number
): ViolationCluster[];
```

Clustering key: `(category, normalizedPattern, directoryScope)`. Groups violations that share the same structural pattern in the same area of the codebase.

### Emergence Detector

New file: `packages/core/src/architecture/detect-emergence.ts`

```typescript
export function detectEmergentConstraints(
  history: ViolationHistory,
  options: {
    windowWeeks?: number; // default: 4
    minOccurrences?: number; // default: 3
    category?: ArchMetricCategory;
  }
): EmergenceResult;
```

For each cluster meeting the threshold:

1. Generate a `ConstraintRule` with scope from the cluster's directory scope and description from the pattern
2. Assign confidence tier:
   - **high**: >= 2x minOccurrences AND >= 3 unique files
   - **medium**: >= minOccurrences AND >= 2 unique files
   - **low**: >= minOccurrences (minimum threshold met)
3. Collect up to 5 sample violations as evidence
4. Generate rationale string explaining the pattern

### MCP Tool

**Tool name:** `detect_constraint_emergence`

**Input:**

```typescript
{
  path: string;                    // project root
  windowWeeks?: number;            // default: 4
  minOccurrences?: number;         // default: 3
  category?: ArchMetricCategory;   // optional filter
}
```

**Output:**

```typescript
{
  suggestions: EmergentConstraintSuggestion[];
  totalViolationsAnalyzed: number;
  windowWeeks: number;
  minOccurrences: number;
}
```

New file: `packages/cli/src/mcp/tools/constraint-emergence.ts`

### Integration Point: History Append

The `syncConstraintNodes()` function (or a new wrapper) calls `ViolationHistoryManager.append()` after each collector run. This keeps history accumulation tied to the existing collect-and-sync flow without requiring a separate invocation.

### File Layout

| File                                                   | Change                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/core/src/architecture/types.ts`              | Add `ViolationSnapshot`, `ViolationHistory`, `EmergentConstraintSuggestion`, `EmergenceResult` schemas |
| `packages/core/src/architecture/violation-history.ts`  | New -- `ViolationHistoryManager` class                                                                 |
| `packages/core/src/architecture/normalize-pattern.ts`  | New -- violation detail normalization                                                                  |
| `packages/core/src/architecture/cluster-violations.ts` | New -- clustering engine                                                                               |
| `packages/core/src/architecture/detect-emergence.ts`   | New -- emergence detection logic                                                                       |
| `packages/core/src/architecture/index.ts`              | Export new modules                                                                                     |
| `packages/cli/src/mcp/tools/constraint-emergence.ts`   | New -- MCP tool definition and handler                                                                 |
| `packages/cli/src/mcp/server.ts`                       | Register new tool                                                                                      |

## Success Criteria

1. When collectors produce violations and history is appended, recurring patterns across M weeks are detected and clustered
2. When a cluster contains >= N violations (default 3) within the window (default 4 weeks), a `ConstraintRule` suggestion is produced with confidence tier, evidence, and rationale
3. The MCP tool `detect_constraint_emergence` returns structured results filterable by category, minimum occurrences, and time window
4. Pattern normalization correctly strips file-specific details while preserving architectural meaning (verified per-category)
5. History file respects retention policy (default 90 days) and prunes old snapshots
6. Suggested constraint rules have stable IDs (via `constraintRuleId`) and valid structure matching `ConstraintRuleSchema`

## Implementation Order

1. **Types** -- Add violation history and emergence result schemas to `types.ts`
2. **Pattern Normalization** -- `normalizeViolationPattern()` with per-category rules
3. **Violation History Manager** -- Load, append, prune operations on history file
4. **Clustering Engine** -- Group violations by `(category, pattern, scope)`
5. **Emergence Detector** -- Threshold checking, confidence assignment, suggestion generation
6. **MCP Tool** -- Register `detect_constraint_emergence` tool with input validation
7. **Tests** -- Unit tests for normalization, clustering, emergence detection, and MCP tool
