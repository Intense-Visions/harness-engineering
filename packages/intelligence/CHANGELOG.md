# @harness-engineering/intelligence

## 0.3.1

### Patch Changes

- Updated dependencies [8e8e7c1]
  - @harness-engineering/types@0.16.1
  - @harness-engineering/graph@0.11.1

## 0.3.0

### Minor Changes

- 9bbf0a3: Add `createCanaryAdapter` — a total, gracefully-degrading boundary around the deterministic `canary` test CLI (`canary-test-cli`, declared as an optionalDependency). Exposes `probe()` (availability with a full degrade matrix: not-installed / binary-missing / exec-failed / bad-output), `recommendFramework(prompt)` (→ `canary recommend --json`), and `reviewTest(path, framework?)` (→ `canary review-test --json`), all zod-validated and never throwing on a missing or misbehaving CLI. The exec seam is injectable (`CanaryExec`) for testing. Phase 1 of the canary-test-integration spec; skill wiring and docs follow in later phases.
- f5ec94d: Add `harness:outcome-eval` — an LLM-judgment skill that produces a structured, confidence-rated verdict on whether an implementation satisfied its spec.
  - New `packages/intelligence/src/outcome-eval/` module: `OutcomeEvaluator` (mirrors `PeslSimulator`), a `.strict()` `verdictSchema`, a fence-aware spec-section resolver (Success Criteria → user-visible-behavior → Overview), a conservative-confidence prompt, and the false-positive-critical `deriveAuthority` mapping — authority is always derived in TypeScript and never read from the LLM. `evaluate()` is degrade-safe: provider/parse/missing-spec failures resolve to INCONCLUSIVE/advisory and never throw at the blocking gate.
  - Each `evaluate()` persists exactly one `execution_outcome` node via `ExecutionOutcomeConnector` (additive, backward-compatible `metadata` pass-through), consumable by the effectiveness scorer.
  - New `outcome_eval` MCP tool (`@harness-engineering/cli`) makes the skill genuinely invocable, constructing a real `AnalysisProvider` + `GraphStore` and returning the TS-derived verdict.
  - Wired into the orchestrator as step 6.5 (between Code Review and Ship): a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. ADRs 0037 (tiered confidence→authority) and 0038 (execution_outcome provenance) document the decisions.

## 0.2.7

### Patch Changes

- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [318b878]
- Updated dependencies [aaefe1b]
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0

## 0.2.6

### Patch Changes

- Updated dependencies [d1c9bda]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/types@0.15.0

## 0.2.5

### Patch Changes

- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/types@0.14.0

## 0.2.4

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0

## 0.2.3

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0

## 0.2.2

### Patch Changes

- Updated dependencies [bb7658b]
  - @harness-engineering/graph@0.9.0

## 0.2.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0

## 0.2.0

### Minor Changes

- 8825aee: Multi-backend routing (Spec 2)

  The orchestrator now accepts a named `agent.backends` map and a per-use-case `agent.routing` map, replacing the single `agent.backend` / `agent.localBackend` pair. Routable use cases: `default`, four scope tiers (`quick-fix`, `guided-change`, `full-exploration`, `diagnostic`), and two intelligence layers (`intelligence.sel`, `intelligence.pesl`). Multi-local configurations are supported with one `LocalModelResolver` per backend. A single-runner dispatch path replaces the dual-runner split.
  - **`@harness-engineering/types`** — `BackendDef` union (`local` | `pi` | external types), `RoutingConfig`, `NamedLocalModelStatus`.
  - **`@harness-engineering/orchestrator`** — `BackendDefSchema` and `RoutingConfigSchema` (Zod); `migrateAgentConfig` shim for legacy `agent.backend` / `agent.localBackend` (warn-once at startup); `createBackend` factory; `BackendRouter` (use-case → backend resolution with intelligence-layer fallback); `AnalysisProviderFactory` (routed `BackendDef` → `AnalysisProvider`, distinct PESL provider); `OrchestratorBackendFactory` wrapping router + factory + container; `validateWorkflowConfig` SC15 enforcement; `Map<name, LocalModelResolver>` with per-resolver `NamedLocalModelStatus` broadcast; `GET /api/v1/local-models/status` array endpoint (singular `/local-model/status` retained as deprecated alias); `PiBackend` `timeoutMs` plumbed via `AbortController`.
  - **`@harness-engineering/intelligence`** — `IntelligencePipeline` accepts a distinct `peslProvider` so the SEL and PESL layers can resolve to different backends.
  - **`@harness-engineering/dashboard`** — `useLocalModelStatuses` (renamed from singular) consumes `/api/v1/local-models/status` and merges `NamedLocalModelStatus[]` by `backendName`; the Orchestrator page renders one `LocalModelBanner` per unhealthy backend.

  **Deprecation:** `agent.backend` and `agent.localBackend` continue to work via the migration shim, which synthesizes `agent.backends.primary` / `agent.backends.local` plus a `routing` map mirroring `escalation.autoExecute`. Hard removal lands in a follow-up release per ADR 0005.

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/types@0.11.0

## 0.1.5

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1

## 0.1.4

### Patch Changes

- Updated dependencies [3bfe4e4]
  - @harness-engineering/graph@0.7.0

## 0.1.3

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0

## 0.1.2

### Patch Changes

- f62d6ab: Resolve architecture complexity violations and release readiness audit fixes
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/types@0.10.1

## 0.1.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @harness-engineering/types@0.10.0
