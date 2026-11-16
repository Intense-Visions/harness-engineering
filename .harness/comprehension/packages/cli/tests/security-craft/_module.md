---
schemaVersion: 1
module: 'packages/cli/tests/security-craft'
sourceHash: '2221854cb4b452e3f285df2c6f4772daa8ed3bc3de290dfecb2ad5feb371e9c8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'critique-cov544.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'issue-2234.test.ts',
    'signals-cov544.test.ts',
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
import { trustBoundaryRespectedRubric } from '../../src/security-craft/catalog/rubrics/trust-boundary-respected.js'
import { discoverSourceFiles } from '../../src/security-craft/extract/discover'
import { detectSignals } from '../../src/security-craft/extract/signals'
import { detectSignals } from '../../src/security-craft/extract/signals.js'
import { SecuritySignal } from '../../src/security-craft/findings/schema'
import { SecuritySignal, SignalKind } from '../../src/security-craft/findings/schema.js'
import { critiqueOne } from '../../src/security-craft/phases/critique'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from '../../src/security-craft/phases/critique.js'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { MockLlmProvider } from '../../src/shared/craft/llm/provider.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
