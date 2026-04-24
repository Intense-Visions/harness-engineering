# Plan: Phase 4 — Knowledge Pipeline & Diagrams

**Date:** 2026-04-23 | **Spec:** .harness/architecture/business-knowledge-system/ADR-001.md | **Tasks:** 7 | **Time:** ~45 min

## Goal

The harness knowledge system supports diagram-as-code ingestion (Mermaid/D2/PlantUML → graph nodes), structural drift detection with deterministic classification, aggregated staging with gap reporting, a `/harness:knowledge-pipeline` skill with 4-phase convergence loop, and a `harness knowledge-pipeline` CLI command for CI integration.

## Design Decisions

1. **Regex-based diagram parsing** — zero new dependencies; D2 has no JS parser so regex is mandatory for at least one format; the `DiagramFormatParser` interface allows swapping in library-based parsers later without touching upstream code.
2. **Structural drift detection only** — node/edge existence comparison with deterministic stable IDs (`source:path:contentHash`). Semantic drift (content similarity via VectorStore embeddings) deferred to Phase 5 behind a `DriftDetector` interface.
3. **Skill-first, CLI-second** — the skill is the primary interface for agent-driven knowledge maintenance; the CLI command wraps the same core logic for CI/human use.

## Observable Truths (Acceptance Criteria)

1. `DiagramParser.parse(mermaidContent, 'flow.mmd')` returns a `DiagramParseResult` with entities and relationships extracted from a Mermaid flowchart.
2. `DiagramParser.parse(d2Content, 'arch.d2')` returns entities and relationships from D2 syntax.
3. `DiagramParser.parse(pumlContent, 'seq.puml')` returns entities and relationships from PlantUML syntax.
4. `DiagramParser.parse()` returns `{ entities: [], relationships: [] }` for unparseable content (no throw).
5. `DiagramParser.ingest(projectDir, store)` creates `business_concept` nodes and `references` edges in GraphStore for every diagram file found.
6. `ingest_source` MCP tool with `source: 'diagrams'` invokes DiagramParser and persists results to the graph.
7. `StructuralDriftDetector.detect(currentSnapshot, freshSnapshot)` classifies findings into `new | drifted | stale | contradicting` categories.
8. `StructuralDriftDetector.detect()` returns zero findings when snapshots are identical.
9. `KnowledgeStagingAggregator.aggregate(...)` writes unified `.harness/knowledge/staged/pipeline-staged.jsonl` and `.harness/knowledge/gaps.md`.
10. `/harness:knowledge-pipeline` skill executes EXTRACT → RECONCILE → DETECT → REMEDIATE with convergence (≤5 iterations, stops when finding count does not decrease).
11. `harness knowledge-pipeline --drift-check` exits 1 when unresolved drift findings exist, exits 0 otherwise.
12. `DiagramParser`, `StructuralDriftDetector`, and `KnowledgeStagingAggregator` are exported from `packages/graph/src/index.ts`.
13. TypeScript compiles with no errors; `harness validate` passes.

## File Map

```
CREATE  packages/graph/src/ingest/DiagramParser.ts
CREATE  packages/graph/tests/ingest/DiagramParser.test.ts
CREATE  packages/graph/tests/__fixtures__/diagrams/flowchart.mmd
CREATE  packages/graph/tests/__fixtures__/diagrams/sequence.mmd
CREATE  packages/graph/tests/__fixtures__/diagrams/architecture.d2
CREATE  packages/graph/tests/__fixtures__/diagrams/class.puml
CREATE  packages/graph/src/ingest/StructuralDriftDetector.ts
CREATE  packages/graph/tests/ingest/StructuralDriftDetector.test.ts
CREATE  packages/graph/src/ingest/KnowledgeStagingAggregator.ts
CREATE  packages/graph/tests/ingest/KnowledgeStagingAggregator.test.ts
CREATE  agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md
CREATE  packages/cli/src/commands/knowledge-pipeline.ts
CREATE  packages/graph/tests/integration/knowledge-pipeline.test.ts
MODIFY  packages/graph/src/index.ts
MODIFY  packages/cli/src/mcp/tools/graph/ingest-source.ts
```

## Dependency Graph

```
[Task 1: Mermaid] ──┐
                     ├── [Task 3: Orchestrator+Ingest] ──┐
[Task 2: D2+PUML] ──┘                                    │
                                                          ├── [Task 6: Skill] ── [Task 7: CLI+Integration]
[Task 4: Drift] ─────── [Task 5: Staging+Gaps] ─────────┘
```

Wave 1 (parallel): Tasks 1, 2, 4 | Wave 2 (parallel): Tasks 3, 5 | Wave 3: Task 6 | Wave 4: Task 7

## Tasks

### Task 1: DiagramParseResult types + MermaidParser (TDD)

**Depends on:** none
**Files:** `packages/graph/src/ingest/DiagramParser.ts`, `packages/graph/tests/ingest/DiagramParser.test.ts`, `packages/graph/tests/__fixtures__/diagrams/flowchart.mmd`, `packages/graph/tests/__fixtures__/diagrams/sequence.mmd`

1. Create fixture `packages/graph/tests/__fixtures__/diagrams/flowchart.mmd`:

   ```
   graph TD
     A[Auth Service] --> B{Valid Token?}
     B -->|Yes| C[Grant Access]
     B -->|No| D[Reject Request]
     C --> E[Log Event]
   ```

2. Create fixture `packages/graph/tests/__fixtures__/diagrams/sequence.mmd`:

   ```
   sequenceDiagram
     participant Client
     participant API
     participant DB
     Client->>API: POST /orders
     API->>DB: INSERT order
     DB-->>API: order_id
     API-->>Client: 201 Created
   ```

3. Create test file `packages/graph/tests/ingest/DiagramParser.test.ts` with tests for:
   - `MermaidParser.canParse()` returns true for `.mmd` and `.mermaid` extensions
   - `MermaidParser.canParse()` returns false for `.d2`, `.puml`, `.ts`
   - Flowchart: extracts 5 entities (A, B, C, D, E) with labels
   - Flowchart: extracts 4 relationships with correct from/to
   - Flowchart: edge labels captured (`Yes`, `No`)
   - Sequence: extracts 3 participants (Client, API, DB)
   - Sequence: extracts 4 message relationships
   - Returns `{ entities: [], relationships: [], metadata }` for empty/unparseable content
   - `metadata.format` is `'mermaid'` and `diagramType` is `'flowchart'` or `'sequence'`

4. Run tests — observe failures.

5. Define types and implement MermaidParser in `packages/graph/src/ingest/DiagramParser.ts`:

   ```typescript
   export interface DiagramEntity {
     readonly id: string;
     readonly label: string;
     readonly type?: string; // 'decision', 'process', 'participant', etc.
   }

   export interface DiagramRelationship {
     readonly from: string;
     readonly to: string;
     readonly label?: string;
   }

   export interface DiagramParseResult {
     readonly entities: readonly DiagramEntity[];
     readonly relationships: readonly DiagramRelationship[];
     readonly metadata: {
       readonly format: 'mermaid' | 'd2' | 'plantuml';
       readonly diagramType: string;
     };
   }

   export interface DiagramFormatParser {
     canParse(content: string, ext: string): boolean;
     parse(content: string, filePath: string): DiagramParseResult;
   }
   ```

   Implement `MermaidParser` with regex patterns:
   - Flowchart node: `/([A-Za-z0-9_]+)\s*[\[\(\{]([^\]\)\}]+)[\]\)\}]/g`
   - Flowchart edge: `/([A-Za-z0-9_]+)\s*-->\|?([^|]*)\|?\s*([A-Za-z0-9_]+)/g`
   - Sequence participant: `/participant\s+(\w+)(?:\s+as\s+(.+))?/g`
   - Sequence message: `/(\w+)\s*->>?\s*(\w+)\s*:\s*(.+)/g`
   - Diagram type detection: first non-empty line (`graph`, `sequenceDiagram`, `classDiagram`, `erDiagram`)

6. Run tests — observe pass.
7. Commit: `feat(graph): add DiagramParseResult types and MermaidParser`

### Task 2: D2Parser + PlantUmlParser (TDD)

**Depends on:** none
**Files:** `packages/graph/src/ingest/DiagramParser.ts`, `packages/graph/tests/ingest/DiagramParser.test.ts`, `packages/graph/tests/__fixtures__/diagrams/architecture.d2`, `packages/graph/tests/__fixtures__/diagrams/class.puml`

1. Create fixture `packages/graph/tests/__fixtures__/diagrams/architecture.d2`:

   ```
   server: Web Server
   db: PostgreSQL {
     shape: cylinder
   }
   cache: Redis
   server -> db: queries
   server -> cache: session lookup
   cache -> db: cache miss
   ```

2. Create fixture `packages/graph/tests/__fixtures__/diagrams/class.puml`:

   ```
   @startuml
   class AuthService {
     +validateToken(token: string): boolean
     +createSession(user: User): Session
   }
   class TokenStore {
     +get(key: string): Token
     +set(key: string, token: Token): void
   }
   AuthService --> TokenStore : uses
   @enduml
   ```

3. Add tests to `DiagramParser.test.ts`:
   - `D2Parser.canParse()` returns true for `.d2`, false for others
   - D2: extracts 3 entities (server, db, cache) with labels
   - D2: extracts 3 connections with labels
   - D2: nested properties (shape) stored in entity type
   - `PlantUmlParser.canParse()` returns true for `.puml` and `.plantuml`
   - PlantUML: extracts 2 classes with names
   - PlantUML: extracts 1 relationship (AuthService → TokenStore)
   - PlantUML: `metadata.format` is `'plantuml'`, `diagramType` is `'class'`
   - Both return empty results for unparseable content

4. Run tests — observe failures.

5. Implement `D2Parser` in `DiagramParser.ts`:
   - Shape declaration: `/^([a-zA-Z0-9_-]+)\s*:\s*(.+?)(?:\s*\{)?$/gm`
   - Connection: `/^([a-zA-Z0-9_.-]+)\s*->\s*([a-zA-Z0-9_.-]+)(?:\s*:\s*(.+?))?$/gm`
   - Skip lines inside `{ }` blocks (nested properties) — track brace depth

6. Implement `PlantUmlParser` in `DiagramParser.ts`:
   - Class: `/class\s+(\w+)/g`
   - Participant: `/participant\s+(\w+)(?:\s+as\s+"?(.+?)"?)?/g`
   - Component: `/\[(.+?)\]/g` or `/component\s+"?(.+?)"?/g`
   - Relationship: `/(\w+)\s*(?:-->|->|<--|<-|--)\s*(\w+)(?:\s*:\s*(.+))?/g`
   - Diagram type from first directive after `@startuml` or from content heuristics
   - Strip `@startuml`/`@enduml` wrappers before parsing

7. Run tests — observe pass.
8. Commit: `feat(graph): add D2Parser and PlantUmlParser`

### Task 3: DiagramParser orchestrator + ingest-source integration

**Depends on:** Task 1, Task 2
**Files:** `packages/graph/src/ingest/DiagramParser.ts`, `packages/graph/tests/ingest/DiagramParser.test.ts`, `packages/graph/src/index.ts`, `packages/cli/src/mcp/tools/graph/ingest-source.ts`

1. Add orchestrator tests to `DiagramParser.test.ts`:

   ```typescript
   describe('DiagramParser', () => {
     describe('parse()', () => {
       it('dispatches .mmd to MermaidParser', () => { ... });
       it('dispatches .d2 to D2Parser', () => { ... });
       it('dispatches .puml to PlantUmlParser', () => { ... });
       it('returns empty result for unknown extension', () => { ... });
     });

     describe('ingest()', () => {
       let store: GraphStore;
       beforeEach(() => { store = new GraphStore(); });

       it('creates business_concept nodes for each entity', async () => {
         const parser = new DiagramParser(store);
         const result = await parser.ingest(FIXTURES_DIR);
         const concepts = store.findNodes({ type: 'business_concept' });
         expect(concepts.length).toBeGreaterThanOrEqual(10);
       });

       it('creates references edges for relationships', async () => {
         const parser = new DiagramParser(store);
         await parser.ingest(FIXTURES_DIR);
         const edges = store.getEdges({ type: 'references' });
         expect(edges.length).toBeGreaterThanOrEqual(8);
       });

       it('sets confidence to 0.85 on all nodes', async () => { ... });
       it('uses deterministic node IDs: diagram:<pathHash>:<entityId>', async () => { ... });
       it('returns IngestResult with correct counts', async () => { ... });
       it('skips non-diagram files', async () => { ... });
     });
   });
   ```

2. Run tests — observe failures.

3. Implement `DiagramParser` class:

   ```typescript
   export class DiagramParser {
     private readonly parsers: readonly DiagramFormatParser[] = [
       new MermaidParser(),
       new D2Parser(),
       new PlantUmlParser(),
     ];

     constructor(private readonly store: GraphStore) {}

     parse(content: string, filePath: string): DiagramParseResult {
       const ext = path.extname(filePath).toLowerCase();
       for (const parser of this.parsers) {
         if (parser.canParse(content, ext)) {
           return parser.parse(content, filePath);
         }
       }
       return {
         entities: [],
         relationships: [],
         metadata: { format: 'mermaid', diagramType: 'unknown' },
       };
     }

     async ingest(projectDir: string): Promise<IngestResult> {
       // 1. Glob for *.mmd, *.mermaid, *.d2, *.puml, *.plantuml
       // 2. For each file, parse → DiagramParseResult
       // 3. Map entities → business_concept nodes
       //    ID: `diagram:${hash(filePath)}:${entity.id}`
       //    metadata: { source: 'diagram', format, diagramType, confidence: 0.85 }
       // 4. Map relationships → references edges
       //    from: `diagram:${hash(filePath)}:${rel.from}`
       //    to: `diagram:${hash(filePath)}:${rel.to}`
       //    metadata: { label: rel.label }
       // 5. store.addNode() / store.addEdge() for each
       // 6. Return aggregated IngestResult
     }
   }
   ```

4. Run tests — observe pass.

5. Export from `packages/graph/src/index.ts`:

   ```typescript
   export { DiagramParser } from './ingest/DiagramParser.js';
   export type {
     DiagramParseResult,
     DiagramEntity,
     DiagramRelationship,
     DiagramFormatParser,
   } from './ingest/DiagramParser.js';
   ```

6. Wire into `packages/cli/src/mcp/tools/graph/ingest-source.ts`:
   - Add `'diagrams'` to the `source` enum: `enum: ['code', 'knowledge', 'git', 'business-signals', 'diagrams', 'all']`
   - Add dispatch block:
     ```typescript
     if (input.source === 'diagrams' || input.source === 'all') {
       const { DiagramParser } = await import('@harness-engineering/graph');
       const diagramParser = new DiagramParser(store);
       const diagramResult = await diagramParser.ingest(projectPath);
       results.push(diagramResult);
     }
     ```

7. Run: `npx harness validate`
8. Commit: `feat(graph): add DiagramParser orchestrator and ingest-source integration`

### Task 4: StructuralDriftDetector (TDD)

**Depends on:** none
**Files:** `packages/graph/src/ingest/StructuralDriftDetector.ts`, `packages/graph/tests/ingest/StructuralDriftDetector.test.ts`

1. Create test file `packages/graph/tests/ingest/StructuralDriftDetector.test.ts`:

   ```typescript
   describe('StructuralDriftDetector', () => {
     const detector = new StructuralDriftDetector();

     it('returns zero findings for identical snapshots', () => {
       const snapshot: KnowledgeSnapshot = {
         entries: [{ id: 'fact:abc', type: 'business_fact', contentHash: 'h1', source: 'extractor', name: 'Test Rule' }],
         timestamp: new Date().toISOString(),
       };
       const result = detector.detect(snapshot, snapshot);
       expect(result.findings).toHaveLength(0);
       expect(result.driftScore).toBe(0);
     });

     it('classifies entity in fresh but not current as NEW', () => {
       const current: KnowledgeSnapshot = { entries: [], timestamp: new Date().toISOString() };
       const fresh: KnowledgeSnapshot = {
         entries: [{ id: 'fact:abc', type: 'business_fact', contentHash: 'h1', source: 'extractor', name: 'New Rule' }],
         timestamp: new Date().toISOString(),
       };
       const result = detector.detect(current, fresh);
       expect(result.findings).toHaveLength(1);
       expect(result.findings[0].classification).toBe('new');
       expect(result.findings[0].severity).toBe('low');
     });

     it('classifies entity in current but not fresh as STALE', () => { ... });

     it('classifies same ID with different contentHash as DRIFTED', () => { ... });

     it('classifies same entity from different sources with conflicting content as CONTRADICTING', () => { ... });

     it('computes driftScore as findings.length / total unique entries', () => { ... });

     it('handles empty snapshots gracefully', () => {
       const empty: KnowledgeSnapshot = { entries: [], timestamp: new Date().toISOString() };
       const result = detector.detect(empty, empty);
       expect(result.findings).toHaveLength(0);
       expect(result.driftScore).toBe(0);
     });

     it('summary counts match finding classifications', () => { ... });
   });
   ```

2. Run tests — observe failures.

3. Implement in `packages/graph/src/ingest/StructuralDriftDetector.ts`:

   ```typescript
   export type DriftClassification = 'new' | 'drifted' | 'stale' | 'contradicting';

   export interface KnowledgeSnapshotEntry {
     readonly id: string;
     readonly type: NodeType;
     readonly contentHash: string;
     readonly source: string; // 'extractor', 'linker', 'diagram', 'manual'
     readonly name: string;
   }

   export interface KnowledgeSnapshot {
     readonly entries: readonly KnowledgeSnapshotEntry[];
     readonly timestamp: string;
   }

   export interface DriftFinding {
     readonly entryId: string;
     readonly classification: DriftClassification;
     readonly current?: KnowledgeSnapshotEntry;
     readonly fresh?: KnowledgeSnapshotEntry;
     readonly severity: 'critical' | 'high' | 'medium' | 'low';
   }

   export interface DriftResult {
     readonly findings: readonly DriftFinding[];
     readonly driftScore: number;
     readonly summary: { new: number; drifted: number; stale: number; contradicting: number };
   }

   export interface DriftDetector {
     detect(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult;
   }

   export class StructuralDriftDetector implements DriftDetector {
     detect(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult {
       const findings: DriftFinding[] = [];
       const currentById = new Map(current.entries.map((e) => [e.id, e]));
       const freshById = new Map(fresh.entries.map((e) => [e.id, e]));

       // NEW: in fresh but not current
       for (const [id, entry] of freshById) {
         if (!currentById.has(id)) {
           findings.push({ entryId: id, classification: 'new', fresh: entry, severity: 'low' });
         }
       }

       // STALE: in current but not fresh
       for (const [id, entry] of currentById) {
         if (!freshById.has(id)) {
           findings.push({
             entryId: id,
             classification: 'stale',
             current: entry,
             severity: 'high',
           });
         }
       }

       // DRIFTED: in both but contentHash differs
       for (const [id, freshEntry] of freshById) {
         const currentEntry = currentById.get(id);
         if (currentEntry && currentEntry.contentHash !== freshEntry.contentHash) {
           findings.push({
             entryId: id,
             classification: 'drifted',
             current: currentEntry,
             fresh: freshEntry,
             severity: 'medium',
           });
         }
       }

       // CONTRADICTING: same name from different sources with different content
       // Group fresh entries by name, find multi-source conflicts
       const byName = new Map<string, KnowledgeSnapshotEntry[]>();
       for (const entry of fresh.entries) {
         const group = byName.get(entry.name) ?? [];
         group.push(entry);
         byName.set(entry.name, group);
       }
       for (const [, group] of byName) {
         if (group.length > 1) {
           const sources = new Set(group.map((e) => e.source));
           const hashes = new Set(group.map((e) => e.contentHash));
           if (sources.size > 1 && hashes.size > 1) {
             findings.push({
               entryId: group[0].id,
               classification: 'contradicting',
               fresh: group[0],
               severity: 'critical',
             });
           }
         }
       }

       const totalEntries = new Set([...currentById.keys(), ...freshById.keys()]).size;
       const driftScore = totalEntries > 0 ? findings.length / totalEntries : 0;

       return {
         findings,
         driftScore,
         summary: {
           new: findings.filter((f) => f.classification === 'new').length,
           drifted: findings.filter((f) => f.classification === 'drifted').length,
           stale: findings.filter((f) => f.classification === 'stale').length,
           contradicting: findings.filter((f) => f.classification === 'contradicting').length,
         },
       };
     }
   }
   ```

4. Run tests — observe pass.
5. Commit: `feat(graph): add StructuralDriftDetector with deterministic classification`

### Task 5: KnowledgeStagingAggregator + gap reporting

**Depends on:** Task 4
**Files:** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`, `packages/graph/tests/ingest/KnowledgeStagingAggregator.test.ts`

1. Create test file `packages/graph/tests/ingest/KnowledgeStagingAggregator.test.ts`:

   ```typescript
   describe('KnowledgeStagingAggregator', () => {
     let tmpDir: string;

     beforeEach(async () => {
       tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'staging-'));
     });

     afterEach(async () => {
       await fs.rm(tmpDir, { recursive: true });
     });

     it('writes pipeline-staged.jsonl with entries from all sources', async () => {
       const aggregator = new KnowledgeStagingAggregator(tmpDir);
       const result = await aggregator.aggregate(
         [{ id: 'e1', source: 'extractor', extractorName: 'test-descriptions', nodeType: 'business_rule', name: 'Rule 1', confidence: 0.7, contentHash: 'h1', timestamp: new Date().toISOString() }],
         [{ id: 'l1', source: 'linker', nodeType: 'business_fact', name: 'Fact 1', confidence: 0.6, contentHash: 'h2', timestamp: new Date().toISOString() }],
         [{ id: 'd1', source: 'diagram', nodeType: 'business_concept', name: 'Concept 1', confidence: 0.85, contentHash: 'h3', timestamp: new Date().toISOString() }],
       );
       expect(result.staged).toBe(3);
       const content = await fs.readFile(path.join(tmpDir, '.harness/knowledge/staged/pipeline-staged.jsonl'), 'utf-8');
       const lines = content.trim().split('\n');
       expect(lines).toHaveLength(3);
     });

     it('deduplicates entries with same contentHash across sources', async () => { ... });

     it('generates gaps.md with per-domain coverage scores', async () => { ... });

     it('coverage score = authoritative / (authoritative + provisional + gaps)', async () => { ... });

     it('creates staged directory if missing', async () => { ... });
   });
   ```

2. Run tests — observe failures.

3. Implement in `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`:

   ```typescript
   export interface StagedEntry {
     readonly id: string;
     readonly source: 'extractor' | 'linker' | 'diagram';
     readonly extractorName?: string;
     readonly nodeType: NodeType;
     readonly name: string;
     readonly confidence: number;
     readonly contentHash: string;
     readonly timestamp: string;
   }

   export interface DomainCoverage {
     readonly domain: string;
     readonly authoritative: number;
     readonly provisional: number;
     readonly gaps: number;
     readonly score: number;
   }

   export interface GapReport {
     readonly domains: readonly DomainCoverage[];
     readonly overallScore: number;
     readonly generatedAt: string;
   }

   export class KnowledgeStagingAggregator {
     constructor(private readonly projectDir: string) {}

     async aggregate(
       extractorResults: readonly StagedEntry[],
       linkerResults: readonly StagedEntry[],
       diagramResults: readonly StagedEntry[]
     ): Promise<{ staged: number; gaps: GapReport }> {
       // 1. Merge all entries
       // 2. Deduplicate by contentHash (keep highest confidence)
       // 3. Write to .harness/knowledge/staged/pipeline-staged.jsonl
       // 4. Generate gap report
       // 5. Write .harness/knowledge/gaps.md
     }

     async generateGapReport(store: GraphStore, knowledgeDir: string): Promise<GapReport> {
       // 1. Scan docs/knowledge/ for domain subdirectories
       // 2. Count authoritative nodes per domain (confidence === 1.0)
       // 3. Count provisional nodes per domain (confidence < 1.0)
       // 4. Estimate gaps: code files with no business knowledge edges
       // 5. Compute score: authoritative / (authoritative + provisional + gaps)
     }
   }
   ```

   Gap report markdown format:

   ```markdown
   # Knowledge Gaps Report

   Generated: 2026-04-23T...

   ## Coverage by Domain

   | Domain       | Authoritative | Provisional | Gaps | Score |
   | ------------ | ------------- | ----------- | ---- | ----- |
   | architecture | 2             | 5           | 3    | 20%   |

   ## Overall: 20%
   ```

4. Run tests — observe pass.
5. Commit: `feat(graph): add KnowledgeStagingAggregator with gap reporting`

### Task 6: Knowledge pipeline skill definition

**Depends on:** Task 3, Task 5
**Files:** `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md`

1. Create `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` following the docs-pipeline pattern.

   **Metadata:**

   ```yaml
   name: harness-knowledge-pipeline
   description: 4-phase knowledge extraction, reconciliation, drift detection, and remediation with convergence loop
   version: 1.0.0
   triggers:
     - /harness:knowledge-pipeline
   flags:
     --fix: Enable auto-remediation of safe findings (default: detect-only)
     --ci: Non-interactive mode, skip probably-safe fixes
     --domain: Limit pipeline to specific knowledge domain
   ```

   **Phase 1: EXTRACT**
   - Run `ExtractionRunner` against project (code signal extractors: test descriptions, enums, validators, API paths)
   - Run `DiagramParser.ingest()` for diagram-as-code files (Mermaid/D2/PlantUML)
   - Run `KnowledgeLinker.link()` for connector-ingested nodes (Jira/Slack/Confluence)
   - Collect all results as fresh `KnowledgeSnapshot`

   **Phase 2: RECONCILE**
   - Load current knowledge state from GraphStore as current `KnowledgeSnapshot`
   - Build snapshot entries from all `business_*` nodes in graph
   - Pass both snapshots to `StructuralDriftDetector.detect()`

   **Phase 3: DETECT**
   - Partition drift findings by severity (critical/high/medium/low)
   - Partition by safety classification:
     - `new` → safe to stage
     - `stale` → probably-safe to remove
     - `drifted` → probably-safe to update
     - `contradicting` → unsafe (requires human decision)
   - Generate drift report

   **Phase 4: REMEDIATE** (only with `--fix`)
   - Stage `new` findings via `KnowledgeStagingAggregator` (safe — auto-apply)
   - Present `drifted`/`stale` findings for approval (skip in `--ci`)
   - Surface `contradicting` findings — never auto-resolve
   - Re-run EXTRACT → DETECT to check convergence

   **Convergence Loop (wraps Phase 4):**

   ```
   maxIterations = 5
   previousCount = findings.length

   while iteration < maxIterations:
     1. Apply safe remediations
     2. Present probably-safe remediations (skip in --ci)
     3. Log unsafe findings (never auto-apply)
     4. Re-run EXTRACT + RECONCILE + DETECT
     5. newCount = remaining findings
     6. if newCount >= previousCount: STOP (converged)
     7. previousCount = newCount; iteration++
   ```

   **Shared Context Object:**

   ```typescript
   interface KnowledgePipelineContext {
     extractionSnapshot: KnowledgeSnapshot;
     currentSnapshot: KnowledgeSnapshot;
     driftResult: DriftResult;
     gapReport: GapReport;
     remediationsApplied: string[];
     iteration: number;
     verdict: 'pass' | 'warn' | 'fail';
   }
   ```

   **Verdict Rules:**
   - `pass`: zero unresolved findings after pipeline
   - `warn`: only `new` findings remain (low severity)
   - `fail`: any `contradicting`, `stale`, or `drifted` findings remain

   **Output:** Structured report with drift findings, gap scores, remediation actions taken, and verdict.

2. Commit: `feat(skills): add harness-knowledge-pipeline skill definition`

### Task 7: CLI command + integration tests + exports

**Depends on:** Task 6
**Files:** `packages/cli/src/commands/knowledge-pipeline.ts`, `packages/graph/tests/integration/knowledge-pipeline.test.ts`, `packages/graph/src/index.ts`

1. Add remaining exports to `packages/graph/src/index.ts`:

   ```typescript
   export { StructuralDriftDetector } from './ingest/StructuralDriftDetector.js';
   export type {
     DriftDetector,
     DriftResult,
     DriftFinding,
     DriftClassification,
     KnowledgeSnapshot,
     KnowledgeSnapshotEntry,
   } from './ingest/StructuralDriftDetector.js';
   export { KnowledgeStagingAggregator } from './ingest/KnowledgeStagingAggregator.js';
   export type {
     StagedEntry,
     GapReport,
     DomainCoverage,
   } from './ingest/KnowledgeStagingAggregator.js';
   ```

2. Create `packages/cli/src/commands/knowledge-pipeline.ts` following existing command pattern:

   ```typescript
   import { Command } from 'commander';

   interface KnowledgePipelineOptions {
     cwd?: string;
     fix?: boolean;
     ci?: boolean;
     domain?: string;
     driftCheck?: boolean;
   }

   export function registerKnowledgePipelineCommand(program: Command): void {
     program
       .command('knowledge-pipeline')
       .description('Run knowledge extraction, drift detection, and gap analysis')
       .option('--fix', 'Enable auto-remediation of safe findings')
       .option('--ci', 'Non-interactive mode')
       .option('--domain <domain>', 'Limit to specific knowledge domain')
       .option('--drift-check', 'Exit 1 if unresolved drift exists (for CI gates)')
       .action(async (options: KnowledgePipelineOptions) => {
         const projectDir = options.cwd ?? process.cwd();
         // 1. Load GraphStore from .harness/graph/
         // 2. Build current KnowledgeSnapshot from graph business_* nodes
         // 3. Run extraction:
         //    a. ExtractionRunner.run() → code signals
         //    b. DiagramParser.ingest() → diagram entities
         //    c. KnowledgeLinker.link() → connector knowledge
         // 4. Build fresh KnowledgeSnapshot from extraction results
         // 5. StructuralDriftDetector.detect(current, fresh)
         // 6. KnowledgeStagingAggregator.aggregate(...)
         // 7. If --fix: convergence loop (max 5 iterations)
         // 8. Print report (drift findings, gap scores, verdict)
         // 9. If --drift-check && unresolved findings: process.exit(1)
       });
   }
   ```

3. Register command in CLI command registry.

4. Create integration test `packages/graph/tests/integration/knowledge-pipeline.test.ts`:

   ```typescript
   describe('Knowledge Pipeline (integration)', () => {
     let store: GraphStore;
     let fixturesDir: string;

     beforeEach(async () => {
       store = new GraphStore();
       fixturesDir = path.resolve(__dirname, '../__fixtures__');
     });

     it('extracts from code signals + diagrams into unified snapshot', async () => {
       // Run ExtractionRunner against sample-project
       // Run DiagramParser against __fixtures__/diagrams/
       // Assert: combined results include nodes from both sources
       const runner = createExtractionRunner();
       const extractedDir = path.join(os.tmpdir(), 'extracted-test');
       const codeResult = await runner.run(
         path.join(fixturesDir, 'sample-project'),
         store,
         extractedDir
       );
       expect(codeResult.nodesAdded).toBeGreaterThan(0);

       const diagramParser = new DiagramParser(store);
       const diagramResult = await diagramParser.ingest(path.join(fixturesDir, 'diagrams'));
       expect(diagramResult.nodesAdded).toBeGreaterThan(0);
     });

     it('detects new knowledge when fresh extraction finds entities not in graph', async () => {
       // Empty graph → run extraction → all findings classified as 'new'
       const detector = new StructuralDriftDetector();
       const current: KnowledgeSnapshot = { entries: [], timestamp: new Date().toISOString() };
       // ... build fresh snapshot from extraction
       const result = detector.detect(current, fresh);
       expect(result.summary.new).toBeGreaterThan(0);
       expect(result.summary.stale).toBe(0);
     });

     it('detects stale knowledge when graph has entries absent from extraction', async () => {
       // Pre-populate graph with synthetic business_fact
       // Run extraction (which won't find that fact)
       // Assert: drift finding classified as 'stale'
     });

     it('generates gap report with per-domain coverage', async () => {
       // Set up docs/knowledge/ structure in temp dir
       // Run pipeline
       // Assert: gaps.md exists with coverage table
     });

     it('convergence loop stops when finding count does not decrease', async () => {
       // Inject contradicting findings (cannot be auto-resolved)
       // Run convergence loop
       // Assert: loop terminates in ≤ 2 iterations (1st run + 1 re-check)
     });
   });
   ```

5. Run full test suite: `cd packages/graph && npx vitest run`
6. Run: `npx harness validate`
7. Commit: `feat(cli): add knowledge-pipeline command with integration tests`

## PESL Mitigation Summary

| PESL Concern                                   | Mitigation in Plan                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration Failure (diagram IR serialization) | `DiagramParseResult` is a simple readonly data interface — entities and relationships. No serialization between formats. Each parser produces the same shape, mapped to existing `business_concept` nodes and `references` edges. (Tasks 1-3)                                                                                                        |
| Logical Error (drift detection ambiguity)      | `StructuralDriftDetector` uses deterministic stable IDs and set-difference comparison. Four classifications explicitly defined: `new` (in fresh, not current), `drifted` (same ID, different hash), `stale` (in current, not fresh), `contradicting` (same name, different sources, different content). Severity mapped per classification. (Task 4) |
| API/Contract Failure (multi-format input)      | File-extension-based format detection via `canParse(content, ext)` guards. No multi-format API endpoint — staging workflow is file-based JSONL. Format detection is deterministic: `.mmd`→Mermaid, `.d2`→D2, `.puml`→PlantUML. Unknown extensions return empty results. (Tasks 1-3)                                                                  |
| Test gap: Knowledge Pipeline Engine            | TDD for every task. 5 test files: `DiagramParser.test.ts`, `StructuralDriftDetector.test.ts`, `KnowledgeStagingAggregator.test.ts`, `knowledge-pipeline.test.ts` (integration). Tests written before implementation. (All tasks)                                                                                                                     |
| Test gap: Diagram Parser Service               | `DiagramParser.test.ts` covers all 3 format parsers + orchestrator + graph integration with fixture diagrams. 20+ individual test cases. (Tasks 1-3)                                                                                                                                                                                                 |
