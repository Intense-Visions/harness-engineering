---
schemaVersion: 1
module: 'packages/intelligence/src/analysis-provider'
sourceHash: 'e74d6a8f430652713decb6fdda6e1b124dc79ce11e154f15705c7cf176f5c204'
compiledAt: '2026-08-28T01:22:11.836Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.ts',
    'claude-cli.ts',
    'interface.ts',
    'openai-compatible.ts',
    'schema.ts',
    'structured-output.ts',
  ]
---

## Interface Contract

```ts
export AnthropicAnalysisProvider
export ClaudeCliAnalysisProvider
export OpenAICompatibleAnalysisProvider
export buildCorrectionPrompt
export coerceStructuredContent
export extractEmbeddedJson
export zodToJsonSchema
```

## Dependency Slice

```
import { AnalysisImage, AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js'
import { zodToJsonSchema } from './schema.js'
import { buildCorrectionPrompt, coerceStructuredContent } from './structured-output.js'
import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'node:child_process'
import OpenAI from 'openai'
import { z } from 'zod'
```
