---
schemaVersion: 1
module: 'packages/cli/src/commands/integrations'
sourceHash: '4e95aa713a8a60a9d20d73c19873acc6ed38d31c5e089602e015681256a148ef'
compiledAt: '2026-08-28T01:22:08.842Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['add.ts', 'dismiss.ts', 'index.ts', 'list.ts', 'remove.ts', 'sync.ts']
---

## Interface Contract

```ts
export createIntegrationsCommand
```

## Dependency Slice

```
import { readIntegrationsConfig, readMcpConfig, removeMcpEntry, writeIntegrationsConfig, writeMcpEntry } from '../../integrations/config'
import { ConfiguredServer, reconcileIntegrations } from '../../integrations/reconcile'
import { INTEGRATION_REGISTRY } from '../../integrations/registry'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { addIntegration, buildMcpEntry, createAddIntegrationCommand, updateIntegrationsConfig, writeMcpEntries } from './add'
import { createDismissIntegrationCommand } from './dismiss'
import { createListIntegrationsCommand } from './list'
import { createRemoveIntegrationCommand } from './remove'
import { createSyncIntegrationsCommand } from './sync'
import { Err, Ok, Result } from '@harness-engineering/core'
import chalk from 'chalk'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
```
