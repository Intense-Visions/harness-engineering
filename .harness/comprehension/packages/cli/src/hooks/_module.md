---
schemaVersion: 1
module: 'packages/cli/src/hooks'
sourceHash: 'fdc1e759c175eb6344aef1594c3c8a38ad484fd862a583ac59899954d886cfbf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption-tracker.js',
    'agent-retrospect.ts',
    'autonomy-guard.js',
    'block-no-verify.js',
    'cost-tracker.js',
    'format-check.js',
    'pre-compact-state.js',
    'profiles.ts',
    'protect-config.js',
    'quality-warner.js',
    'read-hook-stdin.js',
    'sentinel-post.js',
    'sentinel-pre.js',
    'session-retrospect-codex.js',
    'session-retrospect-core.d.ts',
    'session-retrospect-core.js',
    'session-retrospect-cursor.js',
    'session-retrospect-gemini.js',
    'session-retrospect.js',
    'strict-quality-gate.js',
    'support-files.test.ts',
    'support-files.ts',
    'telemetry-reporter.js',
  ]
---

## Interface Contract

```ts
export HOOK_SCRIPTS
export HOOK_SUPPORT_FILES
export PROFILES
export RETROSPECT_HOOK_ENTRY_NAME
export detectFormatter
export installAgentRetrospectHooks
export isRetrospectionEnabled
export parseCodexNotifyPayload
export parseHookInput
export readHookStdin
export retrospectLogLine
export retrospectSession
export runFormatCheck
export supportFilesFor
export writeCodexNotifyHook
export writeCursorRetrospectHooks
export writeGeminiSessionEndHook
```

## Dependency Slice

```
import { parseHookInput, runFormatCheck } from './format-check.js'
import { HOOK_SCRIPTS } from './profiles'
import { readHookStdin } from './read-hook-stdin.js'
import { parseCodexNotifyPayload, readHookStdin, retrospectLogLine, retrospectSession } from './session-retrospect-core.js'
import { HOOK_SUPPORT_FILES, supportFilesFor } from './support-files'
import '@harness-engineering/core'
import '@harness-engineering/orchestrator'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs, { accessSync, appendFileSync, existsSync, mkdirSync, readFileSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import os from 'node:os'
import path, { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import * as path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
```
