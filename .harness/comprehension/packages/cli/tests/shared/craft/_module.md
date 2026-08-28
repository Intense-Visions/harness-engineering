---
schemaVersion: 1
module: 'packages/cli/tests/shared/craft'
sourceHash: 'cf35230189661a609e18f0163119f5ad50f6ec708a05d494d98750563f550ae4'
compiledAt: '2026-08-28T01:22:09.979Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'diagnostics.test.ts',
    'in-session-guard.test.ts',
    'lazy-local-adapter.test.ts',
    'llm-provider.test.ts',
  ]
---

## Summary

The `packages/cli/tests/shared/craft` module tests the shared LLM infrastructure underpinning craft-family commands (copy, docs, knowledge, security, spec, test). It validates three critical subsystems: LLM provider resolution (env var → provider selection), local model adapter behavior (lazy probing and model selection), and a guard against silent failures (issue #1368) that ensures all inline craft entry points loudly reject the in-session provider rather than silently returning empty findings. Diagnostics tests verify clear formatting of provider/mode and file analysis counts.

## Invariants

- Every inline craft entry point (runCopyCraft, runDocsCraft, runKnowledgeCraft, runSecurityCraft, runSpecCraft) must throw when given InSessionLlmProvider, never silently return findings: []
- LazyLocalAdapter probes available models exactly once per instance and caches the result; fetchModels() is called no more than once
- Model resolution picks the first item in the configured list that fetchModels() reports as actually loaded; errors clearly (with message showing Configured vs Detected) if no match
- All provider refusals and local endpoint failures must include the HARNESS_CRAFT_LLM env var name and actionable hints (e.g., 'Is the server running?')
- Diagnostic formatter must always report the resolved provider/mode and distinguish 'analyzed N files' (analysis ran) from 'analyzed 0 files' (no files were analyzable)

## Interface Contract

```ts

```

## Dependency Slice

```
import { runCopyCraft } from '../../../src/copy-craft'
import { runDocsCraft } from '../../../src/docs-craft'
import { runKnowledgeCraft } from '../../../src/knowledge-craft'
import { runSecurityCraft } from '../../../src/security-craft'
import { describeCraftResolution, formatCraftDiagnostic } from '../../../src/shared/craft/diagnostics'
import { LlmProvider } from '../../../src/shared/craft/llm/contracts'
import { LazyLocalAdapter } from '../../../src/shared/craft/llm/lazy-local-adapter'
import { CraftLlmResolution, InSessionLlmProvider, MockLlmProvider, PromptDeferredError, getProvider, resolveCraftLlmConfig, resolveCraftLlmMode } from '../../../src/shared/craft/llm/provider'
import { runSpecCraft } from '../../../src/spec-craft'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
