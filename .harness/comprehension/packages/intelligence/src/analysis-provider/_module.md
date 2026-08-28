---
schemaVersion: 1
module: 'packages/intelligence/src/analysis-provider'
sourceHash: 'e74d6a8f430652713decb6fdda6e1b124dc79ce11e154f15705c7cf176f5c204'
compiledAt: '2026-08-28T01:22:11.836Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

packages/intelligence/src/analysis-provider is a pluggable abstraction for LLM-backed structured analysis that wraps different backends (Anthropic SDK, local Claude CLI, OpenAI-compatible APIs) under a single interface enforcing schema-validated JSON responses using Zod. A caller supplies AnalysisRequest (prompt, system prompt, optional images, Zod response schema) and receives AnalysisResponse<T> with validated result, token usage, and latency. Key implementations: AnthropicAnalysisProvider uses tool_use pattern to force structured_output tool calls; ClaudeCliAnalysisProvider spawns the local Claude CLI with --json-schema flag enforcement, handling text via -p and images via stream-json stdin/stdout transport; OpenAICompatibleAnalysisProvider provides OpenAI endpoint support. Helper utilities include zodToJsonSchema, coerceStructuredContent (tolerant JSON salvage), buildCorrectionPrompt (retry logic), and extractEmbeddedJson (fallback parsing).

## Invariants

- Schema-first validation: every response is validated against the caller's Zod schema before returning; schema mismatch triggers one corrective retry (CLI) or requires caller retry (Anthropic)
- Tool/flag enforcement is hard constraint: Anthropic forces tool calls via tool_choice, CLI enforces via --json-schema — not best-effort hints
- Image handling is transport-specific: Anthropic uses content block arrays, CLI requires stream-json transport (stdin/stdout newline-delimited JSON), not -p text prompts
- Token accumulation spans retries: input_tokens, output_tokens, and latencyMs include full wall-clock including corrective attempts
- CLI coercion is graceful (never throws): coerceStructuredContent returns raw prose on chatty replies so mechanical schema check can trigger retry, avoiding false hard-failures
- Model selection follows hierarchy: request.model > constructor defaultModel > provider constant (claude-sonnet-4-20250514 for Anthropic, 'claude' for CLI)
- CLI timeout is per-spawn: configurable timeout (default 180s); spawn failure or non-zero exit propagates as real error, not retried

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
