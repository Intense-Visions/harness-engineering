---
schemaVersion: 1
module: 'packages/cli/src/api-craft/extract'
sourceHash: 'a94554a0d302bf410a5d3c69909270e29ccbb4bd541884b9368ddeeee8c76746'
compiledAt: '2026-08-28T01:22:08.710Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts']
---

## Interface Contract

```ts
export API_ROOTS
export DEFAULT_EXCLUDED_DIRS
export OPENAPI_ROOTS
export classifyApiSurface
export discoverApiSurfaces
export hasRouteSignal
export isNonRouteFile
export isOpenApiSpec
```

## Dependency Slice

```
import { ApiSurfaceKind } from '../catalog/rubrics/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
