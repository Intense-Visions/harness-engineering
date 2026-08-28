---
schemaVersion: 1
module: 'packages/cli/tests/mcp'
sourceHash: 'a5d05fa7f7e08d3435355536c0c991e2ebd98b7d7127e4f62f4c232aa226bbd7'
compiledAt: '2026-08-28T01:22:09.773Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The **`packages/cli/tests/mcp`** module is the comprehensive test suite (98 files) for the Model Context Protocol server that exposes the harness platform's 114+ tools to Claude and other AI clients. Tests organize into core server verification, 90+ tool-specific tests, middleware behavior (context budgeting, compaction, injection guards), resource definitions, and utilities. The suite validates tool registration counts, tiered access control (core ⊂ standard ⊂ full), input/output adapters, config resolution, skill dispatch routing, token budgeting, and security contracts. It also verifies the semantic comprehension substrate (\_module.md files) that captures module structure and dependencies in compiled form.

## Invariants

- Exactly 114 tools and 9 resources must be registered on the MCP server; server.test.ts gates this count and catches drift
- Tool tiers are strict subsets: CORE_TOOL_NAMES ⊂ STANDARD_TOOL_NAMES ⊂ full; selectTier() enforces monotonic access per token budget
- Middleware wrappers (context-budget, compaction, injection-guard) return byte-identical handlers when unconfigured; no-op by reference equality
- Every tool's inputSchema must serialize to valid JSON; gatherContextSurface depends on deterministic schema reflection for token counting
- Config resolution walks parent directories for harness.config.json; returns Ok(config) or Err(message), never throws
- resultToMcpResponse converts Ok(data)→success and Err(e)→error without data loss; dispatch-skills and acceptance-eval depend on this
- handleDispatchSkills routes auto-detect (no files/commitMessage)→dispatchSkillsFromGit; explicit (files or message)→enrichSnapshotForDispatch+dispatchSkills
- Resources include \_meta.stability hints (ephemeral for per-invocation state, session for filesystem-backed, stable for immutable)
- Token estimation is deterministic: (name + description + schemaJSON length) / charsPerToken, no randomness; DEFAULT_CHARS_PER_TOKEN = 4
- Skill dispatch defaults to limit=5; handleDispatchSkills truncates results to min(limit, 5) unless overridden
- Semantic comprehension \_module.md files are versioned with sourceHash; drift in hash signals stale comprehension substrate

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
