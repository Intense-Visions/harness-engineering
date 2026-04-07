# Knowledge Skills Category & Schema Enrichment

**Keywords:** knowledge-skills, progressive-disclosure, paths-activation, skill-import, agentskills-io, PatternsDev, schema-enrichment

## Overview

This feature adds a `knowledge` skill type to harness alongside the existing `rigid` and `flexible` types, enabling the skill system to encode domain reference material (design patterns, best practices, architectural guidance) as first-class skills. Knowledge skills are surfaced to agents via a hybrid injection model: high-confidence matches are auto-injected as context, lower-confidence matches appear as explicit recommendations.

The initial catalog is seeded by importing 58 frontend pattern skills from [PatternsDev/skills](https://github.com/PatternsDev/skills) across three technology verticals (React, JavaScript, Vue), and existing behavioral skills are analyzed for `paths` and `related_skills` backfill.

### Goals

1. Agents gain contextual domain knowledge alongside behavioral capabilities — "how to refactor" + "which patterns to consider"
2. File-glob activation (`paths`) enables type-aware dispatch — editing `*.tsx` surfaces React patterns
3. Progressive disclosure reduces token cost — Instructions section (~2K tokens) auto-injected, Details loaded on-demand
4. Clean architectural separation between behavioral skills (do things) and knowledge skills (know things)
5. All three technology verticals (React, JS, Vue) fully imported and operational as a single deliverable

### Non-Goals

- agentskills.io export/import tooling (deferred; see ADR-001 alternatives)
- Knowledge skills for non-frontend domains (testing, security, infrastructure — future work)
- Reusable import CLI command (one-time script; `metadata.upstream` enables future tooling)

## Decisions

| #   | Decision               | Choice                                                             | Rationale                                                                                                |
| --- | ---------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | Surfacing model        | Hybrid injection — auto-inject at score ≥0.7, recommend at 0.4–0.7 | Balances seamless UX with token cost control. Leverages existing scoring infrastructure.                 |
| 2   | Progressive disclosure | Single SKILL.md with `## Instructions` / `## Details` markers      | Simplest approach, matches PatternsDev's single-file convention, heading-based split is trivial.         |
| 3   | Naming convention      | Technology prefix (`js-`, `react-`, `vue-`)                        | Prevents name collisions, groups naturally in directories, informative at a glance.                      |
| 4   | Import strategy        | One-time script with `metadata.upstream` tracking                  | Ships fast, we own the content. Provenance field enables future sync tooling.                            |
| 5   | Backfill strategy      | Per-skill analysis during execution phase                          | Avoids speculative glob assignments. Grep-based analysis during implementation produces accurate values. |
| 6   | Implementation order   | Vertical slice — React (19) → JS (27) → Vue (11)                   | End-to-end validation at smallest scale first. All slices completed within one roadmap item.             |

## Technical Design

### Schema Changes (`packages/cli/src/skill/schema.ts`)

Extend `SkillMetadataSchema`:

```typescript
type: z.enum(['rigid', 'flexible', 'knowledge']); // Add 'knowledge'

paths: z.array(z.string()).default([]); // NEW — file glob patterns
related_skills: z.array(z.string()).default([]); // NEW — conceptual cross-refs
metadata: z.object({
  // NEW — extensible metadata
  author: z.string().optional(),
  version: z.string().optional(),
  upstream: z.string().optional(), // provenance tracking
})
  .passthrough()
  .default({});
```

Knowledge skill constraints (enforced by schema refinement):

- `type: 'knowledge'` → `phases` must be empty or omitted
- `type: 'knowledge'` → `tools` must be empty or omitted (no tool grants)
- `type: 'knowledge'` → `state.persistent` must be false
- `type: 'knowledge'` → `cognitive_mode` defaults to `advisory-guide`
- `type: 'knowledge'` → `tier` defaults to 3

### Index Changes (`packages/cli/src/skill/index-builder.ts`)

Extend `SkillIndexEntry`:

```typescript
type: 'rigid' | 'flexible' | 'knowledge'
paths: string[]
relatedSkills: string[]
```

Knowledge skills are Tier 3, so they naturally land in the searchable index (Tier 1/2 are always-loaded and excluded from the index).

### Scoring Changes (`packages/cli/src/skill/dispatcher.ts`)

Add `paths` as a new scoring dimension in `scoreSkill()`:

```
Current weights (sum to 1.0):
  keyword:     0.35
  name:        0.20
  description: 0.10
  stack:       0.20
  recency:     0.15

New weights (sum to 1.0):
  keyword:     0.30
  name:        0.15
  description: 0.10
  stack:       0.15
  recency:     0.10
  paths:       0.20    // NEW — glob match against recent/changed files
```

The `paths` score is computed by matching skill `paths` globs against the current working files. A skill with `paths: ["**/*.tsx"]` scores 1.0 on this dimension when the user is editing `.tsx` files, 0.0 otherwise.

### Progressive Disclosure (`packages/cli/src/mcp/tools/skill.ts`)

In `run_skill` handler, after loading SKILL.md:

```typescript
if (metadata.type === 'knowledge') {
  const boundary = content.indexOf('\n## Details');
  if (boundary !== -1) {
    const instructions = content.slice(0, boundary);
    const details = content.slice(boundary);
    // Auto-inject mode: return instructions only
    // On-demand mode: return full content
    return autoInject ? instructions : content;
  }
}
```

### Hybrid Injection (`packages/cli/src/skill/dispatcher.ts`)

In `suggest()`, after scoring:

```
For knowledge skills with score ≥ 0.7:
  → Add to autoInjectKnowledge list (Instructions section loaded into context)

For knowledge skills with score 0.4–0.7:
  → Add to recommendations with type: 'knowledge' marker

For knowledge skills with score < 0.4:
  → Discard
```

The `run_skill` handler checks whether a knowledge skill was auto-injected or explicitly requested and returns the appropriate disclosure tier.

### Recommendation Pipeline (`packages/cli/src/skill/recommendation-engine.ts`)

- Knowledge skills skip the 3-layer pipeline (no hard rules, no health scoring, no topological sort)
- Knowledge skills are scored purely by `scoreSkill()` (keyword + paths + stack)
- Results returned in a separate `knowledgeRecommendations` array in `RecommendationResult`
- `dispatch_skills` and `recommend_skills` MCP tools include both arrays in output

### Knowledge Skill Format

Each imported skill follows this structure:

```yaml
# skill.yaml
name: react-hooks-pattern
version: '1.1.0'
description: Reuse stateful logic across components via custom hooks
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
tools: []
paths:
  - '**/*.tsx'
  - '**/*.jsx'
related_skills:
  - react-compound-pattern
  - react-render-props-pattern
stack_signals:
  - react
  - typescript
keywords:
  - hooks
  - custom-hooks
  - stateful-logic
  - composition
metadata:
  author: patterns.dev
  upstream: 'PatternsDev/skills/react/hooks-pattern'
state:
  persistent: false
  files: []
depends_on: []
```

```markdown
# React Hooks Pattern

> Reuse stateful logic across components via custom hooks

## When to Use

- [bulleted criteria]

## Instructions

[Agent-facing directives, <5K tokens]

## Details

[Educational depth, loaded on-demand]

## Source

[Link to patterns.dev article]
```

### File Layout

```
agents/skills/claude-code/
  react-hooks-pattern/
    skill.yaml
    SKILL.md
  react-server-components/
    skill.yaml
    SKILL.md
  js-singleton-pattern/
    skill.yaml
    SKILL.md
  vue-composables/
    skill.yaml
    SKILL.md
  ... (58 total new directories)
```

Replicated to `gemini-cli/` and `cursor/` platforms per existing convention.

## Success Criteria

1. `type: 'knowledge'` is a valid skill type accepted by schema validation
2. `paths`, `related_skills`, and `metadata` fields are accepted by schema validation with correct defaults
3. Knowledge skills with `type: 'knowledge'` are rejected if they declare `phases` or `tools`
4. `scoreSkill()` incorporates `paths` glob matching with 0.20 weight
5. Knowledge skills with score ≥0.7 are auto-injected with Instructions section only
6. Knowledge skills with score 0.4–0.7 appear in recommendations marked as `type: 'knowledge'`
7. Progressive disclosure splits SKILL.md on `## Details` heading — Instructions section is ≤5K tokens
8. `recommend_skills` returns `knowledgeRecommendations` as a separate array
9. All 58 PatternsDev skills imported (19 React, 27 JS, 11 Vue) with technology-prefixed names
10. Each imported skill has `metadata.upstream` pointing to its PatternsDev source
11. Imported skills are replicated across claude-code, gemini-cli, and cursor platforms
12. Backfill analysis completed for all 81 existing behavioral skills — `paths` and `related_skills` applied where appropriate
13. `harness validate` passes with knowledge skills present
14. Existing behavioral skill dispatch is unaffected — no regression in recommendation quality

## Implementation Order

### Phase A: Schema & Infrastructure

1. Add `type: 'knowledge'`, `paths`, `related_skills`, `metadata` to schema with refinement constraints
2. Extend `SkillIndexEntry` with new fields
3. Add `paths`-based scoring dimension to `scoreSkill()` with rebalanced weights
4. Add progressive disclosure splitting to `run_skill` handler
5. Add hybrid injection logic (≥0.7 auto-inject, 0.4–0.7 recommend)
6. Extend `RecommendationResult` with `knowledgeRecommendations`
7. Unit tests for all schema, scoring, and disclosure changes

### Phase B: React Vertical Slice (19 skills)

1. Import 19 React skills with `react-` prefix and full harness enrichment
2. Replicate to gemini-cli and cursor platforms
3. End-to-end validation: edit `.tsx` file → React knowledge auto-injected
4. Fix issues discovered during validation

### Phase C: JS + Vue Import (38 skills)

1. Import 27 JS skills with `js-` prefix
2. Import 11 Vue skills with `vue-` prefix
3. Replicate to all platforms
4. Validate dispatch across all three technology verticals

### Phase D: Backfill & Polish

1. Analyze all 81 existing behavioral skills for `paths` and `related_skills` applicability
2. Apply values where appropriate, with review
3. Full regression test — existing dispatch quality unaffected
4. Update skill authoring documentation to cover knowledge skill format

## Related Documents

- [ADR-001: Knowledge Skills Category & Schema Enrichment](.harness/architecture/patternsdev-skills-adoption/ADR-001.md)
- [PatternsDev/skills Analysis](.harness/architecture/patternsdev-skills-adoption/analysis.md)
