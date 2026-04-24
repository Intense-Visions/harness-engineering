# Knowledge Pipeline & Diagrams

## Overview

Complete the `/harness:knowledge-pipeline` skill implementation — a 4-phase convergence loop (EXTRACT, RECONCILE, DETECT, REMEDIATE) that orchestrates all existing knowledge infrastructure (code signal extractors, diagram-as-code parser, KnowledgeLinker, drift detector, staging aggregator) into a unified pipeline with `--fix` auto-remediation, `--ci` non-interactive mode, `--domain` filtering, and gap reporting.

## Decisions Made

1. **Library-first architecture:** Pipeline orchestration logic lives in `KnowledgePipelineRunner` class in the graph package (`packages/graph/src/ingest/`), not in the CLI command. CLI is a thin wrapper. Follows the established pattern of ExtractionRunner, CascadeSimulator, and other graph-package classes.

2. **Convergence loop pattern:** Max 5 iterations. After each remediation pass, re-run EXTRACT + RECONCILE + DETECT. Stop when finding count doesn't decrease. Follows the docs-pipeline convergence pattern.

3. **Snapshot separation:** Current snapshot is built from graph state _before_ extraction. Fresh snapshot is built from extraction results. The existing CLI command incorrectly builds both from the same post-extraction state.

4. **Safety classification:** NEW → stage automatically. STALE → auto-remove (probably-safe). DRIFTED → prompt for confirmation (probably-safe). CONTRADICTING → never auto-resolve (unsafe). Matches SKILL.md Iron Law.

## Technical Design

### New Files

| File                                                          | Purpose                                             |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `packages/graph/src/ingest/KnowledgePipelineRunner.ts`        | 4-phase pipeline orchestrator with convergence loop |
| `packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts` | Unit tests for the runner                           |

### Modified Files

| File                                                          | Change                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/cli/src/commands/knowledge-pipeline.ts`             | Rewrite to use KnowledgePipelineRunner, add `--fix`/`--ci`/`--domain` flags |
| `packages/graph/src/index.ts`                                 | Export KnowledgePipelineRunner and types                                    |
| `packages/graph/tests/integration/knowledge-pipeline.test.ts` | Add convergence loop and remediation tests                                  |

### KnowledgePipelineRunner API

```typescript
interface KnowledgePipelineOptions {
  projectDir: string;
  fix: boolean;      // Enable convergence-based auto-remediation
  ci: boolean;       // Non-interactive mode
  domain?: string;   // Limit to specific knowledge domain
  graphDir?: string;  // Override graph directory
  maxIterations?: number; // Default: 5
}

interface KnowledgePipelineResult {
  verdict: 'pass' | 'warn' | 'fail';
  driftScore: number;
  iterations: number;
  findings: DriftResult['summary'];
  extraction: { codeSignals: number; diagrams: number; linkerFacts: number };
  gaps: GapReport;
  remediations: string[];
}

class KnowledgePipelineRunner {
  constructor(private store: GraphStore);
  async run(options: KnowledgePipelineOptions): Promise<KnowledgePipelineResult>;
}
```

### Phase Flow

1. **EXTRACT:** Run ExtractionRunner + DiagramParser + BusinessKnowledgeIngestor + KnowledgeLinker. Build fresh snapshot from newly-added nodes.
2. **RECONCILE:** Build current snapshot from pre-extraction graph state. Run StructuralDriftDetector.detect(current, fresh).
3. **DETECT:** Partition findings by classification. Generate gap report via KnowledgeStagingAggregator. Write gaps.md.
4. **REMEDIATE (only with --fix):** Stage NEW findings. Remove STALE nodes from graph. Skip DRIFTED and CONTRADICTING in --ci mode. Re-run pipeline if finding count decreased. Max 5 iterations.

## Success Criteria

1. `harness knowledge-pipeline` runs all 4 phases and reports verdict (pass/warn/fail)
2. `--fix` enables convergence-based auto-remediation with max 5 iterations
3. `--ci` runs fully non-interactive, applies safe fixes only
4. `--domain` limits pipeline to a specific knowledge domain
5. `--drift-check` exits 1 on unresolved drift (CI gate)
6. Current vs fresh snapshots are properly separated
7. KnowledgeLinker and BusinessKnowledgeIngestor are integrated into the pipeline
8. Gap report written to `.harness/knowledge/gaps.md`
9. Staged entries written to `.harness/knowledge/staged/pipeline-staged.jsonl`
10. All existing integration tests pass; new tests cover convergence and remediation

## Implementation Order

1. Create KnowledgePipelineRunner with phase 1-3 (extract, reconcile, detect)
2. Add phase 4 (remediate) with convergence loop
3. Add domain filtering
4. Rewrite CLI command to use KnowledgePipelineRunner
5. Update graph package exports
6. Add unit and integration tests
