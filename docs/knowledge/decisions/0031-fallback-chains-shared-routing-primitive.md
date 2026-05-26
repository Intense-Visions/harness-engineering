---
number: 0031
title: Fallback chains as a shared routing primitive
date: 2026-05-26
status: accepted
tier: medium
source: docs/changes/granular-task-routing/proposal.md
---

## Context

Routing entries pre-Spec-B were always a single backend name: `routing.default: 'claude-opus'`, `routing.quick-fix: 'local-fast'`, etc. Spec B introduces new axes (ADR 0029) and operators have begun asking for resilience semantics: "try local-fast first, then fall back to claude-sonnet if local-fast is misconfigured or unavailable." Duplicating routing config to express resilience (e.g., two near-identical configs for retry) is error-prone.

The fallback semantics could live as a Spec-B-only construct (`RoutingChain` type only valid under `routing.skills` and `routing.modes`), but that creates schema inconsistency between old and new axes.

## Decision

Every routing value becomes `RoutingValue = string | readonly [string, ...string[]]`. Scalar form is byte-compatible with pre-Spec-B configs; array form expresses an ordered fallback chain. Applies uniformly to all routing axes:

- `routing.default`
- `routing.<tier>` (quick-fix, guided-change, full-exploration, diagnostic)
- `routing.intelligence.{sel,pesl}`
- `routing.isolation.<tier>`
- `routing.skills.<skill-name>` (new)
- `routing.modes.<cognitive-mode>` (new)

`BackendRouter.resolve()` walks chain entries in declared order; the first entry whose backend exists in `agent.backends` is chosen. Scalar form is normalized internally to a one-element array via `toArray(value)`.

## Consequences

**Positive:**

- Operators express resilience uniformly: `routing.skills.harness-soundness-review: [local-reasoning, claude-opus]` says "try local-reasoning, fall back to claude-opus if the former is unknown to `agent.backends`."
- Schema consistency: one mental model across all routing axes, not "chains here, scalars there."
- Backward compatibility: existing scalar configs are byte-compatible (S1 + F5 in spec § Success Criteria).

**Negative:**

- Validation surface widens: every chain entry (not just the routing root) must reference a backend in `agent.backends`. The validator was extended in Phase 2 to traverse chains.
- No health-aware fallback skip in v1 (spec D11). Chain entries are tried in order; if the first chain entry exists in `agent.backends` but its backend is unhealthy at dispatch time, the dispatch attempts it and falls through only on the existing per-backend timeout / error handling — not on a health pre-check.

**Neutral:**

- LMLM (Spec A) composes naturally: an operator can write `routing.skills.harness-soundness-review: [local-reasoning, claude-opus]` knowing LMLM may not yet have pulled `deepseek-r1:32b`; the chain falls through to Claude. Once LMLM installs the local model, future dispatches start staying local. No LMLM-specific code in Spec B's chain semantics.
- `unknown-backend` outcomes are recorded in `RoutingDecision.resolutionPath` (ADR 0032) for telemetry, so operator typos surface in the dashboard `/routing` panel and `harness routing decisions` CLI.
