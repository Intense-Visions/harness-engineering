# Multi-Backend Routing

The orchestrator's `agent.backends` map defines named backend instances; `agent.routing` selects which named backend handles each use case. This is the modern config surface — it replaces `agent.backend` / `agent.localBackend` (which still work via an in-memory migration shim with a deprecation warning at orchestrator start).

> **Routing by complexity + cost?** See [Adaptive Model Routing](./adaptive-model-routing.md) for tier-based routing, budgets, split-routing workflows, and the `harness routing` observability commands.

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

`agent.backends` is a map of operator-chosen names to backend definitions. Each entry is a discriminated union keyed by `type`. Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `ollama`, `pi`.

| type        | required fields     | optional fields                                                                           |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `mock`      | —                   | —                                                                                         |
| `claude`    | —                   | `command` (default: `claude`)                                                             |
| `anthropic` | `model`             | `apiKey`                                                                                  |
| `openai`    | `model`             | `apiKey`                                                                                  |
| `gemini`    | `model`             | `apiKey`                                                                                  |
| `local`     | `endpoint`, `model` | `apiKey`, `timeoutMs`, `probeIntervalMs`                                                  |
| `ollama`    | `endpoint`, `model` | `apiKey`, `timeoutMs`, `maxTurnsPerRun`, `disableReasoning`, `mcpServers`, `capabilities` |
| `pi`        | `endpoint`, `model` | `apiKey`, `timeoutMs`, `probeIntervalMs`                                                  |

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

## Per-skill and per-mode routing (Spec B)

Spec B extends `agent.routing` with two new axes for finer-grained backend selection:

- **`routing.skills.<skill-name>`** — pins a specific skill to a backend regardless of scope tier
- **`routing.modes.<cognitive-mode>`** — pins all skills of a given cognitive mode (declared via `cognitive_mode:` in skill.yaml) to a backend

Both axes are optional. Resolution order is deterministic (see [Routing Resolution](../knowledge/orchestrator/routing-resolution.md)):

1. Invocation override (`--backend <name>`)
2. Per-skill (`routing.skills.<name>`)
3. Per-cognitive-mode (`routing.modes.<mode>`)
4. Per-tier / per-intelligence-layer / per-isolation (pre-Spec-B)
5. `routing.default`

First match wins.

### Fallback chains

Every routing value (old and new) accepts either a single backend name or an ordered fallback chain. The resolver picks the first chain entry whose backend exists in `agent.backends`:

```yaml
routing:
  default: claude-opus
  quick-fix: [local-fast, claude-sonnet] # try local-fast, fall back to claude-sonnet
```

Scalar form is byte-compatible with pre-Spec-B configs — no migration required.

### Worked example

```yaml
agent:
  backends:
    claude-opus: { type: anthropic, model: claude-opus-4-7 }
    claude-sonnet: { type: anthropic, model: claude-sonnet-4-6 }
    local-fast: { type: local, endpoint: http://localhost:1234/v1, model: qwen3:8b }
    local-reasoning: { type: local, endpoint: http://localhost:1234/v1, model: deepseek-r1:32b }
  routing:
    default: claude-opus
    quick-fix: [local-fast, claude-sonnet] # fallback chain
    intelligence:
      sel: local-fast
      pesl: local-reasoning
    skills: # per-skill
      harness-debugging: [local-fast, claude-sonnet]
      harness-soundness-review: claude-opus
      harness-brainstorming: claude-opus
    modes: # per-cognitive-mode
      adversarial-reviewer: [local-fast, claude-sonnet]
      constructive-architect: claude-opus
      meticulous-implementer: claude-sonnet
```

### Common patterns

**Route reviewers to local, route architects to cloud** — use `routing.modes`:

```yaml
routing:
  default: claude-opus
  modes:
    adversarial-reviewer: local-fast
    constructive-architect: claude-opus
```

Every skill whose `cognitive_mode: adversarial-reviewer` lives in skill.yaml dispatches to `local-fast`. Architects keep running on Opus. No per-skill listing required.

**Absorb cloud rate caps by pinning a specific skill local** — use `routing.skills` with a fallback chain:

```yaml
routing:
  default: claude-opus
  skills:
    harness-debugging: [local-fast, claude-sonnet]
```

Only `harness-debugging` is affected — every other dispatch keeps its prior routing. If `local-fast` is misconfigured or missing from `agent.backends`, the chain falls through to `claude-sonnet`.

See [Routing Trace](./routing-trace.md) for debugging routing decisions.

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

## Enforced gates on the local backend

A `local`/`pi` backend runs the **full workflow gated**: the orchestrator — not the agent's self-discipline — enforces the mechanical gate and the outcome evaluation on the agent's branch when the run completes. On a `local`/`pi` dispatch, after the agent exits the orchestrator:

1. Runs **verify** (typecheck + lint + test) over the workspace, and
2. When the issue has a spec, runs the same **outcome evaluation** the primary (Claude) backend uses — the `OutcomeEvaluator` over the introduced diff vs the spec's success criteria.

A red verify, or a high-confidence `NOT_SATISFIED` outcome verdict, **blocks the run from completing**: the orchestrator re-dispatches the same unit (threading the failure text into the re-prompt) via the existing retry budget, and escalates `needs-human` when that budget is exhausted. A genuinely green run completes normally — the local gate composes with, and does not replace, the AMR retrospective/quality feeders.

This enforcement is scoped to the local path only; the primary/Claude completion path is unchanged. The gate provider defaults to the local SEL provider (the same one the classifier uses); the `agent.routing.workflowGates` flag below routes the outcome-eval gate to a stronger provider. See [ADR 0070](../knowledge/decisions/0070-harness-enforced-local-gates.md).

### `agent.routing.workflowGates` (local gate provider)

Controls which backend evaluates the LOCAL (`pi`) dispatch's `outcome-eval`
sub-gate. This affects ONLY the local backend's harness-enforced gate — the
Claude/primary dispatch path is unchanged.

- **absent** or `local` (default): the local SEL provider judges outcome-eval.
  Byte-identical to pre-flag behavior.
- `primary`: the outcome-eval gate resolves its provider from the primary
  (`routing.default`) backend, so a stronger model judges "does the diff satisfy
  the spec?" while the local model still does the implementation. If the primary
  provider is unreachable, the gate degrades to a neutral verdict (fail-open) —
  the fail-closed `verify` gate (typecheck+lint+test) remains the hard floor, so
  a broken build still halts regardless of this flag.

Note: `primary` resolves to whatever `routing.default` names (the primary
backend), not a literal backend named `"primary"`. Scope is `outcome-eval` only;
the advisory `review` gate is not yet routed by this flag.

```json
{ "agent": { "routing": { "default": "primary", "workflowGates": "primary" } } }
```

### MCP tools for the local agent

The `ollama` backend agent ships with three built-in tools — `bash`, `read_file`, `write_file`. Set `mcpServers` on the backend def to also give it tools from any MCP server, so a local model gets the same tool leverage a cloud driver gets from native MCP. Each entry is `{ name, command, args?, env?, cwd? }`; the orchestrator hosts one MCP client per server, connects at session start, and merges the servers' tools into the model's tool set alongside the built-ins.

Tools appear to the model **namespaced** as `<server>__<tool>` (so two servers can expose a same-named tool without colliding); if a namespaced name would shadow a built-in, the built-in wins. A server that fails to connect is **skipped with a warning** — the session still runs on the built-ins plus every server that did start, so one flaky server never breaks a dispatch. `mcpServers` defaults to unset (built-ins only), so leaving it off is byte-identical to prior behavior.

`harness-mcp` — and any server without an explicit `cwd` — is spawned with `cwd =` the agent's workspace (the git worktree it is editing), so harness's own code-intelligence tools (`code_search`, `ask_graph`, `review_changes`, `outcome_eval`) operate on the code the agent is building rather than the daemon's repo. Set a per-server `cwd` to override.

```yaml
agent:
  backends:
    local:
      type: ollama
      endpoint: http://127.0.0.1:11434/v1
      model: ['qwen2.5-coder:7b', 'gemma3n:e4b']
      mcpServers:
        - name: context7 # live library docs — stop coding from stale memory
          command: npx
          args: ['-y', '@upstash/context7-mcp']
        - name: harness # code_search / ask_graph / review_changes / outcome_eval,
          command: harness-mcp # run against the agent's workspace
```

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

## Opting a backend into the Local Model Lifecycle Manager

Backends of `type: local` or `type: pi` can hand pool management to the
Local Model Lifecycle Manager (LMLM) by setting `localModels.enabled = true`
in `harness.config.json`. When enabled, the resolver's candidate list is
derived from LMLM pool state (ordered by score) instead of a hand-curated
`model: [...]` array; the orchestrator proposes pool add/swap/evict changes
through the review queue. With `localModels.enabled = false` (default),
behavior is byte-identical to today's hand-curated lists.

See the [Local Model Lifecycle Manager guide](./local-model-lifecycle.md).

## Related

- [`docs/changes/multi-backend-routing/proposal.md`](../changes/multi-backend-routing/proposal.md) — the spec
- [Local Model Resolution](../knowledge/orchestrator/local-model-resolution.md)
- [Issue Routing](../knowledge/orchestrator/issue-routing.md)
- [Intelligence Pipeline](./intelligence-pipeline.md)
- [Routing Resolution](../knowledge/orchestrator/routing-resolution.md) — Spec B resolution chain + decision telemetry
- [Routing Trace](./routing-trace.md) — Spec B operator-debugging guide
- [Hybrid Orchestrator Quick Start](./hybrid-orchestrator-quickstart.md)
- [Local Model Lifecycle Manager](./local-model-lifecycle.md)
