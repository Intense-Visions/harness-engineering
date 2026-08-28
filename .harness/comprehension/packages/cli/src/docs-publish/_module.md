---
schemaVersion: 1
module: 'packages/cli/src/docs-publish'
sourceHash: '82b788f59a0cf1581433417878b02dce4067527979eeba2525ea38185f8e7717'
compiledAt: '2026-08-28T01:22:09.175Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'interface.ts', 'resolver.ts']
---

## Interface Contract

```ts
export *
export ConfluenceConnector
export PlaywrightImporter
export resolveDocsPublishConnector
export verifyRender
```

## Dependency Slice

```
import { HarnessConfig } from '../config/schema.js'
import { CLIError, ExitCode } from '../utils/errors.js'
import { ConfluenceConnector } from './connectors/confluence.js'
import { DocsPublishConnector } from './interface.js'
import { Err, Ok, Result } from '@harness-engineering/core'
```
