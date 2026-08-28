---
schemaVersion: 1
module: 'packages/intelligence/src/adapters'
sourceHash: '65a608bdd779b32b0c5d4dabb44d79006e711992e4599cf39666d8bba49a3a0c'
compiledAt: '2026-08-28T01:22:11.828Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['canary.ts', 'github.ts', 'index.ts', 'jira.ts', 'linear.ts', 'manual.ts']
---

## Interface Contract

```ts
export CanaryAdapter
export CanaryDegradeReason
export CanaryExec
export CanaryFinding
export CanaryFrameworkInfo
export CanaryProbe
export CanaryReader
export CanaryRunRecord
export CanaryTestResult
export FrameworkRecommendation
export GitHubComment
export GitHubIssue
export GitHubLabel
export JiraComment
export JiraIssue
export JiraIssueLink
export LinearComment
export LinearIssue
export LinearLabel
export LinearRelation
export ManualInput
export canaryRunRecordSchema
export canaryTestResultSchema
export createCanaryAdapter
export githubToRawWorkItem
export jiraToRawWorkItem
export linearToRawWorkItem
export manualToRawWorkItem
export resolveTestCommand
```

## Dependency Slice

```
import { RawWorkItem } from '../types.js'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as nodePath from 'node:path'
import { z } from 'zod'
```
