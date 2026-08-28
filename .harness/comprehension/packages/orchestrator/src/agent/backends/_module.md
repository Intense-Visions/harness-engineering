---
schemaVersion: 1
module: "packages/orchestrator/src/agent/backends"
sourceHash: "3766dca9e6f6eaf8eb24afd277a738ed6f0ddb6c9c1985cc61ca67fed1dcb694"
compiledAt: "2026-08-28T01:22:12.177Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["anthropic.ts", "claude.policy-envelope.test.ts", "claude.ts", "codex-agent-message.test.ts", "codex.policy-envelope.test.ts", "codex.test.ts", "codex.ts", "container.ts", "gemini.ts", "local.ts", "mock.ts", "ollama.ts", "openai.ts", "pi.ts", "serverless.ts", "ssh.ts"]
---

## Summary

This module provides a polymorphic backend layer for running agents across 11+ execution environments (Anthropic, Claude CLI, Codex, Gemini, Ollama, OpenAI, Pi, SSH, Container, OCI Serverless, Mock). Each backend implements a common `AgentBackend` interface with lifecycle methods: `startSession()`, `runTurn()` (async generator streaming events), and `stopSession()`. Backends translate provider-specific protocols (REST APIs, CLI spawns, MCP servers) into a normalized shape. The module includes governance plumbing to audit policy enforcement at spawn time, normalize token usage and cache metrics across providers, and parse subscription-limit notifications with fallback semantics.

## Invariants

- Backend contract is symmetric: all implementations must expose startSession | runTurn | stopSession | healthCheck; callers dispatch polymorphically by backendName.
- Session identity is immutable: sessionId, backendName, startedAt, and workspacePath are set once and never mutated; all downstream usage tracking keys off sessionId.
- Token usage must surface on yielded events: TurnResult.usage alone is dropped by async-generator consumers; usage must be yielded as a separate { type: 'usage', usage: {...} } event so the orchestrator advances rate-limit windows.
- Policy audit stamps at spawn time before execution: PolicyAuditRecord is handed to the sink synchronously before subprocess runs; it records metadata and stripped env key names only (never values), so no secrets leak into audit logs even on failure.
- Provider credentials are NOT stripped from env: ANTHROPIC_API_KEY, OPENAI_API_KEY etc. always pass to subprocess; only user-app secrets (DATABASE_URL, custom tokens) are withheld and named in the audit record.
- Subscription-limit detection has fallback semantics: PRIMARY_LIMIT_RE is strict (captures reset time + timezone); looksLikeUnparsedLimit() catches format drift; fallback resolution returns { resolved: 'fallback', resetsAtMs: now + 1h } when timezone parse fails, and callers must surface the distinction.
- Cache metrics are provider-agnostic: AnthropicCacheAdapter, GeminiCacheAdapter, and OpenAICacheAdapter normalize to common { cacheCreationTokens, cacheReadTokens } on TurnResult.usage.

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
import { buildSubprocessEnv } from '../subprocess-env.js'
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
