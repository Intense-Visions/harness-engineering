---
schemaVersion: 1
module: 'packages/cli/tests/code-craft'
sourceHash: '67c93702884add7d35e361fd7688b1b8616f032a3736b01ae7172de8a9b7eaee'
compiledAt: '2026-08-28T01:22:09.599Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'catalog.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'integration.test.ts',
    'units.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCodeCraftPrompts, critiqueCodeInFile, finalizeCodeCraft, runCodeCraft } from '../../src/code-craft'
import { SEED_EXEMPLARS } from '../../src/code-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics'
import { controlFlowHonestRubric } from '../../src/code-craft/catalog/rubrics/control-flow-honest'
import { revealsIntentRubric } from '../../src/code-craft/catalog/rubrics/reveals-intent'
import { discoverSourceFiles } from '../../src/code-craft/extract/discover'
import { extractUnits, unitSource } from '../../src/code-craft/extract/units'
import { CodeUnit, UnitKind } from '../../src/code-craft/findings/schema'
import { critiqueOne } from '../../src/code-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
