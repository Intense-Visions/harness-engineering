---
schemaVersion: 1
module: 'packages/cli/tests/security-craft'
sourceHash: '4739e57ad952382538b7de51c6ab89c6750938607cc0da07096211719be8fb41'
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
