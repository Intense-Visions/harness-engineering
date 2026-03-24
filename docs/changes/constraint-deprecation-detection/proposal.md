# Constraint Deprecation Detection

**Keywords:** constraint, deprecation, staleness, architecture, graph, collector, time-window, MCP

## Overview

Constraint Deprecation Detection identifies architectural constraint rules that haven't been violated within a configurable time window. Constraints that go un-violated for extended periods may be stale — either the codebase has evolved past the need for the constraint, or the constraint is too broad to ever trigger. Surfacing these candidates helps teams keep their constraint sets lean and intentional.

### Goals

1. Register constraint rules as first-class `constraint` nodes in the knowledge graph
2. Track `lastViolatedAt` timestamps on constraint nodes, updated when collectors run
3. Provide an MCP tool (`detect_stale_constraints`) that returns constraints with no violations within a configurable window
4. Default window of 30 days, configurable globally and overridable per-call

### Non-Goals

- Automated constraint removal or relaxation (human decision)
- Per-category or per-rule window configuration (future enhancement)
- `governs` edges from constraints to modules (future enhancement — Approach 2)
- Integration into verify/review workflows (can be added trivially later)
- Full time-series violation history (Tier 2.3 scope)

### Assumptions

- Collectors run regularly enough (at least once within the configured window) to keep `lastViolatedAt` timestamps meaningful. If collectors haven't run recently, results may over-report staleness.
- The knowledge graph is populated and available when the MCP tool is called. If the graph hasn't been ingested, the tool returns empty results.

## Decisions

| Decision                   | Choice                                                                           | Rationale                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constraint granularity     | First-class constraint rules (not category-level)                                | Enables fine-grained detection; lays groundwork for constraint sharing (Tier 2.2) and emergence (Tier 2.8); graph already has `constraint` node type |
| Violation history tracking | `lastViolatedAt` timestamp on constraint nodes                                   | Simplest approach that works; trivial to query; rule-level; time-series can layer on later for Tier 2.3                                              |
| Surface area               | MCP tool only (`detect_stale_constraints`)                                       | Consistent with other Tier 1 items; agents/skills call it programmatically; integration into verify/review is a future one-liner                     |
| Rule population            | Auto-extracted from collectors via `getRules()`                                  | Zero manual effort; stays in sync with enforcement; no config duplication                                                                            |
| Staleness window           | Global 30-day default, per-call override                                         | YAGNI — per-category/per-rule overrides come when there's demand                                                                                     |
| Orphan cleanup             | `syncConstraintNodes` prunes constraint nodes not in current `getRules()` output | Prevents confusing false positives from removed collectors or changed rule IDs                                                                       |

## Technical Design

### New Types

Add to `packages/core/src/architecture/types.ts`:

```typescript
export const ConstraintRuleSchema = z.object({
  id: z.string(), // stable hash: sha256(category + ':' + scope + ':' + description)
  category: ArchMetricCategorySchema,
  description: z.string(), // e.g., "Layer 'services' must not import from 'ui'"
  scope: z.string(), // e.g., 'src/services/', 'project'
  targets: z.array(z.string()).optional(), // forward-compat for governs edges
});

export type ConstraintRule = z.infer<typeof ConstraintRuleSchema>;
```

### Collector Interface Extension

Extend the existing `Collector` interface in `packages/core/src/architecture/types.ts`:

```typescript
export interface Collector {
  category: ArchMetricCategory;
  collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]>;
  getRules(config: ArchConfig, rootDir: string): ConstraintRule[]; // new
}
```

Each collector implements `getRules()` to return the constraint rules it enforces:

- `CircularDepsCollector` — one rule per module scope
- `LayerViolationCollector` — one rule per layer boundary pair
- `ComplexityCollector` — one rule per complexity threshold

### Graph Constraint Nodes

Constraint rules are stored as graph nodes:

```typescript
{
  id: rule.id,
  type: 'constraint',
  name: rule.description,
  category: rule.category,
  scope: rule.scope,
  createdAt: string,        // ISO 8601 — set on first insert
  lastViolatedAt: string,   // ISO 8601 — updated when a violation matches this rule
}
```

### Timestamp Update Flow

1. Collector runs `collect()` → produces `MetricResult[]` with violations
2. Collector runs `getRules()` → produces `ConstraintRule[]`
3. `syncConstraintNodes(store, rules, violations)`:
   - Upserts each rule as a `constraint` node (sets `createdAt` on first insert)
   - For each violation, matches to its parent rule by `category` + scope containment
   - Sets `lastViolatedAt = new Date().toISOString()` on matched rules
   - **Prunes** constraint nodes whose IDs are not present in the current `rules` set (orphan cleanup)

### Rule-to-Violation Matching

A violation matches a rule when:

- `violation.category === rule.category`
- The violation's file path falls within the rule's scope

Each collector's `getRules()` produces rules at the right granularity for matching.

### Staleness Query

`detectStaleConstraints(store, windowDays)`:

- Finds all `constraint` nodes in the graph
- For each node, computes the comparison timestamp as `lastViolatedAt ?? createdAt`
- Filters to nodes where the comparison timestamp is older than `now - windowDays`
- Returns structured results sorted by days since last violation (most stale first)

### MCP Tool

**Tool name:** `detect_stale_constraints`

**Input:**

```typescript
{
  windowDays?: number,              // default: 30
  category?: ArchMetricCategory,    // optional filter
}
```

**Output:**

```typescript
{
  staleConstraints: Array<{
    id: string,
    category: ArchMetricCategory,
    description: string,
    scope: string,
    lastViolatedAt: string | null,  // null = never violated
    daysSinceLastViolation: number,
  }>,
  totalConstraints: number,
  windowDays: number,
}
```

### Configuration

Optional entry in `harness.config.json`:

```json
{
  "architecture": {
    "constraintDeprecation": {
      "windowDays": 30
    }
  }
}
```

### File Layout

| File                                                 | Change                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/core/src/architecture/types.ts`            | Add `ConstraintRuleSchema`, `ConstraintRule`; extend `Collector` interface with `getRules()` |
| `packages/core/src/architecture/collectors/*.ts`     | Implement `getRules()` on each existing collector                                            |
| `packages/core/src/architecture/sync-constraints.ts` | New — `syncConstraintNodes()` function                                                       |
| `packages/core/src/architecture/detect-stale.ts`     | New — staleness query logic                                                                  |
| `packages/mcp/src/tools/detect-stale-constraints.ts` | New — MCP tool registration                                                                  |

## Success Criteria

1. When collectors run, each registered constraint rule exists as a `constraint` node in the graph
2. When a violation matches a constraint rule, that rule's `lastViolatedAt` is updated to the current timestamp
3. `detect_stale_constraints` returns all constraints where the comparison timestamp (`lastViolatedAt ?? createdAt`) is older than `now - windowDays`
4. Default window is 30 days; overridable via `windowDays` parameter on the MCP tool
5. Tool returns structured output: rule ID, category, description, scope, last violated date, days since last violation
6. Constraint nodes from removed collectors are pruned during `syncConstraintNodes`

## Implementation Order

1. **Types & Interface** — Add `ConstraintRule` schema and `getRules()` to `Collector` interface
2. **Collector Implementations** — Implement `getRules()` on each existing collector (CircularDeps, LayerViolation, Complexity)
3. **Graph Sync** — `syncConstraintNodes()` function that upserts constraint nodes, updates timestamps, and prunes orphans
4. **Staleness Query** — `detectStaleConstraints()` function that queries constraint nodes against the window
5. **MCP Tool** — Register `detect_stale_constraints` tool wiring the query to MCP input/output
6. **Tests** — Unit tests for `getRules()`, `syncConstraintNodes()`, staleness query, and MCP tool
