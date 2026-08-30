---
schemaVersion: 1
module: 'packages/core/src/fleet'
sourceHash: '1530bc311d4228e6fee509e8d783e0de5e205b2e6832cf46289d4a2680080f9b'
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
