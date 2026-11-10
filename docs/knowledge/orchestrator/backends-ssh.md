---
type: business_concept
domain: orchestrator
tags: [backends, ssh, remote-host, dispatch, isolation, hermes-phase-5]
phase: hermes-phase-5
---

# SSH agent dispatch backend

**Phase:** Hermes Phase 5 — Dispatch Hardening
**Source:** `packages/orchestrator/src/agent/backends/ssh.ts`

The SSH backend spawns the agent process on a remote host via the
operator's existing `ssh` binary (and therefore the operator's
`~/.ssh/config`). It targets the realistic "single GPU box / beefy
dev server" use case for harness users who don't want to colocate
heavy AI tasks with the orchestrator host.

## Quick start

```json
{
  "agent": {
    "backends": {
      "gpu-host": {
        "type": "ssh",
        "host": "gpu-box.lab",
        "user": "harness",
        "port": 22,
        "identityFile": "~/.ssh/harness_id_ed25519",
        "remoteCommand": "/opt/harness/bin/agent --jsonl",
        "isolation": "remote-sandbox"
      }
    },
    "routing": {
      "default": "gpu-host"
    }
  }
}
```

## Required setup on the remote host

1. **Agent CLI is installed.** The remote `remoteCommand` must be a
   real executable on the target host that speaks the JSON-lines
   agent protocol on stdin/stdout (see "Protocol" below).
2. **Model API keys are configured locally on the remote host.** The
   orchestrator does not push secrets over SSH — the remote agent
   reads them from its own environment.
3. **Key-based SSH auth is set up.** The backend passes
   `-o BatchMode=yes` so password / interactive prompts are
   disabled. Use `ssh-keygen` / `ssh-copy-id` and confirm
   `ssh user@host true` works from the orchestrator host before
   wiring it up.

## Protocol

The remote command is expected to:

1. Read a single JSON line from stdin:

   ```json
   { "kind": "turn", "prompt": "...", "isContinuation": false, "systemPrompt": "..." }
   ```

2. Stream agent events on stdout, one per line:

   ```json
   { "type": "text", "content": "hello " }
   { "type": "thought", "content": "I will…" }
   { "type": "usage", "usage": { "inputTokens": 10, "outputTokens": 20, "totalTokens": 30 } }
   ```

3. Exit cleanly when the turn completes. Non-zero exit codes are
   surfaced as `TurnResult.success = false`.

The backend treats `type: 'error'` events as turn failures and surfaces
the `content` as the error message.

## Security guardrails

- **Host validation.** The constructor rejects hosts containing shell
  metacharacters (`;`, `&`, `|`, backticks, newlines, etc.) or
  starting with `-` (would be interpreted as an SSH flag).
- **No shell on the orchestrator side.** Arguments are passed as an
  array to `child_process.spawn` — there is no shell interpolation
  on the orchestrator host. The remote side runs the command through
  whatever shell `sshd` configures (typically the user's login shell).
- **`--` terminator.** The argv ends with `-- <remoteCommand>` so a
  hostile-looking `remoteCommand` cannot be parsed as an SSH flag.
- **BatchMode=yes.** Disables password / interactive prompts; only
  key-based auth works.

## Configuration reference

| Field           | Type      | Default            | Description                                        |
| --------------- | --------- | ------------------ | -------------------------------------------------- |
| `host`          | string    | —                  | Remote host (no shell metachars).                  |
| `user`          | string?   | —                  | SSH user (or embed in `host` as `user@host`).      |
| `port`          | number?   | 22                 | SSH port.                                          |
| `identityFile`  | string?   | —                  | `ssh -i <path>` identity file.                     |
| `remoteCommand` | string    | —                  | Agent CLI invocation on the remote host.           |
| `sshOptions`    | string[]? | `[]`               | `-o key=value` SSH options to pass through.        |
| `sshBinary`     | string?   | `ssh`              | Path to the `ssh` binary on the orchestrator host. |
| `isolation`     | tier?     | `'remote-sandbox'` | Declared isolation tier for routing.               |

## Troubleshooting

- **`ssh health check failed (exit=255): ...`** — typically wrong
  host, blocked by firewall, or SSH auth failure. Run
  `ssh -o BatchMode=yes user@host true` manually to reproduce.
- **`turn exited with code 127`** — the `remoteCommand` was not
  found on the remote host's `PATH`. Use an absolute path.
- **`agent_not_found` on every call** — local `ssh` binary missing.
  Set `sshBinary` to an absolute path, or install OpenSSH client.
- **Slow first turn** — SSH connection setup is per-turn in v1. Future
  work: use `ControlMaster=auto` via `sshOptions` to reuse a long-lived
  master connection.

## Not yet supported

- Multi-host pool / load balancing across hosts. Operators with
  multiple SSH targets should define them as separate named backends
  and route per task.
- Pushing secrets to the remote host. Configure secrets locally on the
  remote.
- Mid-turn cancellation. The session is torn down at turn boundaries.
