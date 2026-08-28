---
schemaVersion: 1
module: 'packages/cli/tests/integrations'
sourceHash: '0d8aa4085b2dfca8dfc423c4c0551a341fb64d78ee15dca8751202acb4dfe49a'
compiledAt: '2026-08-28T01:22:09.723Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['config.test.ts', 'reconcile.test.ts', 'registry.test.ts', 'toml.test.ts', 'types.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { IntegrationsConfig } from '../../src/config/schema'
import { readIntegrationsConfig, readMcpConfig, removeMcpEntry, writeIntegrationsConfig, writeMcpEntry, writeOpencodeMcpEntry } from '../../src/integrations/config'
import { ConfiguredServer, reconcileIntegrations } from '../../src/integrations/reconcile'
import { CATALOG_LAST_REVIEWED, INTEGRATION_REGISTRY } from '../../src/integrations/registry'
import { writeTomlMcpEntry } from '../../src/integrations/toml'
import { IntegrationDef } from '../../src/integrations/types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
