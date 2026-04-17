# Plan: Container Sandboxing

**Date:** 2026-04-16 | **Spec:** docs/changes/container-sandboxing/proposal.md | **Tasks:** 10 | **Time:** ~44 min

## Goal

When `sandboxPolicy: 'docker'` is set, agent sessions run inside Docker containers with read-only filesystems, unprivileged users, and secrets injected via pluggable backends.

## Observable Truths (Acceptance Criteria)

1. Where `sandboxPolicy` is `'docker'`, the system shall wrap the configured `AgentBackend` in a `ContainerBackend` decorator
2. When a container is created, the system shall pass `--read-only`, `--user 1000:1000`, and bind-mount the workspace at `/workspace`
3. When `secrets.backend` is `'env'`, the system shall resolve secret keys from `process.env`
4. When `secrets.backend` is `'onepassword'`, the system shall resolve secrets via `op read` CLI
5. When `secrets.backend` is `'vault'`, the system shall resolve secrets via `vault kv get` CLI
6. When `stopSession` is called, the system shall remove the Docker container
7. The system shall verify Docker availability via `docker info` during `healthCheck()`
8. `ContainerRuntime` interface shall support future alternative runtimes without modifying `ContainerBackend`
9. `pnpm run build` passes with no type errors
10. All unit tests pass: `pnpm -F @harness-engineering/orchestrator test` passes
11. If Docker is not available, `healthCheck()` returns `Err` (no crash)

## File Map

```
CREATE packages/types/src/container.ts
MODIFY packages/types/src/orchestrator.ts
MODIFY packages/types/src/index.ts
CREATE packages/orchestrator/src/agent/runtime/docker.ts
CREATE packages/orchestrator/src/agent/runtime/index.ts
CREATE packages/orchestrator/src/agent/secrets/env.ts
CREATE packages/orchestrator/src/agent/secrets/onepassword.ts
CREATE packages/orchestrator/src/agent/secrets/vault.ts
CREATE packages/orchestrator/src/agent/secrets/index.ts
CREATE packages/orchestrator/src/agent/backends/container.ts
MODIFY packages/orchestrator/src/orchestrator.ts
CREATE packages/orchestrator/tests/agent/runtime/docker.test.ts
CREATE packages/orchestrator/tests/agent/secrets/env.test.ts
CREATE packages/orchestrator/tests/agent/secrets/onepassword.test.ts
CREATE packages/orchestrator/tests/agent/secrets/vault.test.ts
CREATE packages/orchestrator/tests/agent/backends/container.test.ts
```

## Tasks

### Task 1: Define container and secret types

**Depends on:** none | **Files:** packages/types/src/container.ts

Create the ContainerRuntime, SecretBackend, and related interfaces.

### Task 2: Add container/secret config to AgentConfig and export types

**Depends on:** Task 1 | **Files:** packages/types/src/orchestrator.ts, packages/types/src/index.ts

Add `container?` and `secrets?` fields to `AgentConfig`. Re-export all container types from index.

### Task 3: Write DockerRuntime tests

**Depends on:** Task 1 | **Files:** packages/orchestrator/tests/agent/runtime/docker.test.ts

TDD: Write tests for DockerRuntime (createContainer, removeContainer, healthCheck). Mock child_process.

### Task 4: Implement DockerRuntime

**Depends on:** Task 3 | **Files:** packages/orchestrator/src/agent/runtime/docker.ts, packages/orchestrator/src/agent/runtime/index.ts

Implement DockerRuntime and runtime factory. Tests should pass.

### Task 5: Write secret backend tests

**Depends on:** Task 1 | **Files:** packages/orchestrator/tests/agent/secrets/env.test.ts, packages/orchestrator/tests/agent/secrets/onepassword.test.ts, packages/orchestrator/tests/agent/secrets/vault.test.ts

TDD: Write tests for all three secret backends. Mock process.env and child_process.

### Task 6: Implement secret backends

**Depends on:** Task 5 | **Files:** packages/orchestrator/src/agent/secrets/env.ts, packages/orchestrator/src/agent/secrets/onepassword.ts, packages/orchestrator/src/agent/secrets/vault.ts, packages/orchestrator/src/agent/secrets/index.ts

Implement EnvSecretBackend, OnePasswordSecretBackend, VaultSecretBackend, and factory. Tests pass.

### Task 7: Write ContainerBackend tests

**Depends on:** Tasks 1, 3, 5 | **Files:** packages/orchestrator/tests/agent/backends/container.test.ts

TDD: Write tests for ContainerBackend decorator. Mock inner backend, runtime, and secret backend.

### Task 8: Implement ContainerBackend decorator

**Depends on:** Task 7 | **Files:** packages/orchestrator/src/agent/backends/container.ts

Implement ContainerBackend. Tests pass.

### Task 9: Wire ContainerBackend into orchestrator

**Depends on:** Tasks 2, 4, 6, 8 | **Files:** packages/orchestrator/src/orchestrator.ts

Add imports and modify `createBackend()` to wrap with ContainerBackend when `sandboxPolicy === 'docker'`.

### Task 10: Build verification and final validation

**Depends on:** Task 9 | **Files:** none (verification only)

Run full build, all tests, and harness validate.
