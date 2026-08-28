---
schemaVersion: 1
module: 'packages/cli/tests/naming-craft'
sourceHash: '0f7557a04be488262aa4799b4e0e4d9d93615dea8a47e3292b2e60bffd1ce325'
compiledAt: '2026-08-28T01:22:09.833Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['critique.test.ts', 'extract.test.ts', 'in-session.test.ts', 'integration.test.ts']
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
import { InSessionLlmProvider, MockLlmProvider } from '../../src/naming-craft/llm/provider'
import { critiqueOne } from '../../src/naming-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
