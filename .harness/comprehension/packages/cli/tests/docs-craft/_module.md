---
schemaVersion: 1
module: 'packages/cli/tests/docs-craft'
sourceHash: '5f09028778fdf841f2a7a0c62ba8aeb93d250bb9b7280b666a086eaf550a29fa'
compiledAt: '2026-08-28T01:22:09.706Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'catalog.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectDocsCraftPrompts, critiqueDocFile, finalizeDocsCraft, runDocsCraft } from '../../src/docs-craft'
import { SEED_EXEMPLARS } from '../../src/docs-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/docs-craft/catalog/rubrics'
import { teachesNotDescribesRubric } from '../../src/docs-craft/catalog/rubrics/teaches-not-describes'
import { classifyDoc, discoverDocs } from '../../src/docs-craft/extract/discover'
import { critiqueOne } from '../../src/docs-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
