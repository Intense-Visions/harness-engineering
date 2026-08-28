---
schemaVersion: 1
module: 'packages/cli/tests/hooks'
sourceHash: '1bcfd3c677623abd2997b61e1edc9babc1aad1c1702ab2bf7720b851335e4a80'
compiledAt: '2026-08-28T01:22:09.785Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption-tracker.test.ts',
    'agent-retrospect.test.ts',
    'block-no-verify.test.ts',
    'cost-tracker.test.ts',
    'format-check.test.ts',
    'hooks-cli-integration.test.ts',
    'integration.test.ts',
    'pre-commit-cicheck-gate.e2e.test.ts',
    'pre-commit-dogfood-managed-block.test.ts',
    'pre-commit-skip-allowlist.test.ts',
    'pre-commit-unbuilt-cli-gate.e2e.test.ts',
    'pre-compact-state.test.ts',
    'profiles.test.ts',
    'protect-config.test.ts',
    'quality-warner.test.ts',
    'roadmap-regen-hook.e2e.test.ts',
    'sentinel-pre.test.ts',
    'sentinel.test.ts',
    'session-retrospect-agents.test.ts',
    'session-retrospect-core.test.ts',
    'session-retrospect.test.ts',
    'strict-quality-gate.test.ts',
    'telemetry-reporter.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { initHooks } from '../../src/commands/hooks/init'
import { listHooks } from '../../src/commands/hooks/list'
import { removeHooks } from '../../src/commands/hooks/remove'
import { DEFAULT_REGEN_COMMAND, HOOK_BLOCK_BEGIN, HOOK_BLOCK_END, buildRegenBlock } from '../../src/commands/roadmap/install-hook'
import { RETROSPECT_HOOK_ENTRY_NAME, installAgentRetrospectHooks, writeCodexNotifyHook, writeCursorRetrospectHooks, writeGeminiSessionEndHook } from '../../src/hooks/agent-retrospect'
import { detectFormatter, runFormatCheck } from '../../src/hooks/format-check.js'
import { HOOK_SCRIPTS, HookProfile, PROFILES } from '../../src/hooks/profiles'
import { HOOK_SCRIPTS, PROFILES } from '../../src/hooks/profiles.js'
import { parseCodexNotifyPayload } from '../../src/hooks/session-retrospect-core.js'
import { RoadmapMeta, Shard, parseRoadmap, serializeMeta, serializeShard } from '@harness-engineering/core'
import { execFileSync, execSync, spawnSync } from 'node:child_process'
import * as fs, { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as os, { tmpdir } from 'node:os'
import * as path, { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
