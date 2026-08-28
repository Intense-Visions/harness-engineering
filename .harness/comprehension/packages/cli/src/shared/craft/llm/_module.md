---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/llm'
sourceHash: 'ac927ed16c1c23ff488e8cb98dbc831611da529195ad6933bffb07f1f913f64c'
compiledAt: '2026-08-28T01:22:09.355Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'adapters.test.ts',
    'adapters.ts',
    'contracts.ts',
    'in-session.ts',
    'lazy-local-adapter.ts',
    'orchestrator-md.test.ts',
    'orchestrator-md.ts',
    'provider.ts',
  ]
---

## Summary

The `shared/craft/llm` module provides a unified interface for LLM calls across multiple providers (Anthropic, Claude CLI, OpenAI-compatible). It wraps intelligence-package AnalysisProviders into a craft-compatible contract via AnalysisProviderAdapter, enforcing a raw-envelope pattern where responses are JSON-fenced within a `{raw: string}` envelope. The module routes provider selection through orchestrator.md configuration, supports optional vision capabilities with provider gating, tracks token costs per call, and offers lazy local fallback resolution and in-session deferred prompt execution for scenarios where prompts need runtime binding.

## Invariants

- Raw envelope contract: AnalysisProviderAdapter.callText always returns the raw field from the inner analyze result; system prompt receives appended raw-envelope instructions ('Return a JSON object with a single field "raw"...').
- Vision capability gating: callVision throws if supportsVision is false; the backend is never called for non-vision providers, preventing silent image drops.
- Provider ID and model are factory-set: adaptClaudeCli→'claude-cli'/'claude', adaptAnthropic→'anthropic'/'claude-sonnet-4-20250514', adaptOpenAICompatible→'openai-compatible'/'unknown'; overrides are allowed but the default is immutable per factory.
- Cost tracking accumulates: getCosts() returns an array of all LlmCallCost entries from all callText/callVision invocations; each call appends one entry with model fallback to adapter.model if response.model is empty.
- System prompt composition: when a caller supplies systemPrompt, the raw-envelope instructions are appended after a double-newline; when none is supplied, only raw-envelope instructions are used.
- Response schema is a passthrough bridge: z.object({raw: z.string()}) is always passed to the inner provider's analyze method, rejecting non-string or missing raw fields at validation time.
- Provider resolution precedence: readBackendsFromOrchestratorMd yields providers from orchestrator.md config; getProvider checks that config first, then falls back to factory defaults (Anthropic/Claude CLI); lazy local adapter resolves only if no orchestrator config is found.
- In-session deferred prompts are runtime-bound: DeferredPrompt and InSessionLlmProvider decouple prompt definition from execution, allowing prompts to be resolved at craft-phase runtime when external state (e.g., discovered entities, prior results) is available.

## Interface Contract

```ts
export AnalysisProviderAdapter
export DeferredPrompt
export InSessionLlmProvider
export LazyLocalAdapter
export LazyLocalAdapterOptions
export LlmCallCost
export LlmProvider
export MockLlmProvider
export PromptDeferredError
export VisionInput
export adaptAnthropic
export adaptClaudeCli
export adaptOpenAICompatible
export findOrchestratorMd
export getProvider
export readBackendsFromOrchestratorMd
export resolveCraftLlmConfig
export resolveCraftLlmMode
```

## Dependency Slice

```
import { findConfigFile, loadConfig } from '../../../config/loader.js'
import { AnalysisProviderAdapter, adaptAnthropic, adaptClaudeCli, adaptOpenAICompatible } from './adapters'
import { AnalysisProviderAdapter, adaptAnthropic, adaptClaudeCli, adaptOpenAICompatible } from './adapters.js'
import { LlmCallCost } from './contracts'
import { LlmCallCost, LlmProvider, VisionInput } from './contracts.js'
import { InSessionLlmProvider } from './in-session.js'
import { LazyLocalAdapter } from './lazy-local-adapter.js'
import { findOrchestratorMd, readBackendsFromOrchestratorMd } from './orchestrator-md.js'
import { AnthropicAnalysisProvider, ClaudeCliAnalysisProvider, OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence'
import { defaultFetchModels } from '@harness-engineering/orchestrator'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
```
