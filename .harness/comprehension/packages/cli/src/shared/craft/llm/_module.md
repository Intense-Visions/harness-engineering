---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/llm'
sourceHash: 'ac927ed16c1c23ff488e8cb98dbc831611da529195ad6933bffb07f1f913f64c'
compiledAt: '2026-08-28T01:22:09.355Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
