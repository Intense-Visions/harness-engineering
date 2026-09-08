---
schemaVersion: 1
module: 'packages/cli/tests/mcp'
sourceHash: '36d5afae738e4e145a2515b7ceedc9de09d526fa5f9d405a61cf073fa7681a2f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config-resolver.test.ts',
    'context-surface-cov544b.test.ts',
    'context-surface.test.ts',
    'dispatch-skills.test.ts',
    'result-adapter.test.ts',
    'server-integration.test.ts',
    'server.test.ts',
    'tool-tiers.test.ts',
    'update-check-hook.test.ts',
    'version-guard-surface.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { agentsMdEntry, gatherContextSurface, hooksEntry, mcpToolEntries, skillTreeEntries, toolDefinitionText } from '../../src/mcp/context-surface'
import { getToolDefinitions } from '../../src/mcp/index'
import { ToolDefinition, createHarnessServer, getResourceDefinitions, getToolDefinitions } from '../../src/mcp/server'
import { CORE_TOOL_NAMES, DEFAULT_BUDGETS, DEFAULT_CHARS_PER_TOKEN, STANDARD_TOOL_NAMES, estimateBaselineTokens, selectTier } from '../../src/mcp/tool-tiers'
import { ToolDefinition } from '../../src/mcp/tool-types'
import { dispatchSkillsDefinition, handleDispatchSkills } from '../../src/mcp/tools/dispatch-skills.js'
import { resolveProjectConfig } from '../../src/mcp/utils/config-resolver'
import { resultToMcpResponse } from '../../src/mcp/utils/result-adapter'
import { dispatchSkills, dispatchSkillsFromGit, enrichSnapshotForDispatch } from '../../src/skill/dispatch-engine.js'
import { Err, Ok, buildAttributionReport, getUpdateNotification, heuristicTokenCounter, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '@harness-engineering/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import * as fs, { readFileSync } from 'fs'
import * as fs, { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as os from 'os'
import * as path, { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
