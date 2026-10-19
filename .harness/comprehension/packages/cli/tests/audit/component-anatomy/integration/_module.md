---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/integration'
sourceHash: '178c1a18db4b6e056c8dabf88eb9c80747f588a9666550e16bfb2ec6c25dcf03'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'button-vertical-slice.test.ts',
    'checkbox-convention.test.ts',
    'default-file-scope.test.ts',
    'dialog-convention.test.ts',
    'empty-state-convention.test.ts',
    'input-convention.test.ts',
    'select-convention.test.ts',
    'strictness-matrix.test.ts',
    'switch-convention.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
```
