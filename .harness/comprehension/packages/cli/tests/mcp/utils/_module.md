---
schemaVersion: 1
module: 'packages/cli/tests/mcp/utils'
sourceHash: '6c8bfc0b9d1f7dc81c7fbfbdfeea68fbae706516db3656573b892844536e463a'
compiledAt: '2026-08-28T01:22:09.796Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['analysis-provider.test.ts', 'glob-helper.test.ts', 'graph-loader.test.ts', 'paths.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { isClaudeCliAvailable, resolveAnalysisProvider } from '../../../src/mcp/utils/analysis-provider.js'
import { globFiles } from '../../../src/mcp/utils/glob-helper'
import { clearGraphStoreCache, loadGraphStore } from '../../../src/mcp/utils/graph-loader.js'
import from '../../../src/utils/paths.js'
import * as fs from 'fs'
import * as fss from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
