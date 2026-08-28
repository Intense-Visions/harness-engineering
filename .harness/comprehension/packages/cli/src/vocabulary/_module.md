---
schemaVersion: 1
module: 'packages/cli/src/vocabulary'
sourceHash: '8401620443999cbddd6f1368e6c1c2bf630871a92bbf3aab07aa9622c1c48cc0'
compiledAt: '2026-08-28T01:22:09.474Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['scanner.ts']
---

## Interface Contract

```ts
export formatViolations
export resolveScanFiles
export scanFiles
export scanText
```

## Dependency Slice

```
import { glob } from 'glob'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
```
