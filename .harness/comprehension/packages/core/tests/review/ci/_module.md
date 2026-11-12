---
schemaVersion: 1
module: 'packages/core/tests/review/ci'
sourceHash: '22fe5233bff38f1b537ed54b7f5b633414d779fde953251eb8ed8773f7bf0e4e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'default-exec-file.test.ts',
    'orchestrator-config-forward.test.ts',
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
import { DiffInfo, ReviewFinding } from '../../../src/review/types'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
