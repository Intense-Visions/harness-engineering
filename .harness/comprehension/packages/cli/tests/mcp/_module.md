---
schemaVersion: 1
module: 'packages/cli/tests/mcp'
sourceHash: 'bcb091c2c9d3143e3e073774b3db976ffd15e8476462df5ca40dfb6b7e94ddb2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autonomy-writer-boundary.test.ts',
    'config-resolver.test.ts',
    'context-surface-cov544b.test.ts',
    'context-surface.test.ts',
    'dispatch-skills.test.ts',
    'resource-stale-build.test.ts',
    'result-adapter.test.ts',
    'server-integration.test.ts',
    'server.test.ts',
    'state-resource-stale-build.test.ts',
    'tool-stale-build.test.ts',
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
import { getStateResource } from '../../src/mcp/resources/state'
import { ToolDefinition, createHarnessServer, getResourceDefinitions, getToolDefinitions, handleReadResource } from '../../src/mcp/server'
import { CORE_TOOL_NAMES, DEFAULT_BUDGETS, DEFAULT_CHARS_PER_TOKEN, STANDARD_TOOL_NAMES, estimateBaselineTokens, selectTier } from '../../src/mcp/tool-tiers'
import { ToolDefinition } from '../../src/mcp/tool-types'
import { dispatchSkillsDefinition, handleDispatchSkills } from '../../src/mcp/tools/dispatch-skills.js'
import { resolveProjectConfig } from '../../src/mcp/utils/config-resolver'
import { resultToMcpResponse } from '../../src/mcp/utils/result-adapter'
import { dispatchSkills, dispatchSkillsFromGit, enrichSnapshotForDispatch } from '../../src/skill/dispatch-engine.js'
import { Err, Ok, buildAttributionReport, getUpdateNotification, heuristicTokenCounter, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '@harness-engineering/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { readFileSync } from 'fs'
import * as fs from 'fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join } from 'node:path'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as os from 'os'
import { dirname, resolve } from 'path'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
