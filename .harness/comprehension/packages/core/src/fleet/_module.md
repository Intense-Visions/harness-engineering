---
schemaVersion: 1
module: 'packages/core/src/fleet'
sourceHash: '8399f1d1adbc7bb4fd24c0d8fbde0a79cd269c079b86c71ab7d24919ff6ac439'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'lane-state-isolation.test.ts', 'lane-state-isolation.ts']
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { LANE_STATE_DIRNAME, applyLaneStateEnv, buildLaneStateEnvOverride, resolveLaneClaudeConfigDir, resolveLaneStateDir } from './lane-state-isolation'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
```
