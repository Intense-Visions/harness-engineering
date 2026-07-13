# Adaptive Model Routing (AMR)

Adaptive Model Routing picks a **capability tier** (`fast` → `standard` → `strong`)
per dispatch based on the task's estimated complexity, then routes to the cheapest
backend that qualifies at that tier — so trivial work runs on a cheap/local model
and hard work escalates to a strong one. It layers on top of
[multi-backend routing](./multi-backend-routing.md): `agent.backends` still defines
the named backends; AMR chooses **which tier** each dispatch needs.

**AMR is strictly opt-in and default-off.** With no `agent.routing.policy` set, the
orchestrator dispatches exactly as before — byte-identical, no complexity
classification, no added latency. Everything below activates only once you set a
policy.

## Quick start

Add a `policy` block under `agent.routing`:

```yaml
agent:
  backends:
    local-fast:
      {
        type: local,
        endpoint: http://localhost:1234/v1,
        model: qwen3:8b,
        capabilities: { tier: fast, costPer1kTokens: 0, privacyClass: on-device },
      }
    cloud-strong:
      {
        type: anthropic,
        model: claude-opus-4-8,
        capabilities: { tier: strong, costPer1kTokens: 15, privacyClass: shared-cloud },
      }
  routing:
    default: cloud-strong
    policy:
      # Optional: override the built-in complexity→tier matrix.
      complexityTierMatrix: { trivial: fast, simple: fast, moderate: standard, complex: strong }
      # Optional: keep spend under a soft cap (see "Budget" below).
      budget: { capUsd: 20, degradeAtPct: 90, onBudgetExhausted: degrade }
```

Now a `trivial` task routes to `local-fast` (free), a `complex` one to
`cloud-strong`, and everything degrades a tier once you've spent 90% of the cap.

Backends need a `capabilities` block (`tier`, `costPer1kTokens`, `privacyClass`,
`contextWindow`) for AMR to compare them; a backend without one is invisible to
tier selection and only reachable via the identity/default chain.

## `agent.routing.policy`

| field                  | type                                           | effect                                                                                              |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `complexityTierMatrix` | `{ trivial\|simple\|moderate\|complex: tier }` | Maps the classified complexity level to a required tier. Defaults are provided; override per level. |
| `skillTierOverrides`   | `{ [skillName]: tier }`                        | Pin a specific skill/phase to a tier, evaluated before the matrix.                                  |
| `privacyFloor`         | `on-device \| byo-endpoint \| shared-cloud`    | Excludes backends whose `privacyClass` is weaker than the floor. Fail-closed (see below).           |
| `budget`               | `{ capUsd, degradeAtPct?, onBudgetExhausted }` | Soft spend cap that degrades the tier under pressure. See **Budget**.                               |
| `allowedProviders`     | `BackendType[]`                                | Provider-type allowlist; only these backend `type`s are eligible. Fail-closed if it empties.        |
| `escalationThreshold`  | `number` (default 2)                           | Consecutive quality failures before a unit's tier floor climbs. See **Escalation**.                 |

### How a tier is chosen

For each dispatch, AMR resolves the required tier in order:

1. **`skillTierOverride`** for the skill, else **`complexityTierMatrix`** for the
   classified complexity.
2. **Blast-radius veto (D5):** a sensitive-path / high-risk task is forced to
   `strong` regardless.
3. **Budget clamp (D8):** if over the degrade threshold, step the tier **down** one
   (never below the veto floor).
4. **Escalation floor (D10):** if the coherence unit has climbed, raise the tier
   (never lowers it).

Then it selects the cheapest backend qualifying at that tier, honoring
`privacyFloor` and `allowedProviders`. If a privacy/allowlist constraint leaves
**no** compliant backend, selection **fails closed** (the unit surfaces to a human
as `routing:no-tier-match`) — it never silently routes to a non-compliant backend.

## Budget

`budget` is a **soft, lagging** cap — a degrade _signal_, not a hard ceiling:

- Spend accrues as a **monotonic** total of estimated per-dispatch cost. Once it
  reaches `degradeAtPct` (default 90) of `capUsd`, the tier is clamped **one step
  down** for subsequent dispatches (`strong → standard → fast`), never below the
  blast-radius veto floor.
- It is **lagging under concurrency**: several dispatches in flight all read the
  same pre-accrual total, so a burst can overshoot the cap before the clamp
  engages. It nudges routing cheaper; it does not gate admission.
- `onBudgetExhausted` (`degrade | pause | human`) is the declared intent; the
  shipped clamp implements the `degrade` behavior.

Watch spend against the cap with `harness routing status` (below).

## Escalation

When a coherence unit's output repeatedly fails a **quality gate**, AMR raises that
unit's tier floor (`escalationThreshold` consecutive failures → climb one step,
`strong`-capped). If a unit re-crosses the threshold already at `strong`, it
**hard-fails to a human** (`routing:escalation-exhausted`).

This is **live for both dispatch paths**:

- **Staged workflows** — a `pass-required` stage's gate outcome feeds escalation directly.
- **Single-agent** — on a normal exit, a **baseline-relative** security scan of the
  lines the agent introduced (only added lines, so pre-existing patterns never
  count) feeds `quality-fail` on a new error-severity finding. It is a no-op when
  AMR is off and never breaks completion. Design rationale + why it was deferred
  until a sound source existed: [ADR 0069](../knowledge/decisions/0069-amr-single-agent-quality-gate-deferred.md).

## Split-routing workflows

Declare a multi-stage workflow under `agent.workflows` to run a unit as an ordered
sequence of stages, **each routed independently** at its own required tier on one
shared worktree:

```yaml
agent:
  workflows:
    - name: implement-then-review
      match: { labels: [feature] }
      stages:
        - {
            skill: implement,
            produces: code,
            gate: pass-required,
            routingHint: { complexity: complex },
          }
        - {
            skill: review,
            produces: review,
            expects: code,
            gate: pass-required,
            routingHint: { complexity: moderate },
          }
```

Staged **execution** is single opt-in: the declaration alone selects the staged
path. Per-stage **tier routing** is the additional opt-in — with `routing.policy`
set, each stage calls the router at its own tier; without it, stages use the
identity/default chain. Each stage renders a real prompt from the work item, its
role, and the prior stages' outputs (threaded by `produces`). Absent a matching
≥2-stage workflow, dispatch is byte-identical to single-agent.

**`expects` (optional) narrows the thread.** By default every prior stage's output
is threaded into a stage's prompt. Declaring `expects: <label>` on a stage threads
**only** that one upstream artifact — the operator states exactly which output the
stage consumes, keeping prompts lean and shrinking the injection surface. The label
must be a `produces` from an **earlier** stage (validated at config-load — a typo
or forward/self reference is rejected). Omit `expects` for the all-priors default.
(All stages share one worktree, so the _files_ a stage writes are already on disk
for later stages regardless; `expects` governs the prompt-text channel.)

## Observability

The `harness routing` command group inspects a running orchestrator (set
`HARNESS_ORCHESTRATOR_URL`, default `http://127.0.0.1:8080`):

| command                     | shows                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `harness routing status`    | Live status: AMR on/off, budget **spend-vs-cap** + `DEGRADING` flag, escalated units, allowlist. |
| `harness routing telemetry` | Recent decisions with a per-tier distribution and per-decision cost.                             |
| `harness routing decisions` | The raw recent-decision ring, filterable by `--skill`/`--mode`/`--backend`.                      |
| `harness routing config`    | The resolved routing config + fallback chains.                                                   |
| `harness routing trace`     | Dry-run a decision (`--skill`, `--complexity`, `--risk`) with no side effects.                   |

Each takes `--json` for scripting.

### Runtime control plane

For programmatic / multi-tenant control (e.g. the Shuttle SaaS layer), the
orchestrator exposes:

- `PUT /api/v1/routing/policy` (`admin` scope) — ingest a `RoutingPolicy` at
  runtime, hot-swapping the live router (preserving accumulated escalation). An
  empty `{}` body restores default-off.
- `GET /api/v1/routing/telemetry` (`read-telemetry`) — decisions in the
  cross-repo wire shape (`{ decisions, spentUsd }`).
- `GET /api/v1/routing/status` (`read-telemetry`) — the live operator status.

## Limitations

- **Budget is a soft cap** (lagging, single-step degrade), not a hard ceiling — see
  **Budget**.
- **Single-agent escalation is scoped to security defects (v1)** — it escalates on a
  new error-severity _security_ finding in the diff, not on spec-satisfaction or
  logic quality (that needs an LLM acceptance-eval, still deferred —
  [ADR 0069](../knowledge/decisions/0069-amr-single-agent-quality-gate-deferred.md)).
- **Two `spentUsd` numbers exist:** `routing telemetry`/`GET /telemetry` report the
  bounded ring sum (last N decisions, telemetry-grade); `routing status` reports the
  monotonic accumulator that actually drives the budget clamp. Use `status` for
  budget decisions.
