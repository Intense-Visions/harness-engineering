---
schemaVersion: 1
module: 'packages/cli/tests/commands/agent'
sourceHash: '6d3ec1c02a55f2a5dc4b5dac92d40c0899783e88c8ed3057263637de4ceefc85'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['review-cov544b.test.ts', 'review-json-report.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createReviewCommand, toReviewJson } from '../../../src/commands/agent/review'
import { resolveConfig } from '../../../src/config/loader'
import { logger } from '../../../src/output/logger'
import { CLIError, ExitCode } from '../../../src/utils/errors'
import { loadGuardianCoverage } from '../../../src/utils/guardian-context'
import { parseDiff, runReviewPipeline } from '@harness-engineering/core'
import { execSync } from 'child_process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
