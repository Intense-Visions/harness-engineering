---
schemaVersion: 1
module: 'packages/cli/tests/hooks'
sourceHash: '40c7b37effe143152a0d2f6d20f3ec1dcd7bcbc281417569a9939504dcd3d8c0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption-tracker.test.ts',
    'agent-retrospect.test.ts',
    'autonomy-guard.test.ts',
    'block-no-verify.test.ts',
    'cost-tracker.test.ts',
    'dogfood-hook-parity.test.ts',
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
import '../../../../scripts/lib/plugin-config.mjs'
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
import { createHash } from 'node:crypto'
import { chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join, resolve } from 'node:path'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
