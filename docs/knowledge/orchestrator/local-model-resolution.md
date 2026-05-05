---
type: business_concept
domain: orchestrator
tags: [local-model, resolver, probe-loop, fallback, openai-compatible, lm-studio, ollama]
---

# Local Model Resolution

The orchestrator's `LocalModelResolver` consolidates local-model availability detection into a single component consumed by every code path that needs a local LLM.

## Configuration

```yaml
agent:
  localBackend: pi # or 'openai-compatible'
  localEndpoint: http://localhost:1234/v1
  localModel: [gemma-4-e4b, qwen3:8b, deepseek-coder-v2]
  localApiKey: lm-studio # optional; default 'lm-studio'
  localProbeIntervalMs: 30000 # optional; default 30000, minimum 1000
```

`localModel` accepts either a string or a non-empty array. The string form is normalized internally to a 1-element array.

## Probe Loop

The resolver issues `GET ${endpoint}/models` periodically. Default cadence is 30 seconds; the first probe runs synchronously inside `Orchestrator.start()` so the initial status reflects server availability before any consumer reads from it.

The probe response is OpenAI-standard: `{ data: [{ id: string }, ...] }`. The resolver walks the configured candidate list in priority order and selects the first ID that appears in the response. Failure modes:

- **Network error / timeout / non-2xx:** `available=false`, `resolved=null`, `lastError` populated, `detected` retains the prior successful probe's value
- **Malformed response body** (non-JSON, missing `data`): treated as a probe failure with `lastError = "malformed /v1/models response"`
- **Empty `data` array** (server reachable, no models loaded): `available=false`, `resolved=null`, `detected=[]`, `lastError=null` — distinguished from error states

The probe loop has an overlap guard: if a probe is in flight when the interval fires, the second probe is suppressed (returns the in-flight promise) so concurrent probes can't race-mutate the status.

## Status Surface

`LocalModelStatus` (defined in `@harness-engineering/types`):

| Field         | Type             | Description                                           |
| ------------- | ---------------- | ----------------------------------------------------- |
| `available`   | `boolean`        | True when at least one configured candidate is loaded |
| `resolved`    | `string \| null` | The currently selected model ID                       |
| `configured`  | `string[]`       | Candidate list (always normalized to array)           |
| `detected`    | `string[]`       | Model IDs returned by the last successful probe       |
| `lastProbeAt` | `string \| null` | ISO timestamp of the last successful probe            |
| `lastError`   | `string \| null` | Last probe error message                              |
| `warnings`    | `string[]`       | Human-readable warnings (empty when healthy)          |

Consumers subscribe via `resolver.onStatusChange(handler)` and the orchestrator broadcasts every meaningful change to the dashboard on the `local-model:status` WebSocket topic.

For multi-resolver configs, the orchestrator surfaces a `NamedLocalModelStatus` per resolver — `LocalModelStatus` plus a `backendName: string` and `endpoint: string`. The HTTP API returns the array via `GET /api/v1/local-models/status` (introduced by Spec 2). The singular `GET /api/v1/local-model/status` from Spec 1 remains as a deprecated alias returning the first registered resolver's `LocalModelStatus` (without `backendName` / `endpoint`); it is removed in a follow-up release.

## Consumers

The resolver is the single source of truth for local-model availability. Direct reads of `agent.localModel` exist at exactly one site (the resolver constructor). Two runtime consumers:

- **Backend factory (per-dispatch)** — the `OrchestratorBackendFactory` looks up `this.localResolvers.get(backendName)` for each `local`/`pi` dispatch and passes `getModel: () => resolver.resolveModel()` to the per-dispatch `LocalBackend` / `PiBackend` instance. When the callback returns null, the backend's `startSession()` returns `Err({ category: 'agent_not_found' })`.
- **`analysis-provider-factory` (intelligence pipeline)** — for each `routing.intelligence.{sel,pesl}` target whose resolved `BackendDef.type` is `local` or `pi`, the factory looks up the resolver by backend name and constructs an `OpenAICompatibleAnalysisProvider` whose `defaultModel` reads from the resolver. The pipeline disables the layer (returns null with a warn log) when the resolved model is unavailable at orchestrator start.

## Lifecycle

The orchestrator holds a `Map<string, LocalModelResolver>` (`this.localResolvers`) keyed by backend name. One resolver is constructed for each `agent.backends.<name>` entry whose `type` is `local` or `pi`. Legacy configs (with `agent.localBackend` set) flow through the migration shim, which synthesizes a single `agent.backends.local` entry — so legacy configs see exactly one resolver named `local`, preserving Spec 1 behavior.

`Orchestrator.start()` iterates the map: each resolver's `start()` is awaited (the initial probe is synchronous), and a per-resolver `onStatusChange` listener is registered before the first probe fires. Each listener broadcasts on the `local-model:status` WebSocket topic with payload `NamedLocalModelStatus` (the per-resolver `LocalModelStatus` plus `backendName` and `endpoint`). `Orchestrator.stop()` iterates the map and calls each `resolver.stop()`, clearing all probe intervals.

When zero `local`/`pi` backends are configured, the map is empty and no probe traffic is generated.

## Self-Healing

Once `available` flips to `true`, agent dispatches to the local backend resume without orchestrator restart. The intelligence pipeline does _not_ auto-rebuild — it remains disabled until orchestrator restart even after local becomes available. This is a documented trade-off; tracked as a known limitation in `docs/guides/intelligence-pipeline.md`.

## Related

- [ADR 0003: Local model resolution strategy](../decisions/0003-local-model-resolution-strategy.md)
- [ADR 0004: Local availability disables rather than escalates](../decisions/0004-local-availability-disables-not-escalates.md)
- [ADR 0005: Named backends map](../decisions/0005-named-backends-map.md) — `agent.backends` schema with per-`type: 'local'|'pi'` resolver keying
- [`docs/changes/local-model-fallback/proposal.md`](../../changes/local-model-fallback/proposal.md)
- [Tick Loop](./tick-loop.md) — the probe runs on its own interval, independent of the dispatch tick
