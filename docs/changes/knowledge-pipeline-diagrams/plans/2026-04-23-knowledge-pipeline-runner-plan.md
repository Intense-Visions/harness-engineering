# Plan: Knowledge Pipeline Runner

**Date:** 2026-04-23 | **Spec:** docs/changes/knowledge-pipeline-diagrams/proposal.md | **Tasks:** 6 | **Time:** ~30 min

## Goal

Complete the `/harness:knowledge-pipeline` skill by creating a `KnowledgePipelineRunner` class that orchestrates the 4-phase convergence loop (EXTRACT, RECONCILE, DETECT, REMEDIATE) and rewriting the CLI command to use it with `--fix`, `--ci`, and `--domain` flags.

## Observable Truths (Acceptance Criteria)

1. `harness knowledge-pipeline` runs all 4 phases and prints verdict (pass/warn/fail) with drift score, findings summary, extraction counts, and gap report
2. When `--fix` is passed, the pipeline applies safe remediations (stage NEW, remove STALE) and re-runs until finding count stops decreasing or max 5 iterations
3. When `--ci` is passed, only safe fixes are applied; drifted and contradicting findings are reported without prompting
4. When `--domain payments` is passed, only knowledge entries in the `payments` domain are included in drift detection
5. When `--drift-check` is passed and unresolved drift exists, the process exits with code 1
6. `npx vitest run packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts` passes
7. Existing integration tests in `packages/graph/tests/integration/knowledge-pipeline.test.ts` continue to pass
8. `KnowledgePipelineRunner` is exported from `@harness-engineering/graph`

## File Map

- CREATE `packages/graph/src/ingest/KnowledgePipelineRunner.ts`
- CREATE `packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`
- MODIFY `packages/graph/src/index.ts` (add exports)
- MODIFY `packages/cli/src/commands/knowledge-pipeline.ts` (rewrite to use runner)

## Tasks

### Task 1: Create KnowledgePipelineRunner with 4-phase orchestration

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`

1. Create `packages/graph/src/ingest/KnowledgePipelineRunner.ts` with:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult, NodeType } from '../types.js';
import { BusinessKnowledgeIngestor } from './BusinessKnowledgeIngestor.js';
import { DiagramParser } from './DiagramParser.js';
import { KnowledgeLinker } from './KnowledgeLinker.js';
import {
  StructuralDriftDetector,
  type KnowledgeSnapshot,
  type KnowledgeSnapshotEntry,
  type DriftResult,
  type DriftFinding,
} from './StructuralDriftDetector.js';
import {
  KnowledgeStagingAggregator,
  type GapReport,
  type StagedEntry,
} from './KnowledgeStagingAggregator.js';
import { createExtractionRunner } from './extractors/index.js';

const BUSINESS_NODE_TYPES: readonly NodeType[] = [
  'business_concept',
  'business_rule',
  'business_process',
  'business_term',
  'business_metric',
  'business_fact',
];

export interface KnowledgePipelineOptions {
  readonly projectDir: string;
  readonly fix: boolean;
  readonly ci: boolean;
  readonly domain?: string;
  readonly graphDir?: string;
  readonly maxIterations?: number;
}

export interface KnowledgePipelineResult {
  readonly verdict: 'pass' | 'warn' | 'fail';
  readonly driftScore: number;
  readonly iterations: number;
  readonly findings: DriftResult['summary'];
  readonly extraction: {
    readonly codeSignals: number;
    readonly diagrams: number;
    readonly linkerFacts: number;
    readonly businessKnowledge: number;
  };
  readonly gaps: GapReport;
  readonly remediations: readonly string[];
}

export class KnowledgePipelineRunner {
  constructor(private readonly store: GraphStore) {}

  async run(options: KnowledgePipelineOptions): Promise<KnowledgePipelineResult> {
    const maxIterations = options.maxIterations ?? 5;
    const remediations: string[] = [];
    let iterations = 0;
    let previousFindingCount = Infinity;

    // Capture pre-extraction snapshot (current state of graph)
    let currentSnapshot = this.buildSnapshot(options.domain);

    // Run pipeline phases
    let extraction = await this.extract(options);
    let freshSnapshot = this.buildSnapshot(options.domain);
    let driftResult = this.reconcile(currentSnapshot, freshSnapshot);
    let gapReport = await this.detect(options);

    if (options.fix) {
      while (iterations < maxIterations) {
        iterations++;
        const findingCount = driftResult.findings.length;

        if (findingCount === 0 || findingCount >= previousFindingCount) {
          break; // Converged or no progress
        }
        previousFindingCount = findingCount;

        // Apply safe remediations
        this.remediate(driftResult, remediations, options);

        // Re-run pipeline
        currentSnapshot = this.buildSnapshot(options.domain);
        extraction = await this.extract(options);
        freshSnapshot = this.buildSnapshot(options.domain);
        driftResult = this.reconcile(currentSnapshot, freshSnapshot);
        gapReport = await this.detect(options);
      }
    }

    // Stage NEW findings
    await this.stageNewFindings(driftResult, options);

    const verdict = this.computeVerdict(driftResult);

    return {
      verdict,
      driftScore: driftResult.driftScore,
      iterations: Math.max(iterations, 1),
      findings: driftResult.summary,
      extraction,
      gaps: gapReport,
      remediations,
    };
  }

  private async extract(
    options: KnowledgePipelineOptions
  ): Promise<KnowledgePipelineResult['extraction']> {
    const extractedDir = path.join(options.projectDir, '.harness', 'knowledge', 'extracted');
    await fs.mkdir(extractedDir, { recursive: true });

    // Code signal extractors
    const runner = createExtractionRunner();
    const extractionResult = await runner.run(options.projectDir, this.store, extractedDir);

    // Diagram parsers
    const diagramParser = new DiagramParser(this.store);
    const diagramResult = await diagramParser.ingest(options.projectDir);

    // Business knowledge ingestor
    const knowledgeDir = path.join(options.projectDir, 'docs', 'knowledge');
    const bkIngestor = new BusinessKnowledgeIngestor(this.store);
    let bkResult: IngestResult = {
      nodesAdded: 0,
      nodesUpdated: 0,
      edgesAdded: 0,
      edgesUpdated: 0,
      errors: [],
      durationMs: 0,
    };
    try {
      bkResult = await bkIngestor.ingest(knowledgeDir);
    } catch {
      // docs/knowledge/ may not exist — skip silently
    }

    // Knowledge linker
    const linker = new KnowledgeLinker(this.store, extractedDir);
    const linkResult = await linker.link();

    return {
      codeSignals: extractionResult.nodesAdded,
      diagrams: diagramResult.nodesAdded,
      linkerFacts: linkResult.factsCreated,
      businessKnowledge: bkResult.nodesAdded,
    };
  }

  private buildSnapshot(domain?: string): KnowledgeSnapshot {
    let nodes = BUSINESS_NODE_TYPES.flatMap((type) => this.store.findNodes({ type }));

    if (domain) {
      nodes = nodes.filter((n) => (n.metadata?.domain as string) === domain);
    }

    return {
      entries: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        contentHash: n.hash ?? n.id,
        source: (n.metadata?.source as string) ?? 'unknown',
        name: n.name,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  private reconcile(current: KnowledgeSnapshot, fresh: KnowledgeSnapshot): DriftResult {
    const detector = new StructuralDriftDetector();
    return detector.detect(current, fresh);
  }

  private async detect(options: KnowledgePipelineOptions): Promise<GapReport> {
    const knowledgeDir = path.join(options.projectDir, 'docs', 'knowledge');
    const aggregator = new KnowledgeStagingAggregator(options.projectDir);
    const gapReport = await aggregator.generateGapReport(knowledgeDir);
    await aggregator.writeGapReport(gapReport);
    return gapReport;
  }

  private remediate(
    driftResult: DriftResult,
    remediations: string[],
    options: KnowledgePipelineOptions
  ): void {
    for (const finding of driftResult.findings) {
      switch (finding.classification) {
        case 'stale':
          // Auto-remove stale nodes (source gone)
          this.store.removeNode(finding.entryId);
          remediations.push(`removed stale: ${finding.entryId}`);
          break;
        case 'new':
          // Staged separately via stageNewFindings
          break;
        case 'drifted':
          // In CI mode: skip (report only). Otherwise would prompt user.
          if (!options.ci) {
            remediations.push(`flagged drifted: ${finding.entryId}`);
          }
          break;
        case 'contradicting':
          // Never auto-resolve
          break;
      }
    }
  }

  private async stageNewFindings(
    driftResult: DriftResult,
    options: KnowledgePipelineOptions
  ): Promise<void> {
    const newFindings = driftResult.findings.filter((f) => f.classification === 'new');
    if (newFindings.length === 0) return;

    const stagedEntries: StagedEntry[] = newFindings
      .filter((f): f is DriftFinding & { fresh: KnowledgeSnapshotEntry } => f.fresh != null)
      .map((f) => ({
        id: f.fresh.id,
        source: (f.fresh.source === 'extractor' ||
        f.fresh.source === 'linker' ||
        f.fresh.source === 'diagram'
          ? f.fresh.source
          : 'extractor') as 'extractor' | 'linker' | 'diagram',
        nodeType: f.fresh.type,
        name: f.fresh.name,
        confidence: 0.7,
        contentHash: f.fresh.contentHash,
        timestamp: new Date().toISOString(),
      }));

    const aggregator = new KnowledgeStagingAggregator(options.projectDir);
    await aggregator.aggregate(stagedEntries, [], []);
  }

  private computeVerdict(driftResult: DriftResult): 'pass' | 'warn' | 'fail' {
    const { summary } = driftResult;
    const unresolved = summary.drifted + summary.stale + summary.contradicting;

    if (unresolved === 0 && summary.new === 0) return 'pass';
    if (unresolved === 0) return 'warn';
    return 'fail';
  }
}
```

2. Run: `cd packages/graph && npx tsc --noEmit`
3. Commit: `feat(graph): add KnowledgePipelineRunner with 4-phase convergence loop`

---

### Task 2: Write unit tests for KnowledgePipelineRunner

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`

1. Create test file covering: verdict computation, convergence loop termination, domain filtering, stale remediation, NEW staging, CI mode behavior.

2. Run: `npx vitest run packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`
3. Observe pass.
4. Commit: `test(graph): add KnowledgePipelineRunner unit tests`

---

### Task 3: Rewrite CLI command to use KnowledgePipelineRunner

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/knowledge-pipeline.ts`

1. Rewrite the CLI command to:
   - Import and use `KnowledgePipelineRunner` from `@harness-engineering/graph`
   - Add `--fix`, `--ci`, `--domain` flags
   - Keep existing `--drift-check` flag
   - Keep `--json` output mode
   - Print human-readable report in non-JSON mode

2. Run: `cd packages/cli && npx tsc --noEmit`
3. Commit: `feat(cli): rewrite knowledge-pipeline command with full pipeline runner`

---

### Task 4: Update graph package exports

**Depends on:** Task 1 | **Files:** `packages/graph/src/index.ts`

1. Add exports for `KnowledgePipelineRunner` and its types to `packages/graph/src/index.ts`.

2. Run: `cd packages/graph && npx tsc --noEmit`
3. Commit: `feat(graph): export KnowledgePipelineRunner and types`

---

### Task 5: Update integration tests

**Depends on:** Task 1 | **Files:** `packages/graph/tests/integration/knowledge-pipeline.test.ts`

1. Add tests for:
   - Full pipeline run with KnowledgePipelineRunner (detect-only mode)
   - Pipeline with `--fix` convergence loop
   - Domain filtering
   - CI mode

2. Run: `npx vitest run packages/graph/tests/integration/knowledge-pipeline.test.ts`
3. Observe pass.
4. Commit: `test(graph): add KnowledgePipelineRunner integration tests`

---

### Task 6: Verify build and existing tests

**Depends on:** Tasks 1-5 | **Files:** none

1. Run: `pnpm run build`
2. Run: `pnpm run test`
3. Verify all tests pass and build succeeds.
4. Run: `harness validate` (if available)
