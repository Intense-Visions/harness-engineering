---
schemaVersion: 1
module: 'packages/cli/tests/code-craft'
sourceHash: 'f2509e3f3a9d17fb2e6991dbd74bf56d40c36e3c238bed48ec9469e0cf53c98e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'catalog.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'integration.test.ts',
    'units-cov544.test.ts',
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
import { extractUnits, unitSource } from '../../src/code-craft/extract/units.js'
import { CodeUnit, UnitKind } from '../../src/code-craft/findings/schema'
import { CodeUnit } from '../../src/code-craft/findings/schema.js'
import { critiqueOne } from '../../src/code-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
