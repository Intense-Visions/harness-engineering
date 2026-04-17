# Context Budget System

Explicit per-skill token budgets with progressive loading hierarchy for graceful degradation as skill catalog scales toward 100+.

## Overview

When skill count approaches 100, context windows become constrained. This feature adds a `context_budget` field to `skill.yaml` allowing skill authors to declare explicit token budgets, and implements a 5-level progressive loading hierarchy that degrades content depth based on available budget.

### Goals

1. Allow skill authors to declare explicit token budgets per skill via `context_budget` field
2. Implement 5-level progressive loading: rules -> spec -> source -> errors -> history
3. Trigger progressive loading when skill count approaches threshold (default: 80)
4. Integrate with existing `TokenBudget` infrastructure in `packages/core`
5. Backward compatible -- skills without `context_budget` get sensible defaults

## Decisions

| Decision                                                  | Rationale                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Per-skill budget via `context_budget` schema field        | Gives skill authors explicit control vs. tier-only approach         |
| Section-based progressive loading over uniform truncation | Preserves semantic coherence -- each level is a meaningful subset   |
| Threshold trigger at 80 skills (configurable)             | Buffer before hitting 100; avoids sudden degradation                |
| `ProgressiveLoader` in `packages/core/src/context/`       | Collocated with existing budget code; CLI integrates at load point  |
| Default budget: 4000 tokens, priority 3                   | Matches existing truncation budget; middle priority is safe default |

## Technical Design

### Schema Extension

New optional field in `skill.yaml`:

```yaml
context_budget:
  max_tokens: 2000
  priority: 3
```

- `max_tokens` (number, 100-50000): Maximum tokens this skill should consume when loaded
- `priority` (integer, 1-5): Loading priority. 1 = highest (last to degrade), 5 = lowest (first to degrade)

Both fields optional within the object. Defaults: `max_tokens: 4000`, `priority: 3`.

### 5-Level Loading Hierarchy

| Level | Name    | Sections Included                                               | Approx % |
| ----- | ------- | --------------------------------------------------------------- | -------- |
| 1     | rules   | Process steps, Gates, Iron Law                                  | ~20%     |
| 2     | spec    | + Success Criteria, Session State, Harness Integration          | ~40%     |
| 3     | source  | + Full SKILL.md body (examples, evidence requirements)          | ~70%     |
| 4     | errors  | + Escalation, Rationalizations to Reject, error handling        | ~90%     |
| 5     | history | + Related skills content, project state, dispatcher suggestions | 100%     |

Section mapping uses H2 heading classification. Sections not matching any level default to level 3 (source).

### New Types (`packages/types/src/skill.ts`)

```typescript
export interface SkillContextBudget {
  max_tokens: number;
  priority: number;
}

export type LoadingLevel = 1 | 2 | 3 | 4 | 5;
```

### Progressive Loader (`packages/core/src/context/progressive-loader.ts`)

```typescript
export interface LoaderConfig {
  totalBudget: number;
  skillCountThreshold: number; // default: 80
}

export interface SkillLoadPlan {
  skillName: string;
  level: LoadingLevel;
  allocatedTokens: number;
}

export function computeLoadPlan(
  skills: Array<{ name: string; budget?: SkillContextBudget }>,
  config: LoaderConfig
): SkillLoadPlan[];
```

Algorithm:

1. If `skills.length < config.skillCountThreshold`, return all skills at level 5
2. Otherwise, sort skills by priority (ascending = highest priority first)
3. Allocate tokens from budget pool starting with highest priority
4. When budget exhausted, downgrade remaining skills' levels
5. Each level reduction cuts allocated tokens by ~20%

### Section Parser (`packages/core/src/context/section-parser.ts`)

```typescript
export interface ParsedSection {
  heading: string;
  content: string;
  level: LoadingLevel;
}

export function parseSections(markdown: string): ParsedSection[];
export function extractLevel(content: string, level: LoadingLevel): string;
```

Parses SKILL.md by H2 headings, classifies each section into a loading level, and returns content up to the requested level.

### Index Entry Extension (`packages/cli/src/skill/index-builder.ts`)

Add to `SkillIndexEntry`:

```typescript
contextBudget?: { maxTokens: number; priority: number };
```

Populated from skill.yaml during index building so load plans can be computed without re-reading YAML files.

### CLI Integration (`packages/cli/src/mcp/tools/skill.ts`)

In `handleRunSkill`:

1. After loading SKILL.md content, check if progressive loading is active
2. If active, compute load plan for the requested skill
3. Apply `extractLevel()` to return appropriate content depth
4. Append truncation notice when content is reduced

## Success Criteria

1. `context_budget` field accepted in skill.yaml and validated by Zod schema
2. Skills without `context_budget` receive default budget (4000 tokens, priority 3)
3. `computeLoadPlan()` assigns levels 1-5 based on budget constraints
4. `extractLevel()` returns appropriate content subset for each level
5. When skill count < threshold, all skills load at level 5 (full content)
6. When skill count >= threshold, progressive degradation starts from lowest priority
7. All existing tests pass
8. Unit tests cover: schema validation, load plan computation, section extraction

## Implementation Order

1. **Types** -- Add `SkillContextBudget` and `LoadingLevel` to `packages/types/src/skill.ts`
2. **Schema** -- Add `context_budget` field to Zod schema in `packages/cli/src/skill/schema.ts`
3. **Section Parser** -- Implement section classification and extraction in `packages/core/src/context/section-parser.ts`
4. **Progressive Loader** -- Implement `computeLoadPlan()` in `packages/core/src/context/progressive-loader.ts`
5. **Index Extension** -- Add `contextBudget` to `SkillIndexEntry` in `packages/cli/src/skill/index-builder.ts`
6. **CLI Integration** -- Wire progressive loading into `handleRunSkill` in `packages/cli/src/mcp/tools/skill.ts`
7. **Tests** -- Unit tests for all new modules
