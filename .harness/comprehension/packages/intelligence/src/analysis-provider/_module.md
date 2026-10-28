---
schemaVersion: 1
module: 'packages/intelligence/src/analysis-provider'
sourceHash: 'a94a42094c3bb25443e3679cc8ed22ae8a969b1bc169960fa5cce6ef1c8f99e3'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.ts',
    'claude-cli.ts',
    'generic-cli.ts',
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
export GenericCliAnalysisProvider
export OpenAICompatibleAnalysisProvider
export buildCorrectionPrompt
export buildCustomCliTemplate
export codexCliTemplate
export coerceStructuredContent
export createCliAnalysisProvider
export extractEmbeddedJson
export geminiCliTemplate
export jsonEnvelopeParser
export textSalvageParser
export zodToJsonSchema
```

## Dependency Slice

```
import { AnalysisImage, AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js'
import { zodToJsonSchema } from './schema.js'
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from './structured-output.js'
import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'node:child_process'
import OpenAI from 'openai'
import { z } from 'zod'
```
