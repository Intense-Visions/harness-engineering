---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/extract'
sourceHash: 'ab5df342c0f6c732e85caf48082f002732183db8934be1a5496313c20bb686d4'
compiledAt: '2026-08-28T01:22:08.963Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['commits.ts', 'pr-descriptions.ts', 'source.ts']
---

## Interface Contract

```ts
export extractCommits
export extractFromSource
export extractPRDescriptions
```

## Dependency Slice

```
import { CopySurface, ExtractedCopyItem } from '../findings/schema.js'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
