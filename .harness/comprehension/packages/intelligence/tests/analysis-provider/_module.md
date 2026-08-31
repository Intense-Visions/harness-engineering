---
schemaVersion: 1
module: 'packages/intelligence/tests/analysis-provider'
sourceHash: '618bdf354ac045f973a197a506309252b1c1e25f56f70a69af58c249b96a769d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['anthropic.test.ts', 'claude-cli.test.ts', 'generic-cli.test.ts', 'openai-compatible.test.ts']
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
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from '../../src/analysis-provider/structured-output.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
