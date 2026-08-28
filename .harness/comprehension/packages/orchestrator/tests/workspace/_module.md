---
schemaVersion: 1
module: "packages/orchestrator/tests/workspace"
sourceHash: "b9626a79ee819a039c367afdf66cdc699f41a41ac7ff2d2f3f35a0c7a5faf907"
compiledAt: "2026-08-28T01:22:12.759Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["baseref-fallback.test.ts", "config-scanner.test.ts", "derive-seed-paths.test.ts", "hooks.test.ts", "manager.identity.test.ts", "manager.test.ts"]
---

## Summary

The `packages/orchestrator/tests/workspace` module tests the orchestrator's workspace and configuration management subsystem across six test files. WorkspaceManager creates isolated git worktrees with base-ref resolution via a fallback chain (origin/HEAD → origin/main → origin/master → local main/master/HEAD), emitting baseref_fallback events only when falling back to local-only refs. It supports preserve-on-retry to reuse valid worktrees, gracefully degrades when offline, and manages immutable worktree identities with idempotent number assignment. Config scanner detects injection and malware in CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml with contextualized severity (high blocks dispatch, medium warns). WorkspaceHooks spawns real shell subprocesses for lifecycle hooks with timeout enforcement and sensitive env-var filtering. Seed paths invariably include .harness/proposals and roadmap-backed trackers' configured filePath or docs/roadmap.md default.

## Invariants

- Baseref fallback chain is deterministic: origin/HEAD → origin/{main,master} → local {main,master,HEAD}; emit event only when stepping to local refs
- Exactly one baseref_fallback event per ensureWorkspace() call, even on stale worktree recreate; event forwards to both broadcastMaintenance and emit; must not crash if server undefined
- Config scanner exit codes: 0=clean, 1=medium severity, 2=high severity; high blocks dispatch; context downgrades false positives (doc mentions of eval() OK, hidden unicode never)
- Worktree identity is write-once: ensureIdentity() creates immutable ulid/domain/slug; re-ensure with different metadata silently ignored
- preserve: true + valid worktree → reuse untouched (no remove/add/seed); absence of preserve or missing worktree triggers full cycle
- Hook execution: null/empty → OK(undefined); exit 0 → OK(undefined); exit N (N≠0) → Err('failed with exit code N'); timeout → Err('timed out after Nms') + kill child; sensitive env vars stripped
- Seed paths: .harness/proposals always included; roadmap trackers include configured filePath or docs/roadmap.md default; non-roadmap always use docs/roadmap.md
- Git operations are offline-safe: attempt fetch before ref resolution but proceed with local state on network failure
- Identifier sanitization reversible-to-filename: slashes/spaces→hyphens, lowercase; drives both path resolution and worktree record filenames
- Identity record lookup keyed by sanitized slug: getWorkspaceIdentity('feat/Some Thing') resolves .harness/worktrees/feat-some-thing.json

## Interface Contract

```ts

```

## Dependency Slice

```
import { deriveSeedPaths } from '../../src/orchestrator'
import { scanWorkspaceConfig } from '../../src/workspace/config-scanner'
import { WorkspaceHooks } from '../../src/workspace/hooks'
import { BaseRefFallbackEvent, WorkspaceManager } from '../../src/workspace/manager'
import from '@harness-engineering/core'
import { HooksConfig, WorkflowConfig } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
