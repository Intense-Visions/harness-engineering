---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-workspace-samples/packages/app/src'
sourceHash: '2461abafe223e91985d28c0bdcdad2f8d8b4f8d3bcd839af72d7c92384f0a094'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['main.ts']
---

## Interface Contract

```ts
export out
export schema
```

## Dependency Slice

```
import { usedByRelative } from '../../lib/src/index.js'
import { usedByBare } from '@probe/lib'
import { usedBySubpath } from '@probe/lib/util'
import { z } from 'zod'
```
