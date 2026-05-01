# Multi-Backend Routing for the Orchestrator

**Keywords:** orchestrator, backends, routing, agent-config, intelligence-pipeline, local-model, claude-cli, deprecation, migration, schema-redesign

## Overview

Spec 1 (`local-model-fallback`) added array fallback for the local model and a `LocalModelResolver` consolidating the duplicated local-config reads. This spec builds on that resolver to redesign the orchestrator's backend selection: backends become first-class, named entries, and any LLM-using path can be routed to any backend. Local backends (`local`, `pi`) become full citizens — selectable as the default for all paths, not just for "secondary tier" escalation.

The end state: an operator can run heavy work on Claude CLI (subscription, no API tokens) while routing simple-tier dispatches and the entire intelligence pipeline to a local Pi/LM Studio instance — or invert it, run everything local, mix three backends, whatever. All from one config schema with explicit, validated routing.

### Goals

1. Introduce `agent.backends` as a named map of backend definitions. Each entry is a discriminated union keyed by `type`. `local` and `pi` are valid types alongside `claude`, `anthropic`, `openai`, `gemini`, `mock`.
2. Introduce `agent.routing` as a map of use case → backend name. Routable use cases: `default`, four `ScopeTier`s (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). `default` is required; unknown keys are validation errors.
3. Auto-migrate legacy configs. When `agent.backend` / `agent.localBackend` are present and `agent.backends` is absent, synthesize fixed-name entries `primary` and `local` and a `routing` map that mirrors the existing `EscalationConfig` semantics. Log a one-time deprecation warning at orchestrator start.
4. Reuse `LocalModelResolver` from Spec 1. Each backend definition with `type: 'local' | 'pi'` gets its own resolver instance keyed by endpoint. Multiple local backends are supported.
5. Preserve `ClaudeBackend` semantics. `type: 'claude'` continues to spawn the `claude` CLI subprocess for subscription-based execution. No tokens consumed for Claude CLI use.
6. Backwards compatibility for at least one release. Existing configs (including `escalation` rules) continue to work with no changes; legacy fields are read-only inputs to the migration shim.

### Non-goals

- Hard deprecation / removal of `agent.backend` / `agent.localBackend` in this spec. They're warned, not removed.
- Routing for the dashboard chat panel, maintenance scheduler, or other non-LLM-consuming paths. Those follow `routing.default`.
- A `cml` intelligence layer routing key (currently unused; YAGNI).
- New backend types beyond what already exists in `packages/orchestrator/src/agent/backends/`.
- Schema-rewriting on disk. The migration shim is in-memory only; the user's YAML stays unchanged until they migrate manually.
- Per-task dynamic routing (e.g., "route based on issue label"). Routing is static, defined in config.

### Assumptions

- **Spec 1 lands first.** This spec depends on the `LocalModelResolver` introduced in Spec 1 (`local-model-fallback`).
- **Runtime:** Node.js ≥ 22.x.
- **`EscalationConfig` semantics persist.** `alwaysHuman` still bypasses agent dispatch entirely; `autoExecute` still gates which tiers can dispatch automatically. `routing` only affects _which backend_ dispatches; it does not change _whether_ a tier dispatches.
- **Single deprecation cycle.** Legacy fields warn for one minor release, error in the next. Removal is a follow-up spec.
- **Same work session as Spec 1.** Both specs ship together; the `/api/v1/local-model/status` HTTP endpoint introduced in Spec 1 is _replaced_ (not deprecated) here. If release ordering shifts and Spec 1 ships standalone, the singular endpoint stays as a deprecated alias for one release.

### Success in plain terms

After Spec 2 lands, the operator can write:

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

…and observe that heavy guided-change work runs on Claude CLI (subscription), simple-tier diagnostics run on Pi (local tokens), and the entire intelligence pipeline runs on Pi. Existing configs with `agent.backend: claude` and `agent.localBackend: pi` continue to work unchanged, with a deprecation warning in the orchestrator's startup logs pointing at the migration guide.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Routable use cases:** `default`, four ScopeTiers, and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Maintenance and dashboard chat inherit `default`.                                                                                                       | Maps to the actual LLM-consuming paths. Skipped categories already have separate config or no current consumer (YAGNI).                                                  |
| D2  | **Schema:** `agent.backends` (named map of backend definitions) + `agent.routing` (map of use case → backend name).                                                                                                                                                                | Decouples backend definitions from routing decisions. Avoids the two-slot cap of legacy `backend`/`localBackend`. Aligns with industry adapter patterns.                 |
| D3  | **Auto-migrate legacy `agent.backend` / `agent.localBackend` at config load.** Synthesize `backends.primary` and (when `localBackend` set) `backends.local`. Translate `escalation.autoExecute` into `routing.<tier>: local` entries. Log a one-time `warn` at orchestrator start. | Existing configs work unchanged on first release. Operators discover the new schema through orchestrator logs (where deprecations belong) rather than dashboard noise.   |
| D4  | **When both legacy fields and `agent.backends` are set, `agent.backends` wins.** Legacy fields are ignored; warn naming each ignored field.                                                                                                                                        | Avoids hard errors during mid-migration. Behavior is predictable and inspectable.                                                                                        |
| D5  | **Each `backends.<name>` entry is a discriminated union keyed by `type`.** Valid types: `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`. Type-specific fields validated at config load via Zod.                                                                   | Per-type validation surfaces config errors at load time, not at orchestrator runtime. TypeScript discriminated unions express the shape natively.                        |
| D6  | **Routing key syntax:** tier keys are flat strings; intelligence layers nest under `routing.intelligence`.                                                                                                                                                                         | Avoids YAML quoting awkwardness for dotted keys. Mirrors the existing `intelligence.models.sel` nested shape (orchestrator.ts:449, 467).                                 |
| D7  | **`routing.default` is required; unknown routing keys are validation errors.**                                                                                                                                                                                                     | Typos in routing keys cause hours of "why is this routing wrong" debugging. The set of valid keys is small and known. Strict validation catches mistakes at config load. |
| D8  | **Synthesized backend names are fixed: `primary` and `local`.** Same names every time, regardless of underlying types.                                                                                                                                                             | Predictable; docs and examples can reference `primary`/`local` without caveats. Stable across legacy-config edits.                                                       |
| D9  | **Each `type: 'local' \| 'pi'` backend definition gets its own `LocalModelResolver` instance from Spec 1, keyed by endpoint.** Multiple local backends with different endpoints/model lists are supported.                                                                         | Natural extension of Spec 1's resolver. Lets operators run multiple local servers. The dashboard surface is widened from a single banner to a list.                      |
| D10 | **`ClaudeBackend` (type: claude) untouched.** No change to `claude.ts`; subscription-based execution via `claude` CLI subprocess preserved.                                                                                                                                        | Operator's hard requirement: preserve token-free Claude CLI for primary work.                                                                                            |
| D11 | **`EscalationConfig` semantics unchanged.** `alwaysHuman` still bypasses agent dispatch; `autoExecute` still gates whether a tier dispatches. `routing` only selects _which backend_ dispatches when a tier is permitted.                                                          | Two orthogonal concerns: "should this tier dispatch?" (escalation) vs. "where does this tier dispatch?" (routing). Conflating them was the legacy design's mistake.      |
| D12 | **Migration shim is in-memory only; the user's YAML is never rewritten.**                                                                                                                                                                                                          | Operators control their config files. The orchestrator transparently materializes the new shape internally; the user migrates the YAML on their own schedule.            |
| D13 | **Deprecation lifecycle: warn for one minor release, error in the next, remove in the one after.** Hard removal is a follow-up spec, not part of this one.                                                                                                                         | Operators get explicit signal + a release window to migrate. Hard deprecation in a single release is hostile to running deployments.                                     |

## Technical Design

### Type changes

**File:** `packages/types/src/orchestrator.ts`

```typescript
// -------- Backend definitions --------

export type BackendDef =
  | MockBackendDef
  | ClaudeBackendDef
  | AnthropicBackendDef
  | OpenAIBackendDef
  | GeminiBackendDef
  | LocalBackendDef
  | PiBackendDef;

export interface MockBackendDef {
  type: 'mock';
}
export interface ClaudeBackendDef {
  type: 'claude';
  command?: string;
}
export interface AnthropicBackendDef {
  type: 'anthropic';
  model: string;
  apiKey?: string;
}
export interface OpenAIBackendDef {
  type: 'openai';
  model: string;
  apiKey?: string;
}
export interface GeminiBackendDef {
  type: 'gemini';
  model: string;
  apiKey?: string;
}
export interface LocalBackendDef {
  type: 'local';
  endpoint: string;
  model: string | string[]; // array fallback from Spec 1
  apiKey?: string;
  timeoutMs?: number;
  probeIntervalMs?: number;
}
export interface PiBackendDef {
  type: 'pi';
  endpoint: string;
  model: string | string[]; // array fallback from Spec 1
  apiKey?: string;
  probeIntervalMs?: number;
}

// -------- Routing --------

export interface RoutingConfig {
  /** Required. Backend name (key in `agent.backends`) used when no specific rule matches. */
  default: string;
  'quick-fix'?: string;
  'guided-change'?: string;
  'full-exploration'?: string;
  diagnostic?: string;
  intelligence?: {
    sel?: string;
    pesl?: string;
  };
}

// -------- Updated AgentConfig --------

export interface AgentConfig {
  // ...existing fields preserved...

  /** Named backend definitions (new schema). */
  backends?: Record<string, BackendDef>; // NEW
  /** Routing rules mapping use cases to backend names. */
  routing?: RoutingConfig; // NEW

  // Legacy fields — kept for at least one minor release.
  // When `backends` is set, these are ignored (with warning).
  backend: string;
  command?: string;
  model?: string;
  apiKey?: string;
  localBackend?: 'openai-compatible' | 'pi';
  localEndpoint?: string;
  localModel?: string | string[]; // from Spec 1
  localApiKey?: string;
  localTimeoutMs?: number;
  localProbeIntervalMs?: number; // from Spec 1
  // ...other existing fields unchanged...
}

// -------- Status surface --------

/** Snapshot of a single named local backend's availability. */
export interface NamedLocalModelStatus extends LocalModelStatus {
  backendName: string;
  endpoint: string;
}
```

### Config schema and validation

Zod schema (location: existing config-validation module, e.g. `packages/cli/src/config/schema.ts` — verify path at write time):

```typescript
const BackendDefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mock') }),
  z.object({ type: z.literal('claude'), command: z.string().optional() }),
  z.object({ type: z.literal('anthropic'), model: z.string(), apiKey: z.string().optional() }),
  z.object({ type: z.literal('openai'), model: z.string(), apiKey: z.string().optional() }),
  z.object({ type: z.literal('gemini'), model: z.string(), apiKey: z.string().optional() }),
  z.object({
    type: z.literal('local'),
    endpoint: z.string().url(),
    model: z.union([z.string().min(1), z.array(z.string().min(1)).nonempty()]),
    apiKey: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    probeIntervalMs: z.number().int().min(1000).optional(),
  }),
  z.object({
    type: z.literal('pi'),
    endpoint: z.string().url(),
    model: z.union([z.string().min(1), z.array(z.string().min(1)).nonempty()]),
    apiKey: z.string().optional(),
    probeIntervalMs: z.number().int().min(1000).optional(),
  }),
]);

const RoutingConfigSchema = z
  .object({
    default: z.string().min(1),
    'quick-fix': z.string().optional(),
    'guided-change': z.string().optional(),
    'full-exploration': z.string().optional(),
    diagnostic: z.string().optional(),
    intelligence: z
      .object({
        sel: z.string().optional(),
        pesl: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict(); // .strict() rejects unknown keys (D7)

const AgentConfigSchema = BaseAgentConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.backends && cfg.routing) {
    const names = new Set(Object.keys(cfg.backends));
    const checkRef = (path: string, name: string | undefined) => {
      if (name !== undefined && !names.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: path.split('.'),
          message: `routing.${path} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
        });
      }
    };
    checkRef('default', cfg.routing.default);
    checkRef('quick-fix', cfg.routing['quick-fix']);
    checkRef('guided-change', cfg.routing['guided-change']);
    checkRef('full-exploration', cfg.routing['full-exploration']);
    checkRef('diagnostic', cfg.routing.diagnostic);
    checkRef('intelligence.sel', cfg.routing.intelligence?.sel);
    checkRef('intelligence.pesl', cfg.routing.intelligence?.pesl);
  }
});
```

### Migration shim

**File:** `packages/orchestrator/src/agent/config-migration.ts` (NEW)

```typescript
export interface MigrationResult {
  config: AgentConfig; // effective config with backends + routing populated
  warnings: string[]; // logged at orchestrator start
}

export function migrateAgentConfig(input: AgentConfig): MigrationResult {
  // - If `backends` set: legacy fields ignored. Warn naming each ignored field.
  // - Else if any legacy field set: synthesize backends.primary (always) and
  //   backends.local (when localBackend set). Translate escalation.autoExecute
  //   to routing.<tier>: local.
  // - Else: leave alone (validation will catch missing backends).
}
```

Migration mapping table:

| Legacy field                                     | Synthesized into                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `agent.backend: claude` (+ `agent.command`)      | `backends.primary = { type: 'claude', command: agent.command }`                           |
| `agent.backend: anthropic` (+ `model`, `apiKey`) | `backends.primary = { type: 'anthropic', model, apiKey }`                                 |
| `agent.backend: openai` (similar)                | `backends.primary = { type: 'openai', model, apiKey }`                                    |
| `agent.backend: gemini` (similar)                | `backends.primary = { type: 'gemini', model, apiKey }`                                    |
| `agent.backend: mock`                            | `backends.primary = { type: 'mock' }`                                                     |
| `agent.localBackend: openai-compatible`          | `backends.local = { type: 'local', endpoint, model, apiKey, timeoutMs, probeIntervalMs }` |
| `agent.localBackend: pi`                         | `backends.local = { type: 'pi', endpoint, model, apiKey, probeIntervalMs }`               |
| `agent.escalation.autoExecute: [<tier>, ...]`    | `routing[<tier>] = 'local'` for each listed tier                                          |
| (always)                                         | `routing.default = 'primary'`                                                             |

### Per-backend `LocalModelResolver` instantiation

Spec 1's resolver becomes a per-backend object held in a map:

```typescript
private localResolvers = new Map<string, LocalModelResolver>();   // keyed by backend name

private createLocalResolvers(): void {
  for (const [name, def] of Object.entries(this.config.agent.backends ?? {})) {
    if (def.type === 'local' || def.type === 'pi') {
      this.localResolvers.set(name, new LocalModelResolver({
        endpoint: def.endpoint,
        apiKey: def.apiKey,
        configured: typeof def.model === 'string' ? [def.model] : def.model,
        probeIntervalMs: def.probeIntervalMs,
        logger: this.logger.child({ backend: name }),
      }));
    }
  }
}

async start() {
  for (const [name, resolver] of this.localResolvers) {
    await resolver.start();
    resolver.onStatusChange((status) => {
      this.server?.broadcastLocalModelStatus({
        ...status,
        backendName: name,
        endpoint: this.lookupEndpoint(name),
      });
    });
  }
}

async stop() {
  for (const resolver of this.localResolvers.values()) resolver.stop();
}
```

### Routing resolution

**File:** `packages/orchestrator/src/agent/router.ts` (NEW)

```typescript
export type RoutingUseCase =
  | { kind: 'tier'; tier: ScopeTier }
  | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
  | { kind: 'maintenance' }
  | { kind: 'chat' };

export class BackendRouter {
  constructor(
    private routing: RoutingConfig,
    private backends: Record<string, BackendDef>
  ) {}

  resolve(useCase: RoutingUseCase): string {
    switch (useCase.kind) {
      case 'tier':
        return this.routing[useCase.tier] ?? this.routing.default;
      case 'intelligence':
        return this.routing.intelligence?.[useCase.layer] ?? this.routing.default;
      case 'maintenance':
      case 'chat':
        return this.routing.default;
    }
  }

  resolveDefinition(useCase: RoutingUseCase): BackendDef {
    const name = this.resolve(useCase);
    const def = this.backends[name];
    if (!def) throw new Error(`Routing target '${name}' is not in backends`);
    return def;
  }
}
```

### Backend instantiation per use case

```typescript
private backendFactory: BackendFactory;

private createBackendFactory(): BackendFactory {
  const router = new BackendRouter(this.config.agent.routing!, this.config.agent.backends!);
  return {
    forUseCase: (useCase: RoutingUseCase): AgentBackend => {
      const def = router.resolveDefinition(useCase);
      return this.instantiateBackend(def, router.resolve(useCase));
    },
  };
}

private instantiateBackend(def: BackendDef, name: string): AgentBackend {
  let backend: AgentBackend;
  switch (def.type) {
    case 'mock':      backend = new MockBackend(); break;
    case 'claude':    backend = new ClaudeBackend(def.command); break;
    case 'anthropic': backend = new AnthropicBackend({ model: def.model, ...(def.apiKey && { apiKey: def.apiKey }) }); break;
    case 'openai':    backend = new OpenAIBackend({ model: def.model, ...(def.apiKey && { apiKey: def.apiKey }) }); break;
    case 'gemini':    backend = new GeminiBackend({ model: def.model, ...(def.apiKey && { apiKey: def.apiKey }) }); break;
    case 'local': {
      const resolver = this.localResolvers.get(name)!;
      backend = new LocalBackend({
        endpoint: def.endpoint,
        apiKey: def.apiKey,
        timeoutMs: def.timeoutMs,
        getModel: () => resolver.resolveModel(),
      });
      break;
    }
    case 'pi': {
      const resolver = this.localResolvers.get(name)!;
      backend = new PiBackend({
        endpoint: def.endpoint,
        apiKey: def.apiKey,
        getModel: () => resolver.resolveModel(),
      });
      break;
    }
  }

  // Container wrapping moves here so any backend can be sandboxed.
  if (this.config.agent.sandboxPolicy === 'docker' && this.config.agent.container) {
    const runtime = new DockerRuntime();
    const secretBackend = this.config.agent.secrets ? createSecretBackend(this.config.agent.secrets) : null;
    const secretKeys = this.config.agent.secrets?.keys ?? [];
    backend = new ContainerBackend(backend, runtime, secretBackend, this.config.agent.container, secretKeys);
  }

  return backend;
}
```

### Dispatch path changes

The dispatch site at `packages/orchestrator/src/orchestrator.ts:1188` (`backend === 'local' && this.localRunner ? ...`) is replaced. The state machine determines the `RoutingUseCase` from the issue's scope tier; the factory returns the appropriate backend; the runner dispatches.

```typescript
// Old: const activeRunner = backend === 'local' && this.localRunner ? this.localRunner : this.runner;
// New:
const useCase: RoutingUseCase = { kind: 'tier', tier: issue.scopeTier };
const backend = this.backendFactory.forUseCase(useCase);
const runner = new AgentRunner(backend /* existing runner deps */);
this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt, runner);
```

The `this.runner` / `this.localRunner` two-runner split goes away.

### Intelligence pipeline wiring

```typescript
private createAnalysisProvider(): AnalysisProvider | null {
  const intel = this.config.intelligence;
  if (!intel?.enabled) return null;

  // 1. Explicit intelligence.provider override (preserves today's priority)
  if (intel.provider) return this.createProviderFromExplicitConfig(intel.provider, intel.models?.sel);

  // 2. Routed: use the backend named in routing.intelligence.sel (or default).
  const router = new BackendRouter(this.config.agent.routing!, this.config.agent.backends!);
  const def = router.resolveDefinition({ kind: 'intelligence', layer: 'sel' });

  // Translate BackendDef → AnalysisProvider:
  // local/pi → OpenAICompatibleAnalysisProvider with resolver-aware model
  // anthropic/openai/gemini → respective analysis providers
  // claude/mock → not supported as analysis providers; return null with warning
  return this.analysisProviderFromDef(def, intel);
}
```

`pesl` is handled the same way inside `IntelligencePipeline` if it ever needs a separate provider. Today `pesl` shares the `sel` provider's session and only overrides the model name (orchestrator.ts:449). We extend `IntelligencePipeline` only enough to accept a separate provider when `routing.intelligence.pesl !== routing.intelligence.sel`.

### Dashboard surface (multi-local extension)

**Server side**

- Replace Spec 1's `GET /api/v1/local-model/status` with `GET /api/v1/local-models/status` returning `NamedLocalModelStatus[]` (one entry per resolver).
- SSE topic `local-model:status` carries `NamedLocalModelStatus` instead of `LocalModelStatus`. Spec 1's payload is a strict subset, so the dashboard's banner code adapts by reading `status.backendName`.
- During the legacy-shim release, the synthesized resolver is named `local`, so the dashboard banner labeling stays familiar.

**Client side**

- `useLocalModelStatus()` (Spec 1) → `useLocalModelStatuses()` returning an array.
- Banner component on the Orchestrator page renders one banner per unhealthy backend, each labeled with `backendName` and `endpoint`.

### File layout summary

| Path                                                         | Change                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `packages/types/src/orchestrator.ts`                         | Add `BackendDef` union, `RoutingConfig`, `NamedLocalModelStatus`; widen `AgentConfig`           |
| `packages/cli/src/config/schema.ts` (or wherever)            | Zod schemas + `superRefine` cross-field validator                                               |
| `packages/orchestrator/src/agent/config-migration.ts`        | **NEW** — legacy-to-new migration shim                                                          |
| `packages/orchestrator/src/agent/router.ts`                  | **NEW** — `BackendRouter` class                                                                 |
| `packages/orchestrator/src/orchestrator.ts`                  | Replace `createBackend`/`createLocalBackend`/`createAnalysisProvider`; multi-resolver; dispatch |
| `packages/orchestrator/src/server/routes.ts` (or equivalent) | `/local-model/status` → `/local-models/status` (array); SSE payload widened                     |
| `packages/dashboard/src/client/hooks/useLocalModelStatus.ts` | Rename / widen to `useLocalModelStatuses()` returning array                                     |
| `packages/dashboard/src/client/pages/Orchestrator.tsx`       | Render N banners (one per unhealthy backend)                                                    |
| `packages/orchestrator/tests/agent/config-migration.test.ts` | **NEW** — exhaustive shim tests                                                                 |
| `packages/orchestrator/tests/agent/router.test.ts`           | **NEW** — routing resolution tests                                                              |
| `packages/orchestrator/tests/agent/multi-backend.test.ts`    | **NEW** — end-to-end with multiple backends                                                     |

### Validation rules summary

- `routing.default` required; must reference a key in `backends`.
- All other routing values must reference a key in `backends`.
- `routing` rejects unknown keys (Zod `.strict()`).
- Each `backends.<name>` entry validated per its `type`.
- `model` arrays must be non-empty.
- `probeIntervalMs` ≥ 1000.
- Legacy + new schema together: emit warning, new wins.

## Integration Points

### Entry Points

- **HTTP route changes:**
  - `GET /api/v1/local-models/status` (NEW; **replaces** Spec 1's `/api/v1/local-model/status`) — returns `NamedLocalModelStatus[]`.
  - The Spec 1 endpoint is removed in this spec since both specs ship together. If release ordering shifts, the singular endpoint stays as a deprecated alias for one release.
- **SSE topic:** `local-model:status` payload widens from `LocalModelStatus` to `NamedLocalModelStatus`. Adds the `backendName` and `endpoint` fields; existing fields unchanged.
- **React hook:** `useLocalModelStatuses()` (plural) replaces Spec 1's `useLocalModelStatus()`.
- **Module exports (orchestrator package, internal):** `BackendRouter`, `migrateAgentConfig`, plus `LocalModelResolver` (already exported per Spec 1).
- **Type exports:** `BackendDef`, `RoutingConfig`, `NamedLocalModelStatus` plus union member types (`ClaudeBackendDef`, `LocalBackendDef`, etc.) re-exported from `@harness-engineering/types`.

### Registrations Required

- **Type barrel:** `packages/types/src/index.ts` re-exports the new types. `pnpm run generate:barrels` regenerates.
- **Zod schema registration:** `BackendDefSchema` and `RoutingConfigSchema` registered alongside other agent-level validators in the existing config-validation surface.
- **Server routes:** `/api/v1/local-models/status` registered; old `/local-model/status` removed (or kept as deprecated alias if release ordering dictates).
- **SSE topic enrollment:** `local-model:status` topic stays registered (payload shape change only).
- **Dashboard proxy:** no change — `/api/v1/*` is already forwarded.
- **Dashboard route:** no new dashboard page; banner stays on the existing Orchestrator page.
- **Test fixtures:** any fixture constructing `WorkflowConfig` exercised both with legacy (regression) and new schema (forward path).

### Documentation Updates

- **NEW guide:** `docs/guides/multi-backend-routing.md` — primary reference for the new schema. Sections: overview, `backends` map, `routing` rules, multi-local examples, migration from legacy schema. Linked from the deprecation warning.
- `docs/guides/hybrid-orchestrator-quickstart.md` — Update with old/new side-by-side; add a "Routing" section.
- `docs/guides/intelligence-pipeline.md` — Update provider resolution table for routing-driven resolution.
- `docs/changes/hybrid-orchestrator/proposal.md` — Addendum noting the post-Phase 1 multi-backend redesign.
- `docs/changes/local-model-fallback/proposal.md` (Spec 1) — Cross-reference Spec 2 in "Non-goals."
- `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md` — Commented new-schema example alongside the active legacy schema.
- `AGENTS.md` — Update orchestrator package description to mention `agent.backends` / `agent.routing` as the modern config surface.
- **CHANGELOG entry** naming the new schema and the deprecation timeline.

### Architectural Decisions

Three ADRs warranted (large tier — config schema redesign):

- **ADR — Backend definitions become a named map.** Records D2.
- **ADR — Routing is explicit and strict.** Records D7.
- **ADR — Legacy schema deprecated via in-memory shim, not on-disk rewrite.** Records D3 + D12 + D13.

Filenames assigned at write time as `docs/knowledge/decisions/<NNNN>-named-backends-map.md`, `<NNNN>-strict-routing-validation.md`, `<NNNN>-legacy-config-shim-deprecation.md`.

### Knowledge Impact

- **NEW concept:** `Backend Definitions` — domain `orchestrator`. Path: `docs/knowledge/orchestrator/backend-definitions.md`.
- **NEW process:** `Backend Routing` — domain `orchestrator`. Path: `docs/knowledge/orchestrator/backend-routing.md`.
- **NEW process:** `Legacy Config Migration` — domain `orchestrator`. Path: `docs/knowledge/orchestrator/legacy-config-migration.md`.
- **Updated:** `Agent Dispatch Lifecycle` — note routing resolution before backend instantiation.
- **Updated:** `Issue Routing` — separation between escalation (whether) and routing (where).
- **Updated:** `Local Model Resolution` (Spec 1's new doc) — note resolvers are per-backend-definition.
- **Relationships:** `Backend Definitions` → `is consumed by` → `Backend Routing` → `feeds` → `Agent Dispatch Lifecycle`. `Backend Definitions` → `references` → `Local Model Resolution`. `Legacy Config Migration` → `produces` → `Backend Definitions`, `Backend Routing`.

### Cross-spec dependencies

- **Spec 1 (`local-model-fallback`) must land before this spec.** `LocalModelResolver`, `LocalModelStatus`, and the `getModel: () => string | null` callbacks on `LocalBackend`/`PiBackend` are pre-requisites.
- During the same work session, Spec 1 ships, then Spec 2 ships. The Spec 1 HTTP endpoint is _replaced_ (not deprecated) since both ship together.

## Success Criteria

### Schema validation

- **SC1** — Given `backends.cloud = { type: 'claude', command: 'claude' }` and `backends.local = { type: 'pi', endpoint, model: ['a','b'] }`, schema validation passes.
- **SC2** — Given `backends.foo = { type: 'pi' }` (missing `endpoint`/`model`), validation fails with a Zod error naming the missing fields.
- **SC3** — Given `backends.foo = { type: 'unknown' }`, validation fails with a discriminator error listing valid types.
- **SC4** — Given `routing` without `default`, validation fails with a "default is required" error.
- **SC5** — Given `routing.default: 'nonexistent'` while `backends` lacks `nonexistent`, validation fails with a cross-field error naming the missing backend.
- **SC6** — Given `routing.quickfix: 'local'` (typo: missing hyphen), validation fails on the unknown key.
- **SC7** — Given `routing.intelligence.foo: 'local'`, validation fails on the unknown intelligence layer.
- **SC8** — Given `backends.local = { type: 'local', model: [] }`, validation fails on the empty array.

### Legacy migration shim

- **SC9** — Given a legacy config with `agent.backend: 'claude'` only, the shim produces `backends.primary = { type: 'claude' }` and `routing = { default: 'primary' }`.
- **SC10** — Given a legacy config with `backend: 'pi'`, `localBackend: 'pi'`, `localEndpoint`, `localModel: 'gemma-4-e4b'`, and `escalation.autoExecute: ['quick-fix','diagnostic']`, the shim produces `backends.primary` and `backends.local` (both `type: 'pi'`) and `routing = { default: 'primary', 'quick-fix': 'local', diagnostic: 'local' }`.
- **SC11** — Given `localModel: ['a','b','c']` (Spec 1 array form), the shim preserves the array on `backends.local.model`.
- **SC12** — Given any legacy config triggering the shim, the orchestrator logs exactly one `warn`-level message at start-up referencing each deprecated field present and pointing at `docs/guides/multi-backend-routing.md`.
- **SC13** — Given **both** `agent.backend: 'claude'` and `agent.backends.cloud: { type: 'claude' }`, the orchestrator uses `agent.backends`, ignores `agent.backend`, logs a `warn` naming each ignored legacy field.
- **SC14** — Given a config with `agent.backends` set, the migration shim is a no-op (returns input config unchanged).
- **SC15** — Given a config with no `backends` and no legacy `backend`, schema validation fails (must have at least one backend definition path).

### Routing resolution

- **SC16** — Given `routing: { default: 'cloud', 'quick-fix': 'local' }`, `BackendRouter.resolve({ kind: 'tier', tier: 'quick-fix' })` returns `'local'`.
- **SC17** — For unmapped `tier: 'guided-change'`, `resolve()` returns `'cloud'` (default).
- **SC18** — Given `routing.intelligence: { sel: 'local' }` and unmapped `pesl`, `resolve({ kind: 'intelligence', layer: 'pesl' })` returns the routing default.
- **SC19** — `resolve({ kind: 'maintenance' })` always returns `routing.default`.
- **SC20** — `resolve({ kind: 'chat' })` always returns `routing.default`.
- **SC21** — `BackendRouter.resolveDefinition()` returns the same `BackendDef` instance referenced in `agent.backends` (no copying).

### Backend instantiation

- **SC22** — When `backends.cli = { type: 'claude', command: 'claude' }` and a tier routes to `cli`, the dispatched backend is a `ClaudeBackend` constructed with `command='claude'`. No tokens consumed; spawned subprocess matches today's behavior.
- **SC23** — When `backends.local = { type: 'pi', endpoint, model: ['a','b'] }`, instantiation creates a `LocalModelResolver` keyed by the endpoint and passes a `getModel` callback to the `PiBackend`.
- **SC24** — Given two distinct local backends with different endpoints, two separate `LocalModelResolver` instances exist on the orchestrator, each probing its own endpoint independently.
- **SC25** — When `agent.sandboxPolicy === 'docker'` and `agent.container` is set, every instantiated backend (cloud or local) is wrapped in a `ContainerBackend`.
- **SC26** — When `agent.sandboxPolicy !== 'docker'`, no backend is wrapped.

### Dispatch path

- **SC27** — Given `routing.quick-fix: 'local'` / `routing.default: 'cloud'`, a `quick-fix` issue dispatches to local, a `guided-change` issue dispatches to cloud.
- **SC28** — Given `routing.full-exploration: 'cloud'` AND `escalation.alwaysHuman: ['full-exploration']`, the issue is _not_ dispatched (alwaysHuman wins).
- **SC29** — Given `routing.diagnostic: 'local'` AND `escalation.autoExecute: []`, the issue is _not_ dispatched (escalation gate persists).
- **SC30** — The dispatch site no longer references `this.localRunner` or the `backend === 'local'` switch; the two-runner split is removed.

### Intelligence pipeline integration

- **SC31** — Given `routing.intelligence.sel: 'local'`, the analysis provider is built from `backends.local` (an `OpenAICompatibleAnalysisProvider` with resolver-aware model).
- **SC32** — Given `routing.intelligence.sel: 'cloud'` where `cloud = { type: 'anthropic', model, apiKey }`, the analysis provider is `AnthropicAnalysisProvider`.
- **SC33** — Given `intelligence.provider` explicit config, it wins over routing (preserves today's behavior).
- **SC34** — Given `routing.intelligence.sel === routing.intelligence.pesl`, `IntelligencePipeline` receives a single provider and overrides only the model name for `pesl` (current behavior preserved).
- **SC35** — Given `routing.intelligence.sel !== routing.intelligence.pesl`, `IntelligencePipeline` accepts distinct providers for each layer.
- **SC36** — When the routed analysis backend is `claude` or `mock`, `createAnalysisProvider()` returns `null` and logs a warning.

### Local availability semantics

- **SC37** — Given a multi-local config and one of two endpoints reachable, the unreachable resolver reports `available: false` while the reachable one reports `available: true`. Routing rules targeting the unreachable backend disable those code paths; routing rules targeting the reachable backend continue to function.
- **SC38** — `GET /api/v1/local-models/status` returns one entry per `type: 'local'|'pi'` backend, each tagged with `backendName` and `endpoint`.
- **SC39** — SSE `local-model:status` carries `NamedLocalModelStatus` payload. Dashboard banner consumes it correctly.
- **SC40** — When multiple local backends are unhealthy, the dashboard renders one warning banner per unhealthy backend.

### Backwards compatibility

- **SC41** — Every existing test in `packages/orchestrator/tests/core/state-machine.test.ts` passes unchanged with the legacy schema.
- **SC42** — A canonical legacy config (the project's own `harness.orchestrator.md` at write time) loads, runs, and dispatches without errors. Smoke or integration test asserts dispatch reaches the synthesized `local` backend for `quick-fix` and `primary` for `guided-change`.
- **SC43** — `agent.escalation.alwaysHuman` and `agent.escalation.autoExecute` continue to govern whether dispatch happens. The new `routing` map governs only where dispatch goes when permitted.

### Mechanical gates

- **SC44** — `pnpm typecheck` passes with strict mode on all changed files.
- **SC45** — `pnpm lint` passes; no new ESLint suppressions introduced.
- **SC46** — `pnpm test` passes the full test suite, including new router, migration, and multi-backend tests.
- **SC47** — `harness validate` and `harness check-docs` pass after the spec is written and the implementation lands.

### Out-of-scope assertions

- Hard removal of `agent.backend` / `agent.localBackend`. They warn in this spec; removal is a follow-up.
- Per-task or per-issue dynamic routing (e.g., based on labels). Routing is static.
- Routing keys for `cml` intelligence layer (currently unused; YAGNI).
- Routing for the dashboard chat panel (separate config surface).
- Schema-rewriting on disk; the YAML stays unchanged.

## Implementation Order

### Phase 1: Foundation (types, schema, migration shim)

<!-- complexity: medium -->

- Add `BackendDef`, `RoutingConfig`, `NamedLocalModelStatus` to types; widen `AgentConfig`
- Implement Zod schemas + `superRefine` cross-field validator
- Implement `migrateAgentConfig()` translation table
- Unit tests covering SC1–SC15

**Exit:** SC1–SC15 green. Existing orchestrator tests still pass (legacy schema flows through unchanged).

### Phase 2: Router + backend factory

<!-- complexity: low -->

- Implement `BackendRouter` and `instantiateBackend()` factory
- Move `ContainerBackend` wrapping into `instantiateBackend()`
- Unit tests covering SC16–SC26

**Exit:** SC16–SC26 green.

### Phase 3: Orchestrator wiring (multi-resolver + dispatch)

<!-- complexity: high -->

- Replace single `LocalModelResolver` field with `Map<string, LocalModelResolver>`
- Wire `start()`/`stop()` lifecycle for all resolvers
- Replace `createBackend()`/`createLocalBackend()` with factory + router
- Remove the two-runner split at the dispatch site
- Integration tests covering SC27–SC30, SC37, SC41–SC43

**Exit:** SC27–SC30, SC37, SC41–SC43 green.

### Phase 4: Intelligence pipeline routing

<!-- complexity: medium -->

- Refactor `createAnalysisProvider()` to consult router for `intelligence.sel`
- Teach `IntelligencePipeline` to accept distinct providers for `sel` vs. `pesl`
- Handle `claude`/`mock` rejection (return null + warn)
- Integration tests covering SC31–SC36

**Exit:** SC31–SC36 green.

### Phase 5: Dashboard surface (multi-local)

<!-- complexity: medium -->

- Replace `/local-model/status` with `/local-models/status` (array)
- Widen SSE payload
- Rename hook to `useLocalModelStatuses()`
- Update banner component to render N banners
- Tests for SC38–SC40

**Exit:** SC38–SC40 green.

### Phase 6: Documentation, ADRs, knowledge

<!-- complexity: low -->

- Write `docs/guides/multi-backend-routing.md`
- Update `hybrid-orchestrator-quickstart.md`, `intelligence-pipeline.md`
- Update `harness.orchestrator.md` template + project copy
- Write three ADRs in `docs/knowledge/decisions/`
- Write three knowledge concepts/processes; update three existing ones
- Cross-references in Spec 1's proposal and `hybrid-orchestrator/proposal.md`
- AGENTS.md update
- CHANGELOG entry

**Exit:** `harness validate` and `harness check-docs` pass.

### Phase 7: Validation gate

<!-- complexity: low -->

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`
- `harness validate`
- `harness check-docs`
- End-to-end smoke (manual): legacy config still dispatches correctly with deprecation warning; migrated config routes correctly; multi-local config shows two banners and self-heals independently

**Exit:** SC44–SC47 green. Smoke passes.

### Sequencing notes

- 1 → 2 → 3 strictly serial.
- 4 depends on 3.
- 5 can start in parallel with 4 once 3 exposes the multi-resolver map.
- 6 mostly mechanical; can run alongside 4/5 once 3 lands.
- 7 is a strict gate at the end.

### Estimated effort

| Phase                     | Rough effort |
| ------------------------- | ------------ |
| 1 — types, schema, shim   | 1 day        |
| 2 — router + factory      | half day     |
| 3 — orchestrator wiring   | 1 day        |
| 4 — intelligence routing  | half day     |
| 5 — dashboard surface     | half day     |
| 6 — docs, ADRs, knowledge | 1 day        |
| 7 — validation gate       | quarter day  |

**Total: 4–5 working days for one focused agent.** Combined with Spec 1 (1.5–2 days), the full work session is roughly **6–7 working days** end-to-end.
