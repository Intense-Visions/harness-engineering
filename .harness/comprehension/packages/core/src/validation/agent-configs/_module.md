---
schemaVersion: 1
module: 'packages/core/src/validation/agent-configs'
sourceHash: '9636a2113e2f4002564a0815ce46dac476f2c73f301dd64cdf2fc14ae4601c65'
compiledAt: '2026-08-28T01:22:10.674Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['agnix-runner.ts', 'index.ts', 'runner.ts', 'types.ts']
---

## Summary

This module implements hybrid agent-config validation: it prefers an external `agnix` binary (~385 rules) for comprehensive checks but gracefully falls back to a deterministic TypeScript rule set when agnix is unavailable, disabled, or fails. The `validateAgentConfigs()` async function handles binary resolution (explicit arg → HARNESS_AGNIX_BIN env → PATH lookup), spawning with timeout, JSON parsing, and severity normalization. In strict mode, all warnings are promoted to errors. The output shape is stable across both engines so downstream consumers don't branch on which engine ran.

## Invariants

- Fallback is deterministic: TypeScript rules must succeed without external tool dependencies so callers always get a result
- Binary resolution precedence is strict: explicit arg > HARNESS_AGNIX_BIN env var > PATH lookup; no re-ordering allowed
- Timeout always settles the promise: runAgnix() must resolve (never hang or reject) even on timeout; callers rely on this to avoid hot-path exceptions
- Output shape is engine-agnostic: both agnix and fallback return AgentConfigValidation with identical structure; downstream must not branch on engine field
- Strict mode means valid = no errors: valid:true in strict mode guarantees zero error-severity findings
- File paths are cwd-relative and normalized: raw paths are stripped of cwd prefix and leading slashes for portability
- Severity normalization is case-insensitive and deterministic: same raw severity string always produces the same AgentConfigSeverity enum value

## Interface Contract

```ts
export AgentConfigFallbackReason
export AgentConfigFinding
export AgentConfigOptions
export AgentConfigSeverity
export AgentConfigValidation
export runFallbackRules
export validateAgentConfigs
```

## Dependency Slice

```
import { DEFAULT_AGNIX_TIMEOUT_MS, isAgnixDisabled, parseAgnixOutput, resolveAgnixBinary, runAgnix } from './agnix-runner'
import { runFallbackRules } from './fallback'
import { AgentConfigFallbackReason, AgentConfigFinding, AgentConfigOptions, AgentConfigSeverity, AgentConfigValidation } from './types'
import { SpawnOptions, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
```
