# Multi-Backend Routing

The orchestrator's `agent.backends` map defines named backend instances; `agent.routing` selects which named backend handles each use case. This is the modern config surface — it replaces `agent.backend` / `agent.localBackend` (which still work via an in-memory migration shim with a deprecation warning at orchestrator start).

## Quick example

```yaml
agent:
  backends:
    cli: { type: claude, command: claude }
    local: { type: pi, endpoint: http://localhost:1234/v1, model: [gemma-4-e4b, qwen3:8b] }
  routing:
    default: cli
    quick-fix: local
    diagnostic: local
    intelligence:
      sel: local
      pesl: local
```

With this config, heavy guided-change work runs on Claude CLI (subscription, no API tokens), simple-tier diagnostics run on the local Pi, and the entire intelligence pipeline runs on the local Pi.

## `agent.backends`

`agent.backends` is a map of operator-chosen names to backend definitions. Each entry is a discriminated union keyed by `type`. Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`.

| type        | required fields     | optional fields                          |
| ----------- | ------------------- | ---------------------------------------- |
| `mock`      | —                   | —                                        |
| `claude`    | —                   | `command` (default: `claude`)            |
| `anthropic` | `model`             | `apiKey`                                 |
| `openai`    | `model`             | `apiKey`                                 |
| `gemini`    | `model`             | `apiKey`                                 |
| `local`     | `endpoint`, `model` | `apiKey`, `timeoutMs`, `probeIntervalMs` |
| `pi`        | `endpoint`, `model` | `apiKey`, `probeIntervalMs`              |

`model` accepts a single string or a non-empty array. With an array, the orchestrator probes `${endpoint}/v1/models` and picks the first array entry that's loaded on the server. See [Local Model Resolution](../knowledge/orchestrator/local-model-resolution.md).

## `agent.routing`

`agent.routing` is a strict map of use cases to backend names. `default` is required; all other keys are optional and fall back to `default`. Unknown keys are validation errors (typo protection).

| key                 | use case                                                   |
| ------------------- | ---------------------------------------------------------- |
| `default`           | required; used by maintenance, dashboard chat, fallback    |
| `quick-fix`         | scope-tier dispatch                                        |
| `guided-change`     | scope-tier dispatch                                        |
| `full-exploration`  | scope-tier dispatch (note: still escalates to human first) |
| `diagnostic`        | scope-tier dispatch                                        |
| `intelligence.sel`  | spec-enrichment LLM call                                   |
| `intelligence.pesl` | pre-execution-simulation LLM call                          |

`routing` selects _which_ backend handles a permitted dispatch. `escalation.alwaysHuman` and `escalation.autoExecute` continue to control _whether_ a tier dispatches at all; routing only matters once a tier is permitted.

## Multi-local example

```yaml
agent:
  backends:
    cloud: { type: anthropic, model: claude-3-5-sonnet-latest, apiKey: ${ANTHROPIC_API_KEY} }
    lm-studio: { type: local, endpoint: http://localhost:1234/v1, model: [qwen3:8b] }
    pi:        { type: pi,    endpoint: http://pi.local:1234/v1, model: [gemma-4-e4b] }
  routing:
    default: cloud
    quick-fix: pi
    diagnostic: pi
    guided-change: lm-studio
    intelligence:
      sel: lm-studio
      pesl: lm-studio
```

The orchestrator probes `lm-studio` and `pi` independently. Each surfaces its own dashboard banner if unhealthy. `GET /api/v1/local-models/status` returns one entry per local backend with `backendName` and `endpoint`.

## Migrating from the legacy schema

The orchestrator continues to accept `agent.backend` / `agent.localBackend` for at least one minor release. At startup, an in-memory migration shim translates legacy fields into `agent.backends` / `agent.routing`:

| legacy field                                     | synthesized into                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `agent.backend: claude` (+ `agent.command`)      | `backends.primary = { type: 'claude', command }`                                          |
| `agent.backend: anthropic` (+ `model`, `apiKey`) | `backends.primary = { type: 'anthropic', model, apiKey }`                                 |
| `agent.backend: openai` (similar)                | `backends.primary = { type: 'openai', model, apiKey }`                                    |
| `agent.backend: gemini` (similar)                | `backends.primary = { type: 'gemini', model, apiKey }`                                    |
| `agent.backend: mock`                            | `backends.primary = { type: 'mock' }`                                                     |
| `agent.localBackend: openai-compatible`          | `backends.local = { type: 'local', endpoint, model, apiKey, timeoutMs, probeIntervalMs }` |
| `agent.localBackend: pi`                         | `backends.local = { type: 'pi', endpoint, model, apiKey, probeIntervalMs }`               |
| `agent.escalation.autoExecute: [<tier>, ...]`    | `routing[<tier>] = 'local'` for each listed tier                                          |
| (always)                                         | `routing.default = 'primary'`                                                             |

The orchestrator logs a one-time `warn`-level message at startup naming each deprecated field present and pointing at this guide. Legacy fields are removed in a future release; see the deprecation timeline for details.

When **both** legacy and `agent.backends` are set, `agent.backends` wins and each ignored legacy field is logged.

## Deprecation timeline

- **Now (Spec 2 release):** Legacy fields warn at orchestrator start. New `agent.backends` / `agent.routing` schema is the documented primary surface.
- **Next minor release:** Legacy fields are still accepted; warn level escalates if needed.
- **Future release (separate spec):** Legacy fields are removed. The migration shim in `packages/orchestrator/src/agent/config-migration.ts` is deleted.

See [ADR 0005: Named backends map](../knowledge/decisions/0005-named-backends-map.md) for the architectural rationale.

## Related

- [`docs/changes/multi-backend-routing/proposal.md`](../changes/multi-backend-routing/proposal.md) — the spec
- [Local Model Resolution](../knowledge/orchestrator/local-model-resolution.md)
- [Issue Routing](../knowledge/orchestrator/issue-routing.md)
- [Intelligence Pipeline](./intelligence-pipeline.md)
- [Hybrid Orchestrator Quick Start](./hybrid-orchestrator-quickstart.md)
