---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/integration'
sourceHash: 'a6690581657c0bdf3c536fc6ecbc5db4d71963ffe4ed523d1bc9ad5e27e6a3e3'
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
