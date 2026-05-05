# Plan: Spec 2 Phase 3 — Orchestrator Wiring (multi-resolver + dispatch)

**Date:** 2026-05-01 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (Phase 3 only — autopilot index 2) | **Tasks:** 17 | **Time:** ~70 min | **Integration Tier:** medium | **Session:** `changes--multi-backend-routing--proposal`

## Goal

`Orchestrator` consumes the post-migration `agent.backends` + `agent.routing` shape end-to-end: multi-resolver `Map`, `BackendRouter`-driven dispatch, single-runner factory at the dispatch site, two-runner split removed. Closes Phase 0's deferred `validateWorkflowConfig` wiring (SC15) and Phase 1's three carry-forward concerns (PFC-1/2/3).

## Observable Truths (Acceptance Criteria)

1. **SC15** (closing Phase 0 deferral) — `validateWorkflowConfig` rejects a config with neither `agent.backend` nor `agent.backends`.
2. **SC27** — Given `routing.quick-fix: 'local'` and `routing.default: 'cloud'`, dispatching a `quick-fix`-tier issue invokes the local backend; a `guided-change`-tier issue invokes the cloud backend.
3. **SC28** — Given `escalation.alwaysHuman: ['full-exploration']`, no dispatch happens for that scope tier (escalation gate persists).
4. **SC29** — Given `escalation.autoExecute: []`, no dispatch happens for `diagnostic` regardless of routing.
5. **SC30** — `git grep -n "backend === 'local'"` and `git grep -n "this\.localRunner"` return zero hits in `packages/orchestrator/src/`.
6. **SC37** — With two `local`/`pi` backends at distinct endpoints, the unreachable resolver reports `available: false` while the reachable one reports `available: true` independently.
7. **SC41** — `pnpm --filter @harness-engineering/orchestrator test -- core/state-machine` passes unchanged.
8. **SC42** — Canonical legacy config (single `agent.backend: 'pi'` + `localBackend: 'pi'`) loads, dispatches `quick-fix` to synthesized `local`, `guided-change` to synthesized `primary`.
9. **SC43** — `escalation.alwaysHuman`/`escalation.autoExecute` continue to govern _whether_; `routing` governs _where_.
10. **PFC-2** — `PiBackendConfig.timeoutMs` honored when set.
11. **Mechanical** — `pnpm --filter @harness-engineering/orchestrator typecheck`, full suite (~780 tests), `harness validate`, `harness check-deps` all green.

## Skills (from `docs/changes/multi-backend-routing/SKILLS.md`)

- `ts-zod-integration` (apply) — Tasks 5–6 (validateWorkflowConfig wiring).
- `gof-factory-method` (reference) — Tasks 7–8 (OrchestratorBackendFactory).
- `ts-type-guards` (reference) — Tasks 1, 11–12 (RoutingUseCase narrowing in router + dispatch).

## Uncertainties

- **[ASSUMPTION]** `AgentRunner` is safe to construct per-dispatch (verified during Task 11 by reading the constructor; if state-bearing, fall back to caching by backend name).
- **[ASSUMPTION]** `getLocalModelStatus` HTTP callback returns the **first** local resolver's status during this phase. Multi-local API surface (SC38–40) is autopilot Phase 4 (spec §5).
- **[ASSUMPTION]** `createAnalysisProvider` keeps its current resolution order; only "consult the resolver Map keyed by the routed-default backend name" changes. Routing-driven analysis selection lands in autopilot Phase 3 (spec §4 / SC31–36).
- **[ASSUMPTION]** Removing `this.runner`/`this.localRunner` is safe; the fallback at line 1300 (`runner ?? this.runner`) gets removed when all callers pass a factory-built runner.
- **[DEFERRABLE]** `dispatchIssue(..., backend?: 'local' | 'primary')` parameter — kept as-is. When `'local'`, route as `{ kind: 'tier', tier: 'quick-fix' }`; otherwise `{ kind: 'tier', tier: issue.scopeTier ?? 'guided-change' }`. Eliminating this legacy parameter is a Phase 4+ cleanup.

## File Map

```
MODIFY  packages/orchestrator/src/agent/backend-router.ts           (refactor API to RoutingUseCase shape)
MODIFY  packages/orchestrator/tests/agent/backend-router.test.ts    (update tests to new API; SC16-SC21 retained)
CREATE  packages/orchestrator/src/agent/orchestrator-backend-factory.ts
CREATE  packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
MODIFY  packages/orchestrator/src/agent/backends/pi.ts              (PiBackendConfig.timeoutMs + class usage)
MODIFY  packages/orchestrator/src/agent/backend-factory.ts          (pass timeoutMs to PiBackend; remove deferral comment)
MODIFY  packages/orchestrator/tests/agent/backend-factory.test.ts   (assert timeoutMs propagation; pi+timeout case)
MODIFY  packages/orchestrator/src/workflow/config.ts                (wire BackendDefSchema + RoutingConfigSchema + validateBackendsAndRouting; closes SC15)
MODIFY  packages/orchestrator/tests/workflow/                       (new test file or extend schema.test.ts for SC15 end-to-end)
MODIFY  packages/orchestrator/src/orchestrator.ts                   (constructor: migrateAgentConfig → multi-resolver Map → factory; remove createBackend/createLocalBackend/localRunner/runner; rewrite dispatch site at L1250)
MODIFY  packages/orchestrator/src/index.ts                          (re-export BackendRouter, migrateAgentConfig)
CREATE  packages/orchestrator/tests/agent/multi-backend-dispatch.test.ts   (SC27-SC30, SC42, SC43)
CREATE  packages/orchestrator/tests/agent/multi-resolver-independence.test.ts  (SC37)
```

13 files (3 new, 10 modify). `state-machine.test.ts` is intentionally untouched (SC41).

## Skeleton (approved)

1. BackendRouter API refactor to RoutingUseCase shape (~2 tasks, ~6 min) — _approved_
2. PiBackend timeoutMs wiring (~2 tasks, ~5 min) — _approved_
3. validateWorkflowConfig wiring (~2 tasks, ~6 min) — _approved_
4. OrchestratorBackendFactory class (~2 tasks, ~7 min) — _approved_
5. Orchestrator constructor refactor (multi-resolver Map) (~3 tasks, ~12 min) — _approved_
6. Orchestrator dispatch refactor (single-runner) (~2 tasks, ~10 min) — _approved_
7. createAnalysisProvider adaptation (~1 task, ~5 min) — _approved_
8. Integration tests (~3 tasks, ~12 min) — _approved_
9. Verification gate (1 task, ~2 min) — _approved_

---

## Tasks

### Task 1: TDD — Update BackendRouter tests to spec's `RoutingUseCase` API

**Depends on:** none | **Files:** `packages/orchestrator/tests/agent/backend-router.test.ts`

Rewrite the 12 existing tests to call `resolve(useCase)` and `resolveDefinition(useCase)` instead of `getBackendName(scope, intelligenceLayer?)` / `getBackend(...)`. Add the `RoutingUseCase` import.

1. At the top of the file, add:

   ```typescript
   import type { RoutingUseCase } from '@harness-engineering/types';
   ```

2. Replace each call site:

   | Before                                     | After                                                               |
   | ------------------------------------------ | ------------------------------------------------------------------- |
   | `router.getBackendName('quick-fix')`       | `router.resolve({ kind: 'tier', tier: 'quick-fix' })`               |
   | `router.getBackendName('guided-change')`   | `router.resolve({ kind: 'tier', tier: 'guided-change' })`           |
   | `router.getBackendName('totally-made-up')` | `router.resolve({ kind: 'maintenance' })` (always default per SC19) |
   | `router.getBackend('quick-fix')`           | `router.resolveDefinition({ kind: 'tier', tier: 'quick-fix' })`     |
   | `router.getBackendName('default', 'sel')`  | `router.resolve({ kind: 'intelligence', layer: 'sel' })`            |
   | `router.getBackendName('default', 'pesl')` | `router.resolve({ kind: 'intelligence', layer: 'pesl' })`           |

3. The "unknown scope" test (line 25–29) becomes a `{ kind: 'chat' }` test asserting it returns default (SC20).

4. The integration block at the end (line 97–117) updates correspondingly.

5. Run: `pnpm --filter @harness-engineering/orchestrator test -- backend-router` — must FAIL (impl not yet refactored).
6. Commit: `test(orchestrator): update BackendRouter tests to RoutingUseCase API (Spec 2 SC16-SC21)`

### Task 2: Refactor BackendRouter to spec's `RoutingUseCase` API

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/backend-router.ts`, `packages/types/src/orchestrator.ts`

1. Add to `packages/types/src/orchestrator.ts` (immediately after `RoutingConfig`):

   ```typescript
   export type RoutingUseCase =
     | { kind: 'tier'; tier: ScopeTier }
     | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
     | { kind: 'maintenance' }
     | { kind: 'chat' };
   ```

   Re-export from `packages/types/src/index.ts`. Rebuild types dist: `pnpm --filter @harness-engineering/types build`.

2. Replace `backend-router.ts` with:

   ```typescript
   import type { BackendDef, RoutingConfig, RoutingUseCase } from '@harness-engineering/types';

   export interface BackendRouterOptions {
     backends: Record<string, BackendDef>;
     routing: RoutingConfig;
   }

   export class BackendRouter {
     private readonly backends: Record<string, BackendDef>;
     private readonly routing: RoutingConfig;

     constructor(opts: BackendRouterOptions) {
       this.backends = opts.backends;
       this.routing = opts.routing;
       this.validateReferences();
     }

     resolve(useCase: RoutingUseCase): string {
       switch (useCase.kind) {
         case 'tier': {
           const named = (this.routing as Record<string, string | undefined>)[useCase.tier];
           return named ?? this.routing.default;
         }
         case 'intelligence': {
           const intel = this.routing.intelligence as
             | Record<string, string | undefined>
             | undefined;
           return intel?.[useCase.layer] ?? this.routing.default;
         }
         case 'maintenance':
         case 'chat':
           return this.routing.default;
       }
     }

     resolveDefinition(useCase: RoutingUseCase): BackendDef {
       const name = this.resolve(useCase);
       const def = this.backends[name];
       if (!def) {
         throw new Error(
           `BackendRouter.resolveDefinition: routing target '${name}' is not in backends (useCase=${JSON.stringify(useCase)}).`
         );
       }
       return def;
     }

     private validateReferences(): void {
       // [identical to current implementation — copy lines 65-88 verbatim]
     }
   }
   ```

   Delete the old `getBackendName` and `getBackend` methods.

3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — must pass.
4. Run: `pnpm --filter @harness-engineering/orchestrator test -- backend-router` — must PASS (12 tests).
5. Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite, no regressions.
6. Run: `harness validate`.
7. Commit: `refactor(orchestrator): align BackendRouter API to RoutingUseCase (Spec 2 SC16-SC21)`

### Task 3: TDD — `PiBackendConfig.timeoutMs`

**Depends on:** Task 2 | **Files:** Test for `pi.ts` (extend or create at `packages/orchestrator/tests/agent/backends/pi.test.ts` — discover existing path during execution)

Add a unit test asserting that when `timeoutMs: 60000` is passed, a `PiBackend` instance stores it (or surfaces it via fetch options when the test mocks fetch). Pattern follows the existing `LocalBackend` `timeoutMs` test if one exists; otherwise mirror the construction-only assertion used elsewhere in `pi.ts` tests.

If no existing pi test file exists, add one minimal test:

```typescript
import { describe, it, expect } from 'vitest';
import { PiBackend } from '../../../src/agent/backends/pi.js';

describe('PiBackend timeoutMs', () => {
  it('accepts timeoutMs in config without throwing', () => {
    expect(
      () => new PiBackend({ endpoint: 'http://x:1234/v1', model: 'm', timeoutMs: 30_000 })
    ).not.toThrow();
  });
});
```

Run target test — must FAIL (config field doesn't exist yet).

Commit: `test(orchestrator): cover PiBackend timeoutMs constructor wiring (Spec 2 PFC-2)`

### Task 4: Implement `PiBackendConfig.timeoutMs`

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/backends/pi.ts`

1. Add to `PiBackendConfig` (line 15–24):

   ```typescript
   /** Request timeout in milliseconds. Defaults to 90_000. */
   timeoutMs?: number | undefined;
   ```

2. In the `PiBackend` class, propagate to the OpenAI client / fetch call shape (mirror `LocalBackend`'s handling of `timeoutMs`). At minimum, store `private readonly timeoutMs: number;` from `opts.timeoutMs ?? 90_000` in the constructor and use it where the existing implementation calls `fetch` or constructs the OpenAI client.

3. Update `packages/orchestrator/src/agent/backend-factory.ts` line 60–69 — replace the `pi` branch with:

   ```typescript
   case 'pi': {
     const isArray = Array.isArray(def.model);
     return new PiBackend({
       endpoint: def.endpoint,
       ...(typeof def.model === 'string' ? { model: def.model } : {}),
       ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
       ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
       ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
     });
   }
   ```

   Remove the deferral comment (lines 66–68).

4. Update `packages/orchestrator/tests/agent/backend-factory.test.ts` — extend the `pi` variant test to assert `timeoutMs` is propagated when set on the def.

5. Run: `pnpm --filter @harness-engineering/orchestrator test -- pi backend-factory` — must PASS.
6. Commit: `feat(orchestrator): wire PiBackend timeoutMs through factory (Spec 2 PFC-2)`

### Task 5: TDD — `validateWorkflowConfig` rejects no-backend config (SC15)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/workflow/config.test.ts` (CREATE if missing) or extend existing schema test

Add a test:

```typescript
import { describe, it, expect } from 'vitest';
import { validateWorkflowConfig, getDefaultConfig } from '../../src/workflow/config.js';

describe('validateWorkflowConfig — backend requirement (SC15)', () => {
  it('rejects a config with neither agent.backend nor agent.backends set', () => {
    const cfg = getDefaultConfig();
    // strip the default mock backend so neither path is set
    (cfg.agent as Record<string, unknown>).backend = undefined;
    delete (cfg.agent as Record<string, unknown>).backends;
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/must define agent\.backend or agent\.backends/i);
    }
  });

  it('accepts a config with only legacy agent.backend set', () => {
    const cfg = getDefaultConfig();
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(true);
  });

  it('accepts a config with only modern agent.backends set', () => {
    const cfg = getDefaultConfig();
    (cfg.agent as Record<string, unknown>).backend = undefined;
    (cfg.agent as Record<string, unknown>).backends = { primary: { type: 'mock' } };
    (cfg.agent as Record<string, unknown>).routing = { default: 'primary' };
    const result = validateWorkflowConfig(cfg);
    expect(result.ok).toBe(true);
  });
});
```

Run — first test must FAIL.

Commit: `test(orchestrator): cover validateWorkflowConfig SC15 backend requirement`

### Task 6: Implement SC15 enforcement in `validateWorkflowConfig`

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/workflow/config.ts`

After the existing intelligence check (line 14–19), insert:

```typescript
const agent = (c.agent ?? {}) as Record<string, unknown>;
const hasLegacyBackend = typeof agent.backend === 'string';
const hasModernBackends =
  agent.backends !== undefined && typeof agent.backends === 'object' && agent.backends !== null;
if (!hasLegacyBackend && !hasModernBackends) {
  return Err(new Error('Config must define agent.backend or agent.backends.'));
}

if (hasModernBackends) {
  // Validate the new shape via Phase 0's Zod schemas + cross-field validator.
  const { BackendDefSchema, RoutingConfigSchema, validateBackendsAndRouting } =
    await import('./schema.js');
  // Note: this path is only hit for modern configs. The legacy path stays
  // hand-rolled until autopilot Phase 4+ retires the legacy schema entirely.
  const z = await import('zod');
  const BackendsMap = z.z.record(z.z.string(), BackendDefSchema);
  const backendsParsed = BackendsMap.safeParse(agent.backends);
  if (!backendsParsed.success) {
    return Err(new Error(`agent.backends: ${backendsParsed.error.message}`));
  }
  const routingParsed = RoutingConfigSchema.optional().safeParse(agent.routing);
  if (!routingParsed.success) {
    return Err(new Error(`agent.routing: ${routingParsed.error.message}`));
  }
  if (routingParsed.data) {
    const cross = validateBackendsAndRouting(backendsParsed.data, routingParsed.data);
    if (cross.length > 0) {
      return Err(
        new Error(
          `Cross-field: ${cross.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
        )
      );
    }
  }
}
```

> NOTE: `validateWorkflowConfig` is currently sync (returns `Result`, not `Promise<Result>`). The `await import` above is inside the async path; if `validateWorkflowConfig` cannot be made async without ripple, use `require()`-equivalent (top-of-file static imports of `./schema.js` and `zod`). Decision deferred to execution; default to making it sync via static imports — `BackendDefSchema` and `RoutingConfigSchema` are already importable.

Concretely, prefer the static-import path:

```typescript
// at the top of the file
import { BackendDefSchema, RoutingConfigSchema, validateBackendsAndRouting } from './schema.js';
import { z } from 'zod';
```

…and use them synchronously inside the function.

Run: `pnpm --filter @harness-engineering/orchestrator test -- workflow/config` — all 3 tests pass.
Run: `pnpm --filter @harness-engineering/orchestrator typecheck`.
Run: full suite — no regressions.
Run: `harness validate`.

Commit: `feat(orchestrator): enforce SC15 in validateWorkflowConfig (Spec 2)`

### Task 7: TDD — `OrchestratorBackendFactory` class

**Depends on:** Task 6 | **Files:** `packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts` (CREATE)

```typescript
import { describe, it, expect } from 'vitest';
import type { BackendDef, RoutingConfig, RoutingUseCase } from '@harness-engineering/types';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory.js';
import { ClaudeBackend } from '../../src/agent/backends/claude.js';
import { PiBackend } from '../../src/agent/backends/pi.js';

const cloud: BackendDef = { type: 'claude', command: 'claude' };
const local: BackendDef = { type: 'pi', endpoint: 'http://x:1234/v1', model: 'm' };

describe('OrchestratorBackendFactory', () => {
  const backends = { cloud, local };
  const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };

  it('produces a backend matching the routed BackendDef.type', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    expect(factory.forUseCase({ kind: 'tier', tier: 'quick-fix' })).toBeInstanceOf(PiBackend);
    expect(factory.forUseCase({ kind: 'tier', tier: 'guided-change' })).toBeInstanceOf(
      ClaudeBackend
    );
  });

  it('returns a fresh backend instance per call', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    const a = factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    const b = factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    expect(a).not.toBe(b);
  });

  it('falls through to default for maintenance/chat use cases', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    expect(factory.forUseCase({ kind: 'maintenance' })).toBeInstanceOf(ClaudeBackend);
    expect(factory.forUseCase({ kind: 'chat' })).toBeInstanceOf(ClaudeBackend);
  });

  it('wraps with ContainerBackend when sandboxPolicy=docker AND container set', async () => {
    const { ContainerBackend } = await import('../../src/agent/backends/container.js');
    const factory = new OrchestratorBackendFactory({
      backends,
      routing,
      sandboxPolicy: 'docker',
      container: { image: 'fake', mounts: [] } as unknown as never,
    });
    expect(factory.forUseCase({ kind: 'tier', tier: 'guided-change' })).toBeInstanceOf(
      ContainerBackend
    );
  });
});
```

Run — must FAIL (class doesn't exist yet).

Commit: `test(orchestrator): cover OrchestratorBackendFactory routed instantiation (Spec 2 SC22-SC25)`

### Task 8: Implement `OrchestratorBackendFactory`

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/agent/orchestrator-backend-factory.ts` (CREATE)

```typescript
import type {
  AgentBackend,
  BackendDef,
  RoutingConfig,
  RoutingUseCase,
  ContainerConfig,
  SecretsConfig,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { createBackend } from './backend-factory.js';
import { ContainerBackend } from './backends/container.js';
import { DockerRuntime } from './backends/container.js'; // adjust if from another module
import { createSecretBackend } from './secrets/factory.js'; // adjust to actual path during execution

export interface OrchestratorBackendFactoryOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
  sandboxPolicy: 'none' | 'docker';
  container?: ContainerConfig;
  secrets?: SecretsConfig;
  // hook for resolver injection — called per local/pi backend def, returns getModel
  getResolverModelFor?: (backendName: string) => (() => string | null) | undefined;
}

export class OrchestratorBackendFactory {
  private readonly router: BackendRouter;
  private readonly opts: OrchestratorBackendFactoryOptions;

  constructor(opts: OrchestratorBackendFactoryOptions) {
    this.opts = opts;
    this.router = new BackendRouter({ backends: opts.backends, routing: opts.routing });
  }

  forUseCase(useCase: RoutingUseCase): AgentBackend {
    const def = this.router.resolveDefinition(useCase);
    const name = this.router.resolve(useCase);
    let backend = createBackend(def);

    // For local/pi defs, override getModel with the orchestrator-owned resolver
    // when one was registered. We rebuild via createBackend then re-instantiate
    // the local/pi class with the resolver-bound getModel. Implementation detail
    // — handled by passing through a custom factory hook in execution.
    if ((def.type === 'local' || def.type === 'pi') && this.opts.getResolverModelFor) {
      const getModel = this.opts.getResolverModelFor(name);
      if (getModel) {
        backend = this.rebuildLocalLikeWithResolver(def, getModel);
      }
    }

    if (this.opts.sandboxPolicy === 'docker' && this.opts.container) {
      const runtime = new DockerRuntime();
      const secretBackend = this.opts.secrets ? createSecretBackend(this.opts.secrets) : null;
      const secretKeys = this.opts.secrets?.keys ?? [];
      backend = new ContainerBackend(
        backend,
        runtime,
        secretBackend,
        this.opts.container,
        secretKeys
      );
    }
    return backend;
  }

  private rebuildLocalLikeWithResolver(
    def: BackendDef,
    getModel: () => string | null
  ): AgentBackend {
    // Re-construct LocalBackend or PiBackend with the resolver-bound getModel
    // overriding the head-of-array placeholder from createBackend.
    // [implementation: import LocalBackend / PiBackend directly and construct
    //  with full def + the resolver getModel; mirrors createBackend's local/pi
    //  branches but substitutes getModel.]
  }
}
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-backend-factory` — must PASS.
Run typecheck + full suite + `harness validate`.

Commit: `feat(orchestrator): add OrchestratorBackendFactory wrapping router + factory + container (Spec 2)`

### Task 9: Apply `migrateAgentConfig` early in Orchestrator constructor

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Insert immediately after `this.config = config;` is set (early in the constructor, before any field that reads `this.config.agent.backend*` or `this.config.agent.localBackend*`):

```typescript
import { migrateAgentConfig } from './agent/config-migration.js';

// inside the constructor, immediately after setting this.config:
const migrationResult = migrateAgentConfig(this.config.agent);
if (migrationResult.warnings.length > 0) {
  for (const w of migrationResult.warnings) this.logger.warn(w);
}
this.config = { ...this.config, agent: migrationResult.config };
```

> Note: `migrateAgentConfig` returns the input unchanged when `agent.backends` is already set (Phase 0 SC14), and synthesizes `backends`+`routing` from legacy fields when only legacy fields are set (SC9–SC11). After this line runs, `this.config.agent.backends` and `this.config.agent.routing` are guaranteed populated for non-legacy code paths.

Run typecheck + state-machine.test.ts (SC41 baseline) + full suite — must remain green.
Commit: `feat(orchestrator): apply migrateAgentConfig early in constructor (Spec 2)`

### Task 10: Replace `localModelResolver` field with multi-resolver `Map`

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Replace line 88:

   ```typescript
   private localModelResolver: LocalModelResolver | null = null;
   ```

   with:

   ```typescript
   private localResolvers = new Map<string, LocalModelResolver>();
   ```

2. Replace the constructor block at lines 158–185 with:

   ```typescript
   // Build per-named-backend resolver Map. Each local/pi backend in
   // agent.backends spawns one LocalModelResolver. Legacy single-backend
   // configs went through migrateAgentConfig (Task 9), so this branch is
   // uniform whether the user wrote backends or legacy fields.
   const backendsMap = this.config.agent.backends ?? {};
   for (const [name, def] of Object.entries(backendsMap)) {
     if (def.type === 'local' || def.type === 'pi') {
       const resolverOpts: import('./agent/local-model-resolver').LocalModelResolverOptions = {
         endpoint: def.endpoint,
         configured: typeof def.model === 'string' ? [def.model] : def.model,
         logger: this.logger,
       };
       if (def.apiKey !== undefined) resolverOpts.apiKey = def.apiKey;
       if (def.probeIntervalMs !== undefined) resolverOpts.probeIntervalMs = def.probeIntervalMs;
       this.localResolvers.set(name, new LocalModelResolver(resolverOpts));
     }
   }
   ```

3. Update the server callback at line 246:

   ```typescript
   getLocalModelStatus: () => {
     // First-resolver compat: SC38–40 (multi-banner API) lands in autopilot Phase 4.
     const first = this.localResolvers.values().next();
     return first.done ? null : first.value.getStatus();
   },
   ```

4. Update `start()` and `stop()` lifecycle methods (find their bodies; replace the single-resolver lines):

   ```typescript
   // in start():
   for (const [name, resolver] of this.localResolvers) {
     await resolver.start();
     resolver.onStatusChange((status) => {
       this.server?.broadcastLocalModelStatus({
         ...status,
         backendName: name,
         endpoint: this.lookupEndpointFor(name),
       });
     });
   }

   // in stop():
   for (const resolver of this.localResolvers.values()) resolver.stop();
   ```

   Add a private helper `lookupEndpointFor(name: string): string` that reads `this.config.agent.backends?.[name]?.endpoint ?? '<unknown>'`.

5. Anywhere `this.localModelResolver` is read elsewhere in the file, change to `this.localResolvers.get(<name>)` — or use the "first-resolver" helper for legacy single-backend paths. Use `git grep "this\.localModelResolver"` to find all sites.

Run: `pnpm --filter @harness-engineering/orchestrator test -- core/state-machine` (SC41 baseline) — must remain green.
Run typecheck + full suite + `harness validate`.

Commit: `refactor(orchestrator): replace single resolver field with Map<name, LocalModelResolver> (Spec 2 SC37)`

### Task 11: Add `OrchestratorBackendFactory` field; remove `createBackend`/`createLocalBackend`/`localRunner`/`runner`

**Depends on:** Task 10 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Add field:

   ```typescript
   private backendFactory: OrchestratorBackendFactory;
   ```

   And import:

   ```typescript
   import { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory.js';
   ```

2. In the constructor, immediately after the multi-resolver Map is built (Task 10), construct:

   ```typescript
   this.backendFactory = new OrchestratorBackendFactory({
     backends: this.config.agent.backends ?? {},
     routing: this.config.agent.routing ?? { default: '__legacy__' },
     sandboxPolicy: this.config.agent.sandboxPolicy ?? 'none',
     ...(this.config.agent.container !== undefined
       ? { container: this.config.agent.container }
       : {}),
     ...(this.config.agent.secrets !== undefined ? { secrets: this.config.agent.secrets } : {}),
     getResolverModelFor: (name) => {
       const resolver = this.localResolvers.get(name);
       return resolver ? () => resolver.resolveModel() : undefined;
     },
   });
   ```

3. Delete the `createBackend()` method (lines 265–308).
4. Delete the `createLocalBackend()` method (lines 456–484).
5. Delete the `runner` and `localRunner` field declarations (lines 87, 88-equivalent).
6. Delete the `this.runner = new AgentRunner(...)` line (148) and the `localBackend = ...` / `this.localRunner = ...` block (187–190).

Do NOT touch the dispatch site yet (Task 12).

Run typecheck — typecheck WILL FAIL because dispatchIssue still references `this.runner`/`this.localRunner`. That is expected; Task 12 closes the loop.

Commit: `refactor(orchestrator): introduce OrchestratorBackendFactory; remove createBackend/createLocalBackend/runner fields (Spec 2 SC30)`

> Justification for the broken-typecheck commit: keeping Tasks 11 and 12 atomic-each preserves reviewability. The pair lands within the same phase, immediately before Task 13's verification. If you prefer a green-typecheck-per-commit invariant, merge Tasks 11+12 into one commit during execution.

### Task 12: Rewrite dispatch site to use the factory

**Depends on:** Task 11 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Replace lines 1250–1251:

   ```typescript
   const useCase: import('@harness-engineering/types').RoutingUseCase =
     backend === 'local'
       ? { kind: 'tier', tier: 'quick-fix' }
       : { kind: 'tier', tier: issue.scopeTier ?? 'guided-change' };
   const agentBackend = this.backendFactory.forUseCase(useCase);
   const activeRunner = new AgentRunner(agentBackend, { maxTurns: this.config.agent.maxTurns });
   this.runAgentInBackgroundTask(issue, workspacePath, prompt, attempt, activeRunner);
   ```

2. Update `runAgentInBackgroundTask` (line 1293) — remove the `runner ?? this.runner` fallback at line 1300 and require `runner` as a non-optional parameter. Update its signature accordingly. Update any other callers.

3. Use `git grep "this\.runner\|this\.localRunner"` and `git grep "backend === 'local'"` to confirm zero hits in `packages/orchestrator/src/`. (SC30 acceptance.)

Run typecheck — must now PASS.
Run: `pnpm --filter @harness-engineering/orchestrator test -- core/state-machine` (SC41 baseline) — must PASS.
Run full suite + `harness validate`.

Commit: `refactor(orchestrator): rewrite dispatch site to BackendFactory (Spec 2 SC27, SC30)`

### Task 13: Adapt `createAnalysisProvider` to multi-resolver landscape

**Depends on:** Task 12 | **Files:** `packages/orchestrator/src/orchestrator.ts`

The existing `createAnalysisProvider` (line 509) consults `this.localModelResolver` directly. Replace those references with a "default-backend resolver" lookup:

```typescript
// at line 525 (the local-backend branch):
if (this.config.agent.localBackend && this.localResolvers.size > 0) {
  // Use the resolver bound to the routed-default backend if it is local;
  // otherwise the first available local resolver. Routing-driven analysis
  // selection is autopilot Phase 3 (spec §4 / SC31-36).
  const defaultName = this.config.agent.routing?.default;
  const resolver =
    (defaultName ? this.localResolvers.get(defaultName) : undefined) ??
    this.localResolvers.values().next().value;
  if (!resolver) return null;
  const status = resolver.getStatus();
  if (!status.available) {
    // ...keep existing warn block but read endpoint from the resolver's owning def
    return null;
  }
  // ...rest of the branch unchanged
}
```

Update the warn block's `this.config.agent.localEndpoint` reference to read from the resolved backend def's `endpoint` field instead.

Run typecheck + full suite + `harness validate`.

Commit: `refactor(orchestrator): adapt createAnalysisProvider to multi-resolver Map (Spec 2)`

### Task 14: Re-export `BackendRouter` and `migrateAgentConfig` from package barrel

**Depends on:** Task 13 | **Files:** `packages/orchestrator/src/index.ts`

Append:

```typescript
export { BackendRouter } from './agent/backend-router';
export { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory';
export { migrateAgentConfig } from './agent/config-migration';
export { createBackend } from './agent/backend-factory';
```

Run: `pnpm --filter @harness-engineering/orchestrator typecheck`.

Commit: `feat(orchestrator): re-export router/factory/migration from package barrel (Spec 2)`

### Task 15: Integration test — SC27/SC28/SC29/SC30/SC42/SC43 (dispatch routing)

**Depends on:** Task 14 | **Files:** `packages/orchestrator/tests/agent/multi-backend-dispatch.test.ts` (CREATE)

Stand up a minimal orchestrator with `MockBackend` for both `cloud` and `local`. Assert:

- (SC27) issue with `scopeTier: 'quick-fix'` invokes the `local` mock; `scopeTier: 'guided-change'` invokes the `cloud` mock. Use a spy on each mock's `startSession` to count invocations.
- (SC28) with `escalation.alwaysHuman: ['full-exploration']`, a `full-exploration` issue is NOT dispatched.
- (SC29) with `escalation.autoExecute: []`, a `diagnostic` issue is NOT dispatched.
- (SC30) `git grep -n "backend === 'local'"` and `git grep -n "this\.localRunner"` in `packages/orchestrator/src/` return zero matches. (Mechanical assertion via execFile.)
- (SC42) legacy config (`agent.backend: 'mock'` + `localBackend: 'openai-compatible'` + `localEndpoint`) loads, dispatches `quick-fix` to synthesized `local`, `guided-change` to synthesized `primary`.
- (SC43) `escalation.alwaysHuman` blocks dispatch; `routing` only governs target.

Test file uses fake fetch/HTTP for the local resolver probe to avoid network dependence.

Run: `pnpm --filter @harness-engineering/orchestrator test -- multi-backend-dispatch` — must PASS.

Commit: `test(orchestrator): integration tests for multi-backend dispatch routing (Spec 2 SC27-SC30, SC42-SC43)`

### Task 16: Integration test — SC37 (multi-resolver independence)

**Depends on:** Task 15 | **Files:** `packages/orchestrator/tests/agent/multi-resolver-independence.test.ts` (CREATE)

Stand up an orchestrator with two `pi` backends at distinct endpoints (`http://up:1234/v1`, `http://down:9999/v1`). Inject a `fetchModels` stub that resolves successfully for `up` and rejects (or returns empty) for `down`. After `start()`:

- The `up` resolver reports `available: true` with a resolved model.
- The `down` resolver reports `available: false`.
- The two resolvers have independent `getStatus()` payloads (no cross-contamination).
- A `quick-fix` issue routed to `up` dispatches; routed to `down` short-circuits (no dispatch + escalation).

Run: `pnpm --filter @harness-engineering/orchestrator test -- multi-resolver-independence` — must PASS.

Commit: `test(orchestrator): integration test for multi-resolver independence (Spec 2 SC37)`

### Task 17: Verification gate

**Depends on:** Task 16 | **Files:** none — verification only

Run, in order:

1. `pnpm --filter @harness-engineering/types build`
2. `pnpm --filter @harness-engineering/types typecheck`
3. `pnpm --filter @harness-engineering/orchestrator typecheck`
4. `pnpm --filter @harness-engineering/orchestrator test` — full suite, expect ~780 tests, no regressions, no skips.
5. `harness validate`
6. `harness check-deps`
7. `git grep -n "backend === 'local'" packages/orchestrator/src/` — must return zero lines.
8. `git grep -n "this\.localRunner\|this\.runner\b" packages/orchestrator/src/` — must return zero lines.

If all pass, write empty exit-gate commit:

```
chore(spec2): Phase 3 exit gate green (orchestrator wiring multi-resolver + dispatch)
```

If any fails, STOP and write a blocker to handoff.

---

## Concerns

- **SEV: info** — The `migrateAgentConfig` warning emission (Task 9) interacts with NF-1 (CASE1 over-suppression carry-forward from Phase 0). Phase 1 review noted that `CASE1_SUPPRESSED` over-suppresses `local*` warnings when `agent.localBackend` is absent. Once this phase finalizes the migration call site, NF-1's narrowed-suppression refactor becomes mechanical and lands cleanly in autopilot Phase 3 (spec §4 / Phase 4 plan).
- **SEV: info** — `getLocalModelStatus` server callback returns first-resolver status only (assumption above). Multi-status surface (`/local-models/status`, SC38–40) is autopilot Phase 4 (spec §5).
- **SEV: info** — `dispatchIssue(..., backend?: 'local' | 'primary')` legacy parameter retained. Eliminating it is a Phase 4+ cleanup once all callers migrate to passing `RoutingUseCase` directly.
- **SEV: info** — Task 11 commit lands with broken typecheck (Task 12 closes it within the same phase). Reviewers wanting green-per-commit can request the executor merge Tasks 11+12 into a single commit.
- **SEV: info** — `createAnalysisProvider` adaptation (Task 13) is minimal-touch. Routing-driven analysis selection (SC31–36) is autopilot Phase 3 (spec §4) and produces the proper provider-resolution refactor.

## Carry-forward to next phases

- **Autopilot Phase 3 (spec §4):** intelligence-pipeline routing (SC31–36); NF-1 narrow-suppression refactor (carry from Phase 0); routing-driven `createAnalysisProvider`.
- **Autopilot Phase 4 (spec §5):** dashboard/server multi-status surface (SC38–40); `getLocalModelStatus` callback widening; `useLocalModelStatuses()` hook rename.
- **Autopilot Phase 5 (spec §6):** docs / ADRs / knowledge.

## Validation

- Plan written to `docs/plans/2026-05-01-spec2-phase3-orchestrator-wiring-plan.md`.
- 17 tasks, each completable in 2–5 minutes.
- TDD enforced: every code-producing task starts with a test (Tasks 1, 3, 5, 7 are test-first; Tasks 9–14 piggyback on existing test surfaces; Tasks 15–16 are integration tests).
- File map complete (13 files).
- All observable truths trace to specific tasks (SC15→Tasks 5–6, SC27→Task 15, SC28→Task 15, SC29→Task 15, SC30→Task 12+15, SC37→Task 16, SC41→guarded by Tasks 9/10/12 via state-machine.test.ts, SC42–43→Task 15, PFC-2→Tasks 3–4, mechanical→Task 17).
- Integration tier `medium` (orchestrator dispatch entry-point modified, new package exports added, schema validator wired into config validation surface).
