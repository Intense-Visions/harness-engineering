---
schemaVersion: 1
module: 'packages/cli/src/commands/graph'
sourceHash: '7debd26e85b37343a1ca3fd83972da1921eea2e750287b77d460242cbaaf1301'
compiledAt: '2026-08-28T01:22:08.846Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
