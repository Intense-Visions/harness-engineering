---
schemaVersion: 1
module: '.harness/hooks'
sourceHash: '8fc4c1f3b4967f60b6e9329bbb1f4213b319c8643ad11396263d0f25ed080f70'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption-tracker.js',
    'block-no-verify.js',
    'format-check.js',
    'pre-compact-state.js',
    'protect-config.js',
    'quality-warner.js',
    'read-hook-stdin.js',
    'sentinel-post.js',
    'sentinel-pre.js',
    'session-retrospect-codex.js',
    'session-retrospect-core.js',
    'session-retrospect-cursor.js',
    'session-retrospect-gemini.js',
    'session-retrospect.js',
    'telemetry-reporter.js',
  ]
---

## Interface Contract

```ts
export detectFormatter
export isRetrospectionEnabled
export parseCodexNotifyPayload
export parseHookInput
export readHookStdin
export retrospectLogLine
export retrospectSession
export runFormatCheck
```

## Dependency Slice

```
import { parseHookInput, runFormatCheck } from './format-check.js'
import { readHookStdin } from './read-hook-stdin.js'
import { parseCodexNotifyPayload, readHookStdin, retrospectLogLine, retrospectSession } from './session-retrospect-core.js'
import '@harness-engineering/core'
import '@harness-engineering/orchestrator'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { accessSync, appendFileSync, existsSync, mkdirSync, readFileSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
```
