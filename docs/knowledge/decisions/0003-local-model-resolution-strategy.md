---
number: 0003
title: Local model resolution strategy
date: 2026-05-01
status: accepted
tier: medium
source: docs/changes/local-model-fallback/proposal.md
---

## Context

The orchestrator's `agent.localModel` config was a single string. If the configured model wasn't loaded on the local server, dispatches failed at request time with an opaque 404. There was no way to express a preference order across multiple candidate models, and no way to detect availability up front. Operators running LM Studio, Ollama, or vLLM had to either restart the orchestrator after loading a model or accept silent dispatch failures.

The detection surface needed to work across all supported local servers (LM Studio, Ollama, vLLM) without coupling the orchestrator to backend-specific endpoints. The probe cadence needed to balance freshness against probe traffic on long-running orchestrator daemons.

## Decision

Detect local model availability via the OpenAI-compatible `/v1/models` endpoint. The orchestrator probes once at `start()` and re-probes on a periodic timer (default 30s, configurable via `agent.localProbeIntervalMs`, minimum 1000ms). The probe lifecycle is owned by a single `LocalModelResolver` instance constructed when `agent.localBackend` is set.

The resolver accepts `localModel: string | string[]`. The string form is normalized internally to a 1-element array. On each probe, the resolver walks the configured candidates in order and selects the first ID present in the server's response. The resolved model name flows to consumers via `getModel: () => string | null` callbacks on `LocalBackend` and `PiBackend`, and via `resolver.getStatus()` reads in the intelligence pipeline.

Backend-native loaded-state checks (LM Studio `/api/v0/models`, Ollama `/api/ps`) were considered and rejected. They added complexity for edge cases the spec didn't require, and `/v1/models` is the standard endpoint already used by `LocalBackend.healthCheck()` (`packages/orchestrator/src/agent/backends/local.ts:147-156`). End-to-end probing via tiny chat completions was also rejected — slow at startup and burns tokens.

## Consequences

**Positive:**

- Standard endpoint works across LM Studio, Ollama, and vLLM with no backend-specific branching.
- Periodic re-probing enables self-healing — operators can load a model after starting the orchestrator and the resolver picks it up within a probe interval, without restart.
- Single `LocalModelResolver` instance consolidates what was previously duplicated reads of `agent.local*` fields across `createLocalBackend()` and `createAnalysisProvider()`.
- The `/v1/models` probe is cheap (one HTTP GET) and uses the same auth header as production traffic.
- Array fallback gives operators a way to express preference order for their local model lineup.

**Negative:**

- LM Studio's `/v1/models` reports models that are loaded; Ollama's reports models that are _installed_ (regardless of RAM state). For Ollama users running with limited VRAM, "model is listed but not loaded" cases would still fail at request time. Acceptable trade — Ollama auto-loads on first request and the resolver's `available: true` is best-effort, not a hard guarantee.
- A 30s probe cadence means status changes are visible to the dashboard with up to 30s latency. Tunable via config.
- Probe failures (network, malformed response) mark `available: false` but the resolver continues probing, so transient failures self-recover.

**Neutral:**

- The resolver's `fetchModels` function is injectable for testing — production code uses `globalThis.fetch` with a 5s `AbortSignal.timeout`. Tests inject stubs to avoid real HTTP traffic.

## Related

- [Local Model Resolution](../orchestrator/local-model-resolution.md)
- [`docs/changes/local-model-fallback/proposal.md`](../../changes/local-model-fallback/proposal.md)
