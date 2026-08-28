---
schemaVersion: 1
module: 'packages/intelligence/tests/analysis-provider'
sourceHash: 'a72393de3c5d9483196dce4bcf7fa70d96164acc11bce23f4b4138213c0fee51'
compiledAt: '2026-08-28T01:22:11.879Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['anthropic.test.ts', 'claude-cli.test.ts', 'openai-compatible.test.ts']
---

## Summary

The `analysis-provider` test module covers three LLM-backed analysis providers (Anthropic, claude-cli, OpenAI-compatible) that accept structured prompts and schemas, returning typed results with token usage and latency. Core surface: successful analysis, request construction (tools/models/images), and error handling. All providers enforce schema validation, tool-use instruction injection, and model/latency tracking.

## Invariants

- Anthropic tool-use is forced (tool_choice + response must have tool_use block)
- System prompt always includes tool-use instruction appended
- Default maxTokens = 4096 when unspecified
- Images always precede text in message content; base64 defaults to image/png
- Zod schema validation is strict (ZodError on mismatch)
- Token usage = inputTokens + outputTokens calculated from response fields
- Model name always reported in response
- Claude CLI prefers structured_output key, falls back to result/bare object
- Vision is best-effort (non-Anthropic providers ignore images)
- OpenAI model precedence: request.model > getModel() > defaultModel (fresh read per call)
- Errors propagate uncaught (network, missing tool_use, schema mismatch)
- disableThinking is advisory (provider may ignore if unsupported)

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
