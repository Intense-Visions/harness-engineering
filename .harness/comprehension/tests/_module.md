---
schemaVersion: 1
module: 'tests'
sourceHash: 'dfc7d10e9c759c7d8cacf783f289eba55bc4932d3a6bbc7f18c16b5b7b36f568'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['platform-parity.test.ts', 'type-tests-coverage.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
```
