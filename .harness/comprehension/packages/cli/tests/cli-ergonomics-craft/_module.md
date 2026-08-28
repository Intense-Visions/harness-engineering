---
schemaVersion: 1
module: 'packages/cli/tests/cli-ergonomics-craft'
sourceHash: '3737762f0af45cab90b7a62ce2ae8e68b8f2180e8a62f3e69f849d4ecac3f93d'
compiledAt: '2026-08-28T01:22:09.587Z'
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
import { collectCliErgonomicsCraftPrompts, critiqueCommandFile, finalizeCliErgonomicsCraft, runCliErgonomicsCraft } from '../../src/cli-ergonomics-craft'
import { SEED_EXEMPLARS } from '../../src/cli-ergonomics-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/cli-ergonomics-craft/catalog/rubrics'
import { namesArePredictableRubric } from '../../src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable'
import { classifyCommand, discoverCommands, isNonCommandFile } from '../../src/cli-ergonomics-craft/extract/discover'
import { critiqueOne } from '../../src/cli-ergonomics-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
