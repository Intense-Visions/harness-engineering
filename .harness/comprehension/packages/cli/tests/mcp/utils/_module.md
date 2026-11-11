---
schemaVersion: 1
module: 'packages/cli/tests/mcp/utils'
sourceHash: 'cc588099153a57817deb95839b7a892d3a0c1f4f6b53469885498b02e1f8bef4'
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
import '../../../src/utils/paths.js'
import * as fs from 'fs'
import * as fss from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
