---
schemaVersion: 1
module: 'packages/cli/tests/commands/agent'
sourceHash: '51acbb3e68ccc45370671b882da0c45d488d11b74225a59dfddd051d63752c64'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['review-cov544b.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createReviewCommand } from '../../../src/commands/agent/review'
import { resolveConfig } from '../../../src/config/loader'
import { logger } from '../../../src/output/logger'
import { CLIError, ExitCode } from '../../../src/utils/errors'
import { loadGuardianCoverage } from '../../../src/utils/guardian-context'
import { parseDiff, runReviewPipeline } from '@harness-engineering/core'
import { execSync } from 'child_process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
