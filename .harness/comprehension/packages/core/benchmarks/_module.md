---
schemaVersion: 1
module: 'packages/core/benchmarks'
sourceHash: 'c2c3ba4633e061f8059ff3eb8bb9df589628781d3f044cd2d1b6b68305bb4b04'
compiledAt: '2026-08-28T01:22:10.199Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['validation.bench.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateCommitMessage } from '../src/validation/commit-message'
import { validateConfig } from '../src/validation/config'
import { bench, describe } from 'vitest'
import { z } from 'zod'
```
