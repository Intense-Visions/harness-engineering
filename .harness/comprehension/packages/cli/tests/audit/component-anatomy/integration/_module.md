---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/integration'
sourceHash: 'ce4fe753d7310ef378a6832a073c236821a35a8135156b09bc8a7d706c80dc2e'
compiledAt: '2026-08-28T01:22:09.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'button-vertical-slice.test.ts',
    'checkbox-convention.test.ts',
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
