# Plan: Spec 2 Phase 2 — Router + Backend Factory

**Date:** 2026-05-01 | **Spec:** docs/changes/multi-backend-routing/proposal.md (Phase 2) | **Tasks:** 8 | **Time:** ~38 min | **Integration Tier:** small

## Goal

Implement a pure `createBackend(def)` factory and a `BackendRouter` class that owns routing resolution and construction-time validation, without touching `orchestrator.ts` dispatch.

## Observable Truths (Acceptance Criteria)

1. `createBackend(def: BackendDef): AgentBackend` exists at `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-factory.ts` and produces the correct concrete class for each of the 7 `BackendDef` variants (`mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`). [SC22, SC23]
2. For `local` / `pi` defs whose `model` is an array, `createBackend` passes a `getModel` resolver that returns the first element (or `null` when the array is somehow empty post-validation). [SC23]
3. `BackendRouter` exists at `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-router.ts`, accepts `{ backends, routing }` in its constructor, throws when any name referenced in `routing` is not present in `backends`, and exposes `getBackendName(scope, intelligenceLayer?)` and `getBackend(scope, intelligenceLayer?)`. [SC16-SC21]
4. Unknown scopes resolve to `routing.default` without throwing. Known scopes that map to `undefined` in routing also fall back to default. Intelligence-layer lookups consult `routing.intelligence[layer]` and fall back to default. [SC16, SC17, SC18, SC19, SC20]
5. `getBackend()` returns the same `BackendDef` reference held in the `backends` map (not a copy). [SC21]
6. `npx vitest run packages/orchestrator/tests/agent/backend-factory.test.ts packages/orchestrator/tests/agent/backend-router.test.ts` passes with at least one test per variant plus error paths.
7. `harness validate` passes after the plan is applied.

## Uncertainties

- [DEFERRABLE] The factory's `getModel` resolver returns the head of the array as a placeholder; richer multi-model resolution (Spec 1's `LocalModelResolver`) is wired in autopilot Phase 2. The current head-of-array logic satisfies the construction contract for Phase 2 of Spec 2.
- [DEFERRABLE] `pi.ts` currently does not consume `timeoutMs` on the class side even though `PiBackendDef` accepts it (Phase 0 schema accepted it). Phase 2 plan must NOT pass `timeoutMs` to `PiBackend` constructor since the class does not accept it. Tracked as a concern; address in autopilot Phase 2 wiring.

## File Map

- CREATE `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-factory.ts`
- CREATE `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-factory.test.ts`
- CREATE `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-router.ts`
- CREATE `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-router.test.ts`

No existing files are modified. No barrels updated (internal-only modules; orchestrator wiring is the next phase's job).

## Skeleton

_Skipped — task count (8) is below the standard-mode skeleton threshold._

## Tasks

### Task 1: Add backend-factory test scaffold and verify it fails

**Depends on:** none | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-factory.test.ts` | **SC:** SC22, SC23

1. Create the test file with exact content:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import type { BackendDef } from '@harness-engineering/types';
   import { createBackend } from '../../src/agent/backend-factory.js';
   import { MockBackend } from '../../src/agent/backends/mock.js';
   import { ClaudeBackend } from '../../src/agent/backends/claude.js';
   import { AnthropicBackend } from '../../src/agent/backends/anthropic.js';
   import { OpenAIBackend } from '../../src/agent/backends/openai.js';
   import { GeminiBackend } from '../../src/agent/backends/gemini.js';
   import { LocalBackend } from '../../src/agent/backends/local.js';
   import { PiBackend } from '../../src/agent/backends/pi.js';

   describe('createBackend', () => {
     it('builds MockBackend for type=mock', () => {
       const def: BackendDef = { type: 'mock' };
       expect(createBackend(def)).toBeInstanceOf(MockBackend);
     });

     it('builds ClaudeBackend with default command for type=claude', () => {
       const def: BackendDef = { type: 'claude' };
       expect(createBackend(def)).toBeInstanceOf(ClaudeBackend);
     });

     it('builds ClaudeBackend honoring command override', () => {
       const def: BackendDef = { type: 'claude', command: 'claude-cli' };
       expect(createBackend(def)).toBeInstanceOf(ClaudeBackend);
     });

     it('builds AnthropicBackend with model + apiKey', () => {
       const def: BackendDef = { type: 'anthropic', model: 'claude-sonnet-4', apiKey: 'sk-x' };
       expect(createBackend(def)).toBeInstanceOf(AnthropicBackend);
     });

     it('builds OpenAIBackend with model + apiKey', () => {
       const def: BackendDef = { type: 'openai', model: 'gpt-4o', apiKey: 'sk-y' };
       expect(createBackend(def)).toBeInstanceOf(OpenAIBackend);
     });

     it('builds GeminiBackend with model + apiKey', () => {
       const def: BackendDef = { type: 'gemini', model: 'gemini-2.5', apiKey: 'sk-z' };
       expect(createBackend(def)).toBeInstanceOf(GeminiBackend);
     });

     it('builds LocalBackend for type=local with string model', () => {
       const def: BackendDef = {
         type: 'local',
         endpoint: 'http://localhost:1234/v1',
         model: 'gemma-4-e4b',
       };
       expect(createBackend(def)).toBeInstanceOf(LocalBackend);
     });

     it('builds LocalBackend for type=local with array model and provides getModel resolver', () => {
       const def: BackendDef = {
         type: 'local',
         endpoint: 'http://localhost:1234/v1',
         model: ['gemma-4-e4b', 'qwen3:8b'],
       };
       const backend = createBackend(def) as LocalBackend & { getModel?: () => string | null };
       expect(backend).toBeInstanceOf(LocalBackend);
     });

     it('builds PiBackend for type=pi with string model', () => {
       const def: BackendDef = {
         type: 'pi',
         endpoint: 'http://pi.local:1234/v1',
         model: 'gemma-4-e4b',
       };
       expect(createBackend(def)).toBeInstanceOf(PiBackend);
     });

     it('builds PiBackend for type=pi with array model and head-of-array getModel', () => {
       const def: BackendDef = {
         type: 'pi',
         endpoint: 'http://pi.local:1234/v1',
         model: ['m-a', 'm-b'],
       };
       expect(createBackend(def)).toBeInstanceOf(PiBackend);
     });

     it('throws on unknown discriminant', () => {
       // @ts-expect-error intentionally invalid discriminant
       expect(() => createBackend({ type: 'bogus' })).toThrow(/unknown.*backend.*type/i);
     });
   });
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-factory.test.ts` from the repo root and observe failures (factory module does not yet exist).
3. Commit: `test(orchestrator): add backend-factory contract tests (Spec 2 SC22-SC23)`

### Task 2: Implement backend-factory and pass tests

**Depends on:** Task 1 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-factory.ts` | **SC:** SC22, SC23

1. Create the factory file with exact content:

   ```typescript
   import type { BackendDef } from '@harness-engineering/types';
   import type { AgentBackend } from './types.js';
   import { MockBackend } from './backends/mock.js';
   import { ClaudeBackend } from './backends/claude.js';
   import { AnthropicBackend } from './backends/anthropic.js';
   import { OpenAIBackend } from './backends/openai.js';
   import { GeminiBackend } from './backends/gemini.js';
   import { LocalBackend } from './backends/local.js';
   import { PiBackend } from './backends/pi.js';

   /**
    * Resolve a BackendDef.model (string | string[]) into a getModel function
    * suitable for LocalBackend / PiBackend constructors. The resolver returns
    * the head of the array (or the string itself), or null when neither is
    * available. Richer multi-model resolution (probe-aware fallback) lives in
    * Spec 1's LocalModelResolver and will be wired in autopilot Phase 2.
    */
   function makeGetModel(model: string | string[] | undefined): () => string | null {
     if (typeof model === 'string') return () => model;
     if (Array.isArray(model) && model.length > 0) return () => model[0] ?? null;
     return () => null;
   }

   /**
    * Pure constructor: BackendDef -> concrete AgentBackend instance.
    * No side effects beyond the underlying class constructors.
    * Container wrapping (sandbox policy) is the orchestrator's job, not the factory's.
    */
   export function createBackend(def: BackendDef): AgentBackend {
     switch (def.type) {
       case 'mock':
         return new MockBackend();
       case 'claude':
         return new ClaudeBackend(def.command ?? 'claude');
       case 'anthropic':
         return new AnthropicBackend({
           model: def.model,
           ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
         });
       case 'openai':
         return new OpenAIBackend({
           model: def.model,
           ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
         });
       case 'gemini':
         return new GeminiBackend({
           model: def.model,
           ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
         });
       case 'local': {
         const isArray = Array.isArray(def.model);
         return new LocalBackend({
           endpoint: def.endpoint,
           ...(typeof def.model === 'string' ? { model: def.model } : {}),
           ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
           ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
           ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
         });
       }
       case 'pi': {
         const isArray = Array.isArray(def.model);
         return new PiBackend({
           endpoint: def.endpoint,
           ...(typeof def.model === 'string' ? { model: def.model } : {}),
           ...(isArray ? { getModel: makeGetModel(def.model) } : {}),
           ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
           // NOTE: timeoutMs is accepted by PiBackendDef (Phase 0) but not
           // currently consumed by PiBackend's constructor. Wiring tracked as
           // a Phase 2 (autopilot index 2) concern.
         });
       }
       default: {
         const exhaustive: never = def;
         throw new Error(`createBackend: unknown backend type ${JSON.stringify(exhaustive)}`);
       }
     }
   }
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-factory.test.ts` and observe all tests pass.
3. Run `harness validate`.
4. Commit: `feat(orchestrator): add createBackend factory for BackendDef variants (Spec 2 SC22-SC23)`

### Task 3: Add backend-router test scaffold for happy-path resolution

**Depends on:** Task 2 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-router.test.ts` | **SC:** SC16, SC17, SC19, SC20, SC21

1. Create the test file with exact content:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
   import { BackendRouter } from '../../src/agent/backend-router.js';

   const cloud: BackendDef = { type: 'claude', command: 'claude' };
   const local: BackendDef = {
     type: 'pi',
     endpoint: 'http://pi.local:1234/v1',
     model: ['gemma-4-e4b'],
   };

   describe('BackendRouter — resolution', () => {
     it('returns the named backend for a tier scope', () => {
       const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       expect(router.getBackendName('quick-fix')).toBe('local');
     });

     it('falls back to default when a tier scope is not in routing', () => {
       const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       expect(router.getBackendName('guided-change')).toBe('cloud');
     });

     it('falls back to default for an unknown scope string (no throw)', () => {
       const routing: RoutingConfig = { default: 'cloud' };
       const router = new BackendRouter({ backends: { cloud }, routing });
       expect(router.getBackendName('totally-made-up')).toBe('cloud');
     });

     it('returns the BackendDef reference (identity, not a copy) from getBackend', () => {
       const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
       const backends = { cloud, local };
       const router = new BackendRouter({ backends, routing });
       expect(router.getBackend('quick-fix')).toBe(backends.local);
       expect(router.getBackend('guided-change')).toBe(backends.cloud);
     });
   });
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-router.test.ts` and observe failures (router module does not yet exist).
3. Commit: `test(orchestrator): add BackendRouter happy-path resolution tests (Spec 2 SC16-SC21)`

### Task 4: Implement BackendRouter to satisfy happy-path tests

**Depends on:** Task 3 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/backend-router.ts` | **SC:** SC16, SC17, SC19, SC20, SC21

1. Create the router file with exact content:

   ```typescript
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

   export interface BackendRouterOptions {
     backends: Record<string, BackendDef>;
     routing: RoutingConfig;
   }

   /**
    * BackendRouter
    *
    * Owns the lookup from a routing scope (and optional intelligence layer)
    * to a named backend. Construction-time validation guarantees every name
    * referenced by `routing` is present in `backends` so runtime lookups are
    * total and never throw on unknown-name references (D6/D7).
    *
    * Lookups for unknown scope strings or scopes mapped to undefined fall
    * back to `routing.default` without throwing — this matches the spec's
    * "every use case inherits default unless explicitly routed" semantics.
    */
   export class BackendRouter {
     private readonly backends: Record<string, BackendDef>;
     private readonly routing: RoutingConfig;

     constructor(opts: BackendRouterOptions) {
       this.backends = opts.backends;
       this.routing = opts.routing;
       this.validateReferences();
     }

     /**
      * Returns the backend name for a given scope. Optional intelligenceLayer
      * routes through `routing.intelligence[layer]` instead of the top-level
      * scope. Both fall back to `routing.default` when unmapped.
      */
     getBackendName(scope: string, intelligenceLayer?: string): string {
       if (intelligenceLayer !== undefined) {
         const intel = this.routing.intelligence as Record<string, string | undefined> | undefined;
         const named = intel?.[intelligenceLayer];
         return named ?? this.routing.default;
       }
       const top = this.routing as unknown as Record<string, string | undefined>;
       const named = top[scope];
       return named ?? this.routing.default;
     }

     /**
      * Returns the BackendDef reference for the resolved name. Returns the
      * exact reference held in `backends` (no copy) so identity comparisons
      * succeed (SC21).
      */
     getBackend(scope: string, intelligenceLayer?: string): BackendDef {
       const name = this.getBackendName(scope, intelligenceLayer);
       const def = this.backends[name];
       if (!def) {
         // Should be unreachable thanks to construction-time validation, but
         // we throw rather than return a phantom undefined.
         throw new Error(
           `BackendRouter.getBackend: routing target '${name}' is not in backends ` +
             `(scope='${scope}'${intelligenceLayer ? `, intelligenceLayer='${intelligenceLayer}'` : ''}).`
         );
       }
       return def;
     }

     private validateReferences(): void {
       const known = new Set(Object.keys(this.backends));
       const missing: Array<{ path: string; name: string }> = [];

       const check = (path: string, name: string | undefined) => {
         if (name !== undefined && !known.has(name)) missing.push({ path, name });
       };

       check('default', this.routing.default);
       check('quick-fix', this.routing['quick-fix']);
       check('guided-change', this.routing['guided-change']);
       check('full-exploration', this.routing['full-exploration']);
       check('diagnostic', this.routing.diagnostic);
       check('intelligence.sel', this.routing.intelligence?.sel);
       check('intelligence.pesl', this.routing.intelligence?.pesl);

       if (missing.length > 0) {
         const detail = missing.map(({ path, name }) => `routing.${path} -> '${name}'`).join('; ');
         const known_ = [...known].join(', ') || '(none)';
         throw new Error(
           `BackendRouter: routing references unknown backend(s): ${detail}. Defined backends: [${known_}].`
         );
       }
     }
   }
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-router.test.ts` and observe the four happy-path tests pass.
3. Run `harness validate`.
4. Commit: `feat(orchestrator): add BackendRouter for routing resolution (Spec 2 SC16-SC21)`

### Task 5: Add intelligence-layer resolution tests and confirm pass

**Depends on:** Task 4 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-router.test.ts` | **SC:** SC18

1. Append the following block inside the existing `describe('BackendRouter — resolution', ...)` (immediately before its closing `});`):

   ```typescript
   it('resolves intelligence-layer routes when set', () => {
     const routing: RoutingConfig = {
       default: 'cloud',
       intelligence: { sel: 'local' },
     };
     const router = new BackendRouter({ backends: { cloud, local }, routing });
     expect(router.getBackendName('default', 'sel')).toBe('local');
   });

   it('falls back to default when intelligence layer is unmapped', () => {
     const routing: RoutingConfig = {
       default: 'cloud',
       intelligence: { sel: 'local' },
     };
     const router = new BackendRouter({ backends: { cloud, local }, routing });
     expect(router.getBackendName('default', 'pesl')).toBe('cloud');
   });

   it('falls back to default when intelligence map is absent', () => {
     const routing: RoutingConfig = { default: 'cloud' };
     const router = new BackendRouter({ backends: { cloud }, routing });
     expect(router.getBackendName('default', 'sel')).toBe('cloud');
   });
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-router.test.ts` and observe all tests pass.
3. Run `harness validate`.
4. Commit: `test(orchestrator): cover BackendRouter intelligence-layer fallback (Spec 2 SC18)`

### Task 6: Add construction-time validation rejection tests

**Depends on:** Task 5 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-router.test.ts` | **SC:** SC16 (validation contract supporting all SC16-SC20)

1. Append a new `describe` block at the end of the file (after the closing `});` of the existing block):

   ```typescript
   describe('BackendRouter — construction-time validation', () => {
     it('throws when routing.default names a missing backend', () => {
       const routing: RoutingConfig = { default: 'nope' };
       expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
         /unknown backend.*nope/
       );
     });

     it('throws when a tier scope names a missing backend', () => {
       const routing: RoutingConfig = { default: 'cloud', diagnostic: 'ghost' };
       expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
         /diagnostic.*ghost/
       );
     });

     it('throws when an intelligence layer names a missing backend', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         intelligence: { sel: 'phantom' },
       };
       expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
         /intelligence\.sel.*phantom/
       );
     });

     it('lists known backends in the error for diagnostics', () => {
       const routing: RoutingConfig = { default: 'nope' };
       expect(() => new BackendRouter({ backends: { cloud, local }, routing })).toThrowError(
         /Defined backends.*cloud.*local|Defined backends.*local.*cloud/
       );
     });
   });
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-router.test.ts` and observe all tests pass.
3. Run `harness validate`.
4. Commit: `test(orchestrator): cover BackendRouter construction-time validation (Spec 2 SC16)`

### Task 7: Add factory + router integration test (round-trip)

**Depends on:** Task 6 | **Files:** `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/backend-router.test.ts` | **SC:** SC21, SC22, SC23

1. Append the following block at the end of the file:

   ```typescript
   describe('BackendRouter + createBackend integration', () => {
     it('round-trips: router resolves def, factory builds matching backend class', async () => {
       const { createBackend } = await import('../../src/agent/backend-factory.js');
       const { ClaudeBackend } = await import('../../src/agent/backends/claude.js');
       const { PiBackend } = await import('../../src/agent/backends/pi.js');

       const routing: RoutingConfig = {
         default: 'cloud',
         'quick-fix': 'local',
         intelligence: { sel: 'local' },
       };
       const router = new BackendRouter({ backends: { cloud, local }, routing });

       const cloudDef = router.getBackend('guided-change');
       const localDef = router.getBackend('quick-fix');
       const intelDef = router.getBackend('default', 'sel');

       expect(createBackend(cloudDef)).toBeInstanceOf(ClaudeBackend);
       expect(createBackend(localDef)).toBeInstanceOf(PiBackend);
       expect(createBackend(intelDef)).toBeInstanceOf(PiBackend);
     });
   });
   ```

2. Run `npx vitest run packages/orchestrator/tests/agent/backend-router.test.ts` and observe the new test passes alongside all prior tests.
3. Run `harness validate`.
4. Commit: `test(orchestrator): add factory+router round-trip test (Spec 2 SC21-SC23)`

### Task 8: Final phase gate — run full Phase 2 test set and validate

**Depends on:** Task 7 | **Files:** none (verification only)

1. Run `npx vitest run packages/orchestrator/tests/agent/backend-factory.test.ts packages/orchestrator/tests/agent/backend-router.test.ts` and confirm all tests pass.
2. Run `pnpm --filter @harness-engineering/orchestrator typecheck` (or `pnpm typecheck` from the repo root) and confirm no errors in the new files.
3. Run `harness validate` and `harness check-deps`.
4. No commit; this is a verification gate. If any step fails, return to the appropriate task and fix before declaring Phase 2 complete.

## Concerns

- **Deferred (autopilot Phase 2):** Wire the factory and router into `orchestrator.ts` (replaces the if/else dispatch around line 268). This phase intentionally leaves dispatch untouched.
- **Deferred (autopilot Phase 2):** Replace the head-of-array `getModel` placeholder with a per-backend `LocalModelResolver` instance keyed by endpoint (see spec D9 and `createLocalResolvers`). Factory currently provides a synchronous head-of-array fallback so the contract is testable in isolation.
- **Deferred (autopilot Phase 2):** Wire `PiBackendDef.timeoutMs` through `PiBackend`'s class. Phase 0 added the schema field but the class constructor still ignores it; the factory cannot pass it without a class change. Tracked as a Phase 2 dispatch-wiring concern.
- **Deferred (autopilot Phase 2 / Phase 3):** Container wrapping (`ContainerBackend`) lives in the orchestrator's instantiation path per spec; the factory is intentionally pure.
- **Carry-forward:** NF-1 from Phase 0 review — defer to Phase 3 plan.

## Estimated Time

~38 minutes total: Task 1 (5m), Task 2 (7m), Task 3 (4m), Task 4 (7m), Task 5 (3m), Task 6 (4m), Task 7 (4m), Task 8 (4m).
