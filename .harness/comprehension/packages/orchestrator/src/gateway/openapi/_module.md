---
schemaVersion: 1
module: 'packages/orchestrator/src/gateway/openapi'
sourceHash: '87914cf088185353f4c6295bc0bde676a6694e41eee163d20d1ea04d953d88f8'
compiledAt: '2026-08-28T01:22:12.189Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['generate.test.ts', 'generate.ts', 'registry.ts', 'v1-registry.ts']
---

## Interface Contract

```ts
export buildAuthDocument
export buildAuthRegistry
export buildV1Document
export buildV1Registry
export generateOpenApiYaml
```

## Dependency Slice

```
import { generateOpenApiYaml } from './generate'
import { buildAuthRegistry } from './registry'
import { buildV1Document } from './v1-registry'
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { AuthTokenPublicSchema, BridgeKindSchema, PromptCacheStatsSchema, TokenScopeSchema } from '@harness-engineering/types'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseYaml, stringify } from 'yaml'
import { z } from 'zod'
```
