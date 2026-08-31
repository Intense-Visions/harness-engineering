---
schemaVersion: 1
module: 'packages/orchestrator/src/agent/backends'
sourceHash: '2b78b1655f2f872a15fdaf2767bab71aaf756dee86aa81339d86052d8044dfb2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'anthropic.ts',
    'claude.lane-isolation.test.ts',
    'claude.policy-envelope.test.ts',
    'claude.ts',
    'codex-agent-message.test.ts',
    'codex.policy-envelope.test.ts',
    'codex.test.ts',
    'codex.ts',
    'container.ts',
    'gemini.ts',
    'local.ts',
    'mock.ts',
    'ollama.ts',
    'openai.ts',
    'pi.ts',
    'serverless.ts',
    'ssh.ts',
  ]
---

## Interface Contract

```ts
export AnthropicBackend
export ClaudeBackend
export CodexBackend
export ContainerBackend
export GeminiBackend
export LocalBackend
export MockBackend
export OciServerlessBackend
export OllamaBackend
export OpenAIBackend
export PiBackend
export SshBackend
export buildMcpConfigArgs
export extractCodexAgentMessage
export fromNativeResponse
export looksLikeUnparsedLimit
export parseSubscriptionLimit
export recordCacheUsage
export toNativeMessages
export truncate
```

## Dependency Slice

```
import { BackendDefSchema } from '../../workflow/schema'
import { createBackend, isLocalEndpointBackend, isLocalExecutionBackend } from '../backend-factory'
import { buildSubprocessEnv, isLaneStateIsolationEnabled } from '../subprocess-env.js'
import { ClaudeBackend, PolicyAuditRecord } from './claude'
import { PolicyAuditSink } from './claude.js'
import { CodexBackend, buildMcpConfigArgs, extractCodexAgentMessage } from './codex'
import Anthropic from '@anthropic-ai/sdk'
import { TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import from '@earendil-works/pi-coding-agent'
import { GoogleGenAI } from '@google/genai'
import { AnthropicCacheAdapter, CacheMetricsRecorder, GeminiCacheAdapter, OpenAICacheAdapter } from '@harness-engineering/core'
import { AgentBackend, AgentError, AgentEvent, AgentSession, ContainerConfig, ContainerHandle, ContainerRuntime, Err, McpServerSpec, Ok, PolicyMetadata, PolicyNetworkMode, PolicySandboxMode, Result, SecretBackend, SessionStartParams, TokenUsage, TurnParams, TurnResult } from '@harness-engineering/types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import * as childProcess, { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'
import OpenAI from 'openai'
import { describe, expect, it } from 'vitest'
```
