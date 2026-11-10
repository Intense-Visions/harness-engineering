---
type: business_concept
domain: orchestrator
tags: [dispatch, isolation, isolation-tier, routing, backend-router, hermes-phase-5]
phase: hermes-phase-5
---

# Dispatch isolation tier

**Phase:** Hermes Phase 5 — Dispatch Hardening
**Related ADR:** `docs/knowledge/decisions/0013-dispatch-isolation-tier.md`

Phase 5 introduces `IsolationTier` as the fourth routing axis on
`BackendRouter`. Tasks can request the _kind_ of execution boundary
they need (`'none' | 'container' | 'remote-sandbox'`) without naming a
specific backend, and operators can swap targets without rewriting
each task definition.

## The three tiers

| Tier             | Where the agent runs                                              | Use cases                                                                            |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `none`           | Orchestrator host process (subprocess, HTTP client, etc.)         | Trusted in-house tasks; fast and cheap                                               |
| `container`      | Container on the orchestrator host (`ContainerBackend` decorator) | Tasks that touch the filesystem in unbounded ways; isolated tool execution           |
| `remote-sandbox` | Different host (SSH backend) or ephemeral VM (serverless)         | Untrusted code execution; GPU-heavy jobs on a separate box; one-shot diagnostic runs |

## Resolution flow

1. A caller issues a `RoutingUseCase`:

   ```ts
   const useCase: RoutingUseCase = { kind: 'isolation', tier: 'remote-sandbox' };
   ```

2. `BackendRouter.resolve(useCase)` returns the configured backend name
   for that tier, falling back to `routing.default`:

   ```ts
   router.resolve({ kind: 'isolation', tier: 'remote-sandbox' });
   // → routing.isolation['remote-sandbox'] ?? routing.default
   ```

3. The orchestrator instantiates that backend via `createBackend(def)`
   from `backend-factory.ts`. When the resolved backend has
   `isolation: 'container'` and the inner backend is in-process, the
   `ContainerBackend` decorator wraps it at construction time.

## Native isolation tier per backend

Every `BackendDef` accepts an optional `isolation?: IsolationTier`.
When unset, the defaults are:

| Backend type | Default tier     |
| ------------ | ---------------- |
| `mock`       | `none`           |
| `claude`     | `none`           |
| `anthropic`  | `none`           |
| `openai`     | `none`           |
| `gemini`     | `none`           |
| `local`      | `none`           |
| `pi`         | `none`           |
| `ssh`        | `remote-sandbox` |
| `serverless` | `remote-sandbox` |

Operators should set the field explicitly when they want a different
tier (e.g., declaring `isolation: 'container'` on a `local` backend
that is intended to be wrapped by `ContainerBackend`).

## Example config

```json
{
  "agent": {
    "backends": {
      "local-claude": { "type": "claude", "isolation": "none" },
      "gpu-host": {
        "type": "ssh",
        "host": "gpu-box.lab",
        "remoteCommand": "harness-agent",
        "isolation": "remote-sandbox"
      },
      "sandbox": {
        "type": "serverless",
        "adapter": "oci",
        "image": "ghcr.io/example/agent:1",
        "isolation": "remote-sandbox"
      }
    },
    "routing": {
      "default": "local-claude",
      "isolation": {
        "remote-sandbox": "gpu-host"
      }
    }
  }
}
```

A task that issues `{ kind: 'isolation', tier: 'remote-sandbox' }`
routes to `gpu-host`. A task issuing `{ kind: 'isolation', tier: 'container' }`
falls through to `local-claude` (the `routing.default`).

## What the router does and doesn't do

**Does:**

- Pure name lookup. No backend-specific knowledge inside the router.
- Construction-time validation: every name referenced by
  `routing.isolation.*` must be present in `agent.backends`.

**Doesn't:**

- Decide _when_ to apply `ContainerBackend` — that happens at the
  factory / agent runner layer. The router only resolves the name.
- Synthesize the tier from the backend type. The tier is declarative
  on each `BackendDef`, so the operator owns it.

## Adding a new tier

Future tiers (e.g., `'vm'` or `'tee'`) require:

1. Extending the `IsolationTier` union in
   `packages/types/src/orchestrator.ts`.
2. Adding the new key to `RoutingConfig.isolation`.
3. Extending `BackendRouter.validateReferences()` to walk the new key.
4. Documenting the default mapping for existing backends.

No router-internal logic changes.
