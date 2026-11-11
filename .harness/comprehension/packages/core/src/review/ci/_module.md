---
schemaVersion: 1
module: 'packages/core/src/review/ci'
sourceHash: 'f8a0bb7143e14b030f419ddbed37f54a5f3620e45797230f1e1ca0270c352f02'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'orchestrator.ts', 'runner-presets.ts', 'verdict-schema.ts']
---

## Interface Contract

```ts
export AgentCliPreset
export AgentCliRunnerId
export CI_ASSESSMENTS
export CI_REVIEW_DOMAINS
export CI_REVIEW_VERDICT_SCHEMA_VERSION
export CI_RUNNERS
export CiBlockOn
export CiReviewResult
export CiReviewVerdict
export CiReviewVerdictParts
export CiReviewVerdictSchema
export CiRunner
export DEFAULT_EXEC_MAX_STDOUT_BYTES
export DEFAULT_EXEC_TIMEOUT_MS
export EndpointPreset
export EndpointRunnerId
export ExecFileLike
export HeadlessInvocation
export LocalEndpointInvoke
export RUNNER_PRESETS
export RunCiReviewOptions
export RunnerId
export RunnerPreset
export buildCiReviewVerdict
export defaultExecFile
export deriveBlockingFindings
export deriveExitCode
export isSupportedRunner
export parseAntigravityVerdict
export parseCiReviewVerdict
export parseClaudeVerdict
export parseCodexVerdict
export parseGeminiVerdict
export parseLocalVerdict
export presetKind
export runCiReview
```

## Dependency Slice

```
import { EnforceFindingIntegrityOptions, FindingIntegrityReport, enforceFindingIntegrity, formatIntegritySummary, mergeIntegrityReports } from '../finding-integrity'
import { runReviewPipeline } from '../pipeline-orchestrator'
import { ReviewFinding } from '../types'
import { DiffInfo, ReviewDomain } from '../types/context'
import { parseAntigravityVerdict } from './parsers/antigravity'
import { parseClaudeVerdict } from './parsers/claude'
import { parseCodexVerdict } from './parsers/codex'
import { parseLocalVerdict } from './parsers/local'
import { AgentCliPreset, EndpointPreset, LocalEndpointInvoke, RUNNER_PRESETS, RunnerId } from './runner-presets'
import { CI_ASSESSMENTS, CiReviewVerdict, buildCiReviewVerdict } from './verdict-schema'
import { nodeExecFile } from 'node:child_process'
import { z } from 'zod'
```
