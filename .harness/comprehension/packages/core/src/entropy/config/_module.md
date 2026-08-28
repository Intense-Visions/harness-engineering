---
schemaVersion: 1
module: 'packages/core/src/entropy/config'
sourceHash: '14661bcfa776bd95726732a5139fa5b46aedb7450c8ba609d1197e9ebe32d3fb'
compiledAt: '2026-08-28T01:22:10.333Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'schema.ts']
---

## Interface Contract

```ts
export EntropyConfigSchema
export PatternConfigSchema
export validatePatternConfig
```

## Dependency Slice

```
import { createEntropyError } from '../../shared/errors'
import { Err, Ok, Result } from '../../shared/result'
import { EntropyError, PatternConfig } from '../types'
import { z } from 'zod'
```
