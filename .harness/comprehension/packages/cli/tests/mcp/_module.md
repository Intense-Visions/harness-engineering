---
schemaVersion: 1
module: 'packages/cli/tests/mcp'
sourceHash: 'a5d05fa7f7e08d3435355536c0c991e2ebd98b7d7127e4f62f4c232aa226bbd7'
compiledAt: '2026-08-28T01:22:09.773Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config-resolver.test.ts',
    'context-surface.test.ts',
    'dispatch-skills.test.ts',
    'result-adapter.test.ts',
    'server-integration.test.ts',
    'server.test.ts',
    'tool-tiers.test.ts',
    'update-check-hook.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { gatherContextSurface, mcpToolEntries, toolDefinitionText } from '../../src/mcp/context-surface'
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
import * as os from 'os'
import * as path, { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
