# Plan: Phase 5a -- Stability Types and Classification

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Define the stability classification type system (`StabilityTier`, `StabilityMetadata`) and a resolver function so that all harness content can be classified by caching tier (`static`, `session`, `ephemeral`) for downstream provider adapter integration.

## Observable Truths (Acceptance Criteria)

1. `packages/types/src/caching.ts` exists and exports `StabilityTier` type and `StabilityMetadata` interface.
2. `packages/types/src/index.ts` re-exports `StabilityTier` and `StabilityMetadata`.
3. `packages/types/src/skill.ts` `SkillMetadata` interface includes `stability?: StabilityTier` field.
4. `packages/graph/src/types.ts` exports `NODE_STABILITY` as a `Record<string, StabilityTier>` with 7 entries (File, Function, Class, Constraint, PackedSummary, SkillDefinition, ToolDefinition).
5. `packages/core/src/caching/stability.ts` exports `resolveStability(contentType: string): StabilityTier` that returns the correct tier for known types and `'ephemeral'` for unknown types.
6. When `resolveStability('file')` is called, it returns `'session'`.
7. When `resolveStability('skill')` is called, it returns `'static'`.
8. When `resolveStability('unknown_thing')` is called, it returns `'ephemeral'`.
9. All 675 `agents/skills/claude-code/*/skill.yaml` files contain `stability: static`.
10. `npx vitest run packages/core/tests/caching/stability.test.ts` passes.
11. `npx vitest run packages/graph/tests/types/node-stability.test.ts` passes.
12. `harness validate` passes.

## File Map

```
CREATE  packages/types/src/caching.ts
MODIFY  packages/types/src/index.ts (add caching re-exports)
MODIFY  packages/types/src/skill.ts (add stability field to SkillMetadata)
MODIFY  packages/graph/src/types.ts (add NODE_STABILITY map export)
MODIFY  packages/graph/src/index.ts (re-export NODE_STABILITY)
CREATE  packages/core/src/caching/stability.ts (resolver function)
MODIFY  packages/core/src/caching/index.ts (add stability re-export)
CREATE  packages/core/tests/caching/stability.test.ts (unit tests for resolver)
CREATE  packages/graph/tests/types/node-stability.test.ts (unit tests for NODE_STABILITY)
MODIFY  agents/skills/claude-code/*/skill.yaml (675 files -- add stability: static)
```

## Tasks

### Task 1: Create StabilityTier and StabilityMetadata types

**Depends on:** none
**Files:** `packages/types/src/caching.ts`, `packages/types/src/index.ts`

1. Create `packages/types/src/caching.ts`:

   ```typescript
   /**
    * Stability classification for prompt caching.
    *
    * - `static`    -- changes only on deploy/update (skills index, tool definitions, SKILL.md)
    * - `session`   -- stable within a session, varies between sessions (graph context, project state)
    * - `ephemeral` -- changes per call (tool responses, diff content, file reads)
    */
   export type StabilityTier = 'static' | 'session' | 'ephemeral';

   /**
    * Metadata describing a content block's caching stability.
    */
   export interface StabilityMetadata {
     /** The stability classification of this content */
     stability: StabilityTier;
     /** Advisory TTL hint (e.g., '1h', '5m') -- provider adapters decide actual TTL */
     ttlHint?: string;
   }
   ```

2. Add re-exports to `packages/types/src/index.ts`. Insert after the existing `// --- Session State ---` block (before `// --- Orchestrator ---`):

   ```typescript
   // --- Caching / Stability Classification ---
   export type { StabilityTier, StabilityMetadata } from './caching';
   ```

3. Run: `npx vitest run packages/types/ --passWithNoTests` (verify no type errors)
4. Run: `harness validate`
5. Commit: `feat(types): add StabilityTier and StabilityMetadata caching types`

---

### Task 2: Add stability field to SkillMetadata

**Depends on:** Task 1
**Files:** `packages/types/src/skill.ts`

1. Import `StabilityTier` at the top of `packages/types/src/skill.ts`:

   ```typescript
   import type { StabilityTier } from './caching';
   ```

2. Add the `stability` field to the `SkillMetadata` interface, after the `cognitive_mode` field:

   ```typescript
   export interface SkillMetadata {
     /** Unique name of the skill */
     name: string;
     /** Semantic version string */
     version: string;
     /** Brief description of what the skill does */
     description: string;
     /** The cognitive mode this skill operates in */
     cognitive_mode?: CognitiveMode;
     /** Caching stability tier -- defaults to inferred from content type if omitted */
     stability?: StabilityTier;
   }
   ```

3. Run: `npx vitest run packages/types/ --passWithNoTests`
4. Run: `harness validate`
5. Commit: `feat(types): add optional stability field to SkillMetadata`

---

### Task 3: Add NODE_STABILITY map to graph types

**Depends on:** Task 1
**Files:** `packages/graph/src/types.ts`, `packages/graph/src/index.ts`, `packages/graph/tests/types/node-stability.test.ts`

1. Create test file `packages/graph/tests/types/node-stability.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { NODE_STABILITY } from '../../src/types';

   describe('NODE_STABILITY', () => {
     it('maps File to session', () => {
       expect(NODE_STABILITY.File).toBe('session');
     });

     it('maps Function to session', () => {
       expect(NODE_STABILITY.Function).toBe('session');
     });

     it('maps Class to session', () => {
       expect(NODE_STABILITY.Class).toBe('session');
     });

     it('maps Constraint to session', () => {
       expect(NODE_STABILITY.Constraint).toBe('session');
     });

     it('maps PackedSummary to session', () => {
       expect(NODE_STABILITY.PackedSummary).toBe('session');
     });

     it('maps SkillDefinition to static', () => {
       expect(NODE_STABILITY.SkillDefinition).toBe('static');
     });

     it('maps ToolDefinition to static', () => {
       expect(NODE_STABILITY.ToolDefinition).toBe('static');
     });

     it('contains exactly 7 entries', () => {
       expect(Object.keys(NODE_STABILITY)).toHaveLength(7);
     });
   });
   ```

2. Run test: `npx vitest run packages/graph/tests/types/node-stability.test.ts`
3. Observe failure: `NODE_STABILITY` is not exported from `../../src/types`.

4. Add to the bottom of `packages/graph/src/types.ts`, before the Zod schema section:

   ```typescript
   // --- Node Stability Classification (for prompt caching) ---

   import type { StabilityTier } from '@harness-engineering/types';

   /**
    * Maps graph node types to their caching stability tier.
    * Used by provider cache adapters to determine cache directives.
    *
    * Node types not listed here default to 'ephemeral' at resolution time.
    */
   export const NODE_STABILITY: Record<string, StabilityTier> = {
     File: 'session',
     Function: 'session',
     Class: 'session',
     Constraint: 'session',
     PackedSummary: 'session',
     SkillDefinition: 'static',
     ToolDefinition: 'static',
   };
   ```

   Note: The import of `StabilityTier` should be placed at the top of the file alongside the existing `zod` import. The `NODE_STABILITY` constant should be inserted after the `CURRENT_SCHEMA_VERSION` constant and before the Zod schemas section (before line 179).

5. Add re-export to `packages/graph/src/index.ts`. In the existing value exports block (around line 15-22), add `NODE_STABILITY`:

   ```typescript
   export {
     NODE_TYPES,
     EDGE_TYPES,
     OBSERVABILITY_TYPES,
     CURRENT_SCHEMA_VERSION,
     NODE_STABILITY,
     GraphNodeSchema,
     GraphEdgeSchema,
   } from './types.js';
   ```

6. Run test: `npx vitest run packages/graph/tests/types/node-stability.test.ts`
7. Observe: all 8 tests pass.
8. Run: `harness validate`
9. Commit: `feat(graph): add NODE_STABILITY map for caching tier classification`

---

### Task 4: Create stability resolver function (TDD)

**Depends on:** Task 1, Task 3
**Files:** `packages/core/src/caching/stability.ts`, `packages/core/src/caching/index.ts`, `packages/core/tests/caching/stability.test.ts`

1. Create test file `packages/core/tests/caching/stability.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { resolveStability } from '../../src/caching/stability';

   describe('resolveStability', () => {
     describe('graph node types (PascalCase)', () => {
       it('returns session for File', () => {
         expect(resolveStability('File')).toBe('session');
       });

       it('returns session for Function', () => {
         expect(resolveStability('Function')).toBe('session');
       });

       it('returns session for Class', () => {
         expect(resolveStability('Class')).toBe('session');
       });

       it('returns session for Constraint', () => {
         expect(resolveStability('Constraint')).toBe('session');
       });

       it('returns session for PackedSummary', () => {
         expect(resolveStability('PackedSummary')).toBe('session');
       });

       it('returns static for SkillDefinition', () => {
         expect(resolveStability('SkillDefinition')).toBe('static');
       });

       it('returns static for ToolDefinition', () => {
         expect(resolveStability('ToolDefinition')).toBe('static');
       });
     });

     describe('lowercase content types (graph NodeType values)', () => {
       it('returns session for file', () => {
         expect(resolveStability('file')).toBe('session');
       });

       it('returns session for function', () => {
         expect(resolveStability('function')).toBe('session');
       });

       it('returns session for class', () => {
         expect(resolveStability('class')).toBe('session');
       });

       it('returns session for constraint', () => {
         expect(resolveStability('constraint')).toBe('session');
       });

       it('returns session for packed_summary', () => {
         expect(resolveStability('packed_summary')).toBe('session');
       });

       it('returns static for skill', () => {
         expect(resolveStability('skill')).toBe('static');
       });
     });

     describe('default behavior', () => {
       it('returns ephemeral for unknown types', () => {
         expect(resolveStability('unknown_thing')).toBe('ephemeral');
       });

       it('returns ephemeral for empty string', () => {
         expect(resolveStability('')).toBe('ephemeral');
       });
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/caching/stability.test.ts`
3. Observe failure: module `../../src/caching/stability` not found.

4. Create `packages/core/src/caching/stability.ts`:

   ```typescript
   import type { StabilityTier } from '@harness-engineering/types';
   import { NODE_STABILITY } from '@harness-engineering/graph';

   /**
    * Normalized lookup table mapping both PascalCase graph node display names
    * and lowercase NodeType enum values to their stability tiers.
    */
   const STABILITY_LOOKUP: Record<string, StabilityTier> = {};

   // Populate from NODE_STABILITY (PascalCase keys like 'File', 'SkillDefinition')
   for (const [key, tier] of Object.entries(NODE_STABILITY)) {
     STABILITY_LOOKUP[key] = tier;
     // Also add lowercase version for NodeType enum values (e.g., 'file', 'function')
     STABILITY_LOOKUP[key.toLowerCase()] = tier;
   }

   // Map graph NodeType enum values that differ from PascalCase lowering
   // e.g., 'packed_summary' (NodeType) vs 'packedsummary' (from PascalCase.toLowerCase())
   STABILITY_LOOKUP['packed_summary'] = 'session';
   // 'skill' NodeType maps to SkillDefinition
   STABILITY_LOOKUP['skill'] = 'static';
   // 'tool' would map to ToolDefinition if it existed as a NodeType

   /**
    * Resolve the stability tier for a content type or graph node type.
    *
    * Accepts both PascalCase display names (e.g., 'SkillDefinition') and
    * lowercase NodeType enum values (e.g., 'file', 'packed_summary').
    *
    * Returns 'ephemeral' for any unrecognized type.
    */
   export function resolveStability(contentType: string): StabilityTier {
     return STABILITY_LOOKUP[contentType] ?? 'ephemeral';
   }
   ```

5. Add re-export to `packages/core/src/caching/index.ts`. Append:

   ```typescript
   export { resolveStability } from './stability';
   ```

6. Run test: `npx vitest run packages/core/tests/caching/stability.test.ts`
7. Observe: all 14 tests pass.
8. Run: `harness validate`
9. Commit: `feat(caching): add resolveStability function for content tier classification`

---

### Task 5: Tag all existing skill.yaml files with stability: static

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/*/skill.yaml` (675 files)

1. Run a script to add `stability: static` to every skill.yaml that does not already have it. Insert after the `description:` line (line 3 in all files based on the standard format):

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   for f in agents/skills/claude-code/*/skill.yaml; do
     if ! grep -q '^stability:' "$f"; then
       sed -i '' '/^description:/a\
   stability: static' "$f"
     fi
   done
   ```

2. Verify a sample:

   ```bash
   head -6 agents/skills/claude-code/js-adapter-pattern/skill.yaml
   ```

   Expected output:

   ```
   name: js-adapter-pattern
   version: '1.0.0'
   description: Convert the interface of a class into another interface that clients expect
   stability: static
   cognitive_mode: advisory-guide
   type: knowledge
   ```

3. Verify count -- all 675 files tagged:

   ```bash
   grep -rl '^stability: static' agents/skills/claude-code/*/skill.yaml | wc -l
   ```

   Expected: `675`

4. Run: `harness validate`
5. Commit: `feat(skills): tag all 675 skill.yaml files with stability: static`

---

### Task 6: Integration verification

**Depends on:** Tasks 1-5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run full test suites for affected packages:

   ```bash
   npx vitest run packages/core/tests/caching/stability.test.ts
   npx vitest run packages/graph/tests/types/node-stability.test.ts
   ```

2. Run existing test suites to confirm no regressions:

   ```bash
   npx vitest run packages/types/
   npx vitest run packages/core/tests/compaction/
   npx vitest run packages/graph/tests/types/
   ```

3. Verify type exports resolve correctly:

   ```bash
   cd /Users/cwarner/Projects/harness-engineering
   npx tsc --noEmit -p packages/types/tsconfig.json
   npx tsc --noEmit -p packages/core/tsconfig.json
   npx tsc --noEmit -p packages/graph/tsconfig.json
   ```

4. Run: `harness validate`
5. Verify observable truths:
   - `StabilityTier` and `StabilityMetadata` importable from `@harness-engineering/types`
   - `NODE_STABILITY` importable from `@harness-engineering/graph`
   - `resolveStability` importable from `@harness-engineering/core`
   - `SkillMetadata.stability` field exists as optional `StabilityTier`
   - All skill.yaml files tagged
6. No commit needed -- this is verification only.
