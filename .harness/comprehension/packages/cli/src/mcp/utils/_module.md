---
schemaVersion: 1
module: 'packages/cli/src/mcp/utils'
sourceHash: '3702de6e9576975d9ddad577095cc3b971d16a81f9585b237824ade41f144e57'
compiledAt: '2026-08-28T01:22:09.285Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'analysis-provider.ts',
    'config-resolver.ts',
    'glob-helper.ts',
    'graph-loader.ts',
    'result-adapter.ts',
    'sanitize-path.test.ts',
    'sanitize-path.ts',
    'severity.ts',
  ]
---

## Summary

`packages/cli/src/mcp/utils` provides four core utilities for the MCP server and eval tools:

**Analysis provider resolution** (`analysis-provider.ts`): Centralized LLM judge selection with a three-tier fallback chain — Anthropic API key → local OpenAI-compatible `/v1` endpoint → claude-CLI subscription → null. Returns null if none available, allowing callers to degrade to advisory paths. Claude-CLI support (D8, ADR 0106) is strictly additive; existing deployments resolve identically, only expanding coverage for "no key + no local endpoint" environments.

**Config discovery** (`config-resolver.ts`): Loads `harness.config.json` from project root as `Result<ProjectConfig, Error>`, returning `Err` if missing or unparseable rather than throwing.

**Graph store caching** (`graph-loader.ts`): Loads `graph.json` with mtime-based cache coherency and LRU eviction (8-entry limit). Deduplicates concurrent loads by file mtime—same mtime reuses pending promise, file changes trigger separate loads.

**File discovery** (`glob-helper.ts`): Iterative (not recursive) directory walk collecting source files (`.ts/.tsx/.js/.jsx/.go/.py`), applying glob excludes and syncing skip-dirs with the graph package to avoid three-walker drift.

**Finding severity** (`severity.ts`): Maps severity strings to numeric ranks (error/critical=0, warning/important=1, info/suggestion=2) for deterministic sorting; unmapped values rank last.

**Path safety** (`sanitize-path.ts`): Rejects filesystem root paths to prevent broad filesystem access via MCP tools.

## Invariants

- Three-tier provider precedence must be strictly ordered: Anthropic → local /v1 → claude-CLI → null, with short-circuit on first match. Missing tiers must not break existing deployments.
- Graph store mtime is the sole coherency key—cached entries reused only if file unchanged. Pending loads must also match mtime; file changes between stat() calls trigger separate loads.
- Skip-dir list sourced from @harness-engineering/graph.DEFAULT_SKIP_DIRS shared across CLI, graph, and MCP. Hard-coded local lists cause walker drift and inconsistent file discovery.
- Path normalization must be Windows-aware: glob-helper replaces backslashes with forward slashes in relative paths to match exclude patterns consistently on win32/POSIX.
- Severity sorting must handle unknown values by defaulting to rank 99 (last), not throwing or skipping. Findings sort deterministically regardless of spelling variation.
- sanitizePath rejects both Unix (/) and Windows (drive:\) filesystem roots to prevent escaping. MCP tools accepting user paths must call this before use.

## Interface Contract

```ts
export SEVERITY_ORDER
export bigIntSafeReplacer
export clearGraphStoreCache
export globFiles
export isClaudeCliAvailable
export loadGraphStore
export resolveAnalysisProvider
export resolveProjectConfig
export resultToMcpResponse
export sanitizePath
export sortFindingsBySeverity
```

## Dependency Slice

```
import { sanitizePath } from './sanitize-path'
import { Err, Ok, Result } from '@harness-engineering/core'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import from '@harness-engineering/intelligence'
import * as fs from 'fs'
import { stat } from 'fs/promises'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path, path from 'node:path'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
