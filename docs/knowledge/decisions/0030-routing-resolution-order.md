---
number: 0030
title: Routing resolution order — invocation, skill, mode, tier, default
date: 2026-05-26
status: accepted
tier: medium
source: docs/changes/granular-task-routing/proposal.md
---

## Context

With per-skill and per-cognitive-mode routing added as new axes (ADR 0029), and with the pre-existing per-tier, per-intelligence-layer, per-isolation, maintenance, and chat use cases retained, a single dispatch can match multiple routing entries. Without a deterministic resolution order, operators cannot predict which backend will run a given dispatch when, say, both `routing.skills.harness-debugging` and `routing.modes.diagnostic-investigator` are configured for a skill that matches both.

The orchestrator also supports an invocation-level escape hatch (`harness skill run <name> --backend <name>` and `harness dispatch --backend <name>`) for one-off overrides during testing.

## Decision

`BackendRouter.resolve()` walks routing sources in a fixed deterministic order, returning the first source that yields an available backend:

1. **Invocation override** — `opts.invocationOverride` if set (from `--backend <name>` flag, ADR-0029 D7 in spec).
2. **Per-skill** — `routing.skills[useCase.skillName]` if `useCase.kind === 'skill'`.
3. **Per-cognitive-mode** — `routing.modes[useCase.cognitiveMode]` if `useCase.kind in {'skill', 'mode'}` and a mode is present.
4. **Per-tier / per-intelligence-layer / per-isolation / maintenance / chat** — the pre-Spec-B resolution preserved unchanged.
5. **`routing.default`** — required fallback; throws at construction time (via `validateReferences`) if it names an unknown backend.

First match wins. Within a source, chain entries (ADR 0031) are tried in declared order; the first chain entry whose backend exists in `agent.backends` is chosen.

## Consequences

**Positive:**

- Operator authority over skill author (skills cannot override; ADR 0033) and over scope tier (tier remains as the documented fallback when no skill/mode entry matches).
- Invocation override at the top of the chain provides an authoritative one-off escape hatch for testing and debugging.
- Deterministic: identical config + identical use-case input produces identical resolution; verified by Phase 1's unit-test suite (F3 + F4 + F11 in spec § Success Criteria).

**Negative:**

- Five-step resolution chain has more surface to teach than the pre-Spec-B two-step (per-use-case → default). The "Backend Routing" knowledge doc and `harness routing trace` CLI mitigate this.

**Neutral:**

- Tier is preserved as the fallback path for skills/modes that aren't explicitly configured — pre-Spec-B configs (no `routing.skills`, no `routing.modes`) walk directly from step 4 to step 5 (S1 invariant).
- Resolution path is captured in the `RoutingDecision.resolutionPath` array (ADR 0032), making the walk inspectable post-dispatch.
