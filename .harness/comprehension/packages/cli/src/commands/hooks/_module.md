---
schemaVersion: 1
module: 'packages/cli/src/commands/hooks'
sourceHash: '8525df760e1c0200350fcf3142d420d13253b62f76fec79d8ed35bb01e227744'
compiledAt: '2026-08-28T01:22:08.832Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['add.ts', 'index.ts', 'init.ts', 'list.ts', 'remove.ts', 'run.ts']
---

## Summary

The `hooks` module implements a shell-hook management system for Claude Code projects. It provides a CLI that lets adopters (1) initialize hook profiles (minimal/standard/strict), (2) add/remove individual hooks, (3) list installed hooks, and (4) run hooks manually for testing. Hooks are copied from the harness distribution to `.harness/hooks/` and registered in `.claude/settings.json` as shell commands. The system guards against user edits via SHA256 hashing (recorded at install time), supports hook aliases (e.g., "sentinel" → sentinel-pre + sentinel-post), and auto-ships shared support modules that hooks import. Profiles own the entire hooks section in settings.json, preserving non-hooks keys.

## Invariants

- ESM module marker is non-negotiable: `.harness/hooks/package.json` must declare `"type": "module"` or Node reparses every hook as CommonJS, emitting MODULE_TYPELESS_PACKAGE_JSON spam on every PreToolUse:Bash call in non-harness projects.
- Git-common-dir shell pattern handles worktrees: the hook command uses `git rev-parse --git-common-dir` (not `--show-toplevel`) to resolve the main checkout's `.harness/` even from linked worktrees; without this, worktrees lose hook protection (#990).
- File-hash tracking prevents silent clobber: SHA256 hashes of installed files are recorded in `.harness/profiles.json` at init time; on regeneration, files matching their recorded hash are refreshed, those that differ were user-edited and are preserved unless `--force` (#902).
- Profiles own the entire hooks key: the system replaces (not merges) the `.claude/settings.json` hooks section to prevent orphaned entries from stale profiles.
- Hook source resolution must work dev + bundled: two candidate paths must be checked (`src/hooks/` via dev **dirname and `dist/hooks/` via bundled **dirname); failure to find either throws.
- Silent no-op outside repos: shell commands exit 0 on missing git or `.harness/` to avoid error spam, but propagate exit code 2 when hooks need to block.
- Support files auto-ship on add: `supportFilesFor(hookNames)` returns shared dependencies (e.g., format-check.js); the system always copies these if they exist in source, even if the hook is already installed.

## Interface Contract

```ts
export createHooksCommand
```

## Dependency Slice

```
import { AgentRetrospectResult, installAgentRetrospectHooks } from '../../hooks/agent-retrospect'
import { HOOK_SCRIPTS, HookProfile, PROFILES } from '../../hooks/profiles'
import { parseCodexNotifyPayload, retrospectLogLine, retrospectSession } from '../../hooks/session-retrospect-core.js'
import { supportFilesFor } from '../../hooks/support-files'
import { logger } from '../../output/logger'
import { createAddCommand } from './add'
import { buildHookCommand, createInitCommand, resolveHookSourceDir, writeHooksModuleMarker } from './init'
import { createListCommand } from './list'
import { createRemoveCommand } from './remove'
import { createRunCommand } from './run'
import { Command } from 'commander'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
```
