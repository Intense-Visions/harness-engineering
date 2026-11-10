---
schemaVersion: 1
module: 'packages/intelligence/src/analysis-provider'
sourceHash: '710e68617cf43c5fc247a4eaac2960df0ab22419d2c808adfd2bee154f0407ec'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.ts',
    'child-stdin.ts',
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
export guardChildStdin
export isClosedPipeError
export jsonEnvelopeParser
export textSalvageParser
export zodToJsonSchema
```

## Dependency Slice

```
import { guardChildStdin } from './child-stdin.js'
import { AnalysisImage, AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js'
import { zodToJsonSchema } from './schema.js'
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from './structured-output.js'
import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'node:child_process'
import { Writable } from 'node:stream'
import OpenAI from 'openai'
import { z } from 'zod'
```
