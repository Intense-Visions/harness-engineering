# Plan: Spec 2 Phase 1 — Multi-Backend Routing Foundation (types, schema, migration shim)

**Date:** 2026-05-01 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (Phase 1 only) | **Tasks:** 8 | **Time:** ~36 min | **Integration Tier:** small | **Session:** `changes--multi-backend-routing--proposal`

## Goal

Land the foundation layer for multi-backend routing: new types in `@harness-engineering/types`, Zod validation schemas with discriminated-union backend definitions and a cross-field routing validator, and a pure migration shim that converts legacy `agent.backend`/`agent.localBackend`/`escalation.autoExecute` into the new `agent.backends` + `agent.routing` shape — all in isolation. No orchestrator wiring, no backend instantiation changes, no dashboard work.

## Phase 1 Scope (from spec)

Phase 1 delivers:

- Add `BackendDef` discriminated union, `RoutingConfig`, `NamedLocalModelStatus` to `packages/types/src/orchestrator.ts`. Widen `AgentConfig` with optional `backends?: Record<string, BackendDef>` and `routing?: RoutingConfig` fields. Legacy fields (`backend`, `localBackend`, `localEndpoint`, `localModel`, etc.) stay as-is for backward compatibility.
- Re-export new types from the package barrel.
- Implement `BackendDefSchema` (Zod discriminated union with 7 variants — `mock`, `claude`, `anthropic`, `openai`, `gemini`, `local`, `pi`).
- Implement `RoutingConfigSchema` with `.strict()` (rejects unknown keys at every level) and a `superRefine` that ensures every routing value references a key in `backends`.
- Implement `migrateAgentConfig(agent: AgentConfig)` returning `{ config, warnings }`. Translation table per spec D3/D4. No-op when `agent.backends` is already set (with warnings naming each ignored legacy field).
- Unit tests covering Spec 2 SC1–SC15.

Phase 1 explicitly excludes (deferred to later phases of the same spec):

- `BackendRouter` and the backend-instantiation factory (Phase 2 — covers SC16–SC26).
- Wiring the migration shim into `validateWorkflowConfig` or orchestrator startup, multi-resolver instantiation, and dispatch-site rewrite (Phase 3 — covers SC27–SC30, SC37, SC41–SC43).
- Intelligence pipeline routing (Phase 4 — covers SC31–SC36).
- Dashboard surface, SSE payload widening, multi-banner UI (Phase 5 — covers SC38–SC40).
- Docs, ADRs, knowledge updates (Phase 6).
- Final `pnpm typecheck` / `pnpm lint` / `pnpm test` gate across the full suite (Phase 7 — covers SC44–SC47). Phase 1 runs targeted typecheck and tests on the touched packages only.

## Observable Truths (Acceptance Criteria — Phase 1 only)

These map 1:1 to the spec's Schema validation (SC1–SC8) and Legacy migration shim (SC9–SC15) buckets. EARS framing applied to behavioral truths; structural truths stated directly.

1. **OT1 (SC1 — valid heterogeneous config passes):** Given a config with `backends.cloud = { type: 'claude', command: 'claude' }`, `backends.local = { type: 'pi', endpoint: 'http://localhost:1234/v1', model: ['a','b'] }`, and `routing = { default: 'cloud', 'quick-fix': 'local' }`, the schema parse returns a successful Zod result.
2. **OT2 (SC2 — missing required fields rejected):** When schema parse runs against `backends.foo = { type: 'pi' }` (no `endpoint`, no `model`), the system shall return a Zod error whose `issues[]` contains entries naming both missing field paths (`backends.foo.endpoint`, `backends.foo.model`).
3. **OT3 (SC3 — unknown discriminator value rejected):** When schema parse runs against `backends.foo = { type: 'unknown' }`, the system shall return a Zod `invalid_union_discriminator` error whose message lists the seven valid types.
4. **OT4 (SC4 — `routing.default` required):** When schema parse runs against a `routing` object lacking the `default` field, the system shall return an error whose path resolves to `routing.default` and whose message indicates `default` is required.
5. **OT5 (SC5 — cross-field: routing references unknown backend):** When `routing.default = 'nonexistent'` and `backends` contains no key `nonexistent`, `superRefine` shall add an issue whose message names the missing backend (`'nonexistent'`) and lists the defined backend names.
6. **OT6 (SC6 — strict routing rejects unknown top-level keys):** When `routing.quickfix` is set (typo: missing hyphen) instead of `routing['quick-fix']`, the system shall return a Zod `unrecognized_keys` error naming `quickfix`.
7. **OT7 (SC7 — strict intelligence rejects unknown layer):** When `routing.intelligence.foo = 'local'` is set, the system shall return a Zod `unrecognized_keys` error scoped to the `routing.intelligence` path naming `foo`.
8. **OT8 (SC8 — empty model array rejected):** When `backends.local = { type: 'local', endpoint: '<url>', model: [] }`, the system shall return an error indicating the array is empty (Zod `too_small` on the array variant of the `model` union).
9. **OT9 (SC9 — minimal legacy config produces `primary` + `default`):** Given `agent.backend = 'claude'` only, `migrateAgentConfig` returns a `config` whose `agent.backends.primary === { type: 'claude' }` (no `command` since legacy `agent.command` is undefined) and whose `agent.routing === { default: 'primary' }`. Legacy fields are preserved on the returned config (the shim does not delete them).
10. **OT10 (SC10 — full legacy config including escalation.autoExecute):** Given `agent.backend = 'pi'` (this is the legacy main backend), `agent.localBackend = 'pi'`, `agent.localEndpoint = 'http://localhost:1234/v1'`, `agent.localModel = 'gemma-4-e4b'`, `agent.escalation.autoExecute = ['quick-fix','diagnostic']`, the shim shall produce `backends.primary = { type: 'pi', endpoint: <url>, model: 'gemma-4-e4b' }`, `backends.local = { type: 'pi', endpoint: <url>, model: 'gemma-4-e4b' }`, and `routing = { default: 'primary', 'quick-fix': 'local', diagnostic: 'local' }`.
11. **OT11 (SC11 — array `localModel` preserved):** Given `agent.localModel = ['a','b','c']` (Spec 1 array form) and `agent.localBackend = 'openai-compatible'`, the shim's `backends.local.model` is `['a','b','c']` (array, not string).
12. **OT12 (SC12 — exactly one warning, named fields, doc link):** When the shim runs against any legacy config, `result.warnings` contains exactly one string per deprecated field present, each naming the field by its dotted path (`agent.backend`, `agent.localBackend`, `agent.localEndpoint`, etc.) and including the substring `docs/guides/multi-backend-routing.md`. Total warnings: one per present legacy field, no duplicates. (Counting strategy clarified in Task 5; see Uncertainties.)
13. **OT13 (SC13 — both legacy and new: new wins, warn each ignored field):** Given both `agent.backend = 'claude'` AND `agent.backends = { cloud: { type: 'claude' } }`, the shim's `result.config` equals the input (no synthesis), and `result.warnings` includes a string per ignored legacy field naming each one (e.g., `'Ignoring agent.backend: agent.backends is set'`, etc.).
14. **OT14 (SC14 — no-op when `backends` already set, no legacy fields):** Given a config with `agent.backends` set and no legacy `agent.backend`/`agent.localBackend`/etc., `migrateAgentConfig` returns `{ config: input, warnings: [] }`. The returned `config` is reference-equal to the input.
15. **OT15 (SC15 — neither path: validation surfaces the gap):** When `BackendDefSchema` and `RoutingConfigSchema` are applied to a record in which `backends` and `routing` are both undefined, parse succeeds (both fields are optional in the standalone schemas). Phase 1's Zod surface does not enforce SC15 directly; SC15 is documented as a Phase 3 obligation (when `validateWorkflowConfig` consumes both the migration shim and the Zod schema together, "neither path set" is what raises). A test asserts this contract: `RoutingConfigSchema.optional().parse(undefined)` succeeds, with a comment cross-referencing the Phase 3 hookup.
16. **OT16 (mechanical):** `pnpm --filter @harness-engineering/types typecheck`, `pnpm --filter @harness-engineering/orchestrator typecheck`, `pnpm --filter @harness-engineering/orchestrator test -- config-migration`, `pnpm --filter @harness-engineering/orchestrator test -- workflow/schema`, and `harness validate` all pass at end of phase.

## Skill Recommendations

From `docs/changes/multi-backend-routing/SKILLS.md`:

- `ts-zod-integration` (apply) — central to Tasks 3 and 4 (BackendDefSchema, RoutingConfigSchema, superRefine).
- `ts-template-literal-types` (apply) — light use; the seven backend-type literal strings are kept consistent between TS interfaces and Zod literals.
- `ts-type-guards` (reference) — relevant in Task 5 (migration shim narrows the legacy `localBackend` union).
- `ts-testing-types` (reference) — relevant in Tasks 6 and 7 (typed test fixtures for both Zod parse and shim mappings).
- `gof-factory-method` (reference) — annotated against Task 5 conceptually (the shim is a factory for `BackendDef` from legacy fields), but no pattern-level refactor is required in Phase 1.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` — add `BackendDef` union (and the seven member interfaces), `RoutingConfig`, `NamedLocalModelStatus`; widen `AgentConfig` with optional `backends?` and `routing?`. Legacy fields untouched.
- MODIFY `packages/types/src/index.ts` — re-export `BackendDef`, `MockBackendDef`, `ClaudeBackendDef`, `AnthropicBackendDef`, `OpenAIBackendDef`, `GeminiBackendDef`, `LocalBackendDef`, `PiBackendDef`, `RoutingConfig`, `NamedLocalModelStatus`.
- CREATE `packages/orchestrator/src/workflow/schema.ts` — `BackendDefSchema` (discriminated union), `RoutingConfigSchema` (`.strict()`), and `validateBackendsAndRouting` (a `superRefine` helper exportable for both standalone testing and Phase 3 wiring into `validateWorkflowConfig`). Zod-only; no orchestrator runtime imports.
- CREATE `packages/orchestrator/tests/workflow/schema.test.ts` — unit tests for OT1–OT8 and OT15.
- CREATE `packages/orchestrator/src/agent/config-migration.ts` — `migrateAgentConfig(agent: AgentConfig): MigrationResult` plus `MigrationResult` interface. No imports from orchestrator runtime; types-only consumer.
- CREATE `packages/orchestrator/tests/agent/config-migration.test.ts` — unit tests for OT9–OT14.

No other files are touched in Phase 1. Notably **no** changes to:

- `packages/orchestrator/src/workflow/config.ts` (the existing hand-rolled `validateWorkflowConfig` is unchanged in Phase 1).
- `packages/orchestrator/src/orchestrator.ts` (no backend-instantiation or dispatch changes).
- `packages/orchestrator/src/agent/backends/*.ts` (no backend constructor changes).
- `packages/cli/src/config/schema.ts` (this file validates harness's own `harness.config.yaml`, not the orchestrator's `harness.orchestrator.md` workflow YAML; the spec's hint to put schemas there was incorrect — the orchestrator's workflow validation surface lives in the orchestrator package).

## Skeleton

1. Type widening in `@harness-engineering/types` and barrel export (~2 tasks, ~7 min)
2. Zod schemas — `BackendDefSchema`, `RoutingConfigSchema`, cross-field `superRefine` helper (~1 task, ~6 min)
3. Schema unit tests — OT1–OT8 + OT15 (~1 task, ~7 min)
4. Migration shim — `migrateAgentConfig` and `MigrationResult` (~1 task, ~6 min)
5. Migration shim unit tests — OT9–OT14 (~1 task, ~7 min)
6. Phase exit gate — typecheck, targeted tests, `harness validate` (~1 task, ~3 min)

**Estimated total:** 8 tasks, ~36 min. Skeleton inline (autopilot non-interactive); proceed to full expansion.

## Uncertainties

- **[ASSUMPTION]** **Schema location.** The spec text says "Zod schema (location: existing config-validation module, e.g. `packages/cli/src/config/schema.ts` — verify path at write time)". On verification, that path validates the harness CLI's own `harness.config.yaml`, not the orchestrator's `harness.orchestrator.md` workflow YAML. The orchestrator's workflow validator is hand-rolled in `packages/orchestrator/src/workflow/config.ts`. Phase 1 introduces a new file `packages/orchestrator/src/workflow/schema.ts` that exports the Zod schemas; Phase 3 will integrate them into `validateWorkflowConfig`. If wrong, only Task 3's file path needs updating; other tasks unchanged.
- **[ASSUMPTION]** **No-Zod integration in `validateWorkflowConfig` yet.** The existing hand-rolled validator stays intact; Phase 1's Zod schema is a standalone export consumed only by unit tests. SC15 ("must have at least one backend definition path") therefore is _not_ fully enforced end-to-end after Phase 1 — it requires Phase 3's wiring of the shim + schema into `validateWorkflowConfig`. OT15 documents this contract via a comment in the test file. If the autopilot expects SC15 to be live in Phase 1, escalate.
- **[ASSUMPTION]** **`AgentConfig.backends` and `AgentConfig.routing` are optional in TypeScript.** Per spec lines 152–155 ("`backends?: Record<string, BackendDef>`"). When both are undefined, the legacy fields drive the shim; when both are set, new wins; when one is set without the other, that's a config-validation error (raised in Phase 3, not here).
- **[ASSUMPTION]** **OT12 warning counting strategy.** The spec says "logs exactly one `warn`-level message at start-up referencing each deprecated field present" — singular _message_ but plural _referenced fields_. Phase 1 implements this as one warning string per legacy field present in `MigrationResult.warnings` (the array-of-strings shape; the orchestrator's logger collapses to a single `warn` call later in Phase 3). The doc-link substring is included in every warning string. Each warning is unique (no duplicates).
- **[ASSUMPTION]** **Synthesized `backends.primary.command` is undefined when `agent.command` is absent.** Spec Migration mapping table line 271 shows `agent.command` as optional input, and `ClaudeBackendDef.command` is `command?: string`. Test asserts the field is `undefined`, not `''` or omitted-via-delete. The TypeScript shape is `{ type: 'claude' }` literally (omitting `command` rather than setting it to `undefined`).
- **[ASSUMPTION]** **`agent.backend = 'pi'` is a legitimate legacy main-backend value.** Spec example SC10 uses it: "Given a legacy config with `backend: 'pi'`, `localBackend: 'pi'`...". This implies the legacy `backend` field accepts arbitrary string values today (orchestrator runtime selects on it). Phase 1's shim passes `agent.backend` through into `backends.primary.type` after mapping. Mapping per the spec's Migration mapping table:
  - `agent.backend === 'claude'` → `{ type: 'claude', ...(command && { command }) }`
  - `agent.backend === 'anthropic'` → `{ type: 'anthropic', model, ...(apiKey && { apiKey }) }`
  - `agent.backend === 'openai'` → `{ type: 'openai', model, ...(apiKey && { apiKey }) }`
  - `agent.backend === 'gemini'` → `{ type: 'gemini', model, ...(apiKey && { apiKey }) }`
  - `agent.backend === 'mock'` → `{ type: 'mock' }`
  - `agent.backend === 'pi'` → `{ type: 'pi', endpoint: <localEndpoint or throw>, model: <localModel or throw> }`. (Treated as a local-style backend in the synthesized `primary` slot — same shape used for `backends.local`. If `localEndpoint`/`localModel` are unset, the shim throws a descriptive error, since `pi` requires both.)
  - `agent.backend === 'local'` (if it ever appears) → analogous to `pi`. Spec lists `'local'` as a valid `BackendDef` type but not as a documented legacy `agent.backend` value; if encountered, shim handles it the same as `pi`.
  - Anything else → shim throws `Error('migrateAgentConfig: unknown legacy backend "<x>"')` so misconfigurations don't silently produce a malformed `backends.primary`.
- **[ASSUMPTION]** **`primary.apiKey` and `local.apiKey` flow through.** Per spec table lines 272–277, `apiKey` is preserved when present. When absent, the shim omits it from the synthesized object (does not set to `undefined`).
- **[ASSUMPTION]** **`escalation.primaryExecute` does not generate routing entries in the shim.** Spec D11 distinguishes escalation (whether) from routing (where), and spec D3 says only `escalation.autoExecute` translates to `routing.<tier>: local`. `primaryExecute`, `signalGated`, `alwaysHuman` are left to the existing escalation gate; the shim does not introduce `routing.<tier>: primary` entries for them (they default to `routing.default = 'primary'`).
- **[DEFERRABLE]** Whether `BackendDefSchema` and `RoutingConfigSchema` should be re-exported from the orchestrator package's public `index.ts`. Phase 3 needs internal access; external access is YAGNI. Phase 1 keeps them un-exported from the package barrel and imports them from a relative path in tests. Phase 3 can decide.

## Tasks

### Task 1: Add `BackendDef` union, `RoutingConfig`, `NamedLocalModelStatus` to orchestrator types

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`

**Skills:** `ts-template-literal-types` (apply)

1. Open `/Users/cwarner/Projects/iv/harness-engineering/packages/types/src/orchestrator.ts`. Locate the existing `AgentConfig` interface (currently around lines 293–350).
2. **Above** the `AgentConfig` interface (insert after the closing brace of `HooksConfig`, before the `AgentConfig` JSDoc), add the new backend definitions block:

   ```typescript
   // --- Backend Definitions (Spec 2: Multi-Backend Routing) ---

   /**
    * Discriminated union of all backend definitions, keyed by `type`.
    *
    * Used by `agent.backends` (a named map of definitions) and consumed by
    * `BackendRouter` and the backend-instantiation factory (Phase 2+).
    */
   export type BackendDef =
     | MockBackendDef
     | ClaudeBackendDef
     | AnthropicBackendDef
     | OpenAIBackendDef
     | GeminiBackendDef
     | LocalBackendDef
     | PiBackendDef;

   /** Mock backend (used in tests and dry runs). */
   export interface MockBackendDef {
     type: 'mock';
   }

   /** Claude CLI subprocess backend (subscription-based, no token billing). */
   export interface ClaudeBackendDef {
     type: 'claude';
     /** Override for the `claude` CLI binary path. */
     command?: string;
   }

   /** Anthropic API backend (token-billed). */
   export interface AnthropicBackendDef {
     type: 'anthropic';
     model: string;
     apiKey?: string;
   }

   /** OpenAI API backend (token-billed). */
   export interface OpenAIBackendDef {
     type: 'openai';
     model: string;
     apiKey?: string;
   }

   /** Google Gemini API backend (token-billed). */
   export interface GeminiBackendDef {
     type: 'gemini';
     model: string;
     apiKey?: string;
   }

   /** OpenAI-compatible local backend (LM Studio, Ollama, vLLM, etc.). */
   export interface LocalBackendDef {
     type: 'local';
     endpoint: string;
     /** Model name(s). Array form supports fallback resolution (Spec 1). */
     model: string | string[];
     apiKey?: string;
     /** Per-request timeout in ms. Default: 90_000. */
     timeoutMs?: number;
     /** Probe interval in ms for resolver. Default: 30_000. Minimum: 1_000. */
     probeIntervalMs?: number;
   }

   /** Pi-coding-agent backend pointing at a local OpenAI-compatible server. */
   export interface PiBackendDef {
     type: 'pi';
     endpoint: string;
     model: string | string[];
     apiKey?: string;
     /** Probe interval in ms for resolver. Default: 30_000. Minimum: 1_000. */
     probeIntervalMs?: number;
   }

   /**
    * Routing configuration mapping use cases to named backends.
    *
    * Required: `default`. Optional: per-tier overrides and intelligence-layer
    * overrides. Unknown keys are validation errors (`.strict()`).
    */
   export interface RoutingConfig {
     /** Backend name used when no specific rule matches. Required. */
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
   ```

3. **Inside** the existing `AgentConfig` interface, immediately after the existing `escalation?: Partial<EscalationConfig>;` line, add the two new optional fields:

   ```typescript
     /**
      * Named backend definitions (Spec 2). When set, the legacy
      * `backend` / `localBackend` / `localEndpoint` / `localModel` /
      * `localApiKey` / `localTimeoutMs` / `localProbeIntervalMs` fields
      * are ignored (with a deprecation warning). When unset, the
      * orchestrator synthesizes this map at startup from the legacy
      * fields via `migrateAgentConfig()`.
      */
     backends?: Record<string, BackendDef>;
     /**
      * Routing rules mapping use cases to backend names (Spec 2). Required
      * when `backends` is set. Synthesized by `migrateAgentConfig()` for
      * legacy configs.
      */
     routing?: RoutingConfig;
   ```

4. **Below** the existing `LocalModelStatus` interface (around current line 379), add `NamedLocalModelStatus`:

   ```typescript
   /**
    * Per-backend snapshot of local-model availability. Adds `backendName`
    * and `endpoint` to identify which local backend the status is for in
    * multi-local configurations (Spec 2).
    *
    * Returned by `GET /api/v1/local-models/status` and the SSE
    * `local-model:status` topic (payload widened in Phase 5).
    */
   export interface NamedLocalModelStatus extends LocalModelStatus {
     /** The key in `agent.backends` this status corresponds to. */
     backendName: string;
     /** The endpoint URL this backend probes. */
     endpoint: string;
   }
   ```

5. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/types typecheck
   ```
   Verify: 0 errors.
6. Commit:
   ```bash
   git add packages/types/src/orchestrator.ts
   git commit -m "feat(types): add BackendDef union, RoutingConfig, NamedLocalModelStatus"
   ```

### Task 2: Re-export new types from `@harness-engineering/types` barrel

**Depends on:** Task 1 | **Files:** `packages/types/src/index.ts`

**Skills:** none

1. Open `/Users/cwarner/Projects/iv/harness-engineering/packages/types/src/index.ts`. Locate the `// --- Orchestrator ---` block (currently lines 99–127).
2. Inside the existing `export type { ... } from './orchestrator';` list, append the new type names so the block ends like this (preserve existing entries; add the new ones below `LocalModelStatus`):

   ```typescript
   // --- Orchestrator ---
   export type {
     TokenUsage,
     BlockerRef,
     Issue,
     AgentErrorCategory,
     AgentError,
     SessionStartParams,
     AgentSession,
     TurnParams,
     AgentEvent,
     TurnResult,
     AgentBackend,
     IssueTrackerClient,
     TrackerConfig,
     PollingConfig,
     WorkspaceConfig,
     HooksConfig,
     AgentConfig,
     ServerConfig,
     WorkflowConfig,
     WorkflowDefinition,
     ScopeTier,
     ConcernSignal,
     RoutingDecision,
     EscalationConfig,
     IntelligenceConfig,
     LocalModelStatus,
     // --- Spec 2: Multi-Backend Routing ---
     BackendDef,
     MockBackendDef,
     ClaudeBackendDef,
     AnthropicBackendDef,
     OpenAIBackendDef,
     GeminiBackendDef,
     LocalBackendDef,
     PiBackendDef,
     RoutingConfig,
     NamedLocalModelStatus,
   } from './orchestrator';
   ```

3. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/types typecheck
   ```
   Verify: 0 errors. (This catches a typo in the export list against the source file.)
4. Run a downstream sanity check that the orchestrator package still compiles:
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify: 0 errors. (No orchestrator code uses the new types yet, so this is a no-op import surface check.)
5. Commit:
   ```bash
   git add packages/types/src/index.ts
   git commit -m "feat(types): re-export Spec 2 backend/routing types from barrel"
   ```

### Task 3: Implement Zod schemas — `BackendDefSchema`, `RoutingConfigSchema`, cross-field `superRefine`

**Depends on:** Tasks 1, 2 | **Files:** `packages/orchestrator/src/workflow/schema.ts` (NEW)

**Skills:** `ts-zod-integration` (apply), `ts-template-literal-types` (apply)

1. Create `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/workflow/schema.ts` with the following content:

   ```typescript
   import { z } from 'zod';
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

   /**
    * Zod schema for `BackendDef` (Spec 2 — multi-backend routing).
    *
    * Discriminated union on `type`. Per-variant validation surfaces shape
    * mismatches (missing `model`, missing `endpoint`, etc.) at config-load
    * time rather than at orchestrator runtime.
    *
    * Used in Phase 3 by `validateWorkflowConfig`; in Phase 1 it is exported
    * for standalone unit testing.
    */
   export const BackendDefSchema = z.discriminatedUnion('type', [
     z.object({ type: z.literal('mock') }).strict(),
     z
       .object({
         type: z.literal('claude'),
         command: z.string().optional(),
       })
       .strict(),
     z
       .object({
         type: z.literal('anthropic'),
         model: z.string().min(1),
         apiKey: z.string().optional(),
       })
       .strict(),
     z
       .object({
         type: z.literal('openai'),
         model: z.string().min(1),
         apiKey: z.string().optional(),
       })
       .strict(),
     z
       .object({
         type: z.literal('gemini'),
         model: z.string().min(1),
         apiKey: z.string().optional(),
       })
       .strict(),
     z
       .object({
         type: z.literal('local'),
         endpoint: z.string().url(),
         model: z.union([z.string().min(1), z.array(z.string().min(1)).nonempty()]),
         apiKey: z.string().optional(),
         timeoutMs: z.number().int().positive().optional(),
         probeIntervalMs: z.number().int().min(1000).optional(),
       })
       .strict(),
     z
       .object({
         type: z.literal('pi'),
         endpoint: z.string().url(),
         model: z.union([z.string().min(1), z.array(z.string().min(1)).nonempty()]),
         apiKey: z.string().optional(),
         probeIntervalMs: z.number().int().min(1000).optional(),
       })
       .strict(),
   ]);

   /**
    * Zod schema for `RoutingConfig`. `.strict()` rejects unknown keys at
    * every level (per Spec 2 D7: typos in routing keys are validation
    * errors, not silent default-fallthroughs).
    */
   export const RoutingConfigSchema = z
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
     .strict();

   /**
    * Cross-field validator: every value in `routing` must reference a key
    * that exists in `backends`. Run as a `superRefine` so the issue paths
    * land at the offending routing entry, not at the parent object.
    *
    * Phase 1 exposes this as a standalone helper. Phase 3 wires it into
    * the AgentConfig schema's `superRefine` block when Zod validation
    * replaces the hand-rolled `validateWorkflowConfig` checks.
    */
   export function validateBackendsAndRouting(
     backends: Record<string, BackendDef> | undefined,
     routing: RoutingConfig | undefined,
     ctx: z.RefinementCtx
   ): void {
     if (!backends || !routing) return;
     const names = new Set(Object.keys(backends));
     const checkRef = (path: (string | number)[], name: string | undefined): void => {
       if (name !== undefined && !names.has(name)) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['routing', ...path],
           message: `routing.${path.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
         });
       }
     };
     checkRef(['default'], routing.default);
     checkRef(['quick-fix'], routing['quick-fix']);
     checkRef(['guided-change'], routing['guided-change']);
     checkRef(['full-exploration'], routing['full-exploration']);
     checkRef(['diagnostic'], routing.diagnostic);
     checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
     checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
   }
   ```

2. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify: 0 errors.
3. Run `harness validate`:
   ```bash
   harness validate
   ```
   Verify: passes.
4. Commit:
   ```bash
   git add packages/orchestrator/src/workflow/schema.ts
   git commit -m "feat(orchestrator): add Zod schemas for backends and routing config"
   ```

### Task 4: Unit tests — Zod schemas (OT1–OT8 + OT15)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/workflow/schema.test.ts` (NEW)

**Skills:** `ts-testing-types` (reference), `ts-zod-integration` (apply)

1. Create `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/workflow/schema.test.ts` with the following content. Each test corresponds to one OT.

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { z } from 'zod';
   import {
     BackendDefSchema,
     RoutingConfigSchema,
     validateBackendsAndRouting,
   } from '../../src/workflow/schema';
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

   describe('BackendDefSchema', () => {
     it('OT1: accepts a valid claude backend', () => {
       const result = BackendDefSchema.safeParse({ type: 'claude', command: 'claude' });
       expect(result.success).toBe(true);
     });

     it('OT1: accepts a valid pi backend with array model', () => {
       const result = BackendDefSchema.safeParse({
         type: 'pi',
         endpoint: 'http://localhost:1234/v1',
         model: ['a', 'b'],
       });
       expect(result.success).toBe(true);
     });

     it('OT2: rejects pi backend missing endpoint and model', () => {
       const result = BackendDefSchema.safeParse({ type: 'pi' });
       expect(result.success).toBe(false);
       if (result.success) return;
       const paths = result.error.issues.map((i) => i.path.join('.'));
       expect(paths).toContain('endpoint');
       expect(paths).toContain('model');
     });

     it('OT3: rejects unknown discriminator value with valid types listed', () => {
       const result = BackendDefSchema.safeParse({ type: 'unknown' });
       expect(result.success).toBe(false);
       if (result.success) return;
       const issue = result.error.issues[0]!;
       expect(issue.code).toBe('invalid_union_discriminator');
       // Zod's invalid_union_discriminator includes the valid options:
       const message = JSON.stringify(issue);
       expect(message).toContain('mock');
       expect(message).toContain('claude');
       expect(message).toContain('anthropic');
       expect(message).toContain('openai');
       expect(message).toContain('gemini');
       expect(message).toContain('local');
       expect(message).toContain('pi');
     });

     it('OT8: rejects empty model array on local backend', () => {
       const result = BackendDefSchema.safeParse({
         type: 'local',
         endpoint: 'http://localhost:1234/v1',
         model: [],
       });
       expect(result.success).toBe(false);
       if (result.success) return;
       const codes = result.error.issues.map((i) => i.code);
       // The string|array union fails both branches; one of them is "too_small".
       expect(codes).toContain('too_small');
     });
   });

   describe('RoutingConfigSchema', () => {
     it('OT4: rejects routing without default', () => {
       const result = RoutingConfigSchema.safeParse({ 'quick-fix': 'local' });
       expect(result.success).toBe(false);
       if (result.success) return;
       const paths = result.error.issues.map((i) => i.path.join('.'));
       expect(paths).toContain('default');
     });

     it('OT6: rejects unknown top-level routing key (typo: quickfix)', () => {
       const result = RoutingConfigSchema.safeParse({
         default: 'cloud',
         quickfix: 'local',
       });
       expect(result.success).toBe(false);
       if (result.success) return;
       const codes = result.error.issues.map((i) => i.code);
       expect(codes).toContain('unrecognized_keys');
       const message = JSON.stringify(result.error.issues);
       expect(message).toContain('quickfix');
     });

     it('OT7: rejects unknown intelligence-layer key', () => {
       const result = RoutingConfigSchema.safeParse({
         default: 'cloud',
         intelligence: { foo: 'local' },
       });
       expect(result.success).toBe(false);
       if (result.success) return;
       const codes = result.error.issues.map((i) => i.code);
       expect(codes).toContain('unrecognized_keys');
       const message = JSON.stringify(result.error.issues);
       expect(message).toContain('foo');
     });

     it('OT15: schema is composable as optional (Phase 3 contract)', () => {
       // Phase 1 contract: RoutingConfigSchema is opt-in. SC15 ("must have
       // backends or legacy backend") is enforced in Phase 3 when the schema
       // is wired into validateWorkflowConfig. See plan Uncertainties.
       const result = RoutingConfigSchema.optional().safeParse(undefined);
       expect(result.success).toBe(true);
     });
   });

   describe('validateBackendsAndRouting (cross-field superRefine helper)', () => {
     // Helper: build a parent schema that runs validateBackendsAndRouting
     // and surfaces issues, mirroring what Phase 3 will do.
     const ParentSchema = z
       .object({
         backends: z.record(BackendDefSchema).optional(),
         routing: RoutingConfigSchema.optional(),
       })
       .superRefine((cfg, ctx) =>
         validateBackendsAndRouting(
           cfg.backends as Record<string, BackendDef> | undefined,
           cfg.routing,
           ctx
         )
       );

     it('OT5: cross-field error names missing backend and lists defined names', () => {
       const result = ParentSchema.safeParse({
         backends: { cloud: { type: 'claude' } },
         routing: { default: 'nonexistent' },
       });
       expect(result.success).toBe(false);
       if (result.success) return;
       const customIssue = result.error.issues.find((i) => i.code === 'custom');
       expect(customIssue).toBeDefined();
       expect(customIssue!.path).toEqual(['routing', 'default']);
       expect(customIssue!.message).toContain("'nonexistent'");
       expect(customIssue!.message).toContain('cloud');
     });

     it('OT5: cross-field validator passes when all routing values reference defined backends', () => {
       const result = ParentSchema.safeParse({
         backends: {
           cloud: { type: 'claude' },
           local: {
             type: 'pi',
             endpoint: 'http://localhost:1234/v1',
             model: ['a'],
           },
         },
         routing: {
           default: 'cloud',
           'quick-fix': 'local',
           intelligence: { sel: 'local' },
         },
       });
       expect(result.success).toBe(true);
     });

     it('cross-field validator runs only when both backends and routing are present', () => {
       // No backends: cross-field is a no-op.
       const a = ParentSchema.safeParse({ routing: { default: 'cloud' } });
       expect(a.success).toBe(true);
       // No routing: cross-field is a no-op.
       const b = ParentSchema.safeParse({
         backends: { cloud: { type: 'claude' } },
       });
       expect(b.success).toBe(true);
     });
   });
   ```

2. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- workflow/schema
   ```
   Verify: all tests in this file pass. Expected: ~12 tests, all green.
3. Run typecheck on the orchestrator package:
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify: 0 errors.
4. Commit:
   ```bash
   git add packages/orchestrator/tests/workflow/schema.test.ts
   git commit -m "test(orchestrator): cover BackendDefSchema and RoutingConfigSchema (Spec 2 SC1-SC8, SC15)"
   ```

### Task 5: Implement `migrateAgentConfig()` shim

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/config-migration.ts` (NEW)

**Skills:** `ts-type-guards` (reference), `gof-factory-method` (reference)

1. Create `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/src/agent/config-migration.ts` with the following content:

   ```typescript
   import type {
     AgentConfig,
     BackendDef,
     ClaudeBackendDef,
     AnthropicBackendDef,
     OpenAIBackendDef,
     GeminiBackendDef,
     MockBackendDef,
     LocalBackendDef,
     PiBackendDef,
     RoutingConfig,
     ScopeTier,
   } from '@harness-engineering/types';

   /**
    * Result of running `migrateAgentConfig`.
    *
    * `config` is the *effective* AgentConfig — either the input unchanged
    * (when `agent.backends` is already set or no migration is needed) or
    * the input augmented with synthesized `backends` and `routing` fields.
    *
    * `warnings` is a list of human-readable deprecation messages, one per
    * legacy field encountered. Each message names the deprecated field
    * (dotted path) and includes a pointer to the migration guide. The
    * orchestrator emits these as `warn`-level log entries at startup.
    */
   export interface MigrationResult {
     config: AgentConfig;
     warnings: string[];
   }

   const MIGRATION_GUIDE = 'docs/guides/multi-backend-routing.md';

   /**
    * Translate legacy `agent.backend` / `agent.localBackend` /
    * `agent.escalation.autoExecute` into the new `agent.backends` +
    * `agent.routing` shape (Spec 2 D3, D4, D8, D11).
    *
    * Behavior matrix:
    * - `agent.backends` already set, no legacy fields:
    *     no-op; returns input config unchanged, warnings = [].
    * - `agent.backends` already set + at least one legacy field:
    *     no-op on config; warnings name each ignored legacy field (D4).
    * - No `agent.backends`, at least one of `agent.backend` /
    *   `agent.localBackend` / `agent.localEndpoint` / etc. set:
    *     synthesize `backends.primary` (always, from `agent.backend`)
    *     and `backends.local` (when `localBackend` is set), plus a
    *     `routing` map driven by `escalation.autoExecute` (D3).
    * - No `agent.backends`, no legacy fields:
    *     no-op; the caller's downstream Zod validation surfaces the gap
    *     as a missing-required-field error.
    *
    * Throws on internal inconsistencies (e.g., `agent.backend = 'pi'`
    * with no `localEndpoint`/`localModel`) — these are user-config bugs
    * that would have produced a runtime crash today.
    */
   export function migrateAgentConfig(agent: AgentConfig): MigrationResult {
     const warnings: string[] = [];

     // Identify which legacy fields are present (dotted paths).
     const legacyFields: Array<{ path: string; present: boolean }> = [
       { path: 'agent.backend', present: agent.backend !== undefined && agent.backend !== '' },
       { path: 'agent.command', present: agent.command !== undefined },
       { path: 'agent.model', present: agent.model !== undefined },
       { path: 'agent.apiKey', present: agent.apiKey !== undefined },
       { path: 'agent.localBackend', present: agent.localBackend !== undefined },
       { path: 'agent.localEndpoint', present: agent.localEndpoint !== undefined },
       { path: 'agent.localModel', present: agent.localModel !== undefined },
       { path: 'agent.localApiKey', present: agent.localApiKey !== undefined },
       { path: 'agent.localTimeoutMs', present: agent.localTimeoutMs !== undefined },
       { path: 'agent.localProbeIntervalMs', present: agent.localProbeIntervalMs !== undefined },
     ];
     const presentLegacy = legacyFields.filter((f) => f.present).map((f) => f.path);

     // Case 1: `agent.backends` already set — new schema wins.
     if (agent.backends !== undefined) {
       for (const path of presentLegacy) {
         warnings.push(
           `Ignoring legacy field '${path}': 'agent.backends' is set and takes precedence. See ${MIGRATION_GUIDE}.`
         );
       }
       return { config: agent, warnings };
     }

     // Case 2: No `agent.backends` and no legacy fields — caller's downstream
     // validation (Phase 3) surfaces the gap. Phase 1 is a no-op.
     if (presentLegacy.length === 0) {
       return { config: agent, warnings };
     }

     // Case 3: synthesize backends and routing from legacy fields.
     const backends: Record<string, BackendDef> = {};
     const routing: RoutingConfig = { default: 'primary' };

     // Synthesize `backends.primary` from `agent.backend`.
     backends.primary = synthesizePrimary(agent);

     // Synthesize `backends.local` from `agent.localBackend` (if set).
     if (agent.localBackend !== undefined) {
       backends.local = synthesizeLocal(agent);
     }

     // Translate `escalation.autoExecute` into routing entries.
     const autoExec: ScopeTier[] = agent.escalation?.autoExecute ?? [];
     if (backends.local !== undefined) {
       for (const tier of autoExec) {
         routing[tier] = 'local';
       }
     }

     // One warning per legacy field present, naming the field and the
     // guide. The orchestrator's logger collapses these into a single
     // `warn` call (Phase 3 wiring).
     for (const path of presentLegacy) {
       warnings.push(
         `Deprecated config field '${path}' is in use. Migrate to 'agent.backends' / 'agent.routing'. See ${MIGRATION_GUIDE}.`
       );
     }

     return {
       config: {
         ...agent,
         backends,
         routing,
       },
       warnings,
     };
   }

   function synthesizePrimary(agent: AgentConfig): BackendDef {
     const backend = agent.backend;
     switch (backend) {
       case 'mock':
         return { type: 'mock' } satisfies MockBackendDef;
       case 'claude': {
         const def: ClaudeBackendDef = { type: 'claude' };
         if (agent.command !== undefined) def.command = agent.command;
         return def;
       }
       case 'anthropic': {
         if (agent.model === undefined) {
           throw new Error("migrateAgentConfig: agent.backend='anthropic' requires agent.model");
         }
         const def: AnthropicBackendDef = { type: 'anthropic', model: agent.model };
         if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
         return def;
       }
       case 'openai': {
         if (agent.model === undefined) {
           throw new Error("migrateAgentConfig: agent.backend='openai' requires agent.model");
         }
         const def: OpenAIBackendDef = { type: 'openai', model: agent.model };
         if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
         return def;
       }
       case 'gemini': {
         if (agent.model === undefined) {
           throw new Error("migrateAgentConfig: agent.backend='gemini' requires agent.model");
         }
         const def: GeminiBackendDef = { type: 'gemini', model: agent.model };
         if (agent.apiKey !== undefined) def.apiKey = agent.apiKey;
         return def;
       }
       case 'local': {
         // Treated identically to 'pi' for synthesis; uses the localEndpoint /
         // localModel as the connection details.
         if (agent.localEndpoint === undefined || agent.localModel === undefined) {
           throw new Error(
             "migrateAgentConfig: agent.backend='local' requires agent.localEndpoint and agent.localModel"
           );
         }
         const def: LocalBackendDef = {
           type: 'local',
           endpoint: agent.localEndpoint,
           model: agent.localModel,
         };
         if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
         if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
         if (agent.localProbeIntervalMs !== undefined)
           def.probeIntervalMs = agent.localProbeIntervalMs;
         return def;
       }
       case 'pi': {
         if (agent.localEndpoint === undefined || agent.localModel === undefined) {
           throw new Error(
             "migrateAgentConfig: agent.backend='pi' requires agent.localEndpoint and agent.localModel"
           );
         }
         const def: PiBackendDef = {
           type: 'pi',
           endpoint: agent.localEndpoint,
           model: agent.localModel,
         };
         if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
         if (agent.localProbeIntervalMs !== undefined)
           def.probeIntervalMs = agent.localProbeIntervalMs;
         return def;
       }
       default:
         throw new Error(
           `migrateAgentConfig: unknown legacy backend '${String(backend)}'. Expected one of: mock, claude, anthropic, openai, gemini, local, pi.`
         );
     }
   }

   function synthesizeLocal(agent: AgentConfig): BackendDef {
     if (agent.localBackend === undefined) {
       throw new Error('synthesizeLocal called without agent.localBackend');
     }
     if (agent.localEndpoint === undefined || agent.localModel === undefined) {
       throw new Error(
         'migrateAgentConfig: agent.localBackend requires agent.localEndpoint and agent.localModel'
       );
     }
     if (agent.localBackend === 'pi') {
       const def: PiBackendDef = {
         type: 'pi',
         endpoint: agent.localEndpoint,
         model: agent.localModel,
       };
       if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
       if (agent.localProbeIntervalMs !== undefined)
         def.probeIntervalMs = agent.localProbeIntervalMs;
       return def;
     }
     // 'openai-compatible'
     const def: LocalBackendDef = {
       type: 'local',
       endpoint: agent.localEndpoint,
       model: agent.localModel,
     };
     if (agent.localApiKey !== undefined) def.apiKey = agent.localApiKey;
     if (agent.localTimeoutMs !== undefined) def.timeoutMs = agent.localTimeoutMs;
     if (agent.localProbeIntervalMs !== undefined) def.probeIntervalMs = agent.localProbeIntervalMs;
     return def;
   }
   ```

2. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify: 0 errors.
3. Run `harness validate`:
   ```bash
   harness validate
   ```
   Verify: passes.
4. Commit:
   ```bash
   git add packages/orchestrator/src/agent/config-migration.ts
   git commit -m "feat(orchestrator): add migrateAgentConfig shim for legacy backend fields"
   ```

### Task 6: Unit tests — `migrateAgentConfig` (OT9–OT14)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/tests/agent/config-migration.test.ts` (NEW)

**Skills:** `ts-testing-types` (reference)

1. Create `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/config-migration.test.ts` with the following content:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { migrateAgentConfig } from '../../src/agent/config-migration';
   import type { AgentConfig } from '@harness-engineering/types';

   /**
    * Build a minimal AgentConfig with only the fields a test cares about.
    * Required fields on AgentConfig that the shim does not touch are filled
    * with placeholder values.
    */
   function makeAgentConfig(overrides: Partial<AgentConfig>): AgentConfig {
     return {
       backend: 'mock',
       maxConcurrentAgents: 1,
       maxTurns: 10,
       maxRetryBackoffMs: 5000,
       maxRetries: 5,
       maxConcurrentAgentsByState: {},
       turnTimeoutMs: 300000,
       readTimeoutMs: 30000,
       stallTimeoutMs: 60000,
       ...overrides,
     };
   }

   describe('migrateAgentConfig', () => {
     describe('OT9 — minimal legacy config (backend only)', () => {
       it('produces backends.primary and routing.default for `claude`', () => {
         const input = makeAgentConfig({ backend: 'claude' });
         const result = migrateAgentConfig(input);
         expect(result.config.backends).toEqual({ primary: { type: 'claude' } });
         expect(result.config.routing).toEqual({ default: 'primary' });
         // Primary has no `command` because input.command is undefined.
         expect(result.config.backends!.primary).not.toHaveProperty('command');
       });

       it('preserves legacy fields on the returned config', () => {
         const input = makeAgentConfig({ backend: 'claude' });
         const result = migrateAgentConfig(input);
         expect(result.config.backend).toBe('claude');
       });

       it('passes agent.command into backends.primary.command for type claude', () => {
         const input = makeAgentConfig({ backend: 'claude', command: '/usr/local/bin/claude' });
         const result = migrateAgentConfig(input);
         expect(result.config.backends).toEqual({
           primary: { type: 'claude', command: '/usr/local/bin/claude' },
         });
       });

       it('synthesizes anthropic primary with model + apiKey', () => {
         const input = makeAgentConfig({
           backend: 'anthropic',
           model: 'claude-sonnet-4',
           apiKey: 'sk-ant-xxx',
         });
         const result = migrateAgentConfig(input);
         expect(result.config.backends).toEqual({
           primary: { type: 'anthropic', model: 'claude-sonnet-4', apiKey: 'sk-ant-xxx' },
         });
       });

       it('synthesizes mock primary with no extra fields', () => {
         const input = makeAgentConfig({ backend: 'mock' });
         const result = migrateAgentConfig(input);
         expect(result.config.backends).toEqual({ primary: { type: 'mock' } });
       });
     });

     describe('OT10 — full legacy config with autoExecute', () => {
       it('produces primary + local + routing entries from autoExecute tiers', () => {
         const input = makeAgentConfig({
           backend: 'pi',
           localBackend: 'pi',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: 'gemma-4-e4b',
           escalation: {
             autoExecute: ['quick-fix', 'diagnostic'],
             alwaysHuman: ['full-exploration'],
             primaryExecute: [],
             signalGated: ['guided-change'],
             diagnosticRetryBudget: 1,
           },
         });
         const result = migrateAgentConfig(input);
         expect(result.config.backends).toEqual({
           primary: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'gemma-4-e4b' },
           local: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'gemma-4-e4b' },
         });
         expect(result.config.routing).toEqual({
           default: 'primary',
           'quick-fix': 'local',
           diagnostic: 'local',
         });
       });

       it('does not generate routing entries for primaryExecute, signalGated, or alwaysHuman', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           localBackend: 'pi',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: 'a',
           escalation: {
             autoExecute: [],
             alwaysHuman: ['full-exploration'],
             primaryExecute: ['guided-change'],
             signalGated: ['quick-fix'],
             diagnosticRetryBudget: 1,
           },
         });
         const result = migrateAgentConfig(input);
         expect(result.config.routing).toEqual({ default: 'primary' });
       });
     });

     describe('OT11 — array localModel preserved', () => {
       it('preserves an array localModel on backends.local.model', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           localBackend: 'openai-compatible',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: ['a', 'b', 'c'],
         });
         const result = migrateAgentConfig(input);
         expect(result.config.backends!.local).toEqual({
           type: 'local',
           endpoint: 'http://localhost:1234/v1',
           model: ['a', 'b', 'c'],
         });
       });
     });

     describe('OT12 — warnings: one per legacy field, doc link present', () => {
       it('emits one warning per present legacy field', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           command: 'claude',
           localBackend: 'pi',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: 'a',
           localProbeIntervalMs: 5000,
         });
         const result = migrateAgentConfig(input);
         // Expected fields: agent.backend, agent.command, agent.localBackend,
         // agent.localEndpoint, agent.localModel, agent.localProbeIntervalMs
         expect(result.warnings.length).toBe(6);
         for (const w of result.warnings) {
           expect(w).toContain('docs/guides/multi-backend-routing.md');
         }
         const joined = result.warnings.join('\n');
         expect(joined).toContain('agent.backend');
         expect(joined).toContain('agent.command');
         expect(joined).toContain('agent.localBackend');
         expect(joined).toContain('agent.localEndpoint');
         expect(joined).toContain('agent.localModel');
         expect(joined).toContain('agent.localProbeIntervalMs');
       });

       it('warnings are unique (no duplicates)', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           localBackend: 'pi',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: 'a',
         });
         const result = migrateAgentConfig(input);
         const unique = new Set(result.warnings);
         expect(unique.size).toBe(result.warnings.length);
       });
     });

     describe('OT13 — both legacy and new: new wins, warn each ignored', () => {
       it('returns input config unchanged and warns naming each ignored legacy field', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           localBackend: 'pi',
           localEndpoint: 'http://localhost:1234/v1',
           localModel: 'a',
           backends: {
             cloud: { type: 'claude' },
             local: { type: 'pi', endpoint: 'http://localhost:1234/v1', model: 'a' },
           },
           routing: { default: 'cloud' },
         });
         const result = migrateAgentConfig(input);
         // Config returned unchanged.
         expect(result.config).toBe(input);
         expect(result.config.backends).toEqual(input.backends);
         expect(result.config.routing).toEqual(input.routing);
         // Warnings name each ignored legacy field.
         const joined = result.warnings.join('\n');
         expect(joined).toContain('agent.backend');
         expect(joined).toContain('agent.localBackend');
         expect(joined).toContain('agent.localEndpoint');
         expect(joined).toContain('agent.localModel');
         expect(joined).toContain('agent.backends');
         expect(joined).toContain('precedence');
       });
     });

     describe('OT14 — no-op when only `backends` is set', () => {
       it('returns input reference-equal with no warnings', () => {
         // Build a config where the only present legacy field is `agent.backend`,
         // which the helper sets to a placeholder value. Override it to '' so
         // the legacy detector skips it.
         const input: AgentConfig = {
           ...makeAgentConfig({}),
           backend: '',
           backends: { cloud: { type: 'claude' } },
           routing: { default: 'cloud' },
         };
         const result = migrateAgentConfig(input);
         expect(result.config).toBe(input);
         expect(result.warnings).toEqual([]);
       });
     });

     describe('Edge cases — error paths', () => {
       it('throws when agent.backend is unknown', () => {
         const input = makeAgentConfig({ backend: 'martian' });
         expect(() => migrateAgentConfig(input)).toThrow(/unknown legacy backend/);
       });

       it('throws when agent.backend=anthropic but no model', () => {
         const input = makeAgentConfig({ backend: 'anthropic' });
         expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.model/);
       });

       it('throws when agent.backend=pi but no localEndpoint', () => {
         const input = makeAgentConfig({ backend: 'pi', localModel: 'a' });
         expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.localEndpoint/);
       });

       it('throws when agent.localBackend set but localEndpoint missing', () => {
         const input = makeAgentConfig({
           backend: 'claude',
           localBackend: 'pi',
           localModel: 'a',
         });
         expect(() => migrateAgentConfig(input)).toThrow(/requires agent\.localEndpoint/);
       });
     });

     describe('No-op when neither path is set', () => {
       it('returns input config with empty warnings when there are no legacy fields and no backends', () => {
         const input: AgentConfig = { ...makeAgentConfig({}), backend: '' };
         const result = migrateAgentConfig(input);
         expect(result.config).toBe(input);
         expect(result.warnings).toEqual([]);
       });
     });
   });
   ```

2. Save. From the repo root, run:
   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- config-migration
   ```
   Verify: all tests pass. Expected: ~17 tests, all green.
3. Run typecheck:
   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify: 0 errors.
4. Commit:
   ```bash
   git add packages/orchestrator/tests/agent/config-migration.test.ts
   git commit -m "test(orchestrator): cover migrateAgentConfig (Spec 2 SC9-SC14)"
   ```

### Task 7: Spec-coverage cross-check — confirm SC1–SC15 trace to tests

**Depends on:** Tasks 4, 6 | **Files:** none modified (review-only)

**Skills:** none

[checkpoint:human-verify]

This is a review checkpoint to ensure every Spec 2 success criterion (SC1–SC15) maps to at least one test in the new files. The agent reads the test files and reports the trace; the human confirms before the phase exit gate.

1. Read `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/workflow/schema.test.ts` and `/Users/cwarner/Projects/iv/harness-engineering/packages/orchestrator/tests/agent/config-migration.test.ts`.
2. Print a trace table mapping each SC to the test name(s) covering it:

   | Spec 2 SC | Test file      | Test name                                                                     |
   | --------- | -------------- | ----------------------------------------------------------------------------- |
   | SC1       | schema.test.ts | OT1 (claude) + OT1 (pi with array model)                                      |
   | SC2       | schema.test.ts | OT2: rejects pi backend missing endpoint and model                            |
   | SC3       | schema.test.ts | OT3: rejects unknown discriminator value                                      |
   | SC4       | schema.test.ts | OT4: rejects routing without default                                          |
   | SC5       | schema.test.ts | OT5: cross-field error names missing backend                                  |
   | SC6       | schema.test.ts | OT6: rejects unknown top-level routing key (typo: quickfix)                   |
   | SC7       | schema.test.ts | OT7: rejects unknown intelligence-layer key                                   |
   | SC8       | schema.test.ts | OT8: rejects empty model array on local backend                               |
   | SC9       | migration.test | OT9 (claude only) + (anthropic) + (mock)                                      |
   | SC10      | migration.test | OT10: produces primary + local + routing entries from autoExecute             |
   | SC11      | migration.test | OT11: preserves array localModel on backends.local.model                      |
   | SC12      | migration.test | OT12: emits one warning per present legacy field + warnings unique            |
   | SC13      | migration.test | OT13: returns input unchanged and warns naming each ignored legacy field      |
   | SC14      | migration.test | OT14: returns input reference-equal with no warnings                          |
   | SC15      | schema.test.ts | OT15: schema is composable as optional (Phase 3 contract; comment cross-refs) |

3. Confirm: every SC has at least one test entry. Pause for human confirmation that the trace is complete and SC15's Phase 3 deferral is acceptable.

   If approved, proceed to Task 8. If not approved, return to Task 4 or Task 6 to add the missing coverage.

### Task 8: Phase 1 exit gate — typecheck, targeted tests, harness validate

**Depends on:** Task 7 | **Files:** none modified

**Skills:** none

1. Run typecheck on every touched package:
   ```bash
   pnpm --filter @harness-engineering/types typecheck
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Verify both: 0 errors.
2. Run the new test files:
   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- config-migration
   pnpm --filter @harness-engineering/orchestrator test -- workflow/schema
   ```
   Verify all green.
3. Run the existing orchestrator test suite to confirm Phase 1 introduced no regressions:
   ```bash
   pnpm --filter @harness-engineering/orchestrator test
   ```
   Verify all green. (Should be unchanged from pre-Phase-1 since no production code outside the new files was modified, and the new types are additive.)
4. Run `harness validate` and `harness check-deps`:
   ```bash
   harness validate
   harness check-deps
   ```
   Verify both pass.
5. Commit (message-only commit closes Phase 1; no file changes):

   ```bash
   git commit --allow-empty -m "chore(spec2): Phase 1 exit gate green (types, schema, migration shim)"
   ```

   Phase 1 complete. The handoff to Phase 2 (Router + backend factory) is in `.harness/sessions/changes--multi-backend-routing--proposal/handoff.json`.

---

## Soundness Review (P1–P7)

Soundness review of the draft plan, run inline before writing the handoff:

- **P1 — Coverage:** Every Phase 1 success criterion (SC1–SC15) traces to a task and test. SC15 is documented as a Phase 3 obligation with a Phase 1 contract test (OT15). Pass.
- **P2 — Atomic tasks:** Each task touches 1–2 files (Task 1 modifies one file; Task 2 modifies one file; Task 3 creates one file; Task 4 creates one test file; Task 5 creates one file; Task 6 creates one test file; Task 7 is review-only; Task 8 is the exit gate). Each fits in 3–8 minutes of focused work — well under one context window. Pass.
- **P3 — TDD discipline:** Tasks 4 and 6 are dedicated test tasks following Tasks 3 and 5 respectively. Strict TDD (test-before-implementation) was relaxed to test-immediately-after because (a) the schema and shim are pure, deterministic, and read-only against well-defined types, and (b) the test files are large enough to warrant their own atomic commit. Each test task is a separate atomic commit. Acceptable per harness-planning gates: every code-producing task is followed by a test task before the next code task. Pass.
- **P4 — File map completeness:** Six files touched (2 modify, 4 create). All listed in File Map. No surprise files. Pass.
- **P5 — Dependencies:** Task 1 → Task 2 (barrel) → Task 3 (schema imports types from barrel) → Task 4 (tests imports schema). Independent: Task 5 (shim) only depends on Task 2 (barrel) — could parallelize with Task 3 if needed, kept sequential for simplicity. Task 6 depends on Task 5. Task 7 depends on both test tasks. Task 8 is the gate. No cycles. Pass.
- **P6 — Uncertainties addressed:** Eight uncertainties listed, all classified (assumption or deferrable). The most consequential — schema location and SC15 deferral — are explicitly addressed in the plan body and in OT15's test comment. No blocking uncertainties. Pass.
- **P7 — Integration tier alignment:** Phase 1 is foundation-only (no entry points changed, no registrations required, no docs/ADRs/knowledge in scope, no orchestrator runtime behavior modified). Tier = `small`. Pass.

Convergence: no remaining issues. Plan is cleared for handoff.

---

## Phase Exit Criteria

- All 8 tasks committed in order.
- `pnpm --filter @harness-engineering/types typecheck` passes.
- `pnpm --filter @harness-engineering/orchestrator typecheck` passes.
- `pnpm --filter @harness-engineering/orchestrator test` passes (no regressions; new tests green).
- `harness validate` passes.
- `harness check-deps` passes.
- Spec 2 SC1–SC14 are green; SC15 has a contract test deferred to Phase 3.

---

## Notes for the Executor

- Phase 1 is purely additive in `@harness-engineering/types`. Existing consumers (everything that currently imports `AgentConfig`) keep compiling because `backends?` and `routing?` are optional.
- Phase 1 introduces zero runtime behavior changes. The migration shim is pure; the Zod schemas are not yet consumed by `validateWorkflowConfig`. Phase 3 wires them in.
- The "spec hint" pointing at `packages/cli/src/config/schema.ts` for the Zod schema location is incorrect — that file validates harness CLI config. The orchestrator's workflow validator lives in `packages/orchestrator/src/workflow/config.ts`. Phase 1 places the new Zod schema alongside it at `packages/orchestrator/src/workflow/schema.ts`. Phase 3 integrates the two.
- The migration shim's behavior on `agent.backend = 'pi'` (treated as a local-style backend in the synthesized `primary` slot) is a defensible read of the spec but not explicitly stated. If review surfaces a different intent, only `synthesizePrimary`'s `'pi'` and `'local'` branches need adjustment; tests update accordingly.
