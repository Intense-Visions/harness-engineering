---
schemaVersion: 1
module: 'packages/cli/tests/security-craft'
sourceHash: 'a03c4bbb3f67697ded00f8596536370e32f26f5a500c201a2d77fc8e66ea2f37'
compiledAt: '2026-08-28T01:22:09.970Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'signals.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectSecurityCraftPrompts, critiqueSecurityInFile, finalizeSecurityCraft, runSecurityCraft } from '../../src/security-craft'
import { failClosedNotOpenRubric } from '../../src/security-craft/catalog/rubrics/fail-closed-not-open'
import { trustBoundaryRespectedRubric } from '../../src/security-craft/catalog/rubrics/trust-boundary-respected'
import { discoverSourceFiles } from '../../src/security-craft/extract/discover'
import { detectSignals } from '../../src/security-craft/extract/signals'
import { SecuritySignal } from '../../src/security-craft/findings/schema'
import { critiqueOne } from '../../src/security-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
