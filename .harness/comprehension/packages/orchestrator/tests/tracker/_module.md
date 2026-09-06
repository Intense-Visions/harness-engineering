---
schemaVersion: 1
module: 'packages/orchestrator/tests/tracker'
sourceHash: '29fc8f86ffde6dd748f919ffeea7e43863d33244db82ac877fcc189ae4f9ea04'
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
