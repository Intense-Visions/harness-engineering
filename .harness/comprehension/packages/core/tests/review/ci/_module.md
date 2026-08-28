---
schemaVersion: 1
module: 'packages/core/tests/review/ci'
sourceHash: '2dbe5029e20d01c23b12798ff9ffa04c6aa3ffaddc9c6d0b3e87dde6df5b789c'
compiledAt: '2026-08-28T01:22:10.907Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'default-exec-file.test.ts',
    'orchestrator.test.ts',
    'parsers.test.ts',
    'runner-presets.test.ts',
    'verdict-schema.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExecFileLike, defaultExecFile, runCiReview } from '../../../src/review/ci/orchestrator'
import { parseAntigravityVerdict } from '../../../src/review/ci/parsers/antigravity'
import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude'
import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex'
import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini'
import { parseLocalVerdict } from '../../../src/review/ci/parsers/local'
import { LocalEndpointInvoke, RUNNER_PRESETS, isSupportedRunner, presetKind } from '../../../src/review/ci/runner-presets'
import { CI_REVIEW_DOMAINS, CI_REVIEW_VERDICT_SCHEMA_VERSION, CI_RUNNERS, CiReviewVerdictSchema, parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema'
import { ReviewFinding } from '../../../src/review/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
