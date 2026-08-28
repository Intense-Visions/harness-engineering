---
schemaVersion: 1
module: "packages/orchestrator/src/agent/runtime"
sourceHash: "49dec9e77339186e246e0da9a8f05914daae257d95484b89f4b43ff3169fcf65"
compiledAt: "2026-08-28T01:22:12.093Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["docker.ts", "index.ts"]
---

## Summary

`DockerRuntime` is a concrete implementation of the `ContainerRuntime` interface that wraps Docker CLI operations. It provides three core capabilities: creating isolated containers with custom isolation settings, executing commands inside containers with streaming line-based output, and lifecycle management (start, remove, health checks). The module enforces container persistence via `sleep infinity` entrypoint, allowing repeated exec calls into the same container handle. Errors surface as Result types (`Ok`/`Err`), and all subprocess I/O is streamed or trimmed to avoid spilling large outputs.

## Invariants

- Containers are created with `sleep infinity` as the default command — without this, exec calls have nothing to attach to; modifying the image or entrypoint breaks exec semantics
- `execInContainer` calls `docker start` before every exec but catches errors, assuming the container may already be running; start is best-effort, not guaranteed idempotent
- Exit code resolution samples `child.exitCode` immediately, then falls back to the `exit` event if null; if the caller discards the generator before awaiting, they will miss termination signals
- Readline interface must close in a finally block, even if the generator breaks early, to avoid fd leaks
- All `dockerExec` calls reject on non-zero exit; callers must catch and wrap into Result types; category strings are load-bearing for error routing
- `dockerExec` trims stdout, so callers receive bare output (e.g., container IDs from `docker create`); no whitespace should be assumed

## Interface Contract

```ts
export DockerRuntime
```

## Dependency Slice

```
import { ContainerCreateOpts, ContainerError, ContainerExecOpts, ContainerHandle, ContainerRuntime, Err, Ok, Result } from '@harness-engineering/types'
import { execFile, spawn } from 'node:child_process'
import from 'node:readline'
```
