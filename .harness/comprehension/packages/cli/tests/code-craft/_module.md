---
schemaVersion: 1
module: 'packages/cli/tests/code-craft'
sourceHash: '66d2ae98ed24af005ff6f0705e36746f4b38d632034e139ba90d52cfbc778863'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'catalog.test.ts',
    'critique-prompt.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'integration.test.ts',
    'sibling-evidence.test.ts',
    'siblings.test.ts',
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
import { abstractionEarnsKeepRubric } from '../../src/code-craft/catalog/rubrics/abstraction-earns-keep'
import { controlFlowHonestRubric } from '../../src/code-craft/catalog/rubrics/control-flow-honest'
import { revealsIntentRubric } from '../../src/code-craft/catalog/rubrics/reveals-intent'
import { discoverSourceFiles } from '../../src/code-craft/extract/discover'
import { buildCodeCraftCloneIndex, resolveSiblingEvidence } from '../../src/code-craft/extract/siblings'
import { extractUnits, unitSource } from '../../src/code-craft/extract/units'
import { extractUnits, unitSource } from '../../src/code-craft/extract/units.js'
import { CodeUnit, UnitKind } from '../../src/code-craft/findings/schema'
import { CodeUnit } from '../../src/code-craft/findings/schema.js'
import { SIBLING_AWARE_RUBRIC_IDS, buildPrompt, critiqueOne } from '../../src/code-craft/phases/critique'
import { renderSiblingEvidence } from '../../src/code-craft/phases/sibling-evidence'
import { InSessionLlmProvider, LlmCallCost, LlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
