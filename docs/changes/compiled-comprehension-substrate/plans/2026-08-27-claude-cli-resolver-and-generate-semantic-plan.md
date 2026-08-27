# Plan: Phase 3 — Append claude-CLI resolver step + wire generateSemantic

**Date:** 2026-08-27
**Spec:** `docs/changes/compiled-comprehension-substrate/proposal.md` (D1, D5, D8; § Semantic generation; § Execution across contexts)
**Phase:** 3 of 6 (Implementation Order §3) · **Rigor:** standard
**Tasks:** 5 · **Checkpoints:** 2 · **Est. time:** ~24 min · **Integration Tier:** medium

---

## Goal

Give `generateSemantic` a real backend for every execution context — Anthropic
key, local `/v1`, and (new) `claude`-CLI subscription — by (A) appending a
strictly-additive `claude`-CLI step to the MCP-side analysis-provider resolver
(D8, own commit + ADR) and (B) building the cli-side `GenerateSemantic` adapter
that satisfies the core seam, backed by `AnalysisProvider.analyze<T>()`, with
static-feeds-semantic input bounding, a per-run token budget, cost levers, and a
reentrancy guard — while keeping the no-credential path (null provider →
static-only) intact.

---

## Observable Truths (Acceptance Criteria)

1. **[MODIFIED] D8 resolver precedence is Anthropic key → local `/v1` → `claude`-CLI → null.**
   `resolveAnalysisProvider()` returns the **same** provider as today for every
   environment that already resolved one:
   - `ANTHROPIC_API_KEY` set → `AnthropicAnalysisProvider` (event-driven).
   - `HARNESS_ANALYSIS_BASE_URL` set, no key → `OpenAICompatibleAnalysisProvider`.
   - both set → `AnthropicAnalysisProvider` (backward compatible).
   - blank/whitespace base-url, no key → `null`.
   - **[ADDED]** neither key nor base-url, but `claude` on PATH → `ClaudeCliAnalysisProvider`.
   - **[ADDED]** neither key nor base-url, `claude` NOT on PATH → `null`.
     (This closes SC5's subscription gap and repairs `acceptance_eval`/`outcome_eval`
     degradation for subscription users; it never removes or reorders an existing step.)
2. **SC5 (semantic half).** `createGenerateSemantic(provider)` fed a stubbed
   `AnalysisProvider` returns a validated `{ summary, invariants, model }`, and a
   `compileModule` run using it emits a `semantic: present` unit.
3. **SC4 preserved.** When the resolver returns `null`, `generateSemantic` is not
   supplied to `compileModule`; the unit is emitted `semantic: absent`, static-only,
   with zero LLM calls and no credential. `maybeCreateGenerateSemantic(null)`
   returns `undefined`.
4. **Authority-in-TS.** The adapter validates the provider's raw output against a
   Zod `responseSchema` (`{ summary: string, invariants: string[] }`). A malformed
   shape yields `null` (unit left `semantic: absent`) + a loud log — never a
   malformed unit, never an unhandled throw that aborts the run.
5. **Input bounding (primary efficiency lever).** The prompt is built from the
   static `interfaceContract` + `dependencySlice` + a **bounded** source digest,
   not full raw source. When Σ source exceeds the digest budget, the prompt is
   capped (truncation marker present) so input tokens are bounded by public
   surface, not module size.
6. **Cost levers.** Each `analyze()` call requests `disableThinking: true` and a
   tight `maxTokens`; the model is configurable (defaults to caller/config, cheap
   tier).
7. **Per-run budget, fail-loud.** The adapter enforces `maxTokensPerRun` from the
   **returned** `tokenUsage.totalTokens` across module calls. When the next call
   would exceed the budget, it short-circuits (does **not** call `analyze`),
   returns `null` (module left `semantic: absent`), and logs a budget-exhausted
   warning exactly once — never silently partial.
8. **Reentrancy guard.** If `HARNESS_COMPREHENSION_ACTIVE` is already set on entry,
   the adapter returns `null` without calling `analyze` (a comprehend-triggered
   nested `claude` must not re-trigger comprehension). During a real call the flag
   is set (so the inherited-`env` child subprocess sees it) and restored afterward.
9. `harness validate` degrades no further than the pre-existing baseline (the
   design-token warnings on untouched files — see Concerns).

## NFR Targets

Performance/cost for this phase is a **token-cost** lever, not a hot-path latency
bench: it is delivered functionally by Truths 5–7 (input bounding + tight
`maxTokens` + `disableThinking` + per-run budget), each verified by unit test with
a stubbed provider. No `*.bench.ts` is warranted (no CPU hot path; the cost is the
LLM call, which is stubbed in tests). Security: no new untrusted-input surface
(the adapter feeds our own AST-extracted contract + a bounded slice of our own
source to a provider we resolve); `harness check-security` floor stands.
_No separate NFR-tagged tasks emitted — the levers are core task content._

---

## File Map

```
# Deliverable A — D8 resolver (own atomic commit + ADR)
MODIFY packages/cli/src/mcp/utils/analysis-provider.ts        (append claude-CLI step + isClaudeCliAvailable + opts)
MODIFY packages/cli/tests/mcp/utils/analysis-provider.test.ts (unchanged-resolution + claude-on-PATH + null tests)
CREATE docs/knowledge/decisions/0106-claude-cli-fallback-analysis-provider-resolver.md

# Deliverable B — generateSemantic adapter (cli-side; NOT core — needs intelligence + resolver)
CREATE packages/cli/src/comprehension/generate-semantic.ts
CREATE packages/cli/tests/comprehension/generate-semantic.test.ts
```

No `@harness-engineering/core` barrel changes: the adapter is cli-internal
(consumed by the phase-4 `harness comprehend` CLI and `get_comprehension`), so no
`scripts/generate-core-barrel.mjs` allowlist edit is required this phase. It
imports the `GenerateSemantic`/`SemanticInput`/`SemanticGeneration` **types** from
core (already exported).

## Skeleton

_Not produced — task count (5) is below the standard-rigor threshold (8)._

## Dependencies verified (evidence)

- `@harness-engineering/intelligence` is a `workspace:*` **dependency** of `@harness-engineering/cli` (`packages/cli/package.json`). ✅
- `ClaudeCliAnalysisProvider` is exported from intelligence: `packages/intelligence/src/index.ts:51`. Its ctor takes `{ command?, defaultModel?, timeoutMs? }` and it `analyze<T>()` returns `{ result, tokenUsage: { inputTokens, outputTokens, totalTokens }, model, latencyMs }` (`packages/intelligence/src/analysis-provider/claude-cli.ts:27,38,55`). ✅
- `AnalysisRequest` already carries `disableThinking?` and `maxTokens?` (`packages/intelligence/src/analysis-provider/interface.ts:21,40`); `responseSchema` is a `z.ZodType` validated inside the provider AND we re-validate at the seam. ✅
- Core seam signatures the adapter must satisfy: `GenerateSemantic = (input: SemanticInput) => SemanticGeneration | null | Promise<...>`; `SemanticInput = { module, interfaceContract, dependencySlice, sourceFiles }`; `SemanticGeneration = { summary, invariants, model? }` (`packages/core/src/comprehension/types.ts:82-112`). ✅
- `compileModule` supplies `generateSemantic` optionally and emits `semantic: absent` when it is omitted or returns `null` (`packages/core/src/comprehension/compile.ts:60-73`). ✅
- `zod ^3.25.76` is a cli dependency. ✅
- Next ADR number is **0106** (highest existing: `0105-fleet-cross-run-claim-lease.md`). ADR format + required sections: `docs/knowledge/decisions/README.md`.
- Existing resolver + its 5 precedence tests: `packages/cli/src/mcp/utils/analysis-provider.ts`, `packages/cli/tests/mcp/utils/analysis-provider.test.ts`.

---

## Tasks

### Task 1: Append `claude`-CLI step to the analysis-provider resolver (D8 — own atomic commit)

**Depends on:** none | **Files:** `packages/cli/src/mcp/utils/analysis-provider.ts`, `packages/cli/tests/mcp/utils/analysis-provider.test.ts` | **Owns:** `packages/cli/src/mcp/utils/analysis-provider.ts`
**Category:** integration (D8) · **Skills:** `gof-chain-of-responsibility` (reference)

`[checkpoint:human-verify]` — This changes the **degradation behavior** of the
existing `acceptance_eval`/`outcome_eval` tools for subscription users. Before
committing, confirm the 5 pre-existing precedence tests still pass **unchanged**
(the append-last property) and that the two new cases behave as specified.

1. **Write the failing tests first.** Edit `packages/cli/tests/mcp/utils/analysis-provider.test.ts`:
   - Keep all 5 existing tests untouched (they must pass unchanged — this is the
     append-last proof).
   - Add a deterministic availability seam. The new tests inject availability so
     they never depend on the real host PATH:

     ```ts
     it('falls back to ClaudeCliAnalysisProvider when neither key nor base-url is set but claude is on PATH', async () => {
       clear();
       expect(
         providerName(
           await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true })
         )
       ).toBe('ClaudeCliAnalysisProvider');
     });

     it('returns null when nothing is configured and claude is NOT on PATH', async () => {
       clear();
       expect(
         await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => false })
       ).toBeNull();
     });

     it('still prefers Anthropic / local over claude-CLI (append-last, unchanged precedence)', async () => {
       clear();
       process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
       expect(
         providerName(
           await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true })
         )
       ).toBe('AnthropicAnalysisProvider');
       delete process.env.ANTHROPIC_API_KEY;
       process.env.HARNESS_ANALYSIS_BASE_URL = 'http://127.0.0.1:11434/v1';
       expect(
         providerName(
           await resolveAnalysisProvider(undefined, { isClaudeCliAvailable: () => true })
         )
       ).toBe('OpenAICompatibleAnalysisProvider');
     });
     ```

   - Add direct unit tests for the real PATH scan via injected `env`/`fileExists`
     (Windows-safe, no real fs): one asserting a `claude` file found on a PATH dir
     → `true`; one asserting empty/missing PATH → `false`; one asserting Windows
     `PATHEXT` resolution (`claude.cmd`/`claude.exe`) → `true`:
     ```ts
     import { isClaudeCliAvailable } from '../../../src/mcp/utils/analysis-provider.js';
     it('detects claude on a POSIX PATH dir', () => {
       expect(
         isClaudeCliAvailable({
           env: { PATH: '/opt/bin:/usr/bin' },
           fileExists: (p) => p === '/usr/bin/claude',
         })
       ).toBe(true);
     });
     it('is false when PATH is empty or claude is absent', () => {
       expect(isClaudeCliAvailable({ env: {}, fileExists: () => false })).toBe(false);
     });
     it('resolves a Windows PATHEXT variant', () => {
       expect(
         isClaudeCliAvailable({
           env: { Path: 'C:\\bin', PATHEXT: '.COM;.EXE;.CMD' },
           fileExists: (p) => p === 'C:\\bin\\claude.CMD',
         })
       ).toBe(true);
     });
     ```

2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/utils/analysis-provider.test.ts`
3. **Implement** in `packages/cli/src/mcp/utils/analysis-provider.ts`:
   - Add `import { existsSync } from 'node:fs';` and `import { join, delimiter } from 'node:path';`.
   - Add an exported, injectable PATH-scan helper (Windows-safe via `delimiter`
     and `PATHEXT`; POSIX has no extension):

     ```ts
     export interface ClaudeCliDetectOpts {
       env?: NodeJS.ProcessEnv;
       fileExists?: (p: string) => boolean;
     }

     /** True when a `claude` executable is resolvable on PATH. Injectable for tests. */
     export function isClaudeCliAvailable(opts: ClaudeCliDetectOpts = {}): boolean {
       const env = opts.env ?? process.env;
       const exists = opts.fileExists ?? existsSync;
       const pathVar = env.PATH ?? env.Path ?? '';
       if (!pathVar.trim()) return false;
       const isWin = process.platform === 'win32';
       const exts = isWin
         ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
         : [''];
       for (const dir of pathVar.split(delimiter)) {
         if (!dir) continue;
         for (const ext of exts) {
           if (exists(join(dir, `claude${ext}`))) return true;
         }
       }
       return false;
     }
     ```

   - Add the provider factory (mirrors `makeAnthropicProvider`/`makeLocalProvider`):
     ```ts
     /** claude-CLI provider (subscription auth, no API key) when claude is on PATH, else null. */
     function makeClaudeCliProvider(
       intelligence: Intelligence,
       model: string | undefined,
       available: boolean
     ): unknown {
       if (!available) return null;
       const Provider = intelligence.ClaudeCliAnalysisProvider as
         | ProviderCtor<{ defaultModel?: string }>
         | undefined;
       if (typeof Provider !== 'function') return null;
       return new Provider(model !== undefined ? { defaultModel: model } : {});
     }
     ```
   - Change the signature to accept optional opts and **append** the step LAST:
     ```ts
     export async function resolveAnalysisProvider(
       model?: string,
       opts: { isClaudeCliAvailable?: () => boolean } = {}
     ): Promise<unknown> {
       try {
         const intelligence = (await import('@harness-engineering/intelligence')) as Intelligence;
         const claudeAvailable = (opts.isClaudeCliAvailable ?? (() => isClaudeCliAvailable()))();
         return (
           makeAnthropicProvider(intelligence, model) ??
           makeLocalProvider(intelligence, model) ??
           makeClaudeCliProvider(intelligence, model, claudeAvailable)
         );
       } catch {
         return null;
       }
     }
     ```
   - Update the file header comment to note the new precedence tail and the D8 ADR.

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/utils/analysis-provider.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps` (new node:fs/node:path imports, cli-internal — no new cross-package edge)
6. **Run:** `node packages/cli/dist/bin/harness.js validate` (must not regress beyond the pre-existing design-token baseline)
7. **Commit (THE D8 atomic commit):** `feat(cli): append claude-CLI fallback to analysis-provider resolver (D8)`

### Task 2: ADR 0106 — claude-CLI fallback in the analysis-provider resolver

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0106-claude-cli-fallback-analysis-provider-resolver.md` | **Category:** integration (ADR)

> Note ([[manage_adr not worktree-aware]]): if `manage_adr` is available, verify it
> writes into THIS worktree before using it; otherwise author the file directly
> (below). Do not let it land in the main checkout.

1. Create `docs/knowledge/decisions/0106-claude-cli-fallback-analysis-provider-resolver.md` with frontmatter per `docs/knowledge/decisions/README.md`:
   ```yaml
   ---
   number: 0106
   title: claude-CLI fallback in the analysis-provider resolver
   date: 2026-08-27
   status: accepted
   tier: medium
   source: docs/changes/compiled-comprehension-substrate/proposal.md
   ---
   ```
   Then the three required sections:
   - **Context:** the MCP-side `resolveAnalysisProvider` (used by `acceptance_eval`/
     `outcome_eval`, and now by comprehension's `generateSemantic`) resolved only
     Anthropic-key → local `/v1` → null. A Claude **subscription** user with no
     `ANTHROPIC_API_KEY` and no local endpoint got an inert/advisory verdict even
     though a usable `claude`-CLI backend exists. Contrast the orchestrator's
     `buildAnalysisProvider`, which is a **type-dispatched** selector, not a
     precedence chain — so this is a strictly-additive extension of the MCP
     env-precedence resolver, not a merge of the two shapes.
   - **Decision:** append a `claude`-CLI step **last**: Anthropic key → local `/v1`
     → `claude`-CLI subscription (no API key) → null. Append-last preserves
     fully-local-first ([[fully-local-cannot-be-autopilot]]); it only fills the
     previously-`null` gap.
   - **Consequences (call out the behavior change explicitly):** every environment
     that resolved a provider before resolves the **same** one after; the ONLY
     changed environment is "no key + no local endpoint + claude on PATH", which
     now gets a real `ClaudeCliAnalysisProvider` verdict instead of an advisory
     stub — so `acceptance_eval`/`outcome_eval` degradation improves for
     subscription users, and comprehension's "no API token" becomes real for them.
     Nested `claude --print` draws on the interactive subscription pool (bounded by
     the adapter's cost levers — see the generateSemantic adapter). Covered by the
     append-last precedence test (Task 1).
2. **Run:** `node packages/cli/dist/bin/harness.js validate`
3. **Commit:** `docs(adr): 0106 claude-CLI fallback in analysis-provider resolver`

### Task 3: Semantic prompt-building primitives — Zod schema, bounded digest, prompt builder

**Depends on:** none | **Files:** `packages/cli/src/comprehension/generate-semantic.ts`, `packages/cli/tests/comprehension/generate-semantic.test.ts` | **Owns:** `packages/cli/src/comprehension/**`
**Skills:** `ts-zod-integration` (reference), `ts-performance-patterns` (reference)

1. **Write failing tests** in `packages/cli/tests/comprehension/generate-semantic.test.ts`:
   - `semanticResponseSchema.parse({ summary: 's', invariants: ['a'] })` succeeds;
     `.parse({ summary: 5 })` throws; extra keys stripped/rejected per schema.
   - `boundSourceDigest(files, budget)`: total under budget → full contents joined;
     total over budget → output length ≤ budget and ends with a truncation marker
     (e.g. `\n… [source truncated for comprehension digest]`).
   - `buildSemanticPrompt(input, digestBudget)`: returned prompt CONTAINS
     `input.interfaceContract` and `input.dependencySlice`; when source exceeds the
     budget it contains the truncation marker and does NOT contain the full raw
     source of an over-budget file.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
3. **Implement** in `packages/cli/src/comprehension/generate-semantic.ts`:

   ```ts
   import { z } from 'zod';
   import type { SourceFile } from '@harness-engineering/core';

   /** Authority-in-TS: the unit shape is validated here, never trusted raw. */
   export const semanticResponseSchema = z
     .object({ summary: z.string(), invariants: z.array(z.string()) })
     .strict();
   export type SemanticResult = z.infer<typeof semanticResponseSchema>;

   export const DEFAULT_DIGEST_CHAR_BUDGET = 12_000;
   export const DEFAULT_MAX_OUTPUT_TOKENS = 700;

   /** Bounded source digest — input tokens bounded by budget, not module size. */
   export function boundSourceDigest(
     files: SourceFile[],
     budget = DEFAULT_DIGEST_CHAR_BUDGET
   ): string {
     const marker = '\n… [source truncated for comprehension digest]';
     let out = '';
     for (const f of files) {
       const block = `// ${f.path}\n${f.content}\n`;
       if (out.length + block.length > budget) {
         return (out + block).slice(0, Math.max(0, budget - marker.length)) + marker;
       }
       out += block;
     }
     return out;
   }

   export function buildSemanticPrompt(
     input: {
       module: string;
       interfaceContract: string;
       dependencySlice: string;
       sourceFiles: SourceFile[];
     },
     digestBudget = DEFAULT_DIGEST_CHAR_BUDGET
   ): string {
     return [
       `Summarize the module \`${input.module}\` for another engineer.`,
       `Return a concise prose summary and a list of load-bearing invariants.`,
       `## Interface Contract\n${input.interfaceContract}`,
       `## Dependency Slice\n${input.dependencySlice}`,
       `## Source (bounded digest)\n${boundSourceDigest(input.sourceFiles, digestBudget)}`,
     ].join('\n\n');
   }
   ```

   > Verify `SourceFile` is re-exported from the core barrel; if not, import from
   > `@harness-engineering/core/dist/comprehension/types` is NOT allowed — instead
   > import the type via the package root (`@harness-engineering/core`). If the type
   > is missing from the barrel, this is a blocking core-barrel gap → escalate
   > rather than deep-import.

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): add comprehension semantic prompt primitives (schema, digest, prompt)`

### Task 4: `createGenerateSemantic` adapter — provider call, budget, guard, validation

**Depends on:** Task 3 | **Files:** `packages/cli/src/comprehension/generate-semantic.ts`, `packages/cli/tests/comprehension/generate-semantic.test.ts` | **Owns:** `packages/cli/src/comprehension/**`
**Skills:** `ts-performance-patterns` (reference), `ts-type-guards` (reference)

`[checkpoint:decision]` — Default model tier. The adapter accepts an optional
`model`; when omitted the resolved provider's own default is used. Confirm whether
this phase should hardcode a cheap-tier default id (e.g. a Haiku-class id) or defer
the default entirely to the phase-4 `harness.config.json` `comprehension.model`
(recommended: defer to config; keep the adapter model-agnostic, provider default
when unset). Present both, take the choice, then implement.

1. **Write failing tests** (stubbed `AnalysisProvider` — records requests, returns canned responses):
   - **Happy path:** stub returns `{ result: { summary, invariants }, tokenUsage: { totalTokens: 50, ... }, model: 'x' }`; adapter returns `{ summary, invariants, model: 'x' }`; assert the recorded request had `disableThinking === true`, a numeric `maxTokens`, `responseSchema` present, and `prompt` containing the interface contract.
   - **Malformed → null (authority-in-TS):** stub returns `{ result: { summary: 42 } }`; adapter returns `null` (does NOT throw), and logs once.
   - **Budget fail-loud:** `createGenerateSemantic({ provider, maxTokensPerRun: 100, logger })`; first call (stub totalTokens 100) succeeds; second call → returns `null`, `provider.analyze` NOT called on the second, `logger.warn` called exactly once with a budget-exhausted message.
   - **Reentrancy guard — already set:** with `process.env.HARNESS_COMPREHENSION_ACTIVE = '1'` on entry, adapter returns `null` and `provider.analyze` is NOT called. (Restore env in `afterEach`.)
   - **Reentrancy guard — sets flag for child:** with the flag unset, during the (awaited) `analyze` call the stub observes `process.env.HARNESS_COMPREHENSION_ACTIVE === '1'`; after the call it is restored to its prior value (unset).
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
3. **Implement** — append to `packages/cli/src/comprehension/generate-semantic.ts`:

   ```ts
   import type { AnalysisProvider } from '@harness-engineering/intelligence';
   import type {
     GenerateSemantic,
     SemanticInput,
     SemanticGeneration,
   } from '@harness-engineering/core';

   export const REENTRANCY_ENV = 'HARNESS_COMPREHENSION_ACTIVE';

   export interface GenerateSemanticOptions {
     model?: string;
     maxOutputTokens?: number; // tight cap; default DEFAULT_MAX_OUTPUT_TOKENS
     maxTokensPerRun?: number; // per-run budget from returned tokenUsage
     digestCharBudget?: number; // input-bounding budget
     logger?: { warn: (m: string) => void };
   }

   /**
    * Build the concrete GenerateSemantic seam over an AnalysisProvider.
    * Stateful across module calls in a run (shared budget). Never throws for a
    * merely-missing/failed provider — returns null so the unit stays static-only.
    */
   export function createGenerateSemantic(
     provider: AnalysisProvider,
     opts: GenerateSemanticOptions = {}
   ): GenerateSemantic {
     const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
     const budget = opts.maxTokensPerRun ?? Infinity;
     const log = opts.logger ?? console;
     let spent = 0;
     let budgetWarned = false;

     return async (input: SemanticInput): Promise<SemanticGeneration | null> => {
       // Reentrancy guard: a comprehend-triggered nested `claude` must not recurse.
       if (process.env[REENTRANCY_ENV]) return null;
       if (spent >= budget) {
         if (!budgetWarned) {
           log.warn(
             `comprehension: per-run token budget (${budget}) exhausted; remaining modules left semantic:absent`
           );
           budgetWarned = true;
         }
         return null;
       }
       const prev = process.env[REENTRANCY_ENV];
       process.env[REENTRANCY_ENV] = '1';
       try {
         const res = await provider.analyze<unknown>({
           prompt: buildSemanticPrompt(input, opts.digestCharBudget),
           responseSchema: semanticResponseSchema,
           disableThinking: true,
           maxTokens: maxOutputTokens,
           ...(opts.model ? { model: opts.model } : {}),
         });
         spent += res.tokenUsage?.totalTokens ?? 0;
         const parsed = semanticResponseSchema.safeParse(res.result);
         if (!parsed.success) {
           log.warn(
             `comprehension: semantic output for ${input.module} failed schema validation; left semantic:absent`
           );
           return null;
         }
         return {
           summary: parsed.data.summary,
           invariants: parsed.data.invariants,
           model: res.model ?? null,
         };
       } catch (err) {
         log.warn(
           `comprehension: semantic generation for ${input.module} failed (${err instanceof Error ? err.message : String(err)}); left semantic:absent`
         );
         return null;
       } finally {
         if (prev === undefined) delete process.env[REENTRANCY_ENV];
         else process.env[REENTRANCY_ENV] = prev;
       }
     };
   }
   ```

   > `AnalysisProvider` type import: verify it is exported from the intelligence
   > package root (`packages/intelligence/src/index.ts`). If only the concrete
   > providers are exported, import the interface type from the barrel; do NOT
   > deep-import `dist/...`.

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): wire generateSemantic adapter over AnalysisProvider (budget, guard, zod-validated)`

### Task 5: `maybeCreateGenerateSemantic` + compileModule wire-through proof (SC5 / SC4)

**Depends on:** Task 4 | **Files:** `packages/cli/src/comprehension/generate-semantic.ts`, `packages/cli/tests/comprehension/generate-semantic.test.ts` | **Owns:** `packages/cli/src/comprehension/**`
**Skills:** `ts-testing-types` (reference)

1. **Write failing tests**:
   - `maybeCreateGenerateSemantic(null)` returns `undefined` (caller omits the seam → SC4).
   - `maybeCreateGenerateSemantic(stubProvider)` returns a function.
   - **Wire-through (SC5):** call core `compileModule('pkg/mod', sourceFiles, { extractStatic: stubStatic, generateSemantic: createGenerateSemantic(stubProvider) })`; assert the returned unit has `provenance.semantic === 'present'`, non-empty `summary`, and `invariants` from the stub.
   - **Wire-through (SC4):** call `compileModule('pkg/mod', sourceFiles, { extractStatic: stubStatic })` (no generateSemantic, mirroring the null-provider path); assert `provenance.semantic === 'absent'`, `summary === ''`, `invariants.length === 0`. Confirm no provider interaction.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
3. **Implement** — append:
   ```ts
   /**
    * Returns undefined when no provider resolved (the resolver returned null) so
    * the caller simply omits generateSemantic from compileModule → static-only
    * (SC4). Otherwise builds the adapter.
    */
   export function maybeCreateGenerateSemantic(
     provider: AnalysisProvider | null,
     opts: GenerateSemanticOptions = {}
   ): GenerateSemantic | undefined {
     return provider ? createGenerateSemantic(provider, opts) : undefined;
   }
   ```
4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/generate-semantic.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Run:** `node packages/cli/dist/bin/harness.js validate`
7. **Commit:** `feat(cli): add maybeCreateGenerateSemantic + prove static-feeds-semantic wire-through (SC5, SC4)`

---

## Sequencing & Parallelism

- **Deliverable A (D8):** Task 1 → Task 2. Task 1 is the isolated D8 commit; Task 2 (ADR) depends on it for accurate consequence wording.
- **Deliverable B:** Task 3 → Task 4 → Task 5 (each builds on the prior in the same file).
- **A ∥ B:** Task 1 and Task 3 have `dependsOn: none` and own **disjoint** paths
  (`.../mcp/utils/analysis-provider.ts` vs `.../comprehension/**`) — they can run
  in parallel (`plan_parallelization` wave 1). Task 2 and Tasks 4–5 serialize
  within their deliverables. The B adapter does not import the resolver in this
  phase (resolver→adapter wiring is phase 4), so there is no cross-deliverable edge.

## Uncertainties

- **[ASSUMPTION]** `AnalysisProvider` and `SourceFile`/seam types are importable
  from their package roots (`@harness-engineering/intelligence`,
  `@harness-engineering/core`). Tasks 3–4 verify at implementation; a missing
  barrel export is escalated, not deep-imported.
- **[ASSUMPTION]** `console.warn` is an acceptable default "loud" channel for
  budget/validation failures in a cli-side adapter; phase 4 may inject the harness
  logger. Non-blocking.
- **[DEFERRABLE]** Exact default cheap model id — resolved at the Task 4 decision
  checkpoint (recommended: defer to phase-4 config).
- **[DEFERRABLE]** Bounded **concurrency across modules** is a scheduling concern
  of the phase-4 `harness comprehend` driver (which enumerates + iterates modules),
  not of the per-module adapter. The per-run **budget** lives in the adapter (this
  phase); concurrency is handed off to phase 4.

## Integration Tier: medium

New cli-internal module + new exports within the cli package (5 files touched),
plus a behavior-changing resolver + ADR. No new public core barrel surface, no MCP
tool registration, no `.gitignore`/config-schema change this phase (those are
phases 4–6). Integration requirements met by the ADR (Task 2) and the append-last
precedence test (Task 1); AGENTS.md / CLI-reference / knowledge-doc updates are
deferred to phase 6 per the Implementation Order.

## Success Criteria (this phase)

- SC5: semantic generation resolves via Anthropic key / `claude`-CLI subscription /
  local `/v1` — proven by the unified-resolver test (Task 1) + the adapter/wire
  tests (Tasks 4–5).
- SC4 intact: null provider → static-only, no credential (Tasks 1 null-case + 5).
- D8 resolver change lands as its own atomic commit (Task 1); ADR 0106 accompanies
  it (Task 2).
- Every task is TDD (test → fail → implement → pass), ≤3 files, with exact paths,
  code, and commands.
- `harness validate` regresses no further than the pre-existing baseline.
