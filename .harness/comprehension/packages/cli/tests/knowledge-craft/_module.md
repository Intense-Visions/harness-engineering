---
schemaVersion: 1
module: 'packages/cli/tests/knowledge-craft'
sourceHash: '74f3a36c0b3e5eaf4a4846db4b55e853fcb5432289491b45365db77644d247e1'
compiledAt: '2026-08-28T01:22:09.747Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'edge-cases.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectKnowledgeCraftPrompts, critiqueKnowledgeFile, finalizeKnowledgeCraft, runKnowledgeCraft } from '../../src/knowledge-craft'
import { earnsGraphPlaceRubric } from '../../src/knowledge-craft/catalog/rubrics/earns-graph-place'
import { loadBearingFactRubric } from '../../src/knowledge-craft/catalog/rubrics/load-bearing-fact'
import { discoverKnowledgeEntries } from '../../src/knowledge-craft/extract/discover'
import { critiqueOne } from '../../src/knowledge-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
