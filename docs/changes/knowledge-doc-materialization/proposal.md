# Knowledge Document Materialization

**Date:** 2026-04-25
**Status:** Proposed
**Parent:** [Knowledge Pipeline & Diagrams](../knowledge-pipeline-diagrams/proposal.md)
**Scope:** Extend knowledge pipeline to materialize `docs/knowledge/` files from extracted findings and integrate into standard workflow

## Overview

The knowledge pipeline extracts business rules, processes, and concepts from PRDs, code, diagrams, and connectors into the graph. But it never creates `docs/knowledge/{domain}/*.md` files. Findings end up staged as JSONL and loaded into the graph, while the human-readable knowledge docs are never generated. The gap report only counts existing files without comparing against what was extracted.

This proposal adds:

1. A **differential gap report** that compares extracted graph nodes against documented knowledge entries
2. A **KnowledgeDocMaterializer** that creates `docs/knowledge/` files from undocumented graph nodes
3. **Workflow integration** into planning, execution, and autopilot skills for knowledge-driven development

### Non-goals

- Replacing manual knowledge authoring — materialized docs are first drafts from extraction
- Auto-resolving contradictions — Iron Law preserved (human decides)
- Modifying existing knowledge docs — only creates new ones for undocumented entries
- PRD-specific extraction — uses whatever nodes exist in the graph from any source

## Decisions

| Decision              | Choice                                                        | Rationale                                                                                                  |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Gap comparison method | Name-matching between graph nodes and doc `# Title` headings  | IDs differ between extracted nodes (`extracted:*`) and ingested docs (`bk:*`); names are the semantic link |
| One doc per finding   | Yes, one `.md` file per graph node                            | Matches BusinessKnowledgeIngestor pattern (one file = one graph node); cleaner diffing and updates         |
| CI mode behavior      | Dry run — report what would be created, write nothing         | Docs are user-facing files that deserve human review                                                       |
| Thin finding handling | Skip materialization for nodes with <10 chars content         | A doc with only a title is worse than no doc (false coverage)                                              |
| business_fact mapping | Map to business_rule/business_concept/business_metric         | business_fact is not in BusinessKnowledgeIngestor's valid type set; must map for round-trip                |
| Safety cap            | Max 50 docs per run (configurable)                            | Prevents runaway materialization from large diagram/code extractions                                       |
| Workflow position     | Knowledge baseline during planning, before task decomposition | "TDD for knowledge" — establish truth from PRDs before writing code                                        |

## Technical Design

### New Files

| File                                                           | Purpose                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/graph/src/ingest/KnowledgeDocMaterializer.ts`        | Materializes graph nodes into `docs/knowledge/` markdown files |
| `packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts` | Unit tests for the materializer                                |

### Modified Files

| File                                                          | Change                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`     | Expand types for differential gap report; add store-aware comparison |
| `packages/graph/src/ingest/KnowledgePipelineRunner.ts`        | Async remediate; wire materializer; pass store to gap report         |
| `packages/cli/src/commands/knowledge-pipeline.ts`             | Update output for differential gaps and materialization results      |
| `packages/graph/src/index.ts`                                 | Export KnowledgeDocMaterializer and new types                        |
| `packages/graph/tests/integration/knowledge-pipeline.test.ts` | Add materialization and convergence tests                            |
| `agents/skills/claude-code/harness-planning/SKILL.md`         | Add Phase 1.5 KNOWLEDGE BASELINE                                     |
| `agents/skills/claude-code/harness-autopilot/SKILL.md`        | Add knowledge gap signal to APPROVE_PLAN                             |
| `agents/skills/claude-code/harness-execution/SKILL.md`        | Add knowledge check in PREPARE, reconciliation in PERSIST            |

### KnowledgeDocMaterializer API

```typescript
interface MaterializeOptions {
  readonly projectDir: string;
  readonly dryRun: boolean;
  readonly maxDocs?: number; // Default: 50
}

interface MaterializeResult {
  readonly created: readonly MaterializedDoc[];
  readonly skipped: readonly SkippedEntry[];
}

interface MaterializedDoc {
  readonly filePath: string;
  readonly nodeId: string;
  readonly domain: string;
  readonly name: string;
}

interface SkippedEntry {
  readonly nodeId: string;
  readonly name: string;
  readonly reason: 'no_content' | 'no_domain' | 'already_documented' | 'dry_run' | 'cap_reached';
}

class KnowledgeDocMaterializer {
  constructor(store: GraphStore);
  materialize(gapEntries: GapEntry[], options: MaterializeOptions): Promise<MaterializeResult>;
}
```

### Expanded Gap Report Types

```typescript
interface GapEntry {
  readonly nodeId: string;
  readonly name: string;
  readonly nodeType: NodeType;
  readonly source: string;
  readonly hasContent: boolean;
}

interface DomainCoverage {
  readonly domain: string;
  readonly entryCount: number;
  readonly extractedCount: number;
  readonly gapCount: number;
  readonly gapEntries: readonly GapEntry[];
}

interface GapReport {
  readonly domains: readonly DomainCoverage[];
  readonly totalEntries: number;
  readonly totalExtracted: number;
  readonly totalGaps: number;
  readonly generatedAt: string;
}
```

### Convergence Loop with Materialization

```
Iteration 1:
  EXTRACT → 15 nodes in graph, 0 docs
  DETECT  → gap report: 0 documented / 15 extracted / 12 materializable gaps
  REMEDIATE → materializer creates 12 docs in docs/knowledge/

Iteration 2:
  EXTRACT → BusinessKnowledgeIngestor ingests 12 new docs → 27 nodes total
  DETECT  → gap report: 12 documented / 15 extracted (matched by name) / 0 gaps
  → Convergence reached
```

### Workflow Integration — Knowledge-Driven Development

The knowledge pipeline integrates into the standard harness workflow at four points:

#### A. Planning: Phase 1.5 KNOWLEDGE BASELINE (before DECOMPOSE)

After scoping (deriving observable truths and uncertainties), run the knowledge pipeline to materialize domain knowledge from PRDs/specs before decomposing into tasks. Tasks then reference specific knowledge docs they implement.

#### B. Autopilot: APPROVE_PLAN Knowledge Gate

Add knowledge health as an approval signal. If `totalGaps > 0` and `--fix` was not run during planning, surface as a pause signal in standard/thorough mode. Auto-approved in fast mode.

#### C. Execution: PREPARE Knowledge Verification

After verifying prerequisites, run knowledge pipeline in detect-only mode for plan domains. Contradictions (critical severity) block execution. Gaps surface as warnings.

#### D. Execution: PERSIST Knowledge Reconciliation

After code changes committed, extract new business signals from the code (validation rules, API contracts, test descriptions) and stage for future materialization.

## Success Criteria

1. `harness knowledge-pipeline` shows differential gap report: `N documented / M extracted / K gaps`
2. `harness knowledge-pipeline --fix` creates `docs/knowledge/{domain}/*.md` files from undocumented graph nodes
3. Materialized docs have correct frontmatter parseable by BusinessKnowledgeIngestor
4. Convergence loop reduces gap count across iterations as materialized docs are re-ingested
5. CI mode reports gaps but does not create files
6. Thin findings (no content) are skipped with clear reporting
7. Filename collisions handled with `-2`, `-3` suffixes
8. Planning skill materializes knowledge baseline before task decomposition
9. Autopilot surfaces knowledge gap signal in APPROVE_PLAN
10. All existing tests pass; new tests cover materialization, differential gaps, and convergence

<!-- complexity: medium -->

## Implementation Order

### Phase 1: Differential Gap Report

<!-- complexity: low -->

Expand `KnowledgeStagingAggregator` types and logic to compare extracted graph nodes against documented knowledge entries by name. Update `writeGapReport` markdown template. Backward-compatible — existing behavior preserved when store not provided.

### Phase 2: Knowledge Document Materializer

<!-- complexity: medium -->

Create `KnowledgeDocMaterializer` class with domain inference, filename generation, frontmatter formatting, and round-trip compatibility with `BusinessKnowledgeIngestor`. Include unit tests.

### Phase 3: Pipeline Integration

<!-- complexity: medium -->

Wire materializer into `KnowledgePipelineRunner` remediation phase. Make `remediate()` async. Pass store to gap report. Add `materialization` field to pipeline result. Update CLI output. Update graph package exports.

### Phase 4: Workflow Integration

<!-- complexity: low -->

Update planning, execution, and autopilot SKILL.md files to call knowledge pipeline at appropriate points. Add knowledge gap signal to autopilot approval, knowledge baseline step to planning, and knowledge check/reconciliation to execution.
