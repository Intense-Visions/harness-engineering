---
schemaVersion: 1
module: "packages/cli/tests/mcp/utils"
sourceHash: "6af7727c721df8fd719eec57bb2572eb09b031ec57b0b68a0d5a6b11670bb124"
compiledAt: "2026-08-29T14:44:49.939Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-provider.test.ts", "glob-helper.test.ts", "graph-loader.test.ts", "paths.test.ts"]
---

## Summary

This module tests utilities for resolving analysis backends, globbing source files, loading graph stores, and path handling. The main suites validate provider selection precedence (Anthropic → local OpenAI-compatible → claude-CLI → null), platform-aware PATH scanning for CLI detection, and safe multi-language file discovery with sensible exclusions (build artifacts, test files). The tests emphasize graceful degradation, deterministic precedence, and injectable mocking for cross-platform reproducibility.

## Invariants

- Provider precedence is strict: ANTHROPIC_API_KEY > HARNESS_ANALYSIS_BASE_URL > config-declared endpoint > claude-CLI > null; Anthropic always wins when set (backward compatible).
- Whitespace-only env vars degrade gracefully—HARNESS_ANALYSIS_BASE_URL='   ' is treated as unset, never throws, retries lower precedence.
- Platform-aware PATH scan is deterministic and injectable: delimiter (:/:;), PATHEXT, and Path/PATH case-folding pinned by tests, not runtime. Allows OS-independent test execution.
- glob-helper excludes are exhaustive and unconditional: node_modules, dist, .git, .next, .nuxt, __pycache__, *.test.* files always skipped unless custom patterns override. Nonexistent paths return [], not error.
- Config-declared endpoint (ADR 0109 slice 3) bypasses claude-CLI fallback, centralizing provider selection in harness config.

## Interface Contract

```ts

```

## Dependency Slice

```
import { isClaudeCliAvailable, resolveAnalysisProvider, resolveProviderKind } from '../../../src/mcp/utils/analysis-provider.js'
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
