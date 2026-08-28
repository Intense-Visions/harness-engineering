---
schemaVersion: 1
module: 'packages/cli/tests/mcp/utils'
sourceHash: '6c8bfc0b9d1f7dc81c7fbfbdfeea68fbae706516db3656573b892844536e463a'
compiledAt: '2026-08-28T01:22:09.796Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['analysis-provider.test.ts', 'glob-helper.test.ts', 'graph-loader.test.ts', 'paths.test.ts']
---

## Summary

This test suite pins the contract for three core MCP utility subsystems. **Analysis Provider Selection** tests a cascading fallback for resolving which LLM backend serves eval verdicts (Anthropic API key → local OpenAI-compatible endpoint → claude-CLI → null), with strict precedence and graceful degradation on whitespace-only config. **File Globbing** tests recursive source-file discovery with platform-safe defaults, excluding noise directories (node_modules, dist, .git, .next, .nuxt, **pycache**, fixtures) and test files by default while supporting multi-language patterns. **Graph Store Caching** tests lazy initialization and mtime-aware caching of the dependency graph per projectRoot, where cache invalidation is mtime-driven and even failed loads are cached to avoid repeated errors.

## Invariants

- Provider precedence is strict: Anthropic API key > local endpoint > claude-CLI > null; Anthropic always preferred when both key and local endpoint exist
- Whitespace-only config values degrade safely—treated as unset, never throw or crash resolution
- PATH scanning is platform-aware: POSIX uses ':' delimiter, Windows uses ';' with PATHEXT variants; mismatches cause silent false negatives on cross-platform CI
- globFiles excludes are absolute: node_modules, .git, dist, .next, .nuxt, **pycache**, fixtures always skipped; test files (_.test._) excluded by default
- Graph store cache is per-projectRoot; mtime invalidation is the sole signal for reload; missing/failed loads remain cached until mtime changes
- Injectable dependencies throughout (provider resolution, PATH detection, graph stat) allow deterministic testing via mocks

## Interface Contract

```ts

```

## Dependency Slice

```
import { isClaudeCliAvailable, resolveAnalysisProvider } from '../../../src/mcp/utils/analysis-provider.js'
import { globFiles } from '../../../src/mcp/utils/glob-helper'
import { clearGraphStoreCache, loadGraphStore } from '../../../src/mcp/utils/graph-loader.js'
import from '../../../src/utils/paths.js'
import * as fs from 'fs'
import * as fss from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
