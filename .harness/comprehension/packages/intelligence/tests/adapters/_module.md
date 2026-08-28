---
schemaVersion: 1
module: 'packages/intelligence/tests/adapters'
sourceHash: '8bf4cf89eff95fbbeabfb2d52795f7fb0c838e907e24a50acf87d1c77c08d547'
compiledAt: '2026-08-28T01:22:11.895Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'canary-boundary.test.ts',
    'canary.test.ts',
    'github.test.ts',
    'jira.test.ts',
    'linear.test.ts',
    'manual.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CanaryExec, CanaryReader, canaryFrameworkInfoSchema, createCanaryAdapter, resolveTestCommand } from '../../src/adapters/canary.js'
import { GitHubIssue, githubToRawWorkItem } from '../../src/adapters/github.js'
import { JiraIssue, jiraToRawWorkItem } from '../../src/adapters/jira.js'
import { LinearIssue, linearToRawWorkItem } from '../../src/adapters/linear.js'
import { manualToRawWorkItem } from '../../src/adapters/manual.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```
