---
schemaVersion: 1
module: 'packages/intelligence/tests/analysis-provider'
sourceHash: 'fe77ee39b3aaa225ae88b0d351e658ef8d0bda1f49caf703a6a7d127b5fe2f07'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.test.ts',
    'child-stdin.real-spawn.test.ts',
    'claude-cli.test.ts',
    'generic-cli.test.ts',
    'openai-compatible.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnthropicAnalysisProvider } from '../../src/analysis-provider/anthropic.js'
import { isClosedPipeError } from '../../src/analysis-provider/child-stdin.js'
import { ClaudeCliAnalysisProvider } from '../../src/analysis-provider/claude-cli.js'
import { GenericCliAnalysisProvider, buildCustomCliTemplate, codexCliTemplate, createCliAnalysisProvider, geminiCliTemplate, jsonEnvelopeParser, textSalvageParser } from '../../src/analysis-provider/generic-cli.js'
import { OpenAICompatibleAnalysisProvider } from '../../src/analysis-provider/openai-compatible.js'
import { buildCorrectionPrompt, coerceStructuredContent, extractEmbeddedJson } from '../../src/analysis-provider/structured-output.js'
import { EventEmitter } from 'node:events'
import { execPath } from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
