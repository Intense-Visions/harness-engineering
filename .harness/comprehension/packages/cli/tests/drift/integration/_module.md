---
schemaVersion: 1
module: 'packages/cli/tests/drift/integration'
sourceHash: '1b17b5a2ef0a17753d8afc4d74b80d4b4ed5cfca537bbbe39c17374b1a7fc119'
compiledAt: '2026-08-28T01:22:09.704Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['detect-drift.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDetectDrift } from '../../../src/drift'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
