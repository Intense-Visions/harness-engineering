---
schemaVersion: 1
module: 'packages/cli/tests/shared/craft'
sourceHash: 'cf35230189661a609e18f0163119f5ad50f6ec708a05d494d98750563f550ae4'
compiledAt: '2026-08-28T01:22:09.979Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'diagnostics.test.ts',
    'in-session-guard.test.ts',
    'lazy-local-adapter.test.ts',
    'llm-provider.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runCopyCraft } from '../../../src/copy-craft'
import { runDocsCraft } from '../../../src/docs-craft'
import { runKnowledgeCraft } from '../../../src/knowledge-craft'
import { runSecurityCraft } from '../../../src/security-craft'
import { describeCraftResolution, formatCraftDiagnostic } from '../../../src/shared/craft/diagnostics'
import { LlmProvider } from '../../../src/shared/craft/llm/contracts'
import { LazyLocalAdapter } from '../../../src/shared/craft/llm/lazy-local-adapter'
import { CraftLlmResolution, InSessionLlmProvider, MockLlmProvider, PromptDeferredError, getProvider, resolveCraftLlmConfig, resolveCraftLlmMode } from '../../../src/shared/craft/llm/provider'
import { runSpecCraft } from '../../../src/spec-craft'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
