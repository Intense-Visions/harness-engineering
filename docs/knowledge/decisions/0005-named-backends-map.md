---
number: 0005
title: Backend definitions become a named map
date: 2026-05-05
status: accepted
tier: large
source: docs/changes/multi-backend-routing/proposal.md
---

## Context

The orchestrator's `agent.backend` was a single string naming one of `mock | claude | anthropic | openai | gemini`, with `agent.localBackend` as an optional second slot for `local | pi`. This two-slot cap shaped the dispatch path: a hard-coded `runner` / `localRunner` split chose between the two based on a `backend === 'local'` switch. Operators wanting to mix three backends — a primary cloud, a local, and a Claude CLI subscription — couldn't express it. Routing decisions were entangled with backend identity: `escalation.autoExecute` listed tiers that should "go local" without acknowledging that "local" was a backend choice rather than a tier property.

Three options were considered:

1. **Add more named slots.** Extend with `agent.tertiaryBackend`, etc. Doesn't solve the entanglement, just postpones the cap.
2. **Convert backends to an array.** `agent.backends: [...]` would scale, but ordering becomes load-bearing and routing rules would need to reference array indices.
3. **Convert backends to a named map.** Operators choose names; routing references names. Clean separation between backend identity and routing decisions.

## Decision

`agent.backends` is a `Record<string, BackendDef>` — a named map of operator-chosen keys to discriminated-union backend definitions keyed by `type`. Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`. Per-type fields are validated at config load via Zod (records spec D5).

`agent.routing` is a separate map of use cases to backend names. `default` is required; all other keys (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`, `intelligence.sel`, `intelligence.pesl`) are optional and fall back to `default`. Routing rejects unknown keys (records spec D7) — typos cause hours of "why is this routing wrong" debugging, and the set of valid keys is small and known.

Legacy `agent.backend` / `agent.localBackend` continue to work via an in-memory migration shim (`packages/orchestrator/src/agent/config-migration.ts`) that synthesizes fixed-name entries `primary` and `local` and a `routing` map mirroring `escalation.autoExecute` semantics. The shim is in-memory only; the user's YAML stays unchanged until they migrate manually (records spec D12). A one-time `warn` log at orchestrator start names each deprecated field and points at the operator guide. The deprecation lifecycle is: warn for one minor release, error in the next, remove in the one after — hard removal is a follow-up spec, not part of Spec 2 (records D13).

When **both** legacy and new fields are set, `agent.backends` wins and each ignored legacy field is logged (records D4). Synthesized backend names are fixed (`primary` and `local`) regardless of underlying type, so docs and examples can reference them without caveats (records D8).

## Consequences

**Positive:**

- Backend identity and routing decisions are now orthogonal. Operators express "I have three backends" and "this tier uses backend X" independently.
- Strict routing validation catches typos at config load. `routing.quickfix` (missing hyphen) fails fast with a clear error rather than silently routing to default.
- Multiple local backends are now expressible — operators can run an LM Studio instance alongside a Pi and route different tiers to each. The `LocalModelResolver` instances become per-backend (`Map<backendName, LocalModelResolver>`).
- Per-type discriminated unions surface backend-specific config errors at load time, not at orchestrator runtime. TypeScript narrows `BackendDef` cleanly via the `type` field.
- The dispatch path simplifies to a single runner with a per-dispatch backend factory (see [ADR 0006](./0006-single-runner-orchestrator-dispatch.md)).

**Negative:**

- Operators with existing configs see a deprecation warning at orchestrator start. The warning is informational and pointable at the migration guide, but it's still noise in operator logs until they migrate.
- The migration shim adds maintenance surface in `config-migration.ts` for at least one release window. Spec 2 ships with comprehensive shim tests (SC9–SC15) so the shim is durable.
- Dual-mechanism period — for one minor release the orchestrator must accept both schemas. Reviewers checking config behavior must trace through the shim.

**Neutral:**

- Dispatch behavior is unchanged for legacy configs: a config with `agent.backend: claude` and `agent.localBackend: pi` and `escalation.autoExecute: [quick-fix, diagnostic]` produces exactly the same dispatch outcomes via the shim as it did before Spec 2. SC41 in the spec asserts state-machine.test.ts still passes byte-for-byte.

## Related

- [`docs/changes/multi-backend-routing/proposal.md`](../../changes/multi-backend-routing/proposal.md) — the spec
- [`docs/guides/multi-backend-routing.md`](../../guides/multi-backend-routing.md) — operator guide
- [ADR 0006: Single-runner orchestrator dispatch](./0006-single-runner-orchestrator-dispatch.md) — the dispatch refactor enabled by this schema
- [ADR 0007: Multi-provider intelligence pipeline](./0007-multi-provider-intelligence-pipeline.md) — `routing.intelligence.{sel,pesl}` plumbing
- [ADR 0003: Local model resolution strategy](./0003-local-model-resolution-strategy.md) — `LocalModelResolver` is per-backend under this schema
