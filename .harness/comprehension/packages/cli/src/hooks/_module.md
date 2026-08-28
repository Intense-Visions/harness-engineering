---
schemaVersion: 1
module: 'packages/cli/src/hooks'
sourceHash: '390cdcb1db7c550ed372ba196e6dd1437da7726a6ab364d57dbc0c6becb28072'
compiledAt: '2026-08-28T01:22:09.268Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'adoption-tracker.js',
    'agent-retrospect.ts',
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

## Summary

`packages/cli/src/hooks` is the safety-gate infrastructure for Claude Code sessions. It defines a three-tier hook profile system (minimal, standard, strict) that installs pre-commit and post-edit guards into `.claude/settings.json` hooks. The module provides a shared formatter detection engine (Biome/Prettier/Ruff/gofmt) and resilient stdin reader that handles pipe backpressure. It includes nine profile-installed hooks enforcing safety (block-no-verify), quality (quality-warner, strict-quality-gate), telemetry (adoption-tracker, cost-tracker, telemetry-reporter), and session-end retrospection (session-retrospect) across Claude Code, Gemini CLI, Codex, and Cursor. A support-file registry ensures the installer ships all dependencies alongside consuming hooks, and multi-agent retrospection wires the same session-end trigger into each agent's native config format while preserving existing user configuration and maintaining idempotency.

## Invariants

- Support-file drift detection is mandatory: every hook that statically imports a sibling must list that file in HOOK_SUPPORT_FILES, enforced by the registry↔import test—missing deps cause ERR_MODULE_NOT_FOUND at load in adopters.
- Stdin reads distinguish read failure (ok: false, error populated) from empty input (ok: true, data: '')—block-no-verify treats EAGAIN as 'blind' and exits 2 (fail closed); other hooks treat it as 'no input' and exit 0 (fail open).
- Formatter detection is first-match-wins in deterministic order [Biome, Prettier, Ruff, gofmt]; config presence determines availability. The 'violations' status (real format issues) must be distinguishable from 'infra-error' (tool absent/timeout/spawn failure) so strict gates block only on real violations.
- Profile tiers are strictly additive by minProfile: minimal ⊆ standard ⊆ strict; a hook never appears in multiple tiers independently.
- Once-per-session retrospection dedupe via sentinel file at .harness/state/retrospection/<sessionId>.archived prevents the hook (which may fire multiple times per session) from archiving the same session twice and tearing it down while still live.
- Multi-agent config preservation is absolute: readJsonConfig distinguishes absent/parsed/unparseable states so installAgentRetrospectHooks never overwrites unparseable user config—silent data loss is a breach of contract.
- Multi-agent hook idempotency is checked by stable name marker RETROSPECT_HOOK_ENTRY_NAME and command string; re-running never duplicates entries and returns 'skipped' when already present.
- Sentinel-pre/post taint tracking must survive across sessions: a session marked 'tainted' by destructive ops (git reset, rm, etc.) blocks further edits in that session until a new session is started.

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
export readHookInput
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
import { readHookInput, runFormatCheck } from './format-check.js'
import { HOOK_SCRIPTS } from './profiles'
import { readHookStdin } from './read-hook-stdin.js'
import { parseCodexNotifyPayload, readHookStdin, retrospectLogLine, retrospectSession } from './session-retrospect-core.js'
import { HOOK_SUPPORT_FILES, supportFilesFor } from './support-files'
import from '@harness-engineering/core'
import from '@harness-engineering/orchestrator'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as fs, { accessSync, appendFileSync, existsSync, mkdirSync, readFileSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import * as path, { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
```
