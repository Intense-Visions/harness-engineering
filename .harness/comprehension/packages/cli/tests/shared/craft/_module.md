---
schemaVersion: 1
module: 'packages/cli/tests/shared/craft'
sourceHash: '60dfabc577a11ce8206b805d0b8639ee4aaf58ab92a532bdaebe79a209cef8fc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'diagnostics.test.ts',
    'in-session-guard.test.ts',
    'lazy-local-adapter.test.ts',
    'llm-provider.test.ts',
    'relative-files-scope.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectApiCraftPrompts } from '../../../src/api-craft/index.js'
import { collectCliErgonomicsCraftPrompts } from '../../../src/cli-ergonomics-craft/index.js'
import { collectCodeCraftPrompts } from '../../../src/code-craft/index.js'
import { runCopyCraft } from '../../../src/copy-craft'
import { runDocsCraft } from '../../../src/docs-craft'
import { collectDocsCraftPrompts } from '../../../src/docs-craft/index.js'
import { runKnowledgeCraft } from '../../../src/knowledge-craft'
import { collectKnowledgeCraftPrompts } from '../../../src/knowledge-craft/index.js'
import { collectNamingCraftPrompts } from '../../../src/naming-craft/index.js'
import { runSecurityCraft } from '../../../src/security-craft'
import { collectSecurityCraftPrompts } from '../../../src/security-craft/index.js'
import { describeCraftResolution, formatCraftDiagnostic } from '../../../src/shared/craft/diagnostics'
import { LlmProvider } from '../../../src/shared/craft/llm/contracts'
import { LazyLocalAdapter } from '../../../src/shared/craft/llm/lazy-local-adapter'
import { CraftLlmResolution, InSessionLlmProvider, MockLlmProvider, PromptDeferredError, getProvider, resolveCraftLlmConfig, resolveCraftLlmMode } from '../../../src/shared/craft/llm/provider'
import { runSpecCraft } from '../../../src/spec-craft'
import { collectSpecCraftPrompts } from '../../../src/spec-craft/index.js'
import { collectTestCraftPrompts } from '../../../src/test-craft/index.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
