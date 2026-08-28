---
schemaVersion: 1
module: 'packages/intelligence/tests/analysis-provider'
sourceHash: 'a72393de3c5d9483196dce4bcf7fa70d96164acc11bce23f4b4138213c0fee51'
compiledAt: '2026-08-28T01:22:11.879Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['anthropic.test.ts', 'claude-cli.test.ts', 'openai-compatible.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnthropicAnalysisProvider } from '../../src/analysis-provider/anthropic.js'
import { ClaudeCliAnalysisProvider } from '../../src/analysis-provider/claude-cli.js'
import { OpenAICompatibleAnalysisProvider } from '../../src/analysis-provider/openai-compatible.js'
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from '../../src/analysis-provider/structured-output.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
