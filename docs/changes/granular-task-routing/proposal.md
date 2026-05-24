# Granular Task→Backend Routing

**Status:** Draft · **Tier:** Medium · **Domain:** orchestrator

**Keywords:** routing, backend-selection, per-skill, cognitive-mode, fallback-chains, resolution-order, observability, dispatch-trace, cost-insurance

## Overview

Today the orchestrator routes dispatches to backends based on a small fixed set of use cases: scope tier (`quick-fix` / `guided-change` / `full-exploration` / `diagnostic`), intelligence layer (`sel` / `pesl`), and isolation tier. Every skill at the same scope tier routes to the same backend. This is too coarse for two emerging needs: (1) farming individual skills to cheaper or more-capable models based on the work they do, and (2) absorbing cloud LLM rate-cap pressure by selectively re-routing specific skills to local backends.

Spec B extends routing with two new axes — **per-skill** and **per-cognitive-mode** — and introduces **fallback chains** as a foundational routing primitive (every routing entry can be a single backend name or an ordered array tried in sequence). It adds **routing observability**: structured decision events, a dashboard panel showing live routing decisions, and a `harness routing trace` CLI for dry-runs.

## Why now

1. **Cost insurance.** Cloud LLM rate caps and pricing pressure are tightening. Today the operator can't say "send harness-debugging to local-fast, keep harness-soundness-review on Claude Opus." Spec B closes that gap.
2. **Task-fitness.** Skills have wildly different needs. An adversarial reviewer benefits from a cheap fast model; a constructive architect benefits from a more capable model. The orchestrator already labels skills with `cognitive_mode` — Spec B lets that label drive routing.
3. **Routing legibility.** Today, "why did this dispatch end up on backend X?" is answered only by reading server logs. With routing about to become significantly more configurable, operators need a first-class way to inspect routing decisions before and after they happen.

## Goals

- Operators can route dispatches **per skill** or **per cognitive mode** in `harness.config.json` using a familiar nested-map syntax (`routing.skills.<name>` / `routing.modes.<mode>`).
- Every routing entry accepts a **fallback chain** (single backend name OR ordered array); orchestrator picks the first available backend in the chain.
- **Resolution order is deterministic**: invocation `--backend` flag → per-skill → per-mode → existing per-tier → `routing.default`. First match wins.
- **Backwards-compatible**: existing configs (no `routing.skills` / `routing.modes`) continue to behave identically.
- Operators can **trace a routing decision before dispatch** via `harness routing trace --skill <name>`, and **inspect recent decisions** via dashboard panel + `harness routing decisions` CLI.
- **Composes cleanly with LMLM (Spec A).** Routing entries reference backends whose models LMLM may auto-populate; Spec B requires no LMLM-specific code.

## Non-goals

- **Per-command routing.** CLI commands inherit routing because they invoke skills. Adding `routing.commands.<name>` would duplicate without new value in v1.
- **Per-workflow-step routing.** Workflows are sequences of skill calls; routing the steps means routing the skills. Step-specific overrides deferred to a follow-up if a real use case emerges.
- **Per-route model overrides.** Operators define multiple backend entries when they want multiple models (e.g., `claude-opus`, `claude-sonnet`). The routing schema stays clean.
- **Skill-author backend hints.** Skills do not declare a preferred backend in skill.yaml. Routing is purely operator-controlled to keep skills portable across deployments.
- **Health-aware fallback skip / budget guards.** Fallback chains try in order without consulting health signals; a chain entry is consulted, and the orchestrator's existing per-backend timeout / error handling takes over from there. Budget-aware routing is a separate future spec.
- **Dynamic re-routing of in-flight dispatches.** Routing is decided at dispatch start; the chosen backend handles the whole turn.

## Assumptions

- **Runtime:** Node.js ≥ 18.x (monorepo baseline). Orchestrator process is the host for `BackendRouter` and `RoutingDecisionBus`.
- **Skill catalog availability:** the orchestrator can enumerate skills at startup (skill names + `cognitive_mode`) for validation warnings (D10/S3). Catalog is read once; runtime updates don't trigger re-validation.
- **Dashboard package:** updates land in `packages/dashboard` and ship in the same release as the orchestrator. CLI-only operators can skip the dashboard panel without functional loss.
- **Existing `BackendRouter` API surface:** consumers of `resolveDefinition(useCase)` continue to receive a `BackendDef`; the public contract is unchanged.
- **No persistent decision storage in v1:** ring buffer is process-memory only. Orchestrator restart clears the buffer.
- **Single-orchestrator instance per deployment:** the ring buffer + decision bus are per-process. Multi-orchestrator deployments (federated or HA) would each have their own decision view; aggregation across instances is out of scope. If multi-instance becomes a real use case, persistent storage (D8 follow-up) is the natural next step.
- **Skill name uniqueness:** the skill catalog is assumed to enforce unique `name` values. If two skill.yaml files declared the same `name`, per-skill routing would resolve to the first match found by the catalog loader (existing behavior, not changed by Spec B).

## Decisions

| #       | Decision                                                                                                                                                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | **Two new routing axes: per-skill + per-cognitive-mode.** Add `RoutingUseCase` variants `{ kind: 'skill', skillName }` and `{ kind: 'mode', cognitiveMode }`. Add `routing.skills` and `routing.modes` nested maps.                                                                                                                                                                | Skill is the natural unit of orchestrator work. Cognitive mode (6 standard values) provides a coarser semantic layer that handles the common case ("all reviewer work goes cheap") without per-skill config bloat. Hybrid covers both granularities without forcing operators to choose. |
| **D2**  | **Resolution order: invocation → skill → mode → tier → default.** First match wins. Implemented as an ordered walk in `BackendRouter.resolve()`.                                                                                                                                                                                                                                   | Operator authority over skill author and over scope tier. Invocation flag is the highest because it's used for explicit overrides (testing, one-offs). Tier remains as the fallback for skills/modes that aren't explicitly configured — preserves existing behavior.                    |
| **D3**  | **Config shape: nested maps under `routing`.** `routing.skills.<skill-name>: RoutingValue` and `routing.modes.<cognitive-mode>: RoutingValue`. Mirrors existing `routing.intelligence.<layer>` and `routing.isolation.<tier>` shapes.                                                                                                                                              | Operator-facing schema consistency. Static keys are schema-validatable. No new file or DSL to learn. Avoids the "two ways to express the same thing" trap of mixing nested maps + selector lists.                                                                                        |
| **D4**  | **Fallback chains as a shared primitive.** Every routing value (including existing `default`, `quick-fix`, `intelligence.sel`, etc.) becomes `RoutingValue = string \| [string, ...string[]]`. Scalar is normalized to a one-element array internally.                                                                                                                             | Lets operators express "try local-fast, then fall back to claude" without duplicating routing config for resilience. Widens existing schema for consistency rather than introducing a Spec-B-only mechanism. Scalar form preserves backward compat byte-for-byte.                        |
| **D5**  | **Backend selection only; no per-route model override.** A routing entry references a backend name; the backend carries its own model. Operators define separate backend entries (`claude-opus`, `claude-sonnet`) when they want different models.                                                                                                                                 | Single source of truth for (provider, model) pairs is the `agent.backends` map. Routing stays a name-reference layer with no "which model actually ran?" ambiguity. Slight backend-entry bloat is acceptable trade for schema clarity.                                                   |
| **D6**  | **Skill authors do not declare routing preferences.** `skill.yaml` is not extended with a `preferredBackend` field.                                                                                                                                                                                                                                                                | Keeps skills portable across deployments with different backend names. Operators retain total authority. If a skill genuinely needs a specific class of backend (reasoning model), that's surfaced in skill documentation, not the schema.                                               |
| **D7**  | **Invocation override via `--backend <name>`.** `harness skill run <name> --backend <name>` and `harness dispatch --backend <name>` accept a backend name and bypass the resolution chain for that invocation.                                                                                                                                                                     | Escape hatch for testing, debugging, one-off dispatches. Sits at the top of the resolution chain (D2) so it's authoritative for the invocation only.                                                                                                                                     |
| **D8**  | **Routing-decision events on a new bus topic.** Every `BackendRouter.resolve()` call emits a `RoutingDecision` record onto a new internal event-bus topic `routing:decision`, also broadcast on the WS topic of the same name. Last N decisions held in a per-orchestrator in-memory ring buffer (default 500, configurable).                                                      | Routing legibility is a Spec B goal (#3). Without decision telemetry, granular routing is opaque — operators can't tell what config changes did. Ring buffer keeps memory bounded; persistent storage is a later concern if it becomes needed.                                           |
| **D9**  | **Dashboard panel + CLI tools.** New dashboard route `/routing` shows: current config rendered as resolved chains, recent decisions filterable by skill/mode/outcome, per-backend dispatch volume. `harness routing trace --skill <name>` dry-runs the resolution chain. `harness routing decisions --skill <name> --last <N>` dumps recent decisions in JSON for shell pipelines. | All three surfaces (dashboard, trace CLI, decisions CLI) read from the same event ring buffer + config — single source of truth. Trace is dry-run (no side effects) so it's safe to wire into CI for config-change validation.                                                           |
| **D10** | **Startup validation: hard error on unknown backend, warn on unknown skill name.** Every name referenced by `routing.skills.*` and `routing.modes.*` must exist in `agent.backends` (hard error). Skill names that aren't in the local skill catalog produce a startup warning but do not block startup.                                                                           | Backend typos are a misconfiguration that will silently fail at dispatch — catch at startup. Skill names are more dynamic (third-party skills, locally-developed skills, renames) — warning lets the operator decide whether the discrepancy is intentional.                             |
| **D11** | **No health-aware fallback skip in v1.** Fallback chains try in order. The first chain entry is attempted; if dispatch fails (existing per-backend timeout / error handling), the orchestrator's existing retry / escalation logic takes over. Spec B does not introduce per-chain health checks before attempt.                                                                   | Pure additive scope: keeps Spec B from owning a backend-health-signal abstraction. LMLM resolver health (`available=false`) and rate-limit circuit breaker work are tracked elsewhere. Spec B reserves the ability to add health-aware skip in a follow-up without schema changes.       |
| **D12** | **Cognitive mode is the skill's declared `cognitive_mode` from skill.yaml, or absent.** Skills without a declared mode skip the per-mode resolution step entirely (no synthesis, no default mode).                                                                                                                                                                                 | Avoids the orchestrator silently guessing a mode for skills that didn't declare one. Per-mode routing is opt-in for skill authors via skill.yaml. Skills without `cognitive_mode` fall through to per-tier routing as today.                                                             |

## Technical Design

### Type changes (in `packages/types/src`)

```ts
// BEFORE (current)
export type RoutingUseCase =
  | { kind: 'tier'; tier: 'quick-fix' | 'guided-change' | 'full-exploration' | 'diagnostic' }
  | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
  | { kind: 'isolation'; tier: IsolationTier }
  | { kind: 'maintenance' }
  | { kind: 'chat' };

// AFTER (Spec B additions)
export type RoutingUseCase =
  | { kind: 'tier'; tier: 'quick-fix' | 'guided-change' | 'full-exploration' | 'diagnostic' }
  | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
  | { kind: 'isolation'; tier: IsolationTier }
  | { kind: 'maintenance' }
  | { kind: 'chat' }
  | { kind: 'skill'; skillName: string; cognitiveMode?: string } // NEW
  | { kind: 'mode'; cognitiveMode: string }; // NEW

// RoutingValue: scalar or non-empty fallback chain
export type RoutingValue = string | readonly [string, ...string[]];

// RoutingConfig widened: existing scalar fields become RoutingValue;
// new optional skills + modes maps added.
export interface RoutingConfig {
  default: RoutingValue;
  'quick-fix'?: RoutingValue;
  'guided-change'?: RoutingValue;
  'full-exploration'?: RoutingValue;
  diagnostic?: RoutingValue;
  intelligence?: { sel?: RoutingValue; pesl?: RoutingValue };
  isolation?: Partial<Record<IsolationTier, RoutingValue>>;
  skills?: Record<string, RoutingValue>; // NEW
  modes?: Record<string, RoutingValue>; // NEW
}
```

The `kind: 'skill'` variant carries the skill's `cognitiveMode` (when declared) so the resolver can fall through from skill → mode in one walk without a second `resolve()` call.

### `BackendRouter.resolve()` rewrite

Resolution becomes an ordered walk producing a single chosen backend name plus a `resolutionPath` for telemetry.

```ts
resolve(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): RoutingDecision {
  const path: ResolutionStep[] = [];
  const tryChain = (source: ResolutionSource, value: RoutingValue | undefined) => {
    if (!value) return undefined;
    for (const name of toArray(value)) {
      path.push({ source, candidate: name, outcome: 'considered' });
      if (this.backends[name]) {
        path[path.length - 1].outcome = 'chosen';
        return name;
      }
      path[path.length - 1].outcome = 'unknown-backend';
    }
    return undefined;
  };

  // 1. Invocation override
  const fromInvocation = tryChain('invocation',
    opts?.invocationOverride ? [opts.invocationOverride] : undefined);
  if (fromInvocation) return decide(fromInvocation, path);

  // 2. Per-skill
  if (useCase.kind === 'skill') {
    const fromSkill = tryChain('skill', this.routing.skills?.[useCase.skillName]);
    if (fromSkill) return decide(fromSkill, path);
  }

  // 3. Per-mode (works for useCase.kind='skill' with cognitiveMode and useCase.kind='mode')
  const mode = useCase.kind === 'skill' ? useCase.cognitiveMode
             : useCase.kind === 'mode'  ? useCase.cognitiveMode
             : undefined;
  if (mode) {
    const fromMode = tryChain('mode', this.routing.modes?.[mode]);
    if (fromMode) return decide(fromMode, path);
  }

  // 4. Existing per-tier / intelligence / isolation / maintenance / chat
  const fromExisting = resolveExistingUseCase(useCase, this.routing);
  if (fromExisting) {
    const chained = tryChain('tier', fromExisting);
    if (chained) return decide(chained, path);
  }

  // 5. Default
  const chained = tryChain('default', this.routing.default);
  if (!chained) throw new Error('routing.default produced no available backend');
  return decide(chained, path);
}
```

`decide(name, path)` returns `{ backendName: name, resolutionPath: path, useCase, timestamp, durationMs }` — a `RoutingDecision`.

Note: `unknown-backend` outcomes are kept in the path for telemetry but only `chosen` exits the walk. This makes "operator typo'd a backend name in a skill route" visible in the trace.

### `RoutingDecision` type

```ts
export type ResolutionSource = 'invocation' | 'skill' | 'mode' | 'tier' | 'default';

export interface ResolutionStep {
  source: ResolutionSource;
  candidate: string;
  outcome: 'chosen' | 'unknown-backend' | 'considered';
}

export interface RoutingDecision {
  timestamp: string; // ISO
  useCase: RoutingUseCase;
  resolutionPath: ResolutionStep[];
  backendName: string;
  backendType: BackendDef['type'];
  durationMs: number;
}
```

### Dispatch site changes

Two call sites thread skill metadata into the `RoutingUseCase`:

1. **`packages/orchestrator/src/agent/runner.ts`** — when dispatch is triggered by a skill invocation, construct `{ kind: 'skill', skillName, cognitiveMode }` instead of the current `{ kind: 'tier', tier }`. Tier-based dispatch (issue triage, escalation) keeps `kind: 'tier'`.
2. **`packages/orchestrator/src/intelligence/pipeline-runner.ts`** — unchanged; continues to use `{ kind: 'intelligence', layer }`.

Skill metadata (name + cognitive_mode) is read once at dispatch start from the skill catalog and threaded through the `Dispatch` envelope.

### Config schema (additions to `harness.config.json`)

```yaml
agent:
  backends:
    claude-opus: { type: anthropic, model: claude-opus-4-7 }
    claude-sonnet: { type: anthropic, model: claude-sonnet-4-6 }
    local-fast: { type: local, endpoint: http://localhost:1234/v1, model: qwen3:8b }
    local-reasoning: { type: local, endpoint: http://localhost:1234/v1, model: deepseek-r1:32b }
  routing:
    default: claude-opus
    quick-fix: [local-fast, claude-sonnet] # NEW: fallback chain
    intelligence:
      sel: local-fast
      pesl: local-reasoning
    skills: # NEW: per-skill
      harness-debugging: [local-fast, claude-sonnet]
      harness-soundness-review: claude-opus
      harness-brainstorming: claude-opus
    modes: # NEW: per-cognitive-mode
      adversarial-reviewer: [local-fast, claude-sonnet]
      constructive-architect: claude-opus
      meticulous-implementer: claude-sonnet
```

### Event bus + ring buffer

```ts
// packages/orchestrator/src/routing/decision-bus.ts
export class RoutingDecisionBus {
  private ringBuffer: RoutingDecision[] = [];
  private listeners = new Set<(d: RoutingDecision) => void>();
  constructor(private readonly capacity = 500) {}

  emit(decision: RoutingDecision): void {
    this.ringBuffer.push(decision);
    if (this.ringBuffer.length > this.capacity) this.ringBuffer.shift();
    for (const listener of this.listeners) listener(decision);
  }

  recent(filter?: {
    skillName?: string;
    mode?: string;
    backendName?: string;
    limit?: number;
  }): RoutingDecision[] {
    /* ... */
  }
  subscribe(listener: (d: RoutingDecision) => void): () => void {
    /* ... */
  }
}
```

Wired in `Orchestrator` startup; `BackendRouter` constructor takes the bus and emits after each `resolve()`. Orchestrator broadcasts each decision on the WS topic `routing:decision`.

### HTTP routes (added to orchestrator HTTP server)

| Method   | Path                                                         | Returns                                       |
| -------- | ------------------------------------------------------------ | --------------------------------------------- |
| GET      | `/api/v1/routing/config`                                     | Current `RoutingConfig` + resolved chains     |
| GET      | `/api/v1/routing/decisions?skill=X&mode=Y&backend=Z&limit=N` | Filtered `RoutingDecision[]`                  |
| POST     | `/api/v1/routing/trace`                                      | Dry-run resolution; returns `RoutingDecision` |
| WS topic | `routing:decision`                                           | Broadcasts each decision live                 |

### CLI surface

```
harness routing config                                # print current routing config
harness routing trace --skill <name> [--mode <m>] [--json]
harness routing decisions [--skill <name>] [--mode <m>] [--backend <name>] [--last <N>] [--json]
harness skill run <name> --backend <name>             # invocation override (D7)
harness dispatch ... --backend <name>                 # invocation override (D7)
```

### Dashboard panel

New route `/routing` in `packages/dashboard`. Four cards:

- **Resolved Chains** — table: useCase → resolved fallback chain → currently-chosen backend (with health status from existing backend signals)
- **Recent Decisions** — last N decisions, filterable by skill/mode/backend; each row expands to show the full `resolutionPath`
- **Per-Backend Volume** — dispatch count + success rate over the last 24h, per backend
- **Trace Tool** — embedded UI for dry-running a routing decision (form: skill name + mode → renders the resolution path)

Subscribes to `routing:decision` WS topic for live updates.

### Validation (`packages/core/src/validation/config.ts`)

Extended at startup:

- **Hard error:** Every name in `routing.skills.*` and `routing.modes.*` must exist in `agent.backends` (D10). Includes fallback chain entries.
- **Hard error:** Existing `routing.default` / `routing.<tier>` / `routing.intelligence.*` / `routing.isolation.*` chain entries must also exist in `agent.backends` (D4 widens these to chains).
- **Warning:** Skill names in `routing.skills.*` that aren't in the local skill catalog. Logged once at startup.
- **Warning:** Cognitive modes in `routing.modes.*` that aren't in `STANDARD_COGNITIVE_MODES` (allowed via the `(string & {})` escape hatch in `CognitiveMode`, but worth flagging in case of typo).

### Integration with LMLM (Spec A)

Spec B has no LMLM-specific code. The integration is purely compositional:

- LMLM auto-populates `agent.backends.<name>.model` for `type: local | pi` backends (Spec A D5)
- Spec B routing references those same backend names
- The fallback chain mechanism (D4) helps the LMLM-pool case: an operator can write `routing.skills.harness-soundness-review: [local-reasoning, claude-opus]` knowing that if LMLM hasn't yet pulled `deepseek-r1:32b`, dispatch falls back to Claude. Once LMLM installs the local model, future dispatches start staying local.

## Integration Points

### Entry Points

New entry points created by this spec:

- **New CLI command group**: `harness routing {config,trace,decisions}` — registered in `packages/cli/src/commands/`
- **New CLI flag**: `--backend <name>` on `harness skill run` and `harness dispatch` (invocation override, D7)
- **New HTTP routes**: `/api/v1/routing/{config,decisions,trace}` — registered in `packages/orchestrator/src/server/routes/`
- **New WebSocket topic**: `routing:decision` — registered in the orchestrator's WS broadcast layer
- **New dashboard route**: `/routing` in `packages/dashboard/src/routes/`
- **New module**: `packages/orchestrator/src/routing/` housing `RoutingDecisionBus`, decision-event types, trace helpers

Touched entry points:

- **`packages/types/src/orchestrator.ts`** — `RoutingUseCase` gains two variants; `RoutingConfig` gains two optional maps; `RoutingValue` type added; scalar fields widen to `RoutingValue` (D4)
- **`packages/orchestrator/src/agent/backend-router.ts`** — `resolve()` rewritten to walk the resolution chain, emit `RoutingDecision` events, return resolved decisions (not bare names)
- **`packages/orchestrator/src/agent/runner.ts`** — skill dispatches construct `{ kind: 'skill', skillName, cognitiveMode }` from skill catalog metadata
- **`packages/core/src/validation/config.ts`** — validates new `routing.skills` / `routing.modes` references against `agent.backends`; validates chain entries; warns on unknown skill / mode names
- **`packages/orchestrator/src/orchestrator.ts`** — instantiates `RoutingDecisionBus` at startup, wires it into `BackendRouter`, registers WS broadcast subscription
- **`harness.config.json` schema** — extends `agent.routing` with the new fields

### Registrations Required

- **Barrel export regeneration**: `pnpm generate:barrels` to publish `RoutingValue`, `RoutingDecision`, `ResolutionStep`, `ResolutionSource` from `@harness-engineering/types`
- **Plugin generator regeneration**: `pnpm generate:plugin:all` so the new `harness routing` commands and `--backend` flag appear in Claude/Cursor/Gemini/Codex plugin manifests
- **HTTP route registry**: register the three new routes in the orchestrator's route table
- **WS topic registry**: register `routing:decision` broadcast channel
- **Dashboard route table**: register `/routing` view
- **`harness.config.json` schema**: extend the Zod schema in `packages/orchestrator/src/workflow/schema.ts` and the JSON schema in `packages/types/src/config/` to include the new routing fields and the widened `RoutingValue` shape
- **Config-migration shim** (`packages/orchestrator/src/agent/config-migration.ts`): no change required — existing scalar values are already valid `RoutingValue` (D4 normalizes scalar to one-element array internally)

### Documentation Updates

- **`docs/knowledge/orchestrator/issue-routing.md`** — major update: add per-skill + per-cognitive-mode axes; document resolution order; add fallback-chain semantics; cross-link to LMLM (Spec A)
- **NEW `docs/knowledge/orchestrator/routing-resolution.md`** — domain knowledge for the resolution chain (resolution order, fallback semantics, decision telemetry, ring buffer behavior)
- **`docs/guides/multi-backend-routing.md`** — operator-facing guide gains a "Per-skill and per-mode routing" section with the example config from Technical Design + walkthrough of common patterns (route reviewers to local, route architects to cloud)
- **NEW `docs/guides/routing-trace.md`** — short operator guide on using `harness routing trace` + the dashboard panel to debug routing decisions
- **AGENTS.md** — update the orchestrator section to mention the new routing axes + dashboard panel
- **README.md** — single sentence + link in the orchestrator capabilities section
- **CHANGELOG.md** — feature entry for the next release; flag the `RoutingValue` schema widening (additive, scalar-compatible) as non-breaking

### Architectural Decisions

New ADRs to author (numbers sequential after current latest):

- **ADR-NNNN: Per-skill + per-cognitive-mode as the new routing axes** — rationale: skill is the natural unit of orchestrator work; cognitive mode is the coarser semantic layer that handles common cases; hybrid covers both without forcing a choice (D1)
- **ADR-NNNN+1: Resolution order — invocation → skill → mode → tier → default** — rationale: operator authority over skill author and over scope tier; invocation as the explicit-override escape hatch; tier remains as the documented fallback to preserve existing behavior (D2)
- **ADR-NNNN+2: Fallback chains as a shared routing primitive** — rationale: lets operators express resilience without duplicating routing config; widens existing schema for consistency rather than introducing a Spec-B-only mechanism; scalar form preserves backward compat byte-for-byte (D4)
- **ADR-NNNN+3: Routing telemetry via in-memory ring buffer (no persistence in v1)** — rationale: routing legibility is a Spec B goal; ring buffer keeps memory bounded; persistent decision history is a follow-up if it becomes needed (D8)
- **ADR-NNNN+4: Skill authors do not declare backend preferences** — rationale: keeps skills portable across deployments; total operator authority over routing; skill class needs (e.g., "needs a reasoning model") surfaced in skill documentation, not schema (D6)

### Knowledge Impact

Concepts entering the knowledge graph:

- **`business_concept`: Routing Use Case** — discriminated query identifying what work needs a backend (tier, intelligence layer, isolation, maintenance, chat, **skill**, **cognitive mode**)
- **`business_concept`: Routing Value** — backend name or ordered fallback chain
- **`business_concept`: Routing Decision** — record of the resolution walk for a single dispatch, including the path through resolution sources and the chosen backend
- **`business_process`: Routing Resolution** — the ordered walk from useCase + invocation override through skill / mode / tier / default, returning the first available backend in the first matching chain
- **`business_rule`: Resolution Order** — invocation → skill → mode → tier → default; first match wins; chain entries within a source are tried in declared order
- **`business_rule`: Routing Backwards Compatibility** — scalar `RoutingValue` is byte-compatible with pre-Spec-B configs; absence of `routing.skills` / `routing.modes` produces today's behavior unchanged

Relationships:

- `RoutingDecision` _records_ `RoutingResolution` (new edge)
- `BackendRouter` _emits to_ `RoutingDecisionBus` (new edge)
- `LocalModelPool` (Spec A) _influences_ `RoutingResolution` via backend availability (cross-spec edge)
- `Skill` _participates in_ `RoutingResolution` via name + cognitive mode (new edge)

## Success Criteria

### Functional

- **F1** — A config with `routing.skills.harness-debugging: 'local-fast'` dispatches `harness-debugging` to the `local-fast` backend regardless of scope tier; verified by integration test that asserts the resolved backend name.
- **F2** — A config with `routing.modes.adversarial-reviewer: 'local-fast'` dispatches every skill whose `cognitive_mode = 'adversarial-reviewer'` to `local-fast` — provided no per-skill override exists for that skill.
- **F3** — When both `routing.skills.harness-debugging` and `routing.modes.diagnostic-investigator` are configured for a skill that matches both, the per-skill entry wins (D2).
- **F4** — `harness skill run harness-soundness-review --backend claude-sonnet` dispatches to `claude-sonnet` regardless of any `routing.skills` / `routing.modes` / `routing.<tier>` config.
- **F5** — A scalar routing value (e.g., `routing.default: 'claude-opus'`) behaves identically to its array form (`['claude-opus']`); verified by parametrized test over both shapes.
- **F6** — A fallback chain `['local-fast', 'claude-sonnet']` tries `local-fast` first; if `local-fast` is not in `agent.backends` (or is unknown), tries `claude-sonnet`; resolution path records both candidates.
- **F7** — `harness routing trace --skill harness-debugging` prints the resolved backend name plus the full `resolutionPath` without dispatching anything.
- **F8** — `harness routing decisions --skill harness-debugging --last 10` returns the 10 most recent `RoutingDecision` records for that skill in JSON, suitable for `jq` piping.
- **F9** — Dashboard `/routing` panel renders the current config as resolved chains, the last 50 decisions, per-backend volume for the last 24h, and an inline trace form.
- **F10** — WS subscribers on `routing:decision` topic receive a `RoutingDecision` payload within 100ms of any orchestrator dispatch.
- **F11** — A skill without a declared `cognitive_mode` and without a per-skill routing entry falls through to the existing per-tier resolution and ultimately to `routing.default` — identical to today's behavior.

### Safety / Invariants

- **S1** — Pre-Spec-B configs (no `routing.skills` / `routing.modes`, all scalar values) produce byte-identical dispatch routing to today's behavior; verified by integration test using a frozen pre-Spec-B config.
- **S2** — Startup validation rejects (hard error) any `routing.skills.<name>` / `routing.modes.<mode>` / chain entry that references a backend not present in `agent.backends`; error names the offending route and the missing backend.
- **S3** — Startup validation warns (does not block) when `routing.skills.<name>` references a skill name not present in the local skill catalog.
- **S4** — `BackendRouter.resolve()` is total: every `RoutingUseCase` ultimately resolves to at least `routing.default` (which is required); throws only if `routing.default` itself resolves to an unknown backend, which is also caught at startup validation.
- **S5** — `RoutingDecisionBus` ring buffer respects its capacity bound; verified by unit test that emits 10,000 decisions and asserts `recent({ limit: 99999 })` returns at most `capacity` records.
- **S6** — Decision telemetry never blocks dispatch: emission is synchronous-but-non-throwing; subscriber errors are isolated (caught, logged, do not propagate).
- **S7** — Resolution-path records every chain entry considered, with outcome `chosen` / `unknown-backend` / `considered`; verified by unit test against multi-entry chains with mixed backend existence.

### Observability

- **O1** — Every dispatch logs a single structured `routing-decision` event including `useCase`, `chosen.backendName`, `resolutionPath.length`, and `durationMs`; visible in orchestrator logs.
- **O2** — Dashboard panel renders without error when the ring buffer is empty (no decisions yet), when a backend has zero dispatches in 24h (zero rate-of-success), and when WS is disconnected (falls back to HTTP polling).
- **O3** — `harness routing trace` exits non-zero if the dry-run resolution would throw (e.g., `routing.default` references unknown backend); zero otherwise. Output includes the full `RoutingDecision` JSON on `--json`.
- **O4** — Per-backend volume metric in the dashboard is accurate within ±1 dispatch over the last 24h window; verified by integration test that dispatches N times and asserts the count.

### Non-regression

- **N1** — All existing `BackendRouter` tests pass unchanged after `resolve()` rewrite (the existing tests use `kind: 'tier' | 'intelligence' | 'isolation' | 'maintenance' | 'chat'` use cases; their expected backend names continue to resolve correctly).
- **N2** — All existing tier-based dispatches (issue triage, escalation) continue to construct `{ kind: 'tier', tier }` and route as today.
- **N3** — Existing intelligence-pipeline dispatches (`{ kind: 'intelligence', layer: 'sel' | 'pesl' }`) route to the same backend as today when `routing.intelligence` is unchanged.
- **N4** — `harness validate` passes on a config with no `routing.skills` / `routing.modes` blocks.
- **N5** — `harness validate` passes on a config that uses array form for previously-scalar routing fields (e.g., `routing.default: ['claude-opus', 'claude-sonnet']`), demonstrating the schema widening is accepted.
- **N6** — The deprecated `/api/v1/local-model/status` alias (from Spec 1) remains unaffected; Spec B does not touch local-model resolver code paths.

### Quality / Operator Experience

- **Q1** — Trace CLI dry-run latency is under 100ms for a config with up to 200 routing entries and 20 backends; verified by perf benchmark.
- **Q2** — Dashboard `/routing` panel initial render under 500ms with a fully-populated ring buffer (500 decisions); verified by component perf test.
- **Q3** — Error messages from startup validation include the routing path (e.g., `routing.skills.harness-debugging -> 'lcoal-fast'`) and the list of known backend names — actionable, not just "validation failed."
- **Q4** — A misconfigured fallback chain (`['typo-backend', 'claude-opus']`) succeeds at runtime (falls through to `claude-opus`) but the `routing-decision` event records `typo-backend` with `outcome: 'unknown-backend'`, so the operator can find the typo from the dashboard or `harness routing decisions`.

## Implementation Order

High-level phases. Detailed task breakdown belongs to the planning skill (harness-planning), not this spec.

### Phase 0 — Type changes + scaffolding (≈ 1 day)

Goal: extended `RoutingUseCase`, `RoutingConfig`, `RoutingValue`, `RoutingDecision`, `ResolutionStep`, `ResolutionSource` types ship in `@harness-engineering/types`. No behavior change.

- Add new `RoutingUseCase` variants and the `RoutingValue` union in `packages/types/src/orchestrator.ts`
- Add `RoutingDecision` + `ResolutionStep` + `ResolutionSource` types
- Widen existing `RoutingConfig` scalar fields to `RoutingValue` (scalar still valid)
- Update barrel exports; regenerate via `pnpm generate:barrels`
- Smoke test that all consumers still compile

Checkpoint: `pnpm typecheck && pnpm build` green; existing tests untouched and passing (N1, N2, N3).

### Phase 1 — `BackendRouter.resolve()` rewrite (≈ 3 days)

Goal: resolution walks the ordered chain and returns a `RoutingDecision`. Existing call sites continue to receive a backend name via a thin shim.

- Rewrite `resolve(useCase, opts?)` per Technical Design pseudocode
- Add `toArray(value: RoutingValue): readonly string[]` normalizer
- Add `resolveExistingUseCase()` helper preserving today's tier/intelligence/isolation/maintenance/chat semantics
- `resolveDefinition(useCase, opts?)` returns the backend definition (existing API surface, internally calls `resolve()`)
- Unit tests for: scalar value, chain value, missing chain entry skip, per-skill wins over per-mode, invocation override beats everything, resolution-path fidelity (S7)

Checkpoint: F3 + F5 + F6 + S4 + S7 pass. N1 confirmed via the existing test suite.

### Phase 2 — Config-validator updates (≈ 1 day)

Goal: startup catches misconfigured routing references.

- Extend `config-validator.ts` (or equivalent) to validate `routing.skills.*` and `routing.modes.*` chain entries against `agent.backends`
- Validate widened scalar fields' chain entries against `agent.backends`
- Warn on unknown skill names (read skill catalog) and on non-standard cognitive modes
- Error messages include offending path + known backend list (Q3)

Checkpoint: S2 + S3 + Q3 + N4 + N5 pass.

### Phase 3 — Dispatch-site wiring (≈ 2 days)

Goal: skill dispatches construct `{ kind: 'skill', skillName, cognitiveMode }` and thread `--backend` overrides.

- In `packages/orchestrator/src/agent/runner.ts`, read skill name + cognitive_mode at dispatch start (from skill catalog / skill.yaml), construct `kind: 'skill'` use case
- In `packages/cli/src/commands/skill/run.ts` (or equivalent), accept `--backend <name>` and forward as `invocationOverride`
- In `packages/cli/src/commands/dispatch.ts` (or equivalent), accept `--backend <name>`
- Update CLI command help text + regenerate plugin manifests

Checkpoint: F1 + F2 + F4 + F11 pass.

### Phase 4 — `RoutingDecisionBus` + event emission (≈ 2 days)

Goal: every `resolve()` produces a `RoutingDecision` event surfaced on a new bus topic with a per-orchestrator ring buffer.

- Create `packages/orchestrator/src/routing/decision-bus.ts` with `emit`, `recent`, `subscribe`, capacity bound
- Wire `BackendRouter` constructor to accept the bus and emit after each `resolve()`
- Structured `routing-decision` log line on emit (O1)
- Subscriber errors caught and isolated (S6)
- Unit tests for ring buffer capacity (S5), emission non-blocking, subscriber isolation

Checkpoint: O1 + S5 + S6 pass.

### Phase 5 — HTTP routes + WS topic (≈ 2 days)

Goal: routing decisions accessible via HTTP + live WS broadcast.

- `GET /api/v1/routing/config` returns current config with resolved chains
- `GET /api/v1/routing/decisions` reads from ring buffer with filter params
- `POST /api/v1/routing/trace` runs `resolve()` on the orchestrator's `BackendRouter` without dispatching, returns the `RoutingDecision`
- Register `routing:decision` WS topic; orchestrator broadcasts on bus emit
- Integration test for each route

Checkpoint: F10 passes; routes return correct shapes; WS subscribers receive payloads.

### Phase 6 — CLI tools (`trace` + `decisions` + `config`) (≈ 2 days)

Goal: operators have shell-accessible inspection of routing.

- `harness routing config` — print active config + resolved chains
- `harness routing trace --skill <name> [--mode <m>] [--json]` — dry-run, calls `POST /api/v1/routing/trace`; non-zero exit on resolution failure (O3)
- `harness routing decisions [--skill <name>] [--mode <m>] [--backend <name>] [--last <N>] [--json]`
- `harness skill run` + `harness dispatch` accept `--backend` (Phase 3 already wired the runner path; this phase wires the CLI ergonomics + help text)
- Regenerate plugin manifests for Claude/Cursor/Gemini/Codex

Checkpoint: F4 + F7 + F8 + O3 pass.

### Phase 7 — Dashboard panel (≈ 4 days)

Goal: web operators get parity with CLI operators on routing visibility.

- New route `/routing` in `packages/dashboard`
- Four cards: Resolved Chains, Recent Decisions (filterable + expandable rows), Per-Backend Volume (24h), Trace Tool
- WS subscription to `routing:decision` for live updates
- HTTP polling fallback when WS disconnected (O2)
- Component tests for empty ring buffer, zero-dispatch backend, WS disconnected fixtures (O2)
- Perf test for initial render with 500-decision buffer (Q2)

Checkpoint: F9 + O2 + O4 + Q2 pass.

### Phase 8 — Docs + ADRs + plugin regeneration (≈ 1 day)

Goal: knowledge graph and operator guides reflect the new capability.

- 5 ADRs (per Integration Points Architectural Decisions)
- Major update to `docs/knowledge/orchestrator/issue-routing.md`
- New `docs/knowledge/orchestrator/routing-resolution.md`
- New section in `docs/guides/multi-backend-routing.md` (per-skill / per-mode)
- New `docs/guides/routing-trace.md`
- AGENTS.md + README.md + CHANGELOG entries (note: `RoutingValue` widening is additive, non-breaking)
- `pnpm generate:barrels && pnpm generate:plugin:all`
- Roadmap entry via `manage_roadmap add`

Checkpoint: `harness validate` + `harness check-docs` pass; `pnpm generate:barrels:check && pnpm generate:plugin:check` clean.

---

**Total estimate:** ~18 working days (~3.5 weeks at one engineer). No single phase is large enough to be the dominant risk. Phase 1 (resolver rewrite) is the most subtle and benefits from heavy unit-test coverage written first.

Phases 0-3 are serial. Phase 4 (decision bus) can begin in parallel with Phase 2 once Phase 1's `RoutingDecision` shape is locked. Phases 5 + 6 + 7 are mostly independent once Phase 4 ships and can run in parallel. Phase 8 is end-of-pipeline.
