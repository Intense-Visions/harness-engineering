---
schemaVersion: 1
module: 'packages/burn/src/bin'
sourceHash: '2b1869978804fc631caf8b0f0f5752cfe1745164593c068610be91dbb3f9baa8'
compiledAt: '2026-08-28T01:22:08.626Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['burn-hud.ts']
---

## Summary

burn-hud is a lightweight, latency-critical CLI binary (startup cost ~0.11s) that serves Claude Code's statusline and hook callbacks. It has four subcommands: `line` (render from cache without scanning), `session-start` (warm cache + output session brief), `stop` (refresh if stale, escalate notifications), and `scan` (force refresh, optional JSON output). The module splits burn tracking into two paths: this fast binary for realtime rendering and the full `harness burn` command for interactive features. All I/O is fault-tolerant, error handling is defensive (graceful degradation, never crash the statusline), and workspace context is resolved through a precedence chain (env var > payload > workspace > cwd).

## Invariants

- Zero imports from @harness-engineering packages (enforced by tests/bin-startup.test.ts); startup budget is ~0.11s vs. main CLI's ~0.85s
- No process.exit on error; exceptions set exitCode 0 to prevent HUD crashes from breaking Claude Code's statusline or hooks
- Cache reads are fault-tolerant; missing, corrupt, or stale cache degrades to empty/default summaries rather than crashing
- TTY detection prevents blocking; readStdin() returns {} when stdin is a terminal (manual invocation) to allow ctrl-C
- Workspace resolution is precedence-ordered: CLAUDE_HUD_CWD env var > payload.cwd > workspace.current_dir > process.cwd()
- Notification state persists to lastNotify file for escalation detection; losing the file only costs one duplicate notification
- SessionStart hook must scan before brief; refresh() is called unconditionally to establish warm cache and session baseline

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadConfig, resolvePaths } from '../config'
import { gitSegment } from '../git'
import { NotifyState, escalation, sessionBrief } from '../hooks'
import { readSummary } from '../read-summary'
import { refresh, refreshIfStale } from '../refresh'
import { renderStatusline } from '../statusline'
import { readFileSync, writeFileSync } from 'node:fs'
```
