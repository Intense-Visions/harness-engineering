# Plan: Phase 4 — `LocalModelResolver` Pool-State Integration

**Date:** 2026-07-07 | **Spec:** `docs/changes/local-model-lifecycle-manager/proposal.md` (§Phase 4, §Soundness Reconciliation 2026-07-07) | **Tasks:** 7 | **Time:** ~28 min | **Integration Tier:** medium

## Goal

When `localModels.enabled = true`, the orchestrator's per-backend `LocalModelResolver` derives its candidate list from LMLM pool state (entries ordered by `currentScore` desc → `ollamaName`) instead of the static `agent.backends.<name>.model` list; when `enabled = false` (default), resolver behavior is byte-identical to today.

## Authoritative context (from spec §Soundness Reconciliation 2026-07-07)

- **The Phase 4 seam does not exist yet.** There is no workspace-dependency edge from `packages/orchestrator` to `@harness-engineering/local-models`, and no `PoolStateProvider` interface. Verified 2026-07-07: `grep local-models packages/orchestrator/package.json` → no matches. The seam is built first, before resolver wiring.
- **D5 is additive.** The existing resolver probe loop, status surface, and named-backends map are reused unchanged.

## Uncertainties (resolved)

- [RESOLVED] **Where is the resolver constructed?** Not in either factory. `LocalModelResolver` instances are built in `packages/orchestrator/src/orchestrator.ts:420-431` (constructor loop over `agent.backends`), one per `local`/`pi` backend. The `poolState` provider is injected there. `analysis-provider-factory.ts` (reads `resolver.getStatus()`) and `orchestrator-backend-factory.ts` (calls `resolver.resolveModel()` via `getResolverModelFor`) consume the resolver through stable interfaces and require **no code change** — they transparently observe pool-derived candidates. This corrects the drifted spec/task language that named the factories as the wiring site. See Task 6.
- [RESOLVED] **What port shape?** `PoolManager.snapshot(): PoolState` and `PoolStateStore.snapshot(): PoolState` both already exist (verified: `packages/local-models/src/pool/manager.ts:167`, `pool/state.ts:141`). `PoolStateProvider = { snapshot(): PoolState }` is satisfied by both with zero changes. Candidate ordering lives in a pure, unit-testable helper `poolStateToCandidates(state)` so the resolver stays thin.
- [RESOLVED] **Does config carry `localModels` at runtime?** Yes. The CLI schema already declares `localModels: LocalModelsConfigSchema.optional()` (`packages/cli/src/config/schema.ts:826`) and the orchestrator loader casts the parsed object through unchanged (`packages/orchestrator/src/workflow/config.ts:218` — `config as WorkflowConfig`, no field stripping). Only the `WorkflowConfig` TS interface lacks the field (Task 3 adds it).
- [RESOLVED] **CLI dependency?** Phase 4 CLI does **not** consume pool state (`harness models` is Phase 7). Per the spec's "and `packages/cli` if the CLI will consume pool state", the CLI workspace-dep edge is **out of scope** for Phase 4. Recorded as a concern for the Phase 7 planner.
- [RESOLVED] **Store load is async, constructor is sync.** The `PoolStateStore` is constructed in the (sync) orchestrator constructor and `load()`ed in `initLocalModelAndPipeline()` before the first probe. An unloaded store's `snapshot()` returns `EmptyPoolState()` (empty entries, no throw), so candidates are empty until load — which always completes before `resolver.start()` probes. For unit/integration tests, a fake provider is injected via `overrides.poolState`.

## Observable Truths (Acceptance Criteria)

1. **[N1]** With no `poolState` provided (default), `LocalModelResolver` behavior is byte-identical to today: all existing tests in `packages/orchestrator/tests/agent/local-model-resolver.test.ts` and `multi-resolver-independence.test.ts` pass unchanged.
2. **[N2]** All existing `agent.backends` / `agent.routing` tests pass unchanged (`packages/orchestrator/tests/agent/**`, `packages/orchestrator/tests/routing/**`, `backend-resolver.test.ts`).
3. `@harness-engineering/local-models` appears as a `workspace:*` dependency in `packages/orchestrator/package.json`; `pnpm --filter @harness-engineering/orchestrator build` resolves the import.
4. `PoolStateProvider` is exported from `@harness-engineering/local-models`; a compile-time assertion confirms `PoolManager` and `PoolStateStore` structurally satisfy it.
5. **[Ubiquitous]** The system shall order pool-derived candidates by `currentScore` descending: given pool entries `[{ollamaName:'qwen3:32b',currentScore:80},{ollamaName:'llama3:8b',currentScore:50}]`, `poolStateToCandidates(state)` returns `['qwen3:32b','llama3:8b']`.
6. **[State-driven]** While a resolver holds a `poolState` port, `getStatus().configured` reflects the pool-derived list (ordered `ollamaName`s), not the static config array.
7. **[F4(c)]** When `localModels.enabled = true` and a model is added to pool state and reported by the endpoint probe, `resolver.getStatus().detected` includes it and `resolver.resolveModel()` returns it on the next probe.
8. `docs/knowledge/orchestrator/local-model-resolution.md` documents the `poolState` integration and cross-links LMLM.

## File Map

- CREATE `packages/local-models/src/pool/provider.ts` — `PoolStateProvider` interface + `poolStateToCandidates` helper
- CREATE `packages/local-models/tests/pool/provider.test.ts`
- MODIFY `packages/local-models/src/pool/index.ts` — export provider (top barrel re-exports `./pool/index.js` already, so no `index.ts` change)
- MODIFY `packages/orchestrator/package.json` — add `@harness-engineering/local-models: workspace:*`
- MODIFY `packages/types/src/orchestrator.ts` — add `localModels?: LocalModelsConfig` to `WorkflowConfig`
- MODIFY `packages/orchestrator/src/agent/local-model-resolver.ts` — `poolState?` ctor option + `candidates()` derivation
- MODIFY `packages/orchestrator/tests/agent/local-model-resolver.test.ts` — new poolState tests
- MODIFY `packages/orchestrator/src/orchestrator.ts` — construct/inject `PoolStateStore`; load before probe; `overrides.poolState` seam
- MODIFY `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts` — F4(c) case
- MODIFY `docs/knowledge/orchestrator/local-model-resolution.md` — Configuration section update

## Skeleton

_Not produced — task count (7) is below the standard-rigor threshold (8)._

---

## Tasks

### Task 1: Define `PoolStateProvider` port + `poolStateToCandidates` helper in local-models (TDD)

**Depends on:** none | **Files:** `packages/local-models/src/pool/provider.ts`, `packages/local-models/tests/pool/provider.test.ts`, `packages/local-models/src/pool/index.ts`

1. Create `packages/local-models/tests/pool/provider.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { poolStateToCandidates } from '../../src/pool/provider.js';
   import type { PoolStateProvider } from '../../src/pool/provider.js';
   import { EmptyPoolState, type PoolEntry, type PoolState } from '../../src/pool/types.js';
   import { PoolStateStore } from '../../src/pool/state.js';
   import { PoolManager } from '../../src/pool/manager.js';

   const entry = (ollamaName: string, currentScore: number): PoolEntry => ({
     ollamaName,
     hfRepoId: `Org/${ollamaName}`,
     sizeOnDiskGb: 1,
     installedAt: '2026-07-07T00:00:00.000Z',
     lastUsedAt: null,
     currentScore,
   });

   describe('poolStateToCandidates', () => {
     it('orders ollamaNames by currentScore descending', () => {
       const state: PoolState = {
         ...EmptyPoolState(),
         entries: [entry('llama3:8b', 50), entry('qwen3:32b', 80)],
       };
       expect(poolStateToCandidates(state)).toEqual(['qwen3:32b', 'llama3:8b']);
     });

     it('returns [] for an empty pool', () => {
       expect(poolStateToCandidates(EmptyPoolState())).toEqual([]);
     });

     it('does not mutate the input entries array', () => {
       const entries = [entry('a', 1), entry('b', 2)];
       const state: PoolState = { ...EmptyPoolState(), entries };
       poolStateToCandidates(state);
       expect(entries.map((e) => e.ollamaName)).toEqual(['a', 'b']);
     });
   });

   describe('PoolStateProvider structural conformance', () => {
     it('PoolStateStore satisfies PoolStateProvider', () => {
       const provider: PoolStateProvider = new PoolStateStore();
       expect(typeof provider.snapshot).toBe('function');
     });

     it('PoolManager satisfies PoolStateProvider', () => {
       const provider: PoolStateProvider = new PoolManager({
         store: new PoolStateStore(),
         // Null-ish installer stand-in is acceptable — snapshot() never touches it.
         installer: {} as never,
       });
       expect(typeof provider.snapshot).toBe('function');
     });
   });
   ```

2. Run test — observe failure (module not found): `pnpm --filter @harness-engineering/local-models test -- provider`
3. Create `packages/local-models/src/pool/provider.ts`:

   ```ts
   /**
    * `PoolStateProvider` — the read-only port the Phase 4 `LocalModelResolver`
    * consumes to derive its candidate list from LMLM pool state (D5). Both
    * `PoolManager` and `PoolStateStore` structurally satisfy it via their
    * existing `snapshot(): PoolState` accessor, so no adapter is required.
    *
    * @see docs/changes/local-model-lifecycle-manager/proposal.md Phase 4; D5
    */
   import type { PoolState } from './types.js';

   /** Read-only view over current pool state. Satisfied by PoolManager + PoolStateStore. */
   export interface PoolStateProvider {
     /** Frozen clone of the current pool state. */
     snapshot(): PoolState;
   }

   /**
    * Derive the resolver candidate list from pool state: entries ordered by
    * `currentScore` descending, mapped to `ollamaName`. Pure; does not mutate
    * the input.
    */
   export function poolStateToCandidates(state: PoolState): string[] {
     return [...state.entries]
       .sort((a, b) => b.currentScore - a.currentScore)
       .map((entry) => entry.ollamaName);
   }
   ```

4. Add exports to `packages/local-models/src/pool/index.ts` (after the `EmptyPoolState`/types export block):

   ```ts
   export { poolStateToCandidates } from './provider.js';
   export type { PoolStateProvider } from './provider.js';
   ```

5. Run test — observe pass: `pnpm --filter @harness-engineering/local-models test -- provider`
6. Run: `pnpm --filter @harness-engineering/local-models typecheck && pnpm --filter @harness-engineering/local-models build`
7. Run: `harness validate`
8. Commit: `feat(local-models): add PoolStateProvider port for resolver integration`

---

### Task 2: Add `@harness-engineering/local-models` workspace dependency to orchestrator

**Depends on:** Task 1 | **Files:** `packages/orchestrator/package.json`

1. In `packages/orchestrator/package.json`, add to `dependencies` (alphabetical, after `"@harness-engineering/intelligence": "workspace:*",`):

   ```json
   "@harness-engineering/local-models": "workspace:*",
   ```

2. Install + build (workspace edge + dist required before orchestrator can import — monorepo build ordering):

   ```bash
   pnpm install
   pnpm --filter @harness-engineering/local-models build
   pnpm --filter @harness-engineering/orchestrator build
   ```

3. Verify the edge resolves: `pnpm --filter @harness-engineering/orchestrator exec node -e "require.resolve('@harness-engineering/local-models')"` (expect a resolved path, no error).
4. Run: `harness check-deps`
5. Run: `harness validate`
6. Commit: `build(orchestrator): add @harness-engineering/local-models workspace dependency`

---

### Task 3: Add `localModels?` field to `WorkflowConfig`

**Depends on:** Task 2 | **Files:** `packages/types/src/orchestrator.ts`

> Runtime already carries `localModels` (CLI schema `schema.ts:826`; loader passes through at `config.ts:218`). This closes only the TS gap so `this.config.localModels` typechecks.

1. In `packages/types/src/orchestrator.ts`, add an import near the top type imports (or reference via inline import to avoid a cycle — prefer inline to match the file's `notifications` pattern). Add to `interface WorkflowConfig` (after the `notifications?` field, before `orchestratorId?`):

   ```ts
   /**
    * Local Model Lifecycle Manager (LMLM) settings (D5). Optional; absent or
    * `enabled: false` preserves pre-Phase-4 resolver behavior byte-for-byte.
    */
   localModels?: import('./local-models').LocalModelsConfig;
   ```

2. Run: `pnpm --filter @harness-engineering/types build && pnpm --filter @harness-engineering/types typecheck`
3. Run: `harness validate`
4. Commit: `feat(types): add localModels to WorkflowConfig`

---

### Task 4: Extend `LocalModelResolver` with `poolState?` candidate derivation (TDD)

**Depends on:** Task 2, Task 3 | **Files:** `packages/orchestrator/src/agent/local-model-resolver.ts`, `packages/orchestrator/tests/agent/local-model-resolver.test.ts`

1. Append new tests to `packages/orchestrator/tests/agent/local-model-resolver.test.ts` (add the import at top):

   ```ts
   import type { PoolStateProvider } from '@harness-engineering/local-models';
   import { EmptyPoolState } from '@harness-engineering/local-models';

   const providerWith = (names: Array<[string, number]>): PoolStateProvider => ({
     snapshot: () => ({
       ...EmptyPoolState(),
       entries: names.map(([ollamaName, currentScore]) => ({
         ollamaName,
         hfRepoId: `Org/${ollamaName}`,
         sizeOnDiskGb: 1,
         installedAt: '2026-07-07T00:00:00.000Z',
         lastUsedAt: null,
         currentScore,
       })),
     }),
   });

   describe('LocalModelResolver — poolState integration (Phase 4)', () => {
     it('derives candidates from pool state ordered by currentScore desc', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['static-only'],
         poolState: providerWith([
           ['llama3:8b', 50],
           ['qwen3:32b', 80],
         ]),
         fetchModels: async () => ['qwen3:32b', 'llama3:8b'],
       });
       const status = await resolver.probe();
       expect(status.configured).toEqual(['qwen3:32b', 'llama3:8b']);
       expect(status.resolved).toBe('qwen3:32b');
     });

     it('reflects pool changes on the next probe (F4c)', async () => {
       let entries: Array<[string, number]> = [];
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: [],
         poolState: {
           snapshot: () => ({
             ...EmptyPoolState(),
             entries: entries.map(([n, s]) => ({
               ollamaName: n,
               hfRepoId: `Org/${n}`,
               sizeOnDiskGb: 1,
               installedAt: '2026-07-07T00:00:00.000Z',
               lastUsedAt: null,
               currentScore: s,
             })),
           }),
         },
         fetchModels: async () => (entries.length ? [entries[0]![0]] : []),
       });
       let status = await resolver.probe();
       expect(status.resolved).toBeNull();
       entries = [['qwen3:32b', 90]];
       status = await resolver.probe();
       expect(status.detected).toContain('qwen3:32b');
       expect(status.resolved).toBe('qwen3:32b');
     });

     it('is byte-identical to the static path when poolState is absent', async () => {
       const resolver = new LocalModelResolver({
         endpoint: 'http://localhost:11434/v1',
         configured: ['a', 'b'],
         fetchModels: async () => ['b'],
       });
       const status = await resolver.probe();
       expect(status.configured).toEqual(['a', 'b']);
       expect(status.resolved).toBe('b');
     });
   });
   ```

2. Run test — observe failure: `pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver`
3. Edit `packages/orchestrator/src/agent/local-model-resolver.ts`:

   a. Add imports at the top (below the existing `LocalModelStatus` import):

   ```ts
   import type { PoolState, PoolStateProvider } from '@harness-engineering/local-models';
   import { poolStateToCandidates } from '@harness-engineering/local-models';
   ```

   (`PoolState` may be unused directly — omit it if `tsc` flags no-unused; keep only `PoolStateProvider` + `poolStateToCandidates`.)

   b. Add to `interface LocalModelResolverOptions` (after `configured`):

   ```ts
   /**
    * Phase 4 (D5): optional read-only pool-state port. When provided, the
    * candidate list derives from pool entries (currentScore desc → ollamaName)
    * instead of `configured`. When absent (default), behavior is byte-identical
    * to the pre-Phase-4 resolver.
    */
   poolState?: PoolStateProvider;
   ```

   c. Add a private field alongside `configured`:

   ```ts
   private readonly poolState?: PoolStateProvider;
   ```

   d. In the constructor, after `this.configured = [...opts.configured];`:

   ```ts
   if (opts.poolState !== undefined) {
     this.poolState = opts.poolState;
   }
   ```

   e. Add a private method (e.g. after `getStatus`):

   ```ts
   /**
    * Effective candidate list. With a poolState port present the list derives
    * from pool entries (currentScore desc → ollamaName); otherwise the static
    * `configured` list is returned unchanged (byte-identical to pre-Phase-4).
    */
   private candidates(): string[] {
     return this.poolState ? poolStateToCandidates(this.poolState.snapshot()) : this.configured;
   }
   ```

   f. In `getStatus()`, change `configured: [...this.configured],` → `configured: this.candidates(),`

   g. In `runProbe()`, replace the match + warnings block:

   ```ts
   const candidates = this.candidates();
   const match = candidates.find((id) => detected.includes(id)) ?? null;
   this.resolved = match;
   this.available = match !== null;
   this.warnings = match
     ? []
     : [
         `No configured local model is loaded. Configured: [${candidates.join(', ')}]. Detected: [${detected.join(', ')}].`,
       ];
   ```

   h. In `snapshotForDiff()`, change `configured: this.configured,` → `configured: this.candidates(),`

4. Run new + existing tests — observe pass (N1):

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- local-model-resolver
   pnpm --filter @harness-engineering/orchestrator test -- multi-resolver-independence
   ```

5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): derive resolver candidates from pool state when provided`

---

### Task 5: Wire pool-state provider into orchestrator resolver construction (TDD)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

1. Add an F4(c) integration case to `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts` that constructs an `Orchestrator` with `localModels.enabled = true` and an injected `overrides.poolState` fake whose pool contains one entry, plus a `local` backend whose resolver `fetchModels` reports that same model, then asserts the resolver resolves the pooled model. (Mirror the existing test's Orchestrator construction + config helpers in that file; inject the resolver's `fetchModels` via the existing per-backend hook the file already uses, or assert on `orchestrator.getLocalModelStatus()`.)

   Skeleton of the new case:

   ```ts
   it('resolves a pool-derived candidate when localModels.enabled (F4c)', async () => {
     const poolState = {
       snapshot: () => ({
         diskBudgetGb: 100,
         diskUsedGb: 1,
         allowedOrgs: ['Qwen'],
         allowedFamilies: [],
         lastRefreshAt: null,
         entries: [
           {
             ollamaName: 'qwen3:32b',
             hfRepoId: 'Qwen/Qwen3-32B-GGUF',
             sizeOnDiskGb: 1,
             installedAt: '2026-07-07T00:00:00.000Z',
             lastUsedAt: null,
             currentScore: 90,
           },
         ],
       }),
     };
     // ...build config with localModels.enabled=true + a `local` backend...
     // ...construct Orchestrator(config, prompt, { poolState, ...existing overrides })...
     // ...start(), then assert getLocalModelStatus().resolved === 'qwen3:32b'...
   });
   ```

2. Run — observe failure (overrides.poolState not accepted / not wired): `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver`
3. Edit `packages/orchestrator/src/orchestrator.ts`:

   a. Add import (near the resolver import at line 35):

   ```ts
   import { PoolStateStore } from '@harness-engineering/local-models';
   import type { PoolStateProvider } from '@harness-engineering/local-models';
   ```

   b. Extend the `overrides` param type (line 297):

   ```ts
   overrides?: { tracker?: IssueTrackerClient; backend?: AgentBackend; execFileFn?: ExecFileFn; poolState?: PoolStateProvider }
   ```

   c. Add a private field near `localResolvers` (line ~198):

   ```ts
   /** Phase 4 (D5): pool-state port shared by all local/pi resolvers. Null when LMLM disabled. */
   private poolStateProvider: PoolStateProvider | null = null;
   private poolStateStore: PoolStateStore | null = null;
   ```

   d. Before the resolver-construction loop (before line 419 `const backendsMap = ...`), resolve the provider:

   ```ts
   const localModelsEnabled = this.config.localModels?.enabled === true;
   if (overrides?.poolState) {
     this.poolStateProvider = overrides.poolState;
   } else if (localModelsEnabled) {
     this.poolStateStore = new PoolStateStore({
       onWarn: (message, cause) =>
         this.logger.warn(message, cause !== undefined ? { cause: String(cause) } : undefined),
     });
     this.poolStateProvider = this.poolStateStore;
   }
   ```

   e. Inside the loop, when building `resolverOpts` (after the `probeIntervalMs` line ~428), inject the provider:

   ```ts
   if (this.poolStateProvider !== null) resolverOpts.poolState = this.poolStateProvider;
   ```

   f. In `initLocalModelAndPipeline()` (before the `for (const resolver of this.localResolvers.values()) { await resolver.start(); }` loop at line ~1943), load the on-disk store so pool entries are present before the first probe:

   ```ts
   if (this.poolStateStore !== null) {
     await this.poolStateStore.load();
   }
   ```

4. Run — observe pass (F4c): `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver`
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): inject pool-state provider into resolvers when localModels.enabled`

---

### Task 6: Non-regression gate — confirm factories unchanged, N1 + N2 green

**Depends on:** Task 5 | **Files:** none (verification) | **Category:** integration

`[checkpoint:human-verify]`

1. Confirm no code change is required in the two factories (documented in this task, not edited):
   - `packages/orchestrator/src/agent/analysis-provider-factory.ts` — consumes `getResolverStatusSnapshot()` derived from `resolver.getStatus()`. Pool-derived candidates flow through `getStatus().configured`/`resolved` transparently.
   - `packages/orchestrator/src/agent/orchestrator-backend-factory.ts` — consumes `resolver.resolveModel()` via the `getResolverModelFor` hook. Unchanged.
2. Run the full non-regression suites and confirm all pass:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- agent
   pnpm --filter @harness-engineering/orchestrator test -- routing
   pnpm --filter @harness-engineering/orchestrator test -- backend-resolver
   pnpm --filter @harness-engineering/local-models test
   ```

3. Run the workspace build + typecheck to confirm the new edge is clean:

   ```bash
   pnpm --filter @harness-engineering/local-models build
   pnpm --filter @harness-engineering/orchestrator build
   pnpm --filter @harness-engineering/orchestrator typecheck
   ```

4. Present results (N1 + N2 status, factory-no-change finding) and pause for human confirmation before proceeding to docs.
5. Run: `harness validate`
6. Commit (only if any test snapshot/artifact changed; otherwise skip): `test(orchestrator): confirm Phase 4 resolver non-regression`

---

### Task 7: Document the `poolState` integration

**Depends on:** Task 6 | **Files:** `docs/knowledge/orchestrator/local-model-resolution.md` | **Category:** integration

1. In `docs/knowledge/orchestrator/local-model-resolution.md`, add to the Configuration section a subsection documenting:
   - `LocalModelResolver` accepts an optional `poolState?: PoolStateProvider` (`{ snapshot(): PoolState }`), satisfied by `PoolManager`/`PoolStateStore`.
   - When `localModels.enabled = true`, the orchestrator injects a shared `PoolStateStore` (loaded before first probe) into every `local`/`pi` resolver; the candidate list becomes `poolStateToCandidates(snapshot())` — pool entries ordered by `currentScore` desc → `ollamaName`.
   - When `localModels.enabled = false` (default) or absent, behavior is byte-identical to the static `agent.backends.<name>.model` path.
   - Cross-link to `docs/changes/local-model-lifecycle-manager/proposal.md` (D5, Phase 4).
2. Run: `harness validate`
3. Run (if present): `harness check-docs`
4. Commit: `docs(orchestrator): document resolver pool-state integration`

---

## Sequencing

Serial chain: Task 1 (port) → Task 2 (dep) → Task 3 (config type) → Task 4 (resolver) → Task 5 (wiring) → Task 6 (regression gate) → Task 7 (docs). Task 3 depends only on Task 2's build; Task 4 depends on both 2 and 3 (imports the port + reads `localModels`-typed config indirectly). No parallelizable tasks — all touch the orchestrator resolver seam or its prerequisites.

## Post-plan integration (registrations)

- `pnpm install` (Task 2) updates `pnpm-lock.yaml` — commit it with Task 2.
- No barrel/plugin regeneration required: the `local-models` top barrel already re-exports `./pool/index.js`, and Phase 4 adds no CLI command.

## Concerns / handoff to later phases

- **Factory language drift.** Spec §Phase 4 and the task prompt name `analysis-provider-factory.ts` + `OrchestratorBackendFactory` as the wiring site. The real wiring site is `orchestrator.ts:420-431` (resolver construction). The factories require no change. Recorded so the soundness reviewer does not flag "missing factory edits."
- **CLI dependency deferred.** Phase 4 does not add the `local-models` edge to `packages/cli`; Phase 7 (`harness models`) owns that.
- **Real-disk pool path.** Production uses the default `~/.harness/local-models/pool.json`. An absent file degrades to `EmptyPoolState()` (no throw) → empty candidates until Phase 3c/6 populate the pool. No config knob for the path in Phase 4; add one if Phase 6 needs test isolation beyond `overrides.poolState`.
- **`PoolState` unused-import risk.** If `tsc` flags `PoolState` as unused in the resolver, drop it from the import (keep `PoolStateProvider` + `poolStateToCandidates`).
