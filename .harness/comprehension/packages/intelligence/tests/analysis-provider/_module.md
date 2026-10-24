---
schemaVersion: 1
module: 'packages/intelligence/tests/analysis-provider'
sourceHash: 'b8fb320f9c4811070136d69fb74122f27d9ac8f085652b2ff26ae85c656e76c6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.test.ts',
    'claude-cli.test.ts',
    'generic-cli.test.ts',
    'openai-compatible.test.ts',
    'schema.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnthropicAnalysisProvider } from '../../src/analysis-provider/anthropic.js'
import { ClaudeCliAnalysisProvider } from '../../src/analysis-provider/claude-cli.js'
import { GenericCliAnalysisProvider, buildCustomCliTemplate, codexCliTemplate, createCliAnalysisProvider, geminiCliTemplate, jsonEnvelopeParser, textSalvageParser } from '../../src/analysis-provider/generic-cli.js'
import { OpenAICompatibleAnalysisProvider } from '../../src/analysis-provider/openai-compatible.js'
import { zodToJsonSchema } from '../../src/analysis-provider/schema.js'
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from '../../src/analysis-provider/structured-output.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
