---
schemaVersion: 1
module: 'packages/cli/tests/naming-craft'
sourceHash: '1dbef43de8ca58a2fa65c0863cf666c8472aef07a44dc0856966d180ea0c1b19'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique.test.ts',
    'extract.test.ts',
    'in-session.test.ts',
    'index-cov544.test.ts',
    'integration.test.ts',
    'php-unsupported.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectNamingCraftPrompts, critiqueNamesInFile, finalizeNamingCraft, runNamingCraft } from '../../src/naming-craft'
import { predictivePowerRubric } from '../../src/naming-craft/catalog/rubrics/predictive-power'
import { classify, sampleConventions } from '../../src/naming-craft/extract/convention'
import { ExtractedIdentifier, extractIdentifiers } from '../../src/naming-craft/extract/identifiers'
import { collectNamingCraftPrompts, critiqueNamesInFile, finalizeNamingCraft, runNamingCraft } from '../../src/naming-craft/index.js'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/naming-craft/llm/provider'
import { critiqueOne } from '../../src/naming-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
