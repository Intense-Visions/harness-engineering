---
schemaVersion: 1
module: 'packages/cli/tests/api-craft'
sourceHash: '1530557fa1ea3e29a38906d990c3d531b05800b945498ed819c3f7f76cdd1807'
compiledAt: '2026-08-28T01:22:09.545Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['catalog.test.ts', 'critique.test.ts', 'discover.test.ts', 'integration.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectApiCraftPrompts, critiqueApiSurfaceFile, finalizeApiCraft, runApiCraft } from '../../src/api-craft'
import { SEED_EXEMPLARS } from '../../src/api-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/api-craft/catalog/rubrics'
import { verbsAreHonestRubric } from '../../src/api-craft/catalog/rubrics/verbs-are-honest'
import { classifyApiSurface, discoverApiSurfaces, hasRouteSignal, isNonRouteFile, isOpenApiSpec } from '../../src/api-craft/extract/discover'
import { critiqueOne } from '../../src/api-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
