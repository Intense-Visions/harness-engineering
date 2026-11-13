---
schemaVersion: 1
module: '.harness/hooks'
sourceHash: 'b620349c764b2df05fa44fba5894437e48acb0a953c0854a650c6719c20836cc'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption-tracker.js',
    'autonomy-guard.js',
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
export readHookInput
export readHookStdin
export retrospectLogLine
export retrospectSession
export runFormatCheck
```

## Dependency Slice

```
import { readHookInput, runFormatCheck } from './format-check.js'
import { readHookStdin } from './read-hook-stdin.js'
import { parseCodexNotifyPayload, readHookStdin, retrospectLogLine, retrospectSession } from './session-retrospect-core.js'
import '@harness-engineering/core'
import '@harness-engineering/orchestrator'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs, { accessSync, appendFileSync, existsSync, mkdirSync, readFileSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path, { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
```
