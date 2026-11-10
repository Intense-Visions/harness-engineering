---
schemaVersion: 1
module: 'tests/helpers'
sourceHash: 'c3e6bbb433a29b42e64d34803e1e8068262bee03512fe16d09024a71f02b161c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['remove-temp-dir.test.ts', 'remove-temp-dir.ts']
---

## Interface Contract

```ts
export REMOVE_TEMP_DIR_OPTIONS
export removeTempDirSafely
```

## Dependency Slice

```
import { REMOVE_TEMP_DIR_OPTIONS, removeTempDirSafely } from './remove-temp-dir'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
