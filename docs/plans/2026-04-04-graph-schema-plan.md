# Plan: Graph Schema — Spec-to-Implementation Traceability (Phase 1)

**Date:** 2026-04-04
**Spec:** docs/changes/spec-to-implementation-traceability/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Add `requirement` node type and `requires`, `verified_by`, `tested_by` edge types to the graph schema so downstream phases can create traceability edges between specs, code, and tests.

## Observable Truths (Acceptance Criteria)

1. `NodeType` includes `'requirement'` — verified by `import { NODE_TYPES } from '@harness-engineering/graph'; NODE_TYPES.includes('requirement')` evaluating to `true`.
2. `EdgeType` includes `'requires'`, `'verified_by'`, and `'tested_by'` — verified by the same import pattern.
3. `npx vitest run` in `packages/graph` passes with no regressions.
4. `npm run typecheck` in `packages/graph` passes (Zod schemas auto-derive from the const arrays, so no additional wiring needed).
5. `harness validate` passes.

## File Map

- MODIFY `packages/graph/src/types.ts` (add entries to `NODE_TYPES` and `EDGE_TYPES` arrays)
- CREATE `packages/graph/tests/types/schema-traceability.test.ts` (verify new types exist)

## Tasks

### Task 1: Add requirement node type and traceability edge types

**Depends on:** none
**Files:** `packages/graph/src/types.ts`

1. Open `packages/graph/src/types.ts`.
2. In the `NODE_TYPES` array, after `'conversation'` (line 23) and before the `// VCS` comment, add:
   ```typescript
   'requirement',
   ```
3. In the `EDGE_TYPES` array, after `'decided'` (line 62) and before the `// VCS relationships` comment, add:
   ```typescript
   'requires',
   'verified_by',
   'tested_by',
   ```
4. Run: `harness validate`
5. Commit: `feat(graph): add requirement node type and traceability edge types`

### Task 2: Add schema tests for new types

**Depends on:** Task 1
**Files:** `packages/graph/tests/types/schema-traceability.test.ts`

1. Create `packages/graph/tests/types/schema-traceability.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { NODE_TYPES, EDGE_TYPES, GraphNodeSchema, GraphEdgeSchema } from '../../src/types.js';

   describe('Traceability graph schema additions', () => {
     it('NODE_TYPES includes requirement', () => {
       expect(NODE_TYPES).toContain('requirement');
     });

     it('EDGE_TYPES includes requires', () => {
       expect(EDGE_TYPES).toContain('requires');
     });

     it('EDGE_TYPES includes verified_by', () => {
       expect(EDGE_TYPES).toContain('verified_by');
     });

     it('EDGE_TYPES includes tested_by', () => {
       expect(EDGE_TYPES).toContain('tested_by');
     });

     it('GraphNodeSchema accepts requirement type', () => {
       const node = {
         id: 'req:abc123:1',
         type: 'requirement',
         name: 'The system shall return 404 for missing users',
         metadata: { section: 'Observable Truths', index: 1 },
       };
       expect(GraphNodeSchema.parse(node)).toMatchObject(node);
     });

     it('GraphEdgeSchema accepts requires edge', () => {
       const edge = { from: 'req:abc123:1', to: 'file:src/handler.ts', type: 'requires' };
       expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
     });

     it('GraphEdgeSchema accepts verified_by edge with confidence', () => {
       const edge = {
         from: 'req:abc123:1',
         to: 'file:tests/handler.test.ts',
         type: 'verified_by',
         confidence: 0.6,
         metadata: { method: 'convention' },
       };
       expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
     });

     it('GraphEdgeSchema accepts tested_by edge', () => {
       const edge = {
         from: 'file:src/handler.ts',
         to: 'file:tests/handler.test.ts',
         type: 'tested_by',
       };
       expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
     });
   });
   ```

2. Run test: `cd packages/graph && npx vitest run tests/types/schema-traceability.test.ts`
3. Observe: all 8 tests pass.
4. Run: `harness validate`
5. Commit: `test(graph): add schema tests for traceability types`

### Task 3: Verify full test suite and typecheck

**Depends on:** Task 2
**Files:** none (verification only)

1. Run: `cd packages/graph && npm run typecheck`
2. Observe: no type errors.
3. Run: `cd packages/graph && npx vitest run`
4. Observe: all tests pass, no regressions.
5. Run: `harness validate`
6. Commit: not needed (verification task).

[checkpoint:human-verify] -- Confirm all tests pass and phase is complete before proceeding to Phase 2.
