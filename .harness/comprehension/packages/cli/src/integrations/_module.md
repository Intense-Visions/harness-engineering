---
schemaVersion: 1
module: 'packages/cli/src/integrations'
sourceHash: 'd3b89aca5ec99acb8169460d6fcaa7899d6fa299c96be33c73b6f6fef875618f'
compiledAt: '2026-08-28T01:22:09.235Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config.ts', 'reconcile.ts', 'registry.ts', 'toml.ts', 'types.ts']
---

## Interface Contract

```ts
export CATALOG_LAST_REVIEWED
export INTEGRATION_REGISTRY
export readIntegrationsConfig
export readMcpConfig
export reconcileIntegrations
export removeMcpEntry
export writeIntegrationsConfig
export writeMcpEntry
export writeOpencodeMcpEntry
export writeTomlMcpEntry
```

## Dependency Slice

```
import { IntegrationsConfig } from '../config/schema'
import { IntegrationDef } from './types'
import * as fs from 'fs'
import * as path from 'path'
```
