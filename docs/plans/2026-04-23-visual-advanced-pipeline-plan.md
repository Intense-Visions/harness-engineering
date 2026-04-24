# Plan: Visual & Advanced Pipeline (Phase 5)

**Date:** 2026-04-23 | **Spec:** docs/changes/visual-advanced-pipeline/proposal.md | **Tasks:** 10 | **Time:** ~40 min

## Observable Truths

1. `NODE_TYPES` includes `'image_annotation'` and `EDGE_TYPES` includes `'annotates'` in `packages/graph/src/types.ts`.
2. `FigmaConnector.ingest()` creates `design_token`, `aesthetic_intent`, `design_constraint` nodes from mock API responses — test passes via `npx vitest run packages/graph/tests/ingest/connectors/FigmaConnector.test.ts`.
3. `MiroConnector.ingest()` creates `business_concept`, `document` nodes from mock API responses — test passes via `npx vitest run packages/graph/tests/ingest/connectors/MiroConnector.test.ts`.
4. `ContradictionDetector.detect()` returns `Contradiction` objects with classified `conflictType` and `severity` from a graph containing known cross-source contradictions — test passes via `npx vitest run packages/graph/tests/ingest/ContradictionDetector.test.ts`.
5. `CoverageScorer.score()` returns `DomainCoverageScore` with numeric scores and letter grades — test passes via `npx vitest run packages/graph/tests/ingest/CoverageScorer.test.ts`.
6. `ImageAnalysisExtractor.analyze()` creates `image_annotation` nodes using a mock `AnalysisProvider` — test passes via `npx vitest run packages/graph/tests/ingest/ImageAnalysisExtractor.test.ts`.
7. `KnowledgePipelineRunner` integrates all four new components into the convergence loop.
8. CLI accepts `--analyze-images`, `--coverage`, `--check-contradictions` flags.
9. All new modules are exported from `packages/graph/src/index.ts`.
10. `npx vitest run packages/graph/tests/` passes with no regressions.

## Uncertainties

- [ASSUMPTION] Figma and Miro API fixtures can be hand-crafted from public API docs. No real API keys needed.
- [ASSUMPTION] The AnalysisProvider interface can serve vision prompts by including base64 image data in the prompt string. ImageAnalysisExtractor constructs the prompt.
- [DEFERRABLE] Exact LLM prompt wording for image analysis can be refined post-implementation.

## File Map

```
MODIFY packages/graph/src/types.ts
CREATE packages/graph/src/ingest/connectors/FigmaConnector.ts
CREATE packages/graph/tests/ingest/connectors/FigmaConnector.test.ts
CREATE packages/graph/src/ingest/connectors/MiroConnector.ts
CREATE packages/graph/tests/ingest/connectors/MiroConnector.test.ts
CREATE packages/graph/src/ingest/ContradictionDetector.ts
CREATE packages/graph/tests/ingest/ContradictionDetector.test.ts
CREATE packages/graph/src/ingest/CoverageScorer.ts
CREATE packages/graph/tests/ingest/CoverageScorer.test.ts
CREATE packages/graph/src/ingest/ImageAnalysisExtractor.ts
CREATE packages/graph/tests/ingest/ImageAnalysisExtractor.test.ts
MODIFY packages/graph/src/ingest/KnowledgePipelineRunner.ts
MODIFY packages/graph/src/index.ts
MODIFY packages/cli/src/commands/knowledge-pipeline.ts
```

## Tasks

### Task 1: Add new node and edge types

**Files:** `packages/graph/src/types.ts`

Add `'image_annotation'` to `NODE_TYPES` (after `design_constraint`) and `'annotates'` to `EDGE_TYPES` (after `measures`).

**Verify:** `npx vitest run packages/graph/tests/ --reporter=dot 2>&1 | tail -5` — no test regressions from type additions.

---

### Task 2: Create FigmaConnector with tests (TDD)

**Files:**

- `packages/graph/tests/ingest/connectors/FigmaConnector.test.ts` (test first)
- `packages/graph/src/ingest/connectors/FigmaConnector.ts` (implementation)

The connector follows the exact pattern of `JiraConnector`: constructor accepts optional `HttpClient`, `ingest()` reads env vars for API key and base URL, creates nodes from API responses, and uses `linkToCode` for edges.

**Figma API fixtures:**

- Styles endpoint: `{ styles: [{ key: 'color-primary', name: 'Primary', style_type: 'FILL', description: 'Main brand color' }] }`
- Components endpoint: `{ meta: { components: [{ key: 'btn-001', name: 'Button/Primary', description: 'Primary CTA button' }] } }`

**Node types created:**

- `design_token` for styles (id: `figma:token:<styleKey>`)
- `aesthetic_intent` for component descriptions (id: `figma:intent:<componentKey>`)

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/FigmaConnector.test.ts`

---

### Task 3: Create MiroConnector with tests (TDD)

**Files:**

- `packages/graph/tests/ingest/connectors/MiroConnector.test.ts` (test first)
- `packages/graph/src/ingest/connectors/MiroConnector.ts` (implementation)

Same `GraphConnector` pattern. Reads `MIRO_API_KEY` env var. API v2 format.

**Miro API fixtures:**

- Board items: `{ data: [{ id: '123', type: 'sticky_note', data: { content: 'User authentication must use OAuth2' } }, { id: '456', type: 'shape', data: { content: 'API Gateway' } }] }`

**Node types created:**

- `document` for boards (id: `miro:board:<boardId>`)
- `business_concept` for sticky notes with substantial content (id: `miro:item:<itemId>`)

**Verify:** `npx vitest run packages/graph/tests/ingest/connectors/MiroConnector.test.ts`

---

### Task 4: Create ContradictionDetector with tests (TDD)

**Files:**

- `packages/graph/tests/ingest/ContradictionDetector.test.ts` (test first)
- `packages/graph/src/ingest/ContradictionDetector.ts` (implementation)

Operates on the GraphStore to find cross-source contradictions. Groups knowledge nodes by normalized name, compares content hashes across different sources.

**Test scenarios:**

1. Two nodes with same name from different sources with different content → `value_mismatch`
2. Two nodes with same name from different sources with same content → no contradiction
3. Empty graph → empty result
4. Multiple contradiction groups → all detected

**Verify:** `npx vitest run packages/graph/tests/ingest/ContradictionDetector.test.ts`

---

### Task 5: Create CoverageScorer with tests (TDD)

**Files:**

- `packages/graph/tests/ingest/CoverageScorer.test.ts` (test first)
- `packages/graph/src/ingest/CoverageScorer.ts` (implementation)

Computes per-domain coverage scores. Formula: `(linkedEntities/codeEntities)*60 + min(knowledgeEntries/10,1)*20 + min(uniqueSources/3,1)*20`.

**Test scenarios:**

1. Domain with full coverage (all code linked, many entries, multiple sources) → grade A
2. Domain with no knowledge → grade F
3. Mixed domains → correct per-domain scores
4. Empty graph → empty report

**Verify:** `npx vitest run packages/graph/tests/ingest/CoverageScorer.test.ts`

---

### Task 6: Create ImageAnalysisExtractor with tests (TDD)

**Files:**

- `packages/graph/tests/ingest/ImageAnalysisExtractor.test.ts` (test first)
- `packages/graph/src/ingest/ImageAnalysisExtractor.ts` (implementation)

Uses a mock `AnalysisProvider` to analyze images. Creates `image_annotation` nodes.

**Test scenarios:**

1. Mock provider returns structured analysis → `image_annotation` node created with correct metadata
2. No images found → empty result
3. Image exceeds max size → skipped

**Verify:** `npx vitest run packages/graph/tests/ingest/ImageAnalysisExtractor.test.ts`

---

### Task 7: Wire components into KnowledgePipelineRunner

**Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`

Changes:

1. Add `analyzeImages`, `analysisProvider`, `imagePaths` to `KnowledgePipelineOptions`
2. Add `images` counter to `ExtractionCounts`
3. Add `contradictions` and `coverage` fields to `KnowledgePipelineResult`
4. In EXTRACT phase: call `ImageAnalysisExtractor.analyze()` when `analyzeImages: true`
5. In RECONCILE phase: also include `image_annotation` and `design_token`/`design_constraint`/`aesthetic_intent` in snapshot types
6. After RECONCILE: call `ContradictionDetector.detect()` and merge results
7. In DETECT phase: call `CoverageScorer.score()` alongside gap report

**Verify:** `npx vitest run packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`

---

### Task 8: Update package exports

**Files:** `packages/graph/src/index.ts`

Add exports for:

- `FigmaConnector` from connectors
- `MiroConnector` from connectors
- `ContradictionDetector` and its types
- `CoverageScorer` and its types
- `ImageAnalysisExtractor` and its types

**Verify:** `npx tsc --noEmit -p packages/graph/tsconfig.json 2>&1 | tail -5`

---

### Task 9: Update CLI knowledge-pipeline command

**Files:** `packages/cli/src/commands/knowledge-pipeline.ts`

Add options:

- `--analyze-images` — pass `analyzeImages: true` to pipeline runner
- `--image-paths <paths>` — comma-separated glob patterns
- `--coverage` — display coverage report in output
- `--check-contradictions` — display contradiction report in output

Update output section to display coverage scores and contradictions when present.

**Verify:** `npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | tail -5`

---

### Task 10: Final integration test and validation

Run full test suite and harness validate to ensure no regressions.

**Verify:**

- `cd packages/graph && npx vitest run 2>&1 | tail -10`
- `cd /path/to/project && npx harness validate`

---

## Parallel Opportunities

- Tasks 2, 3, 4, 5, 6 are independent (different files, no shared state) — can be parallelized
- Task 7 depends on Tasks 1-6
- Task 8 depends on Tasks 2-6
- Task 9 depends on Task 7
- Task 10 depends on all
