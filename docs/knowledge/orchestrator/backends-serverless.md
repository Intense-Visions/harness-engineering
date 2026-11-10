---
type: business_concept
domain: orchestrator
tags: [backends, serverless, oci, container, dispatch, isolation, hermes-phase-5]
phase: hermes-phase-5
---

# Serverless agent dispatch backend

**Phase:** Hermes Phase 5 — Dispatch Hardening
**Source:** `packages/orchestrator/src/agent/backends/serverless.ts`

The serverless backend cold-starts a stateless container per session,
runs turns inside it, and tears it down on session stop. It is
distinct from the existing `ContainerBackend` (a _decorator_ over a
long-lived in-process backend) — serverless backends _own_ the
session lifecycle around a short-lived per-session container.

Phase 5 ships:

- `ServerlessBackend` — abstract base providing the cold-start / run /
  teardown lifecycle and protocol parsing.
- `OciServerlessBackend` — the first concrete adapter, cold-starting
  OCI images via `docker` (or `podman`).

Future adapters (`'modal'`, `'daytona'`, `'vercel'`) plug in behind
the same shape — see "Authoring a new adapter" below.

## Quick start (OCI adapter)

```json
{
  "agent": {
    "backends": {
      "sandbox": {
        "type": "serverless",
        "adapter": "oci",
        "image": "ghcr.io/example/harness-agent:1.0.0",
        "pullPolicy": "if-not-present",
        "envPassthrough": ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
        "runtime": "docker",
        "isolation": "remote-sandbox"
      }
    },
    "routing": {
      "default": "sandbox"
    }
  }
}
```

## Lifecycle

```
startSession                        runTurn                          stopSession
────────────                        ───────                          ───────────
docker run -d --rm image  ────►     docker exec -i <id> /agent  ────► docker stop <id>
returns container id                 stdin: { kind: 'turn', ... }
   │                                 stdout: NDJSON events
   ▼
ServerlessHandle stored
on session
```

## Protocol

Inside the container, `/agent` (overridable by extending the
adapter) must:

1. Read a single JSON line from stdin per `docker exec`:

   ```json
   { "kind": "turn", "prompt": "...", "isContinuation": false }
   ```

2. Stream NDJSON events on stdout. Same event shapes as the SSH and
   local backends.

3. Exit cleanly when the turn completes.

## When to use serverless vs. SSH vs. local

| Constraint                                      | Recommended                      |
| ----------------------------------------------- | -------------------------------- |
| Tasks share a host with the orchestrator        | `local` / `anthropic` / `claude` |
| Heavy AI work on a dedicated dev box            | `ssh`                            |
| Untrusted code execution / one-shot diagnostics | `serverless` (OCI)               |
| Need ephemeral GPU sandboxes per task           | `serverless` (future adapter)    |

Cold-start latency is the trade-off: an OCI cold-start is typically
1–10 s. Recommend for low-frequency / high-cost tasks rather than
chatty interactive ones.

## Security guardrails

- **Image validation.** The constructor rejects images with shell
  metacharacters or leading `-`.
- **Blocked docker flags.** `--privileged`, `--cap-add`,
  `--security-opt`, `--pid`, `--ipc`, `--userns` are stripped from
  `extraArgs` at construction time (same list as `ContainerBackend`).
- **Env passthrough is allowlist-only.** Only keys named in
  `envPassthrough` are forwarded; the orchestrator process's
  environment is otherwise hidden from the container.
- **No shell.** Arguments are passed as arrays to `child_process.spawn`.

## Configuration reference (OCI adapter)

| Field            | Type      | Default            | Description                                                 |
| ---------------- | --------- | ------------------ | ----------------------------------------------------------- |
| `image`          | string    | —                  | OCI image reference (must include tag).                     |
| `registry`       | string?   | —                  | Registry override (informational; passed to `docker pull`). |
| `pullPolicy`     | enum?     | `'if-not-present'` | `'always'` / `'if-not-present'` / `'never'`.                |
| `envPassthrough` | string[]? | `[]`               | Allowlist of orchestrator env-var names to forward.         |
| `runtime`        | enum?     | `'docker'`         | `'docker'` or `'podman'`.                                   |
| `isolation`      | tier?     | `'remote-sandbox'` | Declared isolation tier for routing.                        |

## Authoring a new adapter

Sub-class `ServerlessBackend` and implement four methods:

```ts
class ModalServerlessBackend extends ServerlessBackend {
  readonly name = 'serverless:modal';

  protected async coldStart(params) {
    /* spin up Modal task */
  }
  protected async *runOnHandle(handle, params, session) {
    /* call into Modal */
  }
  protected async teardown(handle) {
    /* stop Modal task */
  }
  async healthCheck() {
    /* probe Modal control plane */
  }
}
```

Then add the new `adapter` literal to `ServerlessBackendDef` in
`packages/types/src/orchestrator.ts` and a matching branch in
`createBackend()` (`packages/orchestrator/src/agent/backend-factory.ts`).

## Limitations

- One container per session, not per turn. If you want a fresh
  container per turn, set `maxTurns: 1` on the dispatching task.
- No volume mounting in v1. Add `extraArgs: ['--volume', 'src:dest']`
  for filesystem access; nothing in the protocol expects a mounted
  workspace.
- No cross-host orchestration. Each adapter runs against a single
  control-plane endpoint.
