# Phase 5: Visual & Advanced Pipeline

## Overview

Extends the knowledge pipeline with four capabilities: vision model analysis of image attachments, design tool API connectors (Figma, Miro), cross-source contradiction detection, and knowledge coverage scoring per domain. All components follow the existing modular patterns (GraphConnector, SignalExtractor, DriftDetector) and integrate into the KnowledgePipelineRunner convergence loop.

## Decisions

| #   | Decision                                                                                                                         | Rationale                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Image analysis uses an `ImageAnalysisExtractor` wrapping `AnalysisProvider` rather than extending the AnalysisProvider interface | Keeps AnalysisProvider unchanged (no breaking changes), follows the existing extractor pattern where domain-specific processing feeds into the pipeline                                                          |
| D2  | Figma and Miro connectors implement `GraphConnector` and register with `SyncManager`                                             | Consistent with JiraConnector, ConfluenceConnector, SlackConnector, CIConnector patterns                                                                                                                         |
| D3  | Contradiction detection is a new `ContradictionDetector` class that enhances `StructuralDriftDetector` via composition           | The existing detector finds contradictions within a single snapshot. Cross-source contradiction detection requires comparing knowledge across source boundaries with semantic similarity, not just name-matching |
| D4  | Coverage scoring extends `GapReport` with quantitative metrics rather than creating a separate scoring system                    | `KnowledgeStagingAggregator` already owns gap reporting; coverage scoring is a natural extension                                                                                                                 |
| D5  | New node type `image_annotation` and edge type `annotates` added for vision-extracted knowledge                                  | Distinguishes LLM-derived visual observations from manually authored knowledge. Confidence scoring differentiates certainty levels                                                                               |
| D6  | AnalysisProvider receives image data via the `prompt` field using provider-native multimodal formatting                          | Anthropic API supports content blocks with `type: 'image'` in messages. The ImageAnalysisExtractor constructs the multimodal prompt and passes it through the existing interface without schema changes          |

## Technical Design

### 1. Image Analysis Extractor

**File:** `packages/graph/src/ingest/ImageAnalysisExtractor.ts`

Processes image files (.png, .jpg, .jpeg, .svg, .webp) found in the project tree. Uses the `AnalysisProvider` to send images to a vision-capable model for structured analysis.

```typescript
export interface ImageAnalysisResult {
  readonly description: string;
  readonly detectedElements: readonly DetectedElement[];
  readonly extractedText: string[];
  readonly designPatterns: string[];
  readonly accessibilityNotes: string[];
}

export interface DetectedElement {
  readonly type: string; // 'button', 'form', 'chart', 'diagram', 'screenshot', etc.
  readonly label: string;
  readonly confidence: number; // 0.0-1.0
}

export interface ImageAnalysisExtractorOptions {
  readonly projectDir: string;
  readonly analysisProvider: AnalysisProvider;
  readonly includePaths?: readonly string[]; // Glob patterns to include (default: docs/, .harness/knowledge/)
  readonly maxFileSizeMB?: number; // Skip files over this size (default: 10)
  readonly batchSize?: number; // Images per LLM call (default: 1)
}
```

**Processing flow:**

1. Walk `includePaths` directories for image files
2. Read each image as base64, skip files exceeding `maxFileSizeMB`
3. Construct multimodal prompt requesting structured analysis (description, elements, text, patterns, accessibility)
4. Parse LLM response via `responseSchema` (Zod schema for `ImageAnalysisResult`)
5. For each result, create:
   - One `image_annotation` node per image (id: `img:<pathHash>`, content: description)
   - One `business_concept` node per detected design pattern (confidence >= 0.7)
   - `annotates` edges from annotation nodes to the source image file node
   - `references` edges from concept nodes to related code nodes (text-matched)
6. Write JSONL output to `.harness/knowledge/extracted/image-analysis.jsonl`

**Default include paths:** `['docs/**/*.{png,jpg,jpeg,svg,webp}', '.harness/knowledge/**/*.{png,jpg,jpeg,svg,webp}', 'assets/**/*.{png,jpg,jpeg,svg,webp}']`

**Skipped directories:** Same as ExtractionRunner (node_modules, dist, .git, etc.)

### 2. Figma Connector

**File:** `packages/graph/src/ingest/connectors/FigmaConnector.ts`

Implements `GraphConnector`. Fetches design files from the Figma REST API and extracts design tokens, components, and structure as graph nodes.

**Config:**

```typescript
interface FigmaConnectorConfig extends ConnectorConfig {
  fileIds?: string[]; // Figma file IDs to sync
  teamId?: string; // Alternative: sync all files for a team
  extractComponents?: boolean; // Extract component definitions (default: true)
  extractTokens?: boolean; // Extract design tokens - colors, typography, spacing (default: true)
}
```

**API endpoints used:**

- `GET /v1/files/:file_key` — File structure, pages, frames
- `GET /v1/files/:file_key/styles` — Published styles (colors, text, effects)
- `GET /v1/files/:file_key/components` — Component metadata

**Node creation:**

- `design_token` nodes for colors, typography, spacing values (id: `figma:token:<styleId>`)
- `aesthetic_intent` nodes for component descriptions/annotations (id: `figma:intent:<componentId>`)
- `design_constraint` nodes for layout constraints, auto-layout rules (id: `figma:constraint:<nodeId>`)
- `document` nodes for each Figma file/page (id: `figma:file:<fileId>`)

**Edge creation:**

- `contains` — file → page → frame → component hierarchy
- `uses_token` — component → design token references
- `declares_intent` — component → aesthetic intent (from description field)
- `references` — design token → code nodes (matched by token name in CSS/TS)

**Content condensation:** Component descriptions and annotations condensed via the same pattern used by existing connectors (truncation at `maxContentLength`, default 4000 chars).

### 3. Miro Connector

**File:** `packages/graph/src/ingest/connectors/MiroConnector.ts`

Implements `GraphConnector`. Fetches board content from Miro REST API v2.

**Config:**

```typescript
interface MiroConnectorConfig extends ConnectorConfig {
  boardIds?: string[]; // Miro board IDs to sync
  teamId?: string; // Alternative: sync all boards for a team
  includeFrames?: boolean; // Extract frame-level grouping (default: true)
}
```

**API endpoints used:**

- `GET /v2/boards/:board_id` — Board metadata
- `GET /v2/boards/:board_id/items` — All items (sticky notes, shapes, text, connectors)

**Node creation:**

- `document` nodes for boards (id: `miro:board:<boardId>`)
- `business_concept` nodes for sticky notes and text items with substantial content (id: `miro:item:<itemId>`)
- `business_process` nodes for items detected as process steps (via connector/arrow relationships)
- `design_constraint` nodes for items tagged with constraint-related keywords

**Edge creation:**

- `contains` — board → frame → item hierarchy
- `references` — items connected by Miro connectors/arrows
- `documents` — items → code nodes (text-matched)

**Content extraction:** Miro items have a `data.content` field (HTML). Strip HTML tags, condense to `maxContentLength` (default 2000 chars).

### 4. Cross-Source Contradiction Detector

**File:** `packages/graph/src/ingest/ContradictionDetector.ts`

Enhances contradiction detection beyond the existing `StructuralDriftDetector` (which only finds contradictions within a single fresh snapshot by name-matching). The `ContradictionDetector` operates on the full graph store, comparing knowledge from different sources.

```typescript
export interface Contradiction {
  readonly id: string;
  readonly entityA: ContradictionEntry;
  readonly entityB: ContradictionEntry;
  readonly similarity: number; // 0.0-1.0, name/content similarity
  readonly conflictType: ConflictType;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly description: string;
}

export type ConflictType =
  | 'value_mismatch' // Same entity, different values (e.g., token color in Figma vs CSS)
  | 'definition_conflict' // Same term defined differently across sources
  | 'status_divergence' // Different sources report different status for same entity
  | 'temporal_conflict'; // Newer source contradicts older source

export interface ContradictionEntry {
  readonly nodeId: string;
  readonly source: string;
  readonly name: string;
  readonly content: string;
  readonly lastModified?: string;
}

export interface ContradictionResult {
  readonly contradictions: readonly Contradiction[];
  readonly sourcePairCounts: Record<string, number>; // 'figma↔code': 3
  readonly totalChecked: number;
}
```

**Detection algorithm:**

1. Query graph store for all knowledge nodes (business*\*, design*\*, image_annotation)
2. Group nodes by normalized name (lowercase, strip whitespace/punctuation)
3. For each group with entries from multiple sources:
   a. Compare content hashes — if different, potential contradiction
   b. Classify conflict type based on node types and metadata
   c. Compute name similarity (Levenshtein ratio) for fuzzy matching
   d. Assign severity: `critical` for value_mismatch (hard facts differ), `high` for definition_conflict, `medium` for status/temporal
4. Return `ContradictionResult` with pair-wise contradiction counts

**Integration with pipeline:**

- Called during the RECONCILE phase of KnowledgePipelineRunner
- Contradictions are added to DriftResult findings with classification `'contradicting'`
- Never auto-resolved (existing Iron Law preserved)

### 5. Knowledge Coverage Scorer

**File:** `packages/graph/src/ingest/CoverageScorer.ts`

Computes quantitative coverage scores per knowledge domain, extending the existing `GapReport`.

```typescript
export interface DomainCoverageScore {
  readonly domain: string;
  readonly score: number; // 0-100
  readonly knowledgeEntries: number; // Knowledge nodes in this domain
  readonly codeEntities: number; // Code nodes linked to this domain
  readonly linkedEntities: number; // Code nodes with at least one knowledge edge
  readonly unlinkdEntities: number; // Code nodes with no knowledge edges
  readonly sourceBreakdown: Record<string, number>; // entries by source
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface CoverageReport {
  readonly domains: readonly DomainCoverageScore[];
  readonly overallScore: number; // Weighted average across domains
  readonly overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly generatedAt: string;
}
```

**Scoring formula:**

```
domainScore = (linkedEntities / codeEntities) * 60       // Code coverage weight
            + min(knowledgeEntries / 10, 1.0) * 20        // Knowledge depth weight (saturates at 10)
            + min(uniqueSources / 3, 1.0) * 20            // Source diversity weight (saturates at 3)
```

**Grade mapping:**

- A: score >= 80
- B: score >= 60
- C: score >= 40
- D: score >= 20
- F: score < 20

**Domain detection:** Domains are derived from:

1. Subdirectories of `docs/knowledge/` (existing pattern)
2. Node metadata `domain` field (set by BusinessKnowledgeIngestor)
3. Top-level source directories as implicit domains (e.g., `packages/graph/` → "graph")

**Integration with pipeline:**

- Called during the DETECT phase of KnowledgePipelineRunner
- Replaces the simple `generateGapReport()` call with `generateCoverageReport()`
- Writes enriched report to `.harness/knowledge/coverage.md`

### 6. Type Additions

**New node type in `packages/graph/src/types.ts`:**

- `image_annotation` — Vision model analysis results for an image file

**New edge type in `packages/graph/src/types.ts`:**

- `annotates` — Links an image_annotation node to its source image/file node

### 7. Pipeline Integration

**KnowledgePipelineRunner changes:**

```
Phase 1 (EXTRACT):
  existing:  ExtractionRunner → DiagramParser → BusinessKnowledgeIngestor → KnowledgeLinker
  added:     ImageAnalysisExtractor (after DiagramParser, before BusinessKnowledgeIngestor)
             Note: Figma/Miro run via SyncManager, not directly in pipeline

Phase 2 (RECONCILE):
  existing:  StructuralDriftDetector.detect(preSnapshot, postSnapshot)
  added:     ContradictionDetector.detect(store) — appends cross-source contradictions to findings

Phase 3 (DETECT):
  existing:  KnowledgeStagingAggregator.generateGapReport()
  replaced:  CoverageScorer.generateCoverageReport() — superset of gap report

Phase 4 (REMEDIATE):
  unchanged: Contradictions remain never-auto-resolved
```

**New pipeline options:**

```typescript
export interface KnowledgePipelineOptions {
  // ... existing fields ...
  readonly analyzeImages?: boolean; // Enable vision analysis (default: false)
  readonly analysisProvider?: AnalysisProvider; // Required when analyzeImages is true
  readonly imagePaths?: readonly string[]; // Custom image search paths
}
```

**New result fields:**

```typescript
export interface KnowledgePipelineResult {
  // ... existing fields ...
  readonly contradictions: ContradictionResult;
  readonly coverage: CoverageReport;
  readonly extraction: ExtractionCounts & {
    readonly images: number; // New counter
  };
}
```

### 8. CLI Integration

Update `packages/cli/src/commands/knowledge-pipeline.ts` to add flags:

- `--analyze-images` — Enable vision analysis (requires `ANTHROPIC_API_KEY` env var)
- `--image-paths <paths>` — Comma-separated glob patterns for image search
- `--coverage` — Print coverage report after pipeline run (default: true when not `--ci`)
- `--check-contradictions` — Print contradiction report after pipeline run

### 9. File Layout

```
packages/graph/src/ingest/
  ImageAnalysisExtractor.ts          # NEW - Vision model image analysis
  ContradictionDetector.ts           # NEW - Cross-source contradiction detection
  CoverageScorer.ts                  # NEW - Per-domain coverage scoring
  connectors/
    FigmaConnector.ts                # NEW - Figma API connector
    MiroConnector.ts                 # NEW - Miro API connector

packages/graph/src/types.ts          # MODIFIED - Add image_annotation, annotates

packages/graph/src/ingest/
  KnowledgePipelineRunner.ts         # MODIFIED - Wire new components into phases

packages/cli/src/commands/
  knowledge-pipeline.ts              # MODIFIED - Add new CLI flags

packages/graph/tests/ingest/
  ImageAnalysisExtractor.test.ts     # NEW
  ContradictionDetector.test.ts      # NEW
  CoverageScorer.test.ts             # NEW
  connectors/FigmaConnector.test.ts  # NEW
  connectors/MiroConnector.test.ts   # NEW
```

## Success Criteria

1. **Vision analysis:** `ImageAnalysisExtractor` processes image files and creates `image_annotation` nodes with structured analysis results (description, detected elements, extracted text). Tested with mock `AnalysisProvider`.
2. **Figma connector:** `FigmaConnector` ingests design tokens, components, and structure from Figma API responses. Tested with mock HTTP client returning fixture data.
3. **Miro connector:** `MiroConnector` ingests board items, sticky notes, and connector relationships from Miro API responses. Tested with mock HTTP client returning fixture data.
4. **Contradiction detection:** `ContradictionDetector` identifies cross-source contradictions (value_mismatch, definition_conflict, status_divergence, temporal_conflict) with correct severity classification. Tested with graph fixtures containing known contradictions.
5. **Coverage scoring:** `CoverageScorer` computes per-domain scores using the formula (code coverage 60% + knowledge depth 20% + source diversity 20%). Grade mapping produces correct grades. Tested with graph fixtures of varying coverage levels.
6. **Pipeline integration:** All four components wire into KnowledgePipelineRunner's existing phases without breaking existing functionality. Existing pipeline tests continue to pass.
7. **CLI flags:** `--analyze-images`, `--coverage`, `--check-contradictions` flags are accepted and produce output.
8. **Type safety:** New node type `image_annotation` and edge type `annotates` compile and validate through existing Zod schemas.

## Implementation Order

1. **Types & foundations** — Add `image_annotation` node type, `annotates` edge type to types.ts
2. **Connectors** — FigmaConnector + MiroConnector (independent, parallelizable)
3. **ContradictionDetector** — Cross-source contradiction detection
4. **CoverageScorer** — Per-domain coverage scoring
5. **ImageAnalysisExtractor** — Vision model analysis (depends on types)
6. **Pipeline wiring** — Integrate all components into KnowledgePipelineRunner
7. **CLI updates** — Add flags to knowledge-pipeline command
