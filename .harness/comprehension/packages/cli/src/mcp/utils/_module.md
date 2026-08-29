---
schemaVersion: 1
module: "packages/cli/src/mcp/utils"
sourceHash: "dfd74281c1d5da4f9804cfcb3059a922b862eef3ec3b02997e5630408a90178d"
compiledAt: "2026-08-29T14:44:49.963Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-provider.ts", "config-resolver.ts", "glob-helper.ts", "graph-loader.ts", "result-adapter.ts", "sanitize-path.test.ts", "sanitize-path.ts", "severity.ts"]
---

## Summary

This module bundles seven utility libraries that power the harness MCP server's core I/O and LLM integration:

**Analysis Provider Resolver** (`analysis-provider.ts`) — Three-tier precedence for judgment providers: Anthropic API key → local OpenAI-compatible `/v1` endpoint → `claude` CLI subscription → null. Supports config-declared endpoints (ADR 0109 slice 3) for vendor-neutral comprehension backstop without environment archaeology. All PATH/OS detection is injectable for deterministic tests.

**Config Loader** (`config-resolver.ts`) — Synchronous `harness.config.json` parser returning `Result<ProjectConfig, Error>`.

**File Discovery** (`glob-helper.ts`) — Recursive source file globber (.ts/.tsx/.js/.jsx/.go/.py) using BFS (iterative, not recursive) to avoid stack overflow. Skips `DEFAULT_SKIP_DIRS` from `@harness-engineering/graph` to stay in sync with other scanners. Zero external dependencies.

**Graph Store Cache** (`graph-loader.ts`) — Lazy loader with mtime-based invalidation and concurrent-request deduplication. LRU eviction at 8 entries. Only loads if `graph.json` exists.

**Severity & Sorting** (`severity.ts`) — Canonical severity ordering (`error/critical=0`, `warning/important=1`, `info/suggestion=2`) used consistently across review tools. Lower numbers = higher severity.

**Result Adapter** (`result-adapter.ts`) — Converts `Result<T, E>` to MCP `ToolResponse` format with BigInt JSON serialization support.

**Path Safety** (`sanitize-path.ts`) — Rejects filesystem root to prevent overly-broad MCP tool access.

## Invariants

- Provider precedence is canonical and guarded: resolveProviderKind MUST mirror resolveAnalysisProvider's precedence; a test prevents drift. Calling code uses resolveProviderKind to pick provider-appropriate defaults (Claude models for Anthropic/claude-CLI, custom for local).
- Config-declared endpoint wins over env: AnalysisEndpoint from config is checked BEFORE HARNESS_ANALYSIS_BASE_URL, enabling adopters to point comprehension backstop at ANY vendor without Anthropic key (ADR 0109).
- Graph cache invalidates by mtime, not by timer: Concurrent loads for the same projectRoot with the same mtime reuse the same promise. If mtime differs, a fresh load starts. Only the initiator of a pending load cleans it up.
- DEFAULT_SKIP_DIRS is a single source of truth: globFiles uses the skip-list from @harness-engineering/graph so CLI scanner, MCP walker, and graph ingester stay in sync. Divergence breaks file discovery.
- Directory walking is always iterative: walkDir uses explicit BFS queue to prevent stack overflow on deep trees; recursive descent has caused bugs (see DEFAULT_SKIP_DIRS history comment).
- Path safety enforced at MCP boundary: sanitizePath rejects both / (POSIX) and C:\ (Windows root) to prevent tools accidentally reading the full filesystem.
- Provider factories are null-tolerant: Each of makeAnthropicProvider, makeLocalProvider, makeClaudeCliProvider returns null if the prerequisite (API key, env var, CLI presence) is absent. No exceptions are thrown; callers degrade gracefully.
- Severity order is inverted for sorting: SEVERITY_ORDER maps to integers and sortFindingsBySeverity sorts ascending (lower=first), so error (0) appears before info (2).

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
export resolveProviderKind
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
