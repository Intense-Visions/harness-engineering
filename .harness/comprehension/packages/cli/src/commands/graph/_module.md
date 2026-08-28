---
schemaVersion: 1
module: 'packages/cli/src/commands/graph'
sourceHash: '7debd26e85b37343a1ca3fd83972da1921eea2e750287b77d460242cbaaf1301'
compiledAt: '2026-08-28T01:22:08.846Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'bench-judge.test.ts',
    'bench-judge.ts',
    'bench.test.ts',
    'bench.ts',
    'deprecated-aliases.ts',
    'export.ts',
    'index.ts',
    'ingest-options.ts',
    'ingest.ts',
    'integrity.ts',
    'query.ts',
    'scan.ts',
    'status.ts',
  ]
---

## Summary

The `packages/cli/src/commands/graph` module implements the knowledge graph management command group for the Harness CLI. It provides a suite of graph operations organized into two categories:

**Lifecycle Operations** (`scan`, `ingest`, `export`, `status`): Build, update, and inspect the persisted knowledge graph store. `scan` discovers and ingests source code structure; `ingest` pulls external data into the graph; `export` serializes to JSON/Mermaid; `status` reports statistics and connector sync health.

**Query & Analysis Operations** (`query`, `integrity`, `bench`): Execute graph traversals and validate graph content. `query` (and its sibling `path`) execute scoped graph queries using ContextQL with configurable depth/filters. `integrity` detects extractor debris and connector abstentions that signal untrusted content. `bench` measures the cost efficiency of graph-based retrieval against naive file-by-file strategies, with optional answer-quality judging via an LLM provider.

The benchmark is the module's architectural centerpiece: it deterministically measures _token count_ (chars/4), _tool calls_, and optionally _answer sufficiency_ for both strategies, comparing the shipped graph MCP tools (`handleGetImpact`, `handleComputeBlastRadius`, etc.) against a simulated graph-less agent doing keyword/grep/import traversal. Quality grades degrade honestly to INCONCLUSIVE when no judge is reachable, preserving benchmark determinism and honesty.

## Invariants

- Honest verdict degradation in bench-judge: Any provider rejection or malformed response yields sufficient:null (INCONCLUSIVE) rather than fabricating a score; the grade never throws, and judges cannot be tricked with extra keys (strict Zod parsing prevents authority injection).
- Identical token estimators for both strategies: Both graph and naive payloads use chars/4 so the token-savings ratio is semantically meaningful; the estimator is inlined to avoid benchmark-specific barrel dependencies.
- Bounded payload budget for fair judgment: Judge sees exactly the same 12,000-char budget for both strategies (with deterministic truncation), so quality verdict comparisons are not confounded by asymmetric context windows.
- Zero denominator vs. clean pass distinction: When a check inspects nothing, it exits ZERO_DENOMINATOR (not success), matching check-docs precedent; ensures 'read nothing' is distinguishable from 'verified and passed' in CI.
- Sync metadata is read in full for integrity checks: Deliberately distinct from status reader, which narrows to bare timestamps; integrity check must see errors and counts to detect unseen connector failures (#1336).
- Benchmark comparator target is the arXiv figure, not README: Reported as 'NOT the flattering 99.2%' to preserve honest benchmarking; measured numbers stand regardless of whether they're flattering.

## Interface Contract

```ts
export createGraphCommand
export printGraphIntegrity
export runGraphExport
export runGraphIntegrity
export runGraphStatus
export runIngest
export runQuery
export runScan
export runShortestPath
```

## Dependency Slice

```
import { AnalysisConfigSchema } from '../../config/analysis-schema.js'
import { IngestConfigSchema } from '../../config/ingest-schema.js'
import { handleCodeOutline } from '../../mcp/tools/code-nav.js'
import { handleAskGraph, handleComputeBlastRadius, handleFindContextFor, handleGetImpact, handleQueryGraph } from '../../mcp/tools/graph/index.js'
import { resolveAnalysisProvider } from '../../mcp/utils/analysis-provider.js'
import from '../../mcp/utils/graph-loader.js'
import { ExitCode } from '../../utils/errors.js'
import { BenchJudge, JUDGE_PAYLOAD_CHAR_BUDGET, QualityGrade, buildBenchJudge, resolveBenchJudge } from './bench-judge.js'
import { GraphBenchResult, benchQueryFor, createBenchCommand, estimateBenchTokens, formatBenchReport, runGraphBench } from './bench.js'
import { runGraphExport } from './export.js'
import { loadIngestOptions } from './ingest-options.js'
import { createIngestCommand } from './ingest.js'
import { printGraphIntegrity, runGraphIntegrity } from './integrity.js'
import { createPathCommand, createQueryCommand } from './query.js'
import { createScanCommand, runScan } from './scan.js'
import { runGraphStatus } from './status.js'
import from '@harness-engineering/core'
import { CodeIngestorOptions, ContextQLParams, ContextQLResult, EdgeType, GraphConnector, GraphIntegrityReport, IngestResult, IntegrityFinding, NodeType, ShortestPathDirection, ShortestPathResult, SyncMetadata } from '@harness-engineering/graph'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { formatFindingsContract } from '@harness-engineering/types'
import { Command } from 'commander'
import * as fs from 'fs'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
