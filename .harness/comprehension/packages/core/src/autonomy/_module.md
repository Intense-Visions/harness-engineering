---
schemaVersion: 1
module: 'packages/core/src/autonomy'
sourceHash: '34d31e1f9d0dc9813268fa9e584ecffaf2c6dcaca9ff4a686bd10002ee9e7c22'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['schema.ts']
---

## Interface Contract

```ts
export AutonomyLevelSchema
export SessionOverrideFileSchema
export UserConfigSchema
export parseSessionOverride
export parseUserConfig
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { AutonomySessionOverride, AutonomyUserConfig } from '@harness-engineering/types'
import { z } from 'zod'
```
