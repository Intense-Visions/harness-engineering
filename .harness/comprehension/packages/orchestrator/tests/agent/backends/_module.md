---
schemaVersion: 1
module: "packages/orchestrator/tests/agent/backends"
sourceHash: "cd396b68778d30c3eebe3375fd70458cc0d05df7e8f1c3928a6551d94fd54ad6"
compiledAt: "2026-08-28T01:22:12.538Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["anthropic.test.ts", "claude.test.ts", "container.test.ts", "gemini.test.ts", "local.test.ts", "mock.test.ts", "ollama-mcp.test.ts", "ollama.test.ts", "openai.test.ts", "pi.test.ts", "serverless.behavior.test.ts", "serverless.test.ts", "ssh.test.ts"]
---

## Summary

`packages/orchestrator/tests/agent/backends` is the test suite for the agent backend abstraction layer—a pluggable provider interface supporting Anthropic, Claude, Gemini, OpenAI, Ollama, Pi, container-based, SSH-based, and serverless (OCI) LLM backends. The tests validate that each backend correctly implements the `AgentBackend` interface: session lifecycle (startSession → runTurn* → stopSession), streaming turn execution with real-time token accounting, proper error translation from provider APIs, and system-prompt handling. Key focus areas are cache-usage propagation to the orchestrator's state machine and provider-specific success-flag translation (Anthropic's `usage` fields, Claude's `result.subtype`/`is_error` semantics).

## Invariants

- Usage must be yielded on AgentEvents, not buried in TurnResult. The orchestrator's for-await-of loop only observes yielded events; TurnResult is discarded. Backends must emit at least one AgentEvent with .usage populated (typically the final one) or token accounting silently fails.
- TurnResult.success flag is the early-termination sentinel. AgentRunner gates its exit check on result.success === true. Provider APIs use varying success schemas (Anthropic: usage present, Claude: subtype=success && is_error=false, error cases: exception or is_error=true)—each backend must translate to the canonical boolean.
- Session identity persists through the session lifetime. startSession returns a sessionId (e.g., anthropic-session-<uuid>); runTurn and stopSession must accept/return the same session object without mutation or identity loss.
- System prompts propagate with cache directives. When startSession receives systemPrompt, it must pass it to the backend API with appropriate cache_control metadata (e.g., Anthropic's { type: 'ephemeral' })—omitting cache headers breaks prompt-caching optimization.
- Provider errors must surface as TurnResult.success=false with error message. When an SDK throws (rate-limit, auth, network), the backend catches it, yields any partial text, and returns { success: false, error: <message> } rather than propagating the exception.
- Backends must validate preconditions at startSession, not at runTurn. API key checks, workspace validation, and health checks happen during session start so invalid configs fail early; runTurn assumes a healthy session.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnthropicBackend } from '../../../src/agent/backends/anthropic'
import { ClaudeBackend, looksLikeUnparsedLimit, parseSubscriptionLimit, recordCacheUsage } from '../../../src/agent/backends/claude'
import { ContainerBackend } from '../../../src/agent/backends/container'
import { GeminiBackend } from '../../../src/agent/backends/gemini'
import { LocalBackend } from '../../../src/agent/backends/local'
import { MockBackend } from '../../../src/agent/backends/mock'
import { McpToolDescriptor, OllamaBackend, OllamaBackendConfig, OllamaSession, fromNativeResponse, toNativeMessages, truncate } from '../../../src/agent/backends/ollama'
import { OpenAIBackend } from '../../../src/agent/backends/openai'
import { PiBackend } from '../../../src/agent/backends/pi'
import { OciServerlessBackend } from '../../../src/agent/backends/serverless.js'
import { SshBackend } from '../../../src/agent/backends/ssh.js'
import from '@anthropic-ai/sdk'
import from '@earendil-works/pi-coding-agent'
import from '@google/genai'
import { CacheMetricsRecorder } from '@harness-engineering/core'
import { AgentBackend, AgentEvent, AgentSession, ContainerConfig, ContainerHandle, ContainerRuntime, Err, Ok, SecretBackend, TurnResult } from '@harness-engineering/types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as child_process from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter, PassThrough } from 'node:stream'
import from 'openai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
