# Plan: Spec 2 Phase 4 — Intelligence Pipeline Routing (SC31–SC36)

**Date:** 2026-05-04 | **Spec:** `docs/changes/multi-backend-routing/proposal.md` (Phase 4 — autopilot index 3) | **Tasks:** 14 | **Time:** ~58 min | **Integration Tier:** small | **Session:** `changes--multi-backend-routing--proposal`

## Goal

`createAnalysisProvider` consults `agent.routing.intelligence.{sel,pesl}` (with `default` fallback) instead of legacy `agent.backend`, building each layer's `AnalysisProvider` from the routed `BackendDef`. `IntelligencePipeline` accepts a distinct `pesl` provider when `routing.intelligence.sel !== routing.intelligence.pesl`. Closes the Phase 2-deferred legacy read at `orchestrator.ts:646` (P2-DEF-638), the Phase 0-deferred over-suppression in `config-migration.ts:89` (NF-1), and drops `createAnalysisProvider` cyclomatic complexity below the 15 threshold.

## Observable Truths (Acceptance Criteria)

1. **SC31** — Given `backends.local = { type: 'pi', endpoint, model }` and `routing.intelligence.sel: 'local'`, `createAnalysisProvider()` returns an `OpenAICompatibleAnalysisProvider` whose `baseUrl` matches `backends.local.endpoint` and whose `defaultModel` matches the resolver's resolved model.
2. **SC32** — Given `backends.cloud = { type: 'anthropic', model, apiKey }` and `routing.intelligence.sel: 'cloud'`, `createAnalysisProvider()` returns an `AnthropicAnalysisProvider` constructed with `apiKey=cfg.apiKey` and `defaultModel=cfg.model`.
3. **SC33** — Given any `intelligence.provider` explicit config alongside any `routing.intelligence.*`, the explicit config wins (current Phase 0–2 behavior preserved).
4. **SC34** — Given `routing.intelligence.sel === routing.intelligence.pesl` (or `pesl` unset), `IntelligencePipeline` is constructed with one provider and `pesl` overrides only the model name, mirroring today's behavior.
5. **SC35** — Given `routing.intelligence.sel !== routing.intelligence.pesl` (e.g., `sel: 'local'`, `pesl: 'cloud'`), `IntelligencePipeline` receives **distinct** providers for the two layers — the `PeslSimulator` invokes the `pesl` provider, not the `sel` provider.
6. **SC36** — Given a routing target whose `BackendDef.type` is `claude`, `mock`, or `gemini` (no analysis-provider implementation), `createAnalysisProvider()` returns `null` and emits a `warn`-level log naming the routed backend name, its type, and the layer (`sel` or `pesl`). The fallback to Claude CLI for `type: 'claude'` is preserved (Claude CLI has its own analysis provider).
7. **NF-1 closure** — The over-suppression in `config-migration.ts:89` is split: `agent.backend` stays unconditionally suppressed (required-by-type), but the `local*` group is suppressed **only when `agent.localBackend` is undefined**. Asserted by a new migration unit test that mixes `agent.backends` with a stray `agent.localEndpoint` and expects exactly one `local*` warning.
8. **P2-DEF-638 closure** — `git grep -n "this\.config\.agent\.backend\b" packages/orchestrator/src/orchestrator.ts` returns zero hits inside `createAnalysisProvider`. The legacy primary-fallback branch is replaced by the routing-driven path; legacy `agent.backend` reads remain only in the Phase 2 dispatch fallback (orchestrator.ts:113-comment region).
9. **Complexity reduction** — `createAnalysisProvider` cyclomaticComplexity drops from 33 to ≤ 15 (per `harness check-arch`), achieved by extracting per-type provider construction into a dedicated module (`analysis-provider-factory.ts`).
10. **Mechanical** — `pnpm --filter @harness-engineering/orchestrator typecheck`, `pnpm --filter @harness-engineering/intelligence typecheck`, full test suite (~797 → ≥ 803 with the 6+ new tests below), `harness validate`, `harness check-deps` all green. SC30 grep stays clean (Phase 2 invariant). SC41 state-machine.test.ts diff stays empty.

## Skills (from `docs/changes/multi-backend-routing/SKILLS.md`)

- `gof-factory-method` (apply) — Tasks 3, 4 (`AnalysisProviderFactory`: per-type translation from `BackendDef` → `AnalysisProvider`).
- `ts-type-guards` (reference) — Task 4 (discriminated-union narrowing on `BackendDef.type` inside the factory).
- `gof-chain-of-responsibility` (reference) — Tasks 6–7 (resolution order: explicit `intelligence.provider` → routed `sel`/`pesl` → null+warn).
- `ts-testing-types` (reference) — Tasks 1, 5, 8, 11, 12 (provider-shape assertions via `instanceof` + structural reads).

## Uncertainties

- **[ASSUMPTION]** `OpenAICompatibleAnalysisProvider` is the correct provider for `BackendDef.type === 'openai'` (cloud OpenAI), constructed with `baseUrl: 'https://api.openai.com/v1'`. Verified by reading the existing primary-fallback branch (orchestrator.ts:658-666) — same construction. If wrong, Task 4's openai branch needs revision.
- **[ASSUMPTION]** `BackendDef.type === 'gemini'` has no analysis provider today (no `GeminiAnalysisProvider` in `packages/intelligence/src/analysis-provider/`). Verified by `ls packages/intelligence/src/analysis-provider/` → only `anthropic.ts`, `claude-cli.ts`, `openai-compatible.ts`, `interface.ts`, `schema.ts`. So gemini falls into SC36's "unsupported" warn-and-null bucket. If a `GeminiAnalysisProvider` lands later, the factory's gemini branch upgrades from null+warn to a real provider — non-breaking.
- **[ASSUMPTION]** `BackendDef.type === 'claude'` routed to the intelligence layer continues to use `ClaudeCliAnalysisProvider` (Phase 0 behavior preserved — Claude CLI has a real analysis provider). Per spec line 670–676, the Claude-CLI provider is the existing fallback; Phase 4 keeps it. SC36's "claude returns null+warn" wording in the spec applies only when the routed backend is `claude` AND no Claude CLI command is available — but `ClaudeBackendDef.command` is optional with a `'claude'` default, so this case never fires in practice. Plan treats `claude` as a supported analysis provider type, with `mock`+`gemini` as the two SC36 "null+warn" types. **Concern raised in `concerns[]` for spec wording refinement.**
- **[ASSUMPTION]** `IntelligencePipeline`'s `PeslSimulator` is the only consumer of the `pesl`-routed provider. Verified by `grep -rn "PeslSimulator" packages/intelligence/src/` → only `pipeline.ts:47` and `pesl/simulator.ts`. So adding a `peslProvider` constructor option to `IntelligencePipeline` and threading it into `PeslSimulator` covers the contract.
- **[ASSUMPTION]** When `routing.intelligence.pesl` is unset, `pesl` falls back to `routing.intelligence.sel` (which itself falls back to `routing.default`). This matches the spec's "pesl shares sel's session" wording (proposal §"Intelligence pipeline wiring").
- **[DEFERRABLE]** `intelligence.provider` explicit-config schema (Phase 0 added, Phase 4 untouched). The current `createProviderFromExplicitConfig` keeps its 3-branch resolution. Refactoring it to also share the new factory is a Phase 5+ cleanup; for now Phase 4 keeps the explicit-config path identical to Phase 2 for SC33.
- **[DEFERRABLE]** SC29 spec wording mismatch (carry-forward from Phase 2 VERIFY/REVIEW) — surfaced again in `concerns[]` because Phase 4 spec wording around SC36 ("`claude` returns null") has the same imprecision pattern. Not a planning blocker; flagged for spec author.

## File Map

```
MODIFY  packages/orchestrator/src/agent/config-migration.ts                      (NF-1: split CASE1 suppression)
MODIFY  packages/orchestrator/tests/agent/config-migration.test.ts               (NF-1 unit test)
CREATE  packages/orchestrator/src/agent/analysis-provider-factory.ts             (per-type BackendDef -> AnalysisProvider)
CREATE  packages/orchestrator/tests/agent/analysis-provider-factory.test.ts      (SC31, SC32, SC36 unit tests)
MODIFY  packages/intelligence/src/pipeline.ts                                    (accept distinct pesl provider; SC34, SC35)
MODIFY  packages/intelligence/tests/pipeline.test.ts  (or CREATE if missing)     (SC34, SC35 unit tests)
MODIFY  packages/orchestrator/src/orchestrator.ts                                (createAnalysisProvider rewrite; createIntelligencePipeline plumbs pesl provider)
MODIFY  packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts  (extend OT10 + add SC33 routing-driven test)
CREATE  packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts  (SC31–SC36 end-to-end)
```

9 files (3 new, 6 modify). No new package public exports (the new `analysis-provider-factory.ts` is internal to `@harness-engineering/orchestrator`); `IntelligencePipeline`'s constructor option is additive (backwards-compatible).

## Skeleton (proposed — pending APPROVE_PLAN)

1. NF-1 — Narrow `CASE1_SUPPRESSED` in `config-migration.ts` (~2 tasks, ~7 min) — _proposed_
2. `AnalysisProviderFactory` module (per-type `BackendDef` → `AnalysisProvider`) (~2 tasks, ~10 min) — _proposed_
3. `IntelligencePipeline` accepts distinct `peslProvider` option (~2 tasks, ~8 min) — _proposed_
4. `createAnalysisProvider` rewrite — routing-driven sel; closes P2-DEF-638 (~2 tasks, ~10 min) — _proposed_
5. `createIntelligencePipeline` plumbs distinct sel/pesl providers (~1 task, ~5 min) — _proposed_
6. Existing-test compatibility shim (extend OT10 in `orchestrator-local-resolver.test.ts`) (~1 task, ~3 min) — _proposed_
7. Integration tests (SC31–SC36 end-to-end) (~1 task, ~10 min) — _proposed_
8. Verification gate (~1 task, ~3 min) — _proposed_
9. (optional) Complexity-budget verification via `harness check-arch` (folded into Task 14) — _proposed_

**Estimated total:** 14 tasks, ~58 min. Below the >20-task and >6-checkpoint complexity-override thresholds — confirms **complexity: medium** as annotated in the spec.

---

## Tasks

### Task 1: TDD — NF-1 narrow-suppression unit test in `config-migration.test.ts`

**Depends on:** none | **Files:** `packages/orchestrator/tests/agent/config-migration.test.ts`

Reviewer's NF-1 mandate (from Phase 0): when `agent.backends` is set AND a stray `local*` field is also set AND `agent.localBackend` is **undefined**, the migration **should** warn naming each stray `local*` field. Today's implementation suppresses the entire `local*` group unconditionally (config-migration.ts:89-96), losing the warning.

Add three test cases (use the existing `describe('migrateAgentConfig')` block — pattern-match the existing tests for tone):

```typescript
describe('NF-1 — narrow CASE1 suppression for the local* group', () => {
  it('suppresses local* warnings when agent.localBackend is undefined AND backends is set (existing behavior preserved)', () => {
    // Pure-modern config with no legacy local* group at all
    const result = migrateAgentConfig({
      backends: { primary: { type: 'mock' } },
      backend: 'mock', // required-by-type field; stays suppressed always
    } as unknown as AgentConfig);
    expect(result.warnings).toEqual([]);
  });

  it('warns about local* fields when agent.localBackend is undefined but a stray local* field is set alongside agent.backends', () => {
    // The stray field is user-meaningful: the user partially migrated
    // (set backends but forgot to clean localEndpoint). NF-1's narrowed
    // gate must surface this.
    const result = migrateAgentConfig({
      backends: { primary: { type: 'mock' } },
      backend: 'mock',
      localEndpoint: 'http://stale:1234/v1',
    } as unknown as AgentConfig);
    expect(result.warnings.some((w) => w.includes('agent.localEndpoint'))).toBe(true);
    // agent.backend stays suppressed (always).
    expect(result.warnings.some((w) => w.includes('agent.backend'))).toBe(false);
  });

  it('suppresses local* warnings when agent.localBackend IS set alongside agent.backends (the tightly-coupled-unit case)', () => {
    // localBackend is set, so the local* group is a coherent unit; the
    // user is mid-migration and the unit is still acting in concert.
    // NF-1: keep these suppressed to avoid noisy boot logs.
    const result = migrateAgentConfig({
      backends: { primary: { type: 'mock' } },
      backend: 'mock',
      localBackend: 'pi',
      localEndpoint: 'http://x:1234/v1',
      localModel: 'm',
    } as unknown as AgentConfig);
    // None of the local* group should appear in warnings.
    for (const path of ['agent.localBackend', 'agent.localEndpoint', 'agent.localModel']) {
      expect(
        result.warnings.some((w) => w.includes(path)),
        `expected '${path}' suppressed in tightly-coupled-unit case; got ${JSON.stringify(result.warnings)}`
      ).toBe(false);
    }
  });
});
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- config-migration` — the second test (stray `localEndpoint`) MUST FAIL with the current unconditional suppression. The first and third pass.

Commit: `test(orchestrator): cover NF-1 narrow CASE1 suppression for local* group (Spec 2 Phase 4)`

### Task 2: Implement NF-1 — split `CASE1_SUPPRESSED` into always vs. conditional

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/config-migration.ts`

Replace lines 89–105 (the `CASE1_SUPPRESSED` set + its loop) with:

```typescript
// Two-tier suppression for case 1 (`agent.backends` set):
//
// `CASE1_ALWAYS_SUPPRESS`: `agent.backend` is required-by-type today.
// Every Spec-2-migrated config has it set to a placeholder value, so
// warning about it would be unconditional noise. (Phase 5+ retires
// the field by making it optional.)
//
// `CASE1_LOCAL_GROUP`: the legacy local* fields. These are inert
// without `agent.localBackend` (which is the gate that activates
// them). We suppress them only when `agent.localBackend` is itself
// undefined — i.e., the local* group sits as inert vestigial state
// the user forgot to clean during migration. When `localBackend` IS
// set, the whole group is a coherent unit; suppress to avoid noisy
// boot logs (the user is mid-migration with both shapes).
//
// NF-1 carry-forward from Phase 0: previously the local* group was
// unconditionally suppressed, which silently hid genuine user-config
// drift (e.g., `localEndpoint` set without `localBackend`).
const CASE1_ALWAYS_SUPPRESS = new Set(['agent.backend']);
const CASE1_LOCAL_GROUP = new Set([
  'agent.localBackend',
  'agent.localEndpoint',
  'agent.localModel',
  'agent.localApiKey',
  'agent.localTimeoutMs',
  'agent.localProbeIntervalMs',
]);
const suppressLocalGroup = agent.localBackend === undefined ? false : true;

if (agent.backends !== undefined) {
  for (const path of presentLegacy) {
    if (CASE1_ALWAYS_SUPPRESS.has(path)) continue;
    if (suppressLocalGroup && CASE1_LOCAL_GROUP.has(path)) continue;
    warnings.push(
      `Ignoring legacy field '${path}': 'agent.backends' is set and takes precedence. See ${MIGRATION_GUIDE}.`
    );
  }
  return { config: agent, warnings };
}
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- config-migration` — all three NF-1 tests + the existing case-1/2/3 tests must PASS.
Run: `pnpm --filter @harness-engineering/orchestrator typecheck`.
Run: `harness validate`.

Commit: `fix(orchestrator): split CASE1 suppression into always vs. conditional (Spec 2 NF-1)`

### Task 3: TDD — `AnalysisProviderFactory` per-type unit tests

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/agent/analysis-provider-factory.test.ts` (CREATE)

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { BackendDef } from '@harness-engineering/types';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import { buildAnalysisProvider } from '../../src/agent/analysis-provider-factory.js';

const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('buildAnalysisProvider — BackendDef → AnalysisProvider translation', () => {
  it('SC31: type=local builds OpenAICompatible with endpoint + resolved model', () => {
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma-4-e4b',
      apiKey: 'ollama',
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => 'gemma-4-e4b',
      getResolverAvailable: () => true,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC31: type=pi builds OpenAICompatible (resolver-aware model)', () => {
    const def: BackendDef = {
      type: 'pi',
      endpoint: 'http://pi:1234/v1',
      model: ['a', 'b'],
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => 'a',
      getResolverAvailable: () => true,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC31: type=local with unavailable resolver returns null and warns', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = {
      type: 'local',
      endpoint: 'http://localhost:11434/v1',
      model: 'gemma-4-e4b',
    };
    const result = buildAnalysisProvider({
      def,
      backendName: 'local',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/Intelligence pipeline disabled/i);
  });

  it('SC32: type=anthropic builds AnthropicAnalysisProvider', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-3', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('type=anthropic without apiKey falls back to ClaudeCli', () => {
    const def: BackendDef = { type: 'anthropic', model: 'claude-3' };
    // ANTHROPIC_API_KEY not set in test env (vitest default).
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(ClaudeCliAnalysisProvider);
  });

  it('type=claude builds ClaudeCliAnalysisProvider (preserves Phase 0–2 behavior)', () => {
    const def: BackendDef = { type: 'claude', command: 'claude' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cli',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(ClaudeCliAnalysisProvider);
  });

  it('type=openai builds OpenAICompatible with cloud baseUrl', () => {
    const def: BackendDef = { type: 'openai', model: 'gpt-4', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'cloud',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: noopLogger,
    });
    expect(result).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
  });

  it('SC36: type=mock returns null and warns naming backend + layer', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = { type: 'mock' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'mock-cloud',
      layer: 'pesl',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    const msg = String(warnSpy.mock.calls[0]?.[0]);
    expect(msg).toContain('mock-cloud');
    expect(msg).toMatch(/pesl/);
    expect(msg).toMatch(/mock/);
  });

  it('SC36: type=gemini returns null and warns (no GeminiAnalysisProvider exists)', () => {
    const warnSpy = vi.fn();
    const def: BackendDef = { type: 'gemini', model: 'gemini-pro', apiKey: 'k' };
    const result = buildAnalysisProvider({
      def,
      backendName: 'gem',
      layer: 'sel',
      getResolvedModel: () => null,
      getResolverAvailable: () => false,
      intelligence: { enabled: true },
      logger: { ...noopLogger, warn: warnSpy },
    });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('gemini');
  });
});
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- analysis-provider-factory` — must FAIL (module doesn't exist yet).

Commit: `test(orchestrator): cover AnalysisProviderFactory per-type translation (Spec 2 SC31, SC32, SC36)`

### Task 4: Implement `AnalysisProviderFactory` (`buildAnalysisProvider`)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/analysis-provider-factory.ts` (CREATE)

```typescript
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { BackendDef, IntelligenceConfig } from '@harness-engineering/types';

/** Layer the routed provider serves (used for log labelling). */
export type IntelligenceLayer = 'sel' | 'pesl';

/**
 * Lightweight logger contract — matches the orchestrator's `Logger`
 * shape without importing it (keeps this module dependency-free).
 */
export interface ProviderFactoryLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export interface BuildAnalysisProviderArgs {
  /** The routed BackendDef whose type drives provider selection. */
  def: BackendDef;
  /** The routed backend name (key in agent.backends). Used for log labels + the warn payload. */
  backendName: string;
  /** Which intelligence layer this provider serves. Influences warn wording. */
  layer: IntelligenceLayer;
  /** Resolver hook: returns the currently-resolved model name for `local`/`pi` types, or null when unresolved. */
  getResolvedModel: () => string | null;
  /** Resolver hook: returns whether the resolver believes the local backend is reachable. */
  getResolverAvailable: () => boolean;
  /** Intelligence config — provides selModel/peslModel overrides + transport options. */
  intelligence: IntelligenceConfig | undefined;
  /** Logger for info/warn emission. */
  logger: ProviderFactoryLogger;
}

/**
 * Translate a routed `BackendDef` into an `AnalysisProvider` for the
 * intelligence pipeline (Spec 2 SC31–SC36).
 *
 * Resolution per type:
 * - `local` / `pi`  → OpenAICompatibleAnalysisProvider (resolver-aware
 *                     model). Returns null + warns when the resolver
 *                     is unavailable.
 * - `anthropic`     → AnthropicAnalysisProvider when an API key is
 *                     present (cfg or ANTHROPIC_API_KEY env), else
 *                     ClaudeCliAnalysisProvider fallback.
 * - `openai`        → OpenAICompatibleAnalysisProvider with cloud
 *                     baseUrl when an API key is present (cfg or
 *                     OPENAI_API_KEY env), else null + warn.
 * - `claude`        → ClaudeCliAnalysisProvider (subscription auth;
 *                     no API key needed).
 * - `mock`          → null + warn (SC36).
 * - `gemini`        → null + warn (no GeminiAnalysisProvider exists yet).
 *
 * Replaces the per-type cyclomatic-complexity-33 branch tree previously
 * inlined in `Orchestrator.createAnalysisProvider`. Each branch is a
 * small named helper — the dispatch is a single switch on `def.type`.
 */
export function buildAnalysisProvider(args: BuildAnalysisProviderArgs): AnalysisProvider | null {
  const { def, backendName, layer, intelligence, logger } = args;
  const layerModel = layer === 'sel' ? intelligence?.models?.sel : intelligence?.models?.pesl;

  switch (def.type) {
    case 'local':
    case 'pi':
      return buildLocalLikeProvider(def, args, layerModel);
    case 'anthropic':
      return buildAnthropicProvider(def, args, layerModel);
    case 'openai':
      return buildOpenAIProvider(def, args, layerModel);
    case 'claude':
      return buildClaudeCliProvider(def, args, layerModel);
    case 'mock':
    case 'gemini':
      logger.warn(
        `Intelligence pipeline disabled for layer '${layer}': routed backend '${backendName}' has type '${def.type}' which has no AnalysisProvider implementation.`
      );
      return null;
  }
}

function buildLocalLikeProvider(
  def: Extract<BackendDef, { type: 'local' | 'pi' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider | null {
  const { backendName, getResolvedModel, getResolverAvailable, intelligence, logger } = args;
  if (!getResolverAvailable()) {
    logger.warn(
      `Intelligence pipeline disabled for backend '${backendName}' at ${def.endpoint}: ` +
        `no configured local model loaded.`
    );
    return null;
  }
  const resolved = getResolvedModel();
  const model = layerModel ?? resolved ?? undefined;
  const apiKey = def.apiKey ?? 'ollama';
  logger.info(
    `Intelligence pipeline using backend '${backendName}' (${def.type}) at ${def.endpoint} (model: ${model ?? '(default)'})`
  );
  return new OpenAICompatibleAnalysisProvider({
    apiKey,
    baseUrl: def.endpoint,
    ...(model !== undefined && { defaultModel: model }),
    ...(intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: intelligence.requestTimeoutMs,
    }),
    ...(intelligence?.promptSuffix !== undefined && { promptSuffix: intelligence.promptSuffix }),
    ...(intelligence?.jsonMode !== undefined && { jsonMode: intelligence.jsonMode }),
  });
}

function buildAnthropicProvider(
  def: Extract<BackendDef, { type: 'anthropic' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider {
  const apiKey = def.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = layerModel ?? def.model;
  if (apiKey) {
    return new AnthropicAnalysisProvider({
      apiKey,
      ...(model !== undefined && { defaultModel: model }),
    });
  }
  // Fall through to Claude CLI when no key is configured (preserves
  // today's primary-fallback behavior at orchestrator.ts:670-676).
  args.logger.info(
    `Intelligence pipeline routed to '${args.backendName}' (anthropic) without API key — using Claude CLI fallback.`
  );
  return new ClaudeCliAnalysisProvider({
    ...(model !== undefined && { defaultModel: model }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}

function buildOpenAIProvider(
  def: Extract<BackendDef, { type: 'openai' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider | null {
  const apiKey = def.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    args.logger.warn(
      `Intelligence pipeline disabled for backend '${args.backendName}' (openai): no API key configured.`
    );
    return null;
  }
  const model = layerModel ?? def.model;
  return new OpenAICompatibleAnalysisProvider({
    apiKey,
    baseUrl: 'https://api.openai.com/v1',
    ...(model !== undefined && { defaultModel: model }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}

function buildClaudeCliProvider(
  def: Extract<BackendDef, { type: 'claude' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider {
  return new ClaudeCliAnalysisProvider({
    ...(def.command !== undefined && { command: def.command }),
    ...(layerModel !== undefined && { defaultModel: layerModel }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}
```

> NOTE: `IntelligenceConfig` is imported from `@harness-engineering/types`. Verify the export path during execution; if the type is named differently (e.g., `WorkflowConfig['intelligence']`), use the structural alias inline. The construction options (`requestTimeoutMs`, `promptSuffix`, `jsonMode`) match what `createAnalysisProvider` reads today.

Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — must pass.
Run: `pnpm --filter @harness-engineering/orchestrator test -- analysis-provider-factory` — all 9 tests must PASS.
Run: full suite — no regressions.
Run: `harness validate`.

Commit: `feat(orchestrator): add AnalysisProviderFactory for routed BackendDef → AnalysisProvider (Spec 2 SC31, SC32, SC36)`

### Task 5: TDD — `IntelligencePipeline` accepts distinct `peslProvider` (SC34/SC35)

**Depends on:** Task 4 | **Files:** `packages/intelligence/tests/pipeline.test.ts` (CREATE if missing; otherwise extend)

Discover existing path during execution: `find packages/intelligence -name "pipeline.test.ts"`. If absent, create at `packages/intelligence/tests/pipeline.test.ts`.

Add tests:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { GraphStore } from '@harness-engineering/graph';
import { IntelligencePipeline } from '../src/pipeline.js';
import type { AnalysisProvider } from '../src/analysis-provider/interface.js';

function makeStore(): GraphStore {
  // Minimal stub — pipeline only invokes the store on enrich/score paths
  // not exercised by the constructor-shape tests below.
  return {} as GraphStore;
}

function makeProvider(label: string): AnalysisProvider {
  return {
    label,
    analyze: vi.fn(async () => ({ raw: '', parsed: null })),
  } as unknown as AnalysisProvider;
}

describe('IntelligencePipeline — distinct sel/pesl providers (Spec 2 SC34, SC35)', () => {
  it('SC34: when only one provider is supplied, PeslSimulator uses the same provider as enrich (current behavior)', () => {
    const sel = makeProvider('sel');
    const pipeline = new IntelligencePipeline(sel, makeStore(), { peslModel: 'pesl-model' });
    // Reach into internals — PeslSimulator.provider should equal `sel`.
    const sim = (pipeline as unknown as { simulator: { provider: AnalysisProvider } }).simulator;
    expect(sim.provider).toBe(sel);
  });

  it('SC35: when peslProvider is supplied, PeslSimulator uses the distinct provider', () => {
    const sel = makeProvider('sel');
    const pesl = makeProvider('pesl');
    const pipeline = new IntelligencePipeline(sel, makeStore(), {
      peslModel: 'pesl-model',
      peslProvider: pesl,
    });
    const sim = (pipeline as unknown as { simulator: { provider: AnalysisProvider } }).simulator;
    expect(sim.provider).toBe(pesl);
    // Sanity: enrich path still uses sel
    const enrichProvider = (pipeline as unknown as { provider: AnalysisProvider }).provider;
    expect(enrichProvider).toBe(sel);
  });
});
```

Run: `pnpm --filter @harness-engineering/intelligence test -- pipeline` — both tests fail (option doesn't exist).

Commit: `test(intelligence): cover IntelligencePipeline distinct peslProvider option (Spec 2 SC34, SC35)`

### Task 6: Implement `IntelligencePipeline.peslProvider` constructor option

**Depends on:** Task 5 | **Files:** `packages/intelligence/src/pipeline.ts`

Replace the constructor (lines 43–51) with:

```typescript
constructor(
  provider: AnalysisProvider,
  store: GraphStore,
  options?: {
    peslModel?: string;
    /**
     * Optional distinct provider for the PESL layer. Defaults to
     * `provider` (current behavior — sel and pesl share a session).
     * Spec 2 SC35: when `routing.intelligence.sel !== routing.intelligence.pesl`,
     * the orchestrator passes a second `AnalysisProvider` here so PESL
     * runs against a different backend than SEL.
     */
    peslProvider?: AnalysisProvider;
  }
) {
  this.provider = provider;
  this.store = store;
  this.graphValidator = new GraphValidator(store);
  this.simulator = new PeslSimulator(options?.peslProvider ?? provider, store, {
    ...(options?.peslModel !== undefined && { model: options.peslModel }),
  });
  this.outcomeConnector = new ExecutionOutcomeConnector(store);
}
```

Run: `pnpm --filter @harness-engineering/intelligence typecheck`.
Run: `pnpm --filter @harness-engineering/intelligence test` — full intelligence suite must PASS, including the two new tests from Task 5.
Run: `pnpm --filter @harness-engineering/orchestrator test` — orchestrator suite must remain green (constructor change is additive).
Run: `harness validate`.

Commit: `feat(intelligence): accept distinct peslProvider in IntelligencePipeline (Spec 2 SC35)`

### Task 7: TDD — `createAnalysisProvider` routing-driven sel + intelligence-pipeline plumbing

**Depends on:** Task 6 | **Files:** `packages/orchestrator/tests/integration/intelligence-pipeline-routing.test.ts` (CREATE)

This integration test stands up an `Orchestrator` and asserts the **wiring**, not the LLM behavior — verify that `createAnalysisProvider`'s output and `createIntelligencePipeline`'s argument propagation match the routed config.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../../src/orchestrator.js';
import { MockBackend } from '../../src/agent/backends/mock.js';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { WorkflowConfig, IssueTrackerClient } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { noopExecFile } from '../helpers/noop-exec-file.js';

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: async () => Ok([]),
  } as unknown as IssueTrackerClient;
}

function makeIntelConfig(agentOverride: Partial<WorkflowConfig['agent']>): WorkflowConfig {
  return {
    agent: {
      backend: 'mock',
      ...agentOverride,
    } as unknown as WorkflowConfig['agent'],
    intelligence: { enabled: true },
  } as unknown as WorkflowConfig;
}

function callCreateAnalysisProvider(orch: Orchestrator) {
  return (orch as unknown as { createAnalysisProvider: () => unknown }).createAnalysisProvider();
}

describe('Spec 2 Phase 4 — intelligence pipeline routing', () => {
  it('SC31: routing.intelligence.sel=local builds OpenAICompatible from backends.local', async () => {
    const cfg = makeIntelConfig({
      backends: {
        local: { type: 'pi', endpoint: 'http://localhost:11434/v1', model: 'gemma-4-e4b' },
      },
      routing: { default: 'local', intelligence: { sel: 'local' } },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    // Stub fetchModels on the local resolver so it reports available.
    const resolver = (
      orch as unknown as { localResolvers: Map<string, { fetchModels: unknown }> }
    ).localResolvers
      .values()
      .next().value;
    (resolver as { fetchModels: unknown }).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    await orch.start();
    try {
      const provider = callCreateAnalysisProvider(orch);
      expect(provider).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
    } finally {
      await orch.stop();
    }
  });

  it('SC32: routing.intelligence.sel=cloud (anthropic+apiKey) builds AnthropicAnalysisProvider', async () => {
    const cfg = makeIntelConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
      },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeInstanceOf(AnthropicAnalysisProvider);
  });

  it('SC33: explicit intelligence.provider wins over routing', async () => {
    const cfg = makeIntelConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
      },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    (cfg.intelligence as Record<string, unknown>).provider = {
      kind: 'claude-cli',
    };
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeInstanceOf(ClaudeCliAnalysisProvider);
  });

  it('SC36: routing.intelligence.sel=mock returns null and warns', async () => {
    const cfg = makeIntelConfig({
      backends: { mock: { type: 'mock' } },
      routing: { default: 'mock', intelligence: { sel: 'mock' } },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const warnSpy = vi.fn();
    (orch as unknown as { logger: { warn: typeof warnSpy } }).logger.warn = warnSpy;
    const provider = callCreateAnalysisProvider(orch);
    expect(provider).toBeNull();
    const matched = warnSpy.mock.calls.find((c) =>
      String(c[0]).match(/no AnalysisProvider implementation/i)
    );
    expect(matched, `expected SC36 warn; got: ${JSON.stringify(warnSpy.mock.calls)}`).toBeTruthy();
  });

  it('SC34: routing.intelligence.pesl unset → IntelligencePipeline uses one provider', async () => {
    const cfg = makeIntelConfig({
      backends: { cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' } },
      routing: { default: 'cloud', intelligence: { sel: 'cloud' } },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    await orch.start();
    try {
      const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
      expect(pipeline).not.toBeNull();
      const enrichProv = (pipeline as { provider: unknown }).provider;
      const peslProv = (pipeline as { simulator: { provider: unknown } }).simulator.provider;
      expect(peslProv).toBe(enrichProv);
    } finally {
      await orch.stop();
    }
  });

  it('SC35: routing.intelligence.sel=cloud, pesl=local → distinct providers in pipeline', async () => {
    const cfg = makeIntelConfig({
      backends: {
        cloud: { type: 'anthropic', model: 'claude-3', apiKey: 'k' },
        local: { type: 'pi', endpoint: 'http://localhost:11434/v1', model: 'gemma-4-e4b' },
      },
      routing: {
        default: 'cloud',
        intelligence: { sel: 'cloud', pesl: 'local' },
      },
    });
    delete (cfg.agent as Partial<WorkflowConfig['agent']>).backend;
    const orch = new Orchestrator(cfg, 'Prompt', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
    });
    const resolver = (
      orch as unknown as { localResolvers: Map<string, { fetchModels: unknown }> }
    ).localResolvers
      .values()
      .next().value;
    (resolver as { fetchModels: unknown }).fetchModels = vi.fn().mockResolvedValue(['gemma-4-e4b']);
    await orch.start();
    try {
      const pipeline = (orch as unknown as { pipeline: unknown }).pipeline;
      expect(pipeline).not.toBeNull();
      const enrichProv = (pipeline as { provider: unknown }).provider;
      const peslProv = (pipeline as { simulator: { provider: unknown } }).simulator.provider;
      expect(enrichProv).toBeInstanceOf(AnthropicAnalysisProvider);
      expect(peslProv).toBeInstanceOf(OpenAICompatibleAnalysisProvider);
      expect(enrichProv).not.toBe(peslProv);
    } finally {
      await orch.stop();
    }
  });
});
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- intelligence-pipeline-routing` — at least 4 of 6 tests must FAIL (createAnalysisProvider not yet routed; createIntelligencePipeline not yet plumbing distinct providers). SC33 may pass even today (explicit-config path is unchanged).

Commit: `test(orchestrator): integration tests for intelligence pipeline routing (Spec 2 SC31-SC36)`

### Task 8: Replace `createAnalysisProvider` with routing-driven implementation

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Replace the entire `createAnalysisProvider` method (lines 569–684) with:

```typescript
/**
 * Create the AnalysisProvider for the SEL layer of the intelligence pipeline.
 *
 * Spec 2 Phase 4 (SC31–SC36) — resolution order:
 *   1. Explicit `intelligence.provider` config wins (preserves Phase 0–3 behavior; SC33).
 *   2. Otherwise, consult `agent.routing.intelligence.sel` (or `routing.default`)
 *      to pick a `BackendDef` from `agent.backends`, then translate via
 *      `buildAnalysisProvider` (the per-type factory).
 *
 * Closes the Phase 2 deferral (P2-DEF-638): the legacy `this.config.agent.backend`
 * read at the bottom of this method is removed; routing is the sole source.
 *
 * Cyclomatic complexity: pre-Phase-4 was 33 (factory dispatch was inlined
 * here). Phase 4 extracts the per-type tree into `buildAnalysisProvider`,
 * dropping this method to ≤ 5 branches (under the 15 threshold).
 */
private createAnalysisProvider(layer: 'sel' | 'pesl' = 'sel'): AnalysisProvider | null {
  const intel = this.config.intelligence;
  if (!intel?.enabled) return null;

  // 1. Explicit intelligence.provider override (SC33).
  if (intel.provider) {
    const layerModel = layer === 'sel' ? intel.models?.sel : intel.models?.pesl;
    return this.createProviderFromExplicitConfig(intel.provider, layerModel ?? this.config.agent.model);
  }

  // 2. Routing-driven selection (SC31, SC32, SC36).
  const def = this.resolveRoutedBackendForIntelligence(layer);
  if (!def) return null;

  const { name, def: backendDef } = def;
  const resolver = this.localResolvers.get(name);
  return buildAnalysisProvider({
    def: backendDef,
    backendName: name,
    layer,
    getResolvedModel: () => resolver?.resolveModel() ?? null,
    getResolverAvailable: () => resolver?.getStatus().available ?? false,
    intelligence: intel,
    logger: this.logger,
  });
}

/**
 * Look up the routed BackendDef for an intelligence layer, falling
 * back through `routing.intelligence.<layer>` → `routing.default`
 * → null. Returns the resolved name alongside the def so callers can
 * key into the per-name resolver map.
 */
private resolveRoutedBackendForIntelligence(
  layer: 'sel' | 'pesl'
): { name: string; def: BackendDef } | null {
  const routing = this.config.agent.routing;
  const backends = this.config.agent.backends;
  if (!routing || !backends) return null;
  const layerName = routing.intelligence?.[layer];
  const name = layerName ?? routing.default;
  const def = backends[name];
  if (!def) {
    this.logger.warn(
      `Intelligence pipeline: routed backend '${name}' for layer '${layer}' is not in agent.backends.`
    );
    return null;
  }
  return { name, def };
}
```

Add the import at the top of the file:

```typescript
import { buildAnalysisProvider } from './agent/analysis-provider-factory.js';
import type { BackendDef } from '@harness-engineering/types';
```

Keep `createProviderFromExplicitConfig` unchanged (SC33 preserves Phase 0–3 behavior). Delete the legacy primary-fallback block (lines 645–683) — it has been subsumed by `buildAnalysisProvider`.

Verify P2-DEF-638 closure:

```bash
git grep -n "this\.config\.agent\.backend\b" packages/orchestrator/src/orchestrator.ts
```

The remaining hits should all be **outside** `createAnalysisProvider` (the dispatch fallback marked as `Phase 4+ cleanup` per Phase 2 handoff).

Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — must pass.
Run: `pnpm --filter @harness-engineering/orchestrator test -- intelligence-pipeline-routing` — SC31, SC32, SC33, SC36 must PASS. (SC34/SC35 still need Task 9.)
Run: `pnpm --filter @harness-engineering/orchestrator test` — full suite, no regressions; check that `OT4: createAnalysisProvider logs warn when resolver reports unavailable` (orchestrator-local-resolver.test.ts:221) still passes (the warn message wording may shift — adjust the test in Task 11 if so).

Commit: `feat(orchestrator): rewrite createAnalysisProvider as routing-driven (Spec 2 SC31, SC32, SC36; closes P2-DEF-638)`

### Task 9: Plumb distinct sel/pesl providers through `createIntelligencePipeline`

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.ts`

Replace `createIntelligencePipeline` (lines 546–559) with:

```typescript
private createIntelligencePipeline(): IntelligencePipeline | null {
  const intel = this.config.intelligence;
  if (!intel?.enabled) return null;

  const selProvider = this.createAnalysisProvider('sel');
  if (!selProvider) return null;

  // Spec 2 SC34/SC35: when sel and pesl route to different backends,
  // build a distinct provider for the PESL layer. When they route to
  // the same backend (or pesl is unset), pass undefined so the
  // pipeline falls back to the sel provider (current behavior).
  const routing = this.config.agent.routing;
  const peslName = routing?.intelligence?.pesl;
  const selName = routing?.intelligence?.sel ?? routing?.default;
  const peslProvider =
    peslName !== undefined && peslName !== selName ? this.createAnalysisProvider('pesl') : undefined;

  const peslModel = intel.models?.pesl ?? this.config.agent.model;
  const store = new GraphStore();
  this.graphStore = store;
  return new IntelligencePipeline(selProvider, store, {
    ...(peslModel !== undefined && { peslModel }),
    ...(peslProvider !== undefined && { peslProvider }),
  });
}
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- intelligence-pipeline-routing` — SC34 and SC35 must PASS.
Run full orchestrator suite — no regressions.
Run: `pnpm --filter @harness-engineering/intelligence test` — no regressions.
Run: `harness validate`.

Commit: `feat(orchestrator): plumb distinct pesl provider into IntelligencePipeline (Spec 2 SC34, SC35)`

### Task 10: Update OT10 (`orchestrator-local-resolver.test.ts`) for the new `createAnalysisProvider` shape

**Depends on:** Task 9 | **Files:** `packages/orchestrator/tests/integration/orchestrator-local-resolver.test.ts`

The OT10 source-text assertion at line 159 still passes (`createAnalysisProvider` exists; references `this.localResolvers`), but the regex `/private createAnalysisProvider\(\)[\s\S]*?\n  \}/` now fails because the signature gained a default-arg `(layer: 'sel' | 'pesl' = 'sel')`. Update the regex:

```typescript
const analysisProviderMatch = src.match(/private createAnalysisProvider\([^)]*\)[\s\S]*?\n  \}/);
```

Also relax the `expect(analysisProviderMatch![0]).toMatch(/this\.localResolvers/)` assertion: the new implementation references `this.localResolvers.get(name)` via the helper `resolveRoutedBackendForIntelligence`, which is **outside** the matched method block. Replace with a structural check:

```typescript
// Phase 4: createAnalysisProvider delegates to buildAnalysisProvider
// (per-type factory) and resolveRoutedBackendForIntelligence (router
// lookup). Source must reference both.
expect(src).toMatch(/buildAnalysisProvider/);
expect(src).toMatch(/resolveRoutedBackendForIntelligence/);
expect(src).toMatch(/this\.localResolvers\.get/); // still present in the helper
```

Verify the OT4 `OT4: createAnalysisProvider logs warn when resolver reports unavailable` test (line 221) — the warn wording changed in Task 4 from `'Intelligence pipeline disabled: no configured localModel loaded'` to `'Intelligence pipeline disabled for backend ... at <endpoint>: no configured local model loaded.'`. Update the matcher:

```typescript
const matched = warnCalls.find((m) => /Intelligence pipeline disabled for backend/i.test(m));
```

Run: `pnpm --filter @harness-engineering/orchestrator test -- orchestrator-local-resolver` — must PASS.

Commit: `test(orchestrator): update OT10 + OT4 for routing-driven createAnalysisProvider (Spec 2 Phase 4)`

### Task 11: Verify P2-DEF-638 closure + complexity reduction

**Depends on:** Task 10 | **Files:** none — verification only

1. `git grep -n "this\.config\.agent\.backend\b" packages/orchestrator/src/orchestrator.ts | grep -i "createAnalysisProvider\|570\|580\|590\|600\|610\|620\|630\|640\|650\|660\|670\|680"`
   - Expected: zero matches inside the createAnalysisProvider line range.
   - Remaining matches (the dispatch fallback in `dispatchIssue`-adjacent code) are documented Phase 4+ cleanup.
2. `pnpm --filter @harness-engineering/orchestrator exec tsx -e "const fs=require('fs');const src=fs.readFileSync('src/orchestrator.ts','utf8');const m=src.match(/private createAnalysisProvider\([^)]*\)[\\s\\S]*?\\n  \\}/);console.log('chars:', m?.[0].length, 'lines:', m?.[0].split('\\n').length);"`
   - Spot-check: post-rewrite method should be < 40 lines (was ~115).
3. `harness check-arch` — record the new `createAnalysisProvider` cyclomaticComplexity. Expectation: ≤ 15 (under threshold). If still > 15, surface a follow-up concern in handoff and revisit factoring (e.g., split `resolveRoutedBackendForIntelligence` into a typed helper).
4. `git grep -n "PHASE3-REMOVE\|PHASE4-REMOVE\|TODO.*Phase 4\|TODO.*phase 4" packages/orchestrator/src/orchestrator.ts` — must return zero hits.

If any check fails, STOP and write a blocker to handoff.

If all pass, no commit (verification only).

### Task 12: Re-export `buildAnalysisProvider` from package barrel (orchestrator-internal use only — defer or skip)

**Depends on:** Task 11 | **Files:** none — decision-only

The new `analysis-provider-factory.ts` is consumed only by `orchestrator.ts`. Current Phase 4 scope does not require external re-export. Per Phase 2 precedent (BackendRouter / OrchestratorBackendFactory were re-exported speculatively for Phase 3+ CLI integration — and Phase 2 verification noted "no downstream packages currently import these symbols"), DO NOT re-export `buildAnalysisProvider` from `packages/orchestrator/src/index.ts`. Rationale: keeping the surface minimal until a real consumer exists.

If the executor finds a consumer during execution (e.g., a CLI command needing to preview the routed analysis provider), add the export then. Otherwise no commit.

**No commit.** This task exists to document the deliberate non-export decision in the plan history.

### Task 13: SC30 + SC41 invariant re-check (Phase 4 must not regress prior phases)

**Depends on:** Task 12 | **Files:** none — verification only

1. `git grep -n "this\.localRunner\|this\.runner\b\|backend === 'local'" packages/orchestrator/src/` — must remain zero (Phase 2 SC30 invariant).
2. `git diff 8c8e0abd -- packages/orchestrator/src/core/state-machine.ts` — must remain empty (Phase 2 SC41 invariant; baseline commit is the Phase 2 exit gate).
3. `pnpm --filter @harness-engineering/orchestrator test -- core/state-machine` — must PASS unchanged.
4. `git grep -n "this\.config\.agent\.localBackend\b\|this\.config\.agent\.localModel\b\|this\.config\.agent\.localEndpoint\b" packages/orchestrator/src/orchestrator.ts` — Phase 4's `createAnalysisProvider` rewrite removed the last two reads at lines 614 and 617. Expected hits: zero in the rewritten method; any remaining hits sit in unchanged code paths (e.g., the legacy primary-fallback area in `dispatchIssue`).

If any check fails, STOP and write a blocker to handoff.

No commit.

### Task 14: Verification gate (full mechanical sweep)

**Depends on:** Task 13 | **Files:** none — verification only

Run, in order:

1. `pnpm --filter @harness-engineering/types build`
2. `pnpm --filter @harness-engineering/types typecheck`
3. `pnpm --filter @harness-engineering/intelligence typecheck`
4. `pnpm --filter @harness-engineering/intelligence test`
5. `pnpm --filter @harness-engineering/orchestrator typecheck`
6. `pnpm --filter @harness-engineering/orchestrator test` — full suite. Expect ≥ 803 tests (797 baseline + ≥ 6 new from this phase: 3 NF-1 + 9 factory + 2 pipeline + 6 integration; net ≈ +20 if all land, but several integration tests overlap unit coverage — confirm count empirically).
7. `harness validate`
8. `harness check-deps`
9. `harness check-arch` — confirm `createAnalysisProvider` cyclomaticComplexity ≤ 15 (regression budget). Other pre-existing arch advisories (orchestrator.ts overall complexity, module size, etc.) carry forward.
10. `git grep -n "backend === 'local'" packages/orchestrator/src/` — zero hits (Phase 2 SC30).
11. `git grep -n "this\.localRunner\|this\.runner\b" packages/orchestrator/src/` — zero hits (Phase 2 SC30).
12. `git grep -n "this\.config\.agent\.backend\b" packages/orchestrator/src/orchestrator.ts | grep -nE "57[0-9]|58[0-9]|59[0-9]|60[0-9]|61[0-9]|62[0-9]|63[0-9]"` — zero hits inside `createAnalysisProvider` line range (P2-DEF-638 closure).

If all pass, write empty exit-gate commit:

```
chore(spec2): Phase 4 exit gate green (intelligence pipeline routing SC31-36; NF-1 closed)
```

If any fails, STOP and write a blocker to handoff with the failing command's stderr.

---

## Concerns

- **SEV: info** — SC36 spec wording lists `claude` alongside `mock` as "no AnalysisProvider implementation" types (proposal.md:604). In practice, `ClaudeCliAnalysisProvider` exists and is the **preferred** Phase 0 fallback for `type: 'anthropic'` without an API key (see orchestrator.ts:670–676). Plan treats `claude` as a supported analysis-provider type with `ClaudeCliAnalysisProvider`; only `mock` and `gemini` (no provider exists) trigger SC36's null+warn path. **Recommend the spec author refine SC36 wording before next minor release: "When the routed analysis backend is `mock` or has no AnalysisProvider implementation, …"**. Same imprecision pattern flagged by Phase 2 VERIFY/REVIEW for SC29 (carry-forward).
- **SEV: info** — `intelligence.provider` explicit-config path (`createProviderFromExplicitConfig`) was NOT folded into `buildAnalysisProvider`. SC33 preserves today's behavior, and the explicit-config schema is shaped differently from `BackendDef` (provider has `kind: 'anthropic' | 'claude-cli' | 'openai-compatible'`, no `type` discriminator). A future cleanup unifying both paths is a Phase 5+ docs/refactor task.
- **SEV: info** — `createAnalysisProvider(layer)` reuse for the PESL provider construction means a `null` PESL provider (e.g., routed to `mock`) would surface as undefined `peslProvider`, falling back to the sel provider. This is **correct behavior** (PESL falls back to SEL when its routed target has no provider) but worth flagging: a user routing PESL to `mock` will silently get the SEL provider for PESL, not an error. If we want hard-fail-on-unsupported-PESL semantics, lift the `createAnalysisProvider('pesl')` null check up into `createIntelligencePipeline` and emit a distinct warn. Plan defers this hardening to Phase 5 unless the user objects during APPROVE_PLAN.
- **SEV: info** — Task 12 deliberately skips re-exporting `buildAnalysisProvider`. Phase 2 verification noted speculative re-exports for `BackendRouter` / `OrchestratorBackendFactory` / `migrateAgentConfig` produced "no downstream consumers found." Following that learning, Phase 4 keeps the new module orchestrator-private until a real consumer surfaces.
- **SEV: info — integration tier rationale** — Phase 4 is **small** integration tier despite the spec's "complexity: medium" effort estimate. File count 9 (3 new internal, 6 modify); zero new public package exports (intelligence's `peslProvider` option is additive on an existing constructor; the orchestrator module gains a private file). No HTTP routes, no SSE topic changes, no dashboard surface, no migration shim, no new ADR-warranted decisions (the routing semantics were decided in Phase 0 D6/D11). Compare: Phase 2 (medium, ~13 files, public re-exports added, dispatch entry-point rewrite) vs. Phase 4 (small, internal-only refactor + 1 additive intelligence-package option).
- **SEV: info — Phase 5 hand-off (intentional deferrals)** — The `routing.intelligence.pesl` provider's `peslModel` interplay with the new distinct-provider path: when both `routing.intelligence.pesl` is set AND `intelligence.models.pesl` is set, today's plumbing passes `peslModel` to the _sel_ provider's PeslSimulator. Post-Phase-4 with a distinct provider, `peslModel` should follow the pesl provider. This is naturally correct because `PeslSimulator` is constructed with `(peslProvider ?? selProvider, options.peslModel)` — the model is per-simulator, not per-provider. Verified mentally; an explicit test for this edge case is a Phase 5+ defensive add.
- **SEV: info** — `createAnalysisProvider` is being called twice per pipeline construction when sel ≠ pesl. Each call is cheap (mostly switch-on-type + provider construction; no I/O), but if a future `buildAnalysisProvider` branch acquires expensive setup (e.g., a per-call HTTP probe), memoization should be added. Current plan: no memoization — premature optimization on a code path that runs once per orchestrator startup.

## Carry-forward closure tracking

| ID                                                                                   | Source phase          | Status after Phase 4                                                     |
| ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------ |
| **SC15** (no-backend config rejected)                                                | Phase 0               | Closed by Phase 2 Task 6 (no Phase 4 work).                              |
| **PFC-1** (factory getModel placeholder)                                             | Phase 1               | Closed by Phase 2 (resolver binding via `getResolverModelFor`).          |
| **PFC-2** (PiBackend timeoutMs)                                                      | Phase 1               | Closed by Phase 2 fixup commit `d0879d27` (transport-level enforcement). |
| **PFC-3** (ContainerBackend wrapping)                                                | Phase 1               | Closed by Phase 2 (`OrchestratorBackendFactory.wrapInContainer`).        |
| **NF-1** (CASE1 over-suppression)                                                    | Phase 0               | **Closed by Phase 4 Tasks 1–2.**                                         |
| **P2-DEF-638** (createAnalysisProvider primary fallback legacy `agent.backend` read) | Phase 2               | **Closed by Phase 4 Tasks 8 + 11 verification.**                         |
| **createAnalysisProvider cyclomatic 33**                                             | Phase 2 carry-forward | **Closed by Phase 4 Tasks 4 + 11 verification.**                         |
| **SC29 spec wording mismatch**                                                       | Phase 2 VERIFY/REVIEW | **Carry-forward — surfaced in concerns[] for spec author.**              |
| **SC36 spec wording (`claude` ambiguity)**                                           | Phase 4 (this plan)   | **New carry-forward — surfaced in concerns[] for spec author.**          |

## Carry-forward to next phases

- **Autopilot Phase 4 (spec §5):** dashboard/server multi-status surface (SC38–40); `getLocalModelStatus` callback widening; `useLocalModelStatuses()` hook rename. Phase 4-this-plan does not touch the HTTP/SSE/hook layer.
- **Autopilot Phase 5 (spec §6):** docs / ADRs / knowledge enrichment. Phase 4-this-plan does not write the new `docs/guides/multi-backend-routing.md` or any ADR — those ride into Phase 5 alongside Phase 3 + Phase 4 narratives consolidated.
- **Autopilot Phase 5+ (spec §6/§7 follow-ups):**
  - `intelligence.provider` explicit-config path could fold into `buildAnalysisProvider` (concern bullet 2 above).
  - PESL hard-fail-on-unsupported (concern bullet 3 above).
  - `dispatchIssue(..., backend?: 'local' | 'primary')` legacy parameter (Phase 2 carry-forward — Phase 4 also untouched).
  - `AgentConfig.backend` becomes optional → NF-1's `CASE1_ALWAYS_SUPPRESS` retires (Task 2 comment).

## Validation

- Plan written to `docs/changes/multi-backend-routing/plans/2026-05-04-spec2-phase4-intelligence-pipeline-routing-plan.md`.
- 14 tasks, each completable in 2–5 minutes (Tasks 11–13 are pure verification; Task 12 is a deliberate non-task).
- TDD enforced: every code-producing task pair starts with a failing test (Tasks 1, 3, 5, 7) before its implementation partner (Tasks 2, 4, 6, 8/9).
- File map complete (9 files; 3 new, 6 modify).
- All observable truths trace to specific tasks:
  - SC31 → Tasks 3, 4, 7, 8
  - SC32 → Tasks 3, 4, 7, 8
  - SC33 → Tasks 7, 8 (preserves explicit-config path)
  - SC34 → Tasks 5, 6, 7, 9
  - SC35 → Tasks 5, 6, 7, 9
  - SC36 → Tasks 3, 4, 7, 8
  - NF-1 closure → Tasks 1, 2
  - P2-DEF-638 closure → Tasks 8, 11
  - Complexity reduction → Tasks 4, 11
  - Mechanical → Task 14
- Integration tier `small` (no public-export delta; 9-file refactor + 1 additive intelligence-package option). Integration-tier rationale documented in `concerns[]`.
- Skeleton presented for APPROVE_PLAN gate; `complexity: medium` confirmed (14 tasks < 20; 0 checkpoints < 6 — well below override thresholds).
