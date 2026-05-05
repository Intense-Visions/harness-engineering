---
number: 0004
title: Local availability disables rather than escalates
date: 2026-05-01
status: accepted
tier: medium
source: docs/changes/local-model-fallback/proposal.md
---

## Context

When the orchestrator's local backend is configured but no candidate model is loaded, the system needs a behavioral choice. Three options were considered:

1. **Hard-fail at startup** — orchestrator refuses to start. Loud and obvious, but blocks cloud-routed work that doesn't depend on local.
2. **Silent escalation to cloud** — locally-routed work transparently runs on the primary backend. Frictionless, but quietly costs money the operator may not be tracking.
3. **Disable local paths with a visible warning** — orchestrator continues to serve cloud routes; locally-routed code paths fail with a typed error and a dashboard banner surfaces the disabled state.

The operator's mental model is: "I configured a local backend because I want it to handle these specific routes. If it's not available, tell me — don't quietly fall back to a paid API."

## Decision

When the `LocalModelResolver` reports `available: false`, the orchestrator disables paths that need the local model:

- **Agent dispatch:** `LocalBackend.startSession()` and `PiBackend.startSession()` return `Err({ category: 'agent_not_found' })` when their `getModel` callback returns null. Existing escalation/retry policy handles the error — same code path as if the pi-coding-agent SDK weren't installed.
- **Intelligence pipeline:** `createAnalysisProvider()` returns `null` when local is configured but unavailable at orchestrator start. The pipeline doesn't initialize. A warn-level log records the disabled state with the configured candidates, detected models, and endpoint.
- **Dashboard surface:** A warning banner renders on the Orchestrator page with the configured list, detected list, endpoint, last error, and last probe time, sourced from `GET /api/v1/local-models/status` (one entry per local backend, returning `NamedLocalModelStatus[]`) and live-updated via a `local-model:status` WebSocket topic. The singular `GET /api/v1/local-model/status` endpoint remains as a deprecated alias per the deprecation timeline (warn for one minor release, error in the next, remove in the one after); see [ADR 0005](./0005-named-backends-map.md) and the multi-backend-routing operator guide for canonical schedule wording.
- **Cloud paths and `ClaudeBackend` (subscription via `claude` CLI subprocess):** completely unaffected.

Once the resolver flips `available: true` on a subsequent probe, agent dispatches to the local backend resume successfully. The intelligence pipeline does _not_ auto-rebuild — it remains disabled until orchestrator restart even after local becomes available. This is a documented limitation; revisiting it would require the pipeline construction code to listen for resolver status changes, which adds complexity disproportionate to the value at this iteration.

## Consequences

**Positive:**

- No silent cloud-fallback. Operators see disabled-state in the dashboard, in logs, and (for agent dispatches) as typed errors.
- Cloud routes keep working. An orchestrator with mixed local+cloud routing isn't blocked by local unavailability.
- `ClaudeBackend` (subscription) is preserved untouched — the operator's "no API tokens for primary work" requirement holds.
- Self-healing for the agent backend — once a model is loaded, the next probe flips `available` and dispatches resume without restart.

**Negative:**

- Intelligence pipeline doesn't self-heal post-restart. If the operator starts the orchestrator with no model loaded and then loads one, agent dispatches resume but spec enrichment and pre-execution simulation remain disabled until they restart. Documented as SC23 in the spec.
- Operators who _want_ cloud-fallback for cost-insensitive routes must opt in explicitly via `intelligence.provider` (cloud) or, after Spec 2 (`multi-backend-routing`), via per-use-case routing rules.

**Neutral:**

- The dashboard banner is informational, not blocking. Operators can dismiss it from view but the underlying disable state persists until the resolver flips back to `available: true`.

## Related

- [`docs/changes/local-model-fallback/proposal.md`](../../changes/local-model-fallback/proposal.md) §Disable semantics
- [ADR 0003: Local model resolution strategy](./0003-local-model-resolution-strategy.md)
