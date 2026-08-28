---
schemaVersion: 1
module: 'packages/orchestrator/tests/agent/backends'
sourceHash: 'cd396b68778d30c3eebe3375fd70458cc0d05df7e8f1c3928a6551d94fd54ad6'
compiledAt: '2026-08-28T01:22:12.538Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.test.ts',
    'claude.test.ts',
    'container.test.ts',
    'gemini.test.ts',
    'local.test.ts',
    'mock.test.ts',
    'ollama-mcp.test.ts',
    'ollama.test.ts',
    'openai.test.ts',
    'pi.test.ts',
    'serverless.behavior.test.ts',
    'serverless.test.ts',
    'ssh.test.ts',
  ]
---

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
