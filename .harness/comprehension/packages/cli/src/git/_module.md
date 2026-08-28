---
schemaVersion: 1
module: 'packages/cli/src/git'
sourceHash: '8891207f0c2d576a1d9127bc0020f7307dfe1cca70a75aa40d03fd66e4bcfd85'
compiledAt: '2026-08-28T01:22:09.225Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['merge-driver-setup.test.ts', 'merge-driver-setup.ts']
---

## Interface Contract

```ts
export configureMergeOursDriver
export defaultGitRunner
```

## Dependency Slice

```
import { configureMergeOursDriver } from './merge-driver-setup'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
```
