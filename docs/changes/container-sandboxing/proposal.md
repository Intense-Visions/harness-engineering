# Container Sandboxing

> Docker-based execution isolation for agent sessions with pluggable secret injection and a clear Dagger upgrade path.

**Keywords:** container, docker, sandboxing, secrets, isolation, dagger, security, orchestrator

## Overview

Container Sandboxing adds Docker-based execution isolation to the harness orchestrator. Agent sessions run inside read-only containers with unprivileged users, preventing filesystem and process-level escape. Secrets from 1Password, Vault, or environment variables are injected via a pluggable `SecretBackend` interface. A `ContainerRuntime` interface enables future adoption of Dagger's MCP-based container orchestration (13 MCP tools, immutable container state, git-branch isolation).

### Goals

1. Run any existing `AgentBackend` inside a Docker container transparently via decorator pattern
2. Enforce `--read-only` and `--user` flags for minimal-privilege execution
3. Provide pluggable secret injection via `SecretBackend` interface (env vars, 1Password, Vault)
4. Design `ContainerRuntime` interface for Dagger as a future runtime alternative
5. Zero changes required to existing backends — sandboxing is opt-in via `sandboxPolicy` config

### Non-Goals

- Kubernetes orchestration or cluster-level scheduling
- Custom container image building or registry management
- Network policy enforcement beyond Docker's built-in network modes
- Full Dagger MCP client implementation (evaluation/interface only)

## Decisions

| #   | Decision                                                         | Rationale                                                                                           |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Decorator pattern over standalone backend                        | Avoids duplicating subprocess logic; any backend (CLI or API) can be sandboxed without modification |
| 2   | `ContainerRuntime` interface with `DockerRuntime` implementation | Thin abstraction (4 methods) that naturally supports Dagger as alternative runtime                  |
| 3   | `SecretBackend` interface with 3 implementations                 | Issue explicitly requires 1Password, Vault, env var support                                         |
| 4   | Config-driven activation via `sandboxPolicy: 'docker'`           | `sandboxPolicy` field already exists in `AgentConfig`; cleanest UX                                  |
| 5   | Workspace bind-mounted read-write, root filesystem read-only     | Agent needs to write to workspace (code changes) but shouldn't modify system files                  |
| 6   | `--network=host` default with `--network=none` option            | Agents need network for API calls; network isolation is opt-in for offline agents                   |

## Technical Design

### Type Definitions

Added to `packages/types/src/orchestrator.ts`:

```typescript
// Container runtime abstraction
export interface ContainerRuntime {
  readonly name: string;
  createContainer(opts: ContainerCreateOpts): Promise<Result<ContainerHandle, ContainerError>>;
  execInContainer(
    handle: ContainerHandle,
    cmd: string[],
    opts?: ContainerExecOpts
  ): AsyncGenerator<string, number, void>;
  removeContainer(handle: ContainerHandle): Promise<Result<void, ContainerError>>;
  healthCheck(): Promise<Result<void, ContainerError>>;
}

export interface ContainerCreateOpts {
  image: string;
  workspacePath: string;
  readOnly: boolean;
  user: string;
  network: 'host' | 'none' | 'bridge';
  env: Record<string, string>;
  extraArgs?: string[];
}

export interface ContainerExecOpts {
  cwd?: string;
  env?: Record<string, string>;
}

export interface ContainerHandle {
  containerId: string;
  runtime: string;
}

export interface ContainerError {
  category:
    | 'runtime_not_found'
    | 'container_create_failed'
    | 'container_exec_failed'
    | 'container_remove_failed';
  message: string;
  details?: unknown;
}

// Secret backend abstraction
export interface SecretBackend {
  readonly name: string;
  resolveSecrets(keys: string[]): Promise<Result<Record<string, string>, SecretError>>;
  healthCheck(): Promise<Result<void, SecretError>>;
}

export interface SecretError {
  category: 'provider_unavailable' | 'secret_not_found' | 'access_denied';
  message: string;
  key?: string;
}
```

### Configuration Additions

Added to `AgentConfig` in `packages/types/src/orchestrator.ts`:

```typescript
// Within AgentConfig
container?: ContainerConfig;
secrets?: SecretConfig;

// New config types
export interface ContainerConfig {
  runtime: 'docker';
  image: string;
  readOnly?: boolean;     // default: true
  user?: string;          // default: '1000:1000'
  network?: 'host' | 'none' | 'bridge';  // default: 'host'
  extraArgs?: string[];
}

export interface SecretConfig {
  backend: 'env' | 'onepassword' | 'vault';
  keys: string[];
  vaultAddr?: string;
  vaultPath?: string;
  opVault?: string;
}
```

### File Layout

```
packages/orchestrator/src/
  agent/
    backends/
      container.ts          # ContainerBackend decorator
    runtime/
      docker.ts             # DockerRuntime implementation
      index.ts              # Runtime factory
    secrets/
      env.ts                # EnvSecretBackend
      onepassword.ts        # OnePasswordSecretBackend (1Password CLI)
      vault.ts              # VaultSecretBackend (HashiCorp Vault)
      index.ts              # Secret backend factory
```

### ContainerBackend Decorator

`ContainerBackend` wraps any `AgentBackend`, intercepting session lifecycle to manage containers:

```typescript
export class ContainerBackend implements AgentBackend {
  readonly name: string;

  constructor(
    private inner: AgentBackend,
    private runtime: ContainerRuntime,
    private secretBackend: SecretBackend | null,
    private containerConfig: ContainerConfig
  ) {
    this.name = `container:${inner.name}`;
  }

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    // 1. Resolve secrets if configured
    // 2. Create container with workspace bind-mount
    // 3. Delegate to inner backend with containerized workspace path
    // 4. Track container handle for cleanup
  }

  async *runTurn(session, params): AsyncGenerator<AgentEvent, TurnResult, void> {
    // Delegate directly to inner backend — it runs inside the container
    yield* this.inner.runTurn(session, params);
  }

  async stopSession(session): Promise<Result<void, AgentError>> {
    // 1. Delegate to inner backend
    // 2. Remove container via runtime
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    // Check both inner backend and container runtime
  }
}
```

### DockerRuntime

Uses Docker CLI for container lifecycle:

- **createContainer:** `docker create --read-only --user 1000:1000 -v <workspace>:/workspace -w /workspace --env KEY=VAL <image>`
- **execInContainer:** `docker start <id>` then `docker exec <id> <cmd>`, streaming stdout line-by-line
- **removeContainer:** `docker rm -f <id>`
- **healthCheck:** `docker info --format '{{.ServerVersion}}'`

### Secret Backends

**EnvSecretBackend:** Reads from `process.env`. Simplest — no external dependencies.

**OnePasswordSecretBackend:** Shells out to `op read "op://<vault>/<item>/<field>"` via 1Password CLI. Requires `op` installed and authenticated.

**VaultSecretBackend:** Uses `vault kv get -format=json -field=<key> <path>` via HashiCorp Vault CLI. Requires `VAULT_ADDR` and `VAULT_TOKEN`.

### Wiring in Orchestrator

```typescript
// In orchestrator.ts createBackend()
private createBackend(): AgentBackend {
  let backend = this.createRawBackend(); // existing if/else chain
  if (this.config.agent.sandboxPolicy === 'docker') {
    const runtime = new DockerRuntime();
    const secrets = this.createSecretBackend();
    backend = new ContainerBackend(backend, runtime, secrets, this.config.agent.container!);
  }
  return backend;
}
```

### Dagger Upgrade Path

The `ContainerRuntime` interface is designed so a `DaggerRuntime` can be added later:

- `createContainer` maps to Dagger's container builder API
- `execInContainer` maps to Dagger's `withExec`
- Dagger's MCP tools (13 available) provide richer orchestration: git-branch isolation, immutable container state, layer caching
- Evaluation criteria documented but implementation deferred

## Success Criteria

1. When `sandboxPolicy: 'docker'` is set, agent sessions run inside Docker containers with `--read-only` and `--user` flags
2. `ContainerBackend` wraps any existing backend without modifying backend implementations
3. `SecretBackend` interface has working implementations for env vars, 1Password CLI, and HashiCorp Vault
4. `ContainerRuntime` interface supports `DockerRuntime` with a clear extension point for Dagger
5. Health checks verify Docker availability before dispatching agents
6. All new code has unit tests; DockerRuntime has integration test requiring Docker
7. `harness validate` passes with no architectural violations

## Implementation Order

1. **Phase 1 — Types:** Add `ContainerRuntime`, `SecretBackend`, config types, and error types to `packages/types/src/orchestrator.ts`
2. **Phase 2 — DockerRuntime:** Implement Docker CLI wrapper with security flags and container lifecycle management
3. **Phase 3 — SecretBackends:** Implement env, 1Password, and Vault secret resolution
4. **Phase 4 — ContainerBackend:** Implement decorator composing runtime + secrets + inner backend
5. **Phase 5 — Wiring:** Integrate into `Orchestrator.createBackend()`, add config validation
6. **Phase 6 — Tests:** Unit tests for all components; Docker integration test
