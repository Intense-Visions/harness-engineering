---
schemaVersion: 1
module: 'packages/orchestrator/tests/tracker'
sourceHash: '6e8a24e97ce4a9dc4080332ca7700ae4f23738368468eb103df3f16baffef81f'
compiledAt: '2026-08-28T01:22:12.736Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['file-less-stub.test.ts', 'roadmap.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { Orchestrator } from '../../src/orchestrator'
import { GitHubIssuesIssueTrackerAdapter } from '../../src/tracker/adapters/github-issues-issue-tracker'
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap'
import { TrackerConfig, WorkflowConfig } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
