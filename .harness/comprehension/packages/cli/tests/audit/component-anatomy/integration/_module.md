---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/integration'
sourceHash: '2d62899df851a4d7068622b7dd928f1d206ba0784aa518f4d560c8c4447d8055'
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
