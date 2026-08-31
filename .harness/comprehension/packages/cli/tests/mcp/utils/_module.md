---
schemaVersion: 1
module: 'packages/cli/tests/mcp/utils'
sourceHash: 'c1bda562dcb8f271cdea801cd8374c1cd6a1667961f1cf2c668ad2fbd7fd2c9b'
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
import { AnalysisCliConfig, isClaudeCliAvailable, isCliAvailable, resolveAnalysisProvider, resolveProviderKind } from '../../../src/mcp/utils/analysis-provider.js'
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
