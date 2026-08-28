---
schemaVersion: 1
module: 'packages/cli/tests/spec-craft'
sourceHash: '9da519ee81f02bc7536160c438220a408deddbf9ee1fb658a75176fac69f4fa7'
compiledAt: '2026-08-28T01:22:10.128Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'rubric-mapping.test.ts',
    'sections.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { collectSpecCraftPrompts, critiqueSpecFile, finalizeSpecCraft, runSpecCraft } from '../../src/spec-craft'
import { SEED_RUBRICS, rubricApplies } from '../../src/spec-craft/catalog/rubrics/index'
import { sharpnessRubric } from '../../src/spec-craft/catalog/rubrics/sharpness'
import { discoverSpecs } from '../../src/spec-craft/extract/discover'
import { ParsedSection, canonicalize, parseSections } from '../../src/spec-craft/extract/sections'
import { critiqueOne } from '../../src/spec-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
