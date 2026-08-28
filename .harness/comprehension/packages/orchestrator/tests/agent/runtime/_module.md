---
schemaVersion: 1
module: "packages/orchestrator/tests/agent/runtime"
sourceHash: "bb84667baadec4f46ddf63e23ce5adb5288a47a5b96dd7803f644d5ebf9125f6"
compiledAt: "2026-08-28T01:22:12.452Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["docker.behavior.test.ts", "docker.test.ts"]
---

## Summary

The `packages/orchestrator/tests/agent/runtime` module tests **DockerRuntime**, an abstraction for executing commands inside Docker containers. The test suite characterizes two core operations: `execInContainer` (streaming command execution with exit-code tracking) and `createContainer` (container initialization with mount/env/user configuration). Key behaviors: `execInContainer` is an async generator that yields stdout lines and returns the process exit code, with fallback coercion of `null` → `1`. `createContainer` assembles docker-cli flags for image, mounts, networking, user isolation, and appends `sleep infinity` to keep containers alive. Docker infrastructure errors are either swallowed gracefully (if exec can still run) or surfaced as `runtime_not_found` errors.

## Invariants

- Stream consumption precedes exit event: The async generator must exhaust stdout lines via readline before the exit event fires; uses setImmediate to defer the event callback.
- Null exit code coerces to 1: When the exit event fires with null, the fallback is 1 (not 0 or undefined).
- child.exitCode short-circuits event: If child.exitCode is already set (process fast-exit), the exit event listener must NOT be registered; attempting to do so indicates a bug.
- Docker start failures are non-fatal: docker start errors are caught and ignored; docker exec proceeds regardless (container may already be running).
- Exec arg pattern is canonical: ['exec', <containerId>, ...flags, ...cmd]—flags (-w, --env) insert before the command, containerId always second.
- Workspace mounts to /workspace: createContainer binds the provided workspacePath to /workspace inside the container and sets it as the working directory (-w /workspace).
- Sleep infinity for keep-alive: createContainer appends sleep infinity after the image name to prevent container exit.
- Env vars are discrete --env flags: Each env var is a separate --env KEY=value pair in the args array, not a single --env flag with multiple values.

## Interface Contract

```ts

```

## Dependency Slice

```
import { DockerRuntime } from '../../../src/agent/runtime/docker'
import { execFile, spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
