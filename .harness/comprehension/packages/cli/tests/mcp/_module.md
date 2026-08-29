---
schemaVersion: 1
module: "packages/cli/tests/mcp"
sourceHash: "34e4f8500a485d17691d9a48a77b3be5625c26501da9dc2af9115276be89f3a7"
compiledAt: "2026-08-29T14:14:27.817Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["config-resolver.test.ts", "context-surface.test.ts", "dispatch-skills.test.ts", "result-adapter.test.ts", "server-integration.test.ts", "server.test.ts", "tool-tiers.test.ts", "update-check-hook.test.ts"]
---

## Summary

`packages/cli/tests/mcp` is the test suite for the Harness MCP (Model Context Protocol) server that exposes harness CLI capabilities to Claude and other LLM clients. The module tests four layers: **config resolution** (finding `harness.config.json`), **tool registration** (115 tools + 9 resources), **context budgeting** (a three-tier system exposing core/standard/full subsets based on token budget), and **tool handlers** (converting internal Result types to MCP responses, routing dispatch_skills to auto-detect or explicit modes).

The tests cover config loading via Result-type error handling, a three-tier system where CORE ⊂ STANDARD ⊂ FULL with budget-driven tier selection, server initialization verifying tool/resource counts and preventing leakage of removed tools, context surface gathering producing per-tier token attribution reports, dispatch_skills routing with conditional paths (auto-detect via git vs. explicit via enrichment), Result adapter format conversion, and middleware wrapping for context budgets and prompt injection guards.

## Invariants

- Tier hierarchy: CORE_TOOL_NAMES is a strict subset of STANDARD_TOOL_NAMES; both are subsets of all tools. Violations break budget-driven tier selection.
- Server registration count: Exactly 115 tools and 9 resources. Any tool add/removal updates this count.
- Tool presence: validate_project, check_dependencies, manage_adr, outcome_eval, dispatch_skills must be registered. Removed tools (manage_handoff, apply_fixes) must NOT appear.
- dispatch_skills routing: No files + no commitMessage → dispatchSkillsFromGit; either field present → enrichSnapshotForDispatch + dispatchSkills. Violating this breaks skill discovery.
- Result adapter JSON wrapping: Ok(string) bypasses JSON; Ok(object) gets stringified; Err(e) sets isError:true. Broken wrapping breaks downstream parsing.
- Context budget no-op: wrapWithContextBudget is byte-identical pass-through when maxTokens ≤ 0. Modifying content in this case breaks transparent layering.
- Resource stability metadata: Every resource must declare _meta.stability ∈ {static, session, ephemeral}. Missing or invalid hints break client caching assumptions.
- Tool tier enforcement: selectTier filters to only tools defined in the registry; override/budget can narrow but not widen to undefined tools.
- dispatch_skills schema: All input fields optional (required:[]). Description must contain 'skill sequence'. Violations break schema contracts.
- Core tier coverage: CORE must include essential tools (validate_project, code_search, compact) so the server can function in ultra-tight contexts.

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
