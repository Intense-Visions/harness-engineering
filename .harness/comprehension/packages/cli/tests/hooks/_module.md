---
schemaVersion: 1
module: 'packages/cli/tests/hooks'
sourceHash: '1bcfd3c677623abd2997b61e1edc9babc1aad1c1702ab2bf7720b851335e4a80'
compiledAt: '2026-08-28T01:22:09.785Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/cli/tests/hooks` module is a comprehensive integration suite for 23+ git hooks and supporting infrastructure that enforce quality gates, telemetry tracking, and policy compliance across the harness engineering pipeline. It tests hooks that block or warn on commits (format check, architecture violations, cost overruns, quality gates, unverified pushes), record session data for retrospection and adoption analytics across Codex/Cursor/Gemini platforms, prevent policy violations via sentinel gates, track metrics on skill usage and session outcomes, and manage hook profile installations across different contexts. Tests spawn hooks as isolated Node.js processes with deterministic stdin/stdout, verify fail-open behavior, validate profile consistency, and run e2e integration tests against real git and shell execution environments.

## Invariants

- Fail-open policy: All hooks exit 0 on empty/missing stdin to avoid blocking commits when data isn't available.
- Hooks-to-profiles consistency: Every hook script referenced in a profile must exist as a .js file and be syntactically valid Node.js.
- Stdin delivery via process.input: Hooks must receive stdin via spawnSync's input option (not pipes) to avoid partial/empty delivery under v8 coverage and concurrent file I/O.
- Session state isolation: Each session_id gets its own taint/state files in .harness/; cross-session pollution invalidates sentinel tracking.
- Relocated metrics path: Hooks read from .harness/metrics/skill-events.jsonl (not legacy .harness/events.jsonl); path migration (#GH-580 D5) must be enforced in tests.
- Fail-closed gate structure: Pre-commit gates use 'if ! <producer> >log 2>&1; then exit 1; fi' to block commits on nonzero exit, despite pipes masking exit codes—the if/then structure is load-bearing, not the producer.
- Multi-platform hook parity: Codex/Cursor/Gemini platforms each need separate hook implementations; shared core logic lives in -core.js but entry points are platform-specific.
- Adoption record granularity: One adoption record per skill per session, aggregating all phase_transitions and final outcome; handoff events mark completion, errors mark failure, missing both = abandoned.
- Formatter detection precedence: Biome > Prettier > other; once detected, reused across files in the same run.
- Hook profile definitions immutable during a run: Profile.strict and Profile.development enumerate which hooks fire; changing profiles mid-test invalidates gate assumptions.

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
