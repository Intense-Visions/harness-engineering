# Plan: Phase 4 — Invalidation + CLI (`harness comprehend`)

**Date:** 2026-08-27
**Spec:** `docs/changes/compiled-comprehension-substrate/proposal.md` (Technical design → the static extractor, Invalidation (incremental); Implementation Order §4)
**Phase:** 4 of 6 (index 3) · **Rigor:** standard
**Tasks:** 10 · **Checkpoints:** 2 · **Est. time:** ~42 min · **Integration Tier:** medium

---

## Goal

Make comprehension compilable and maintainable from the command line: a concrete
language-aware `extractStatic` adapter, a git-diff→changed-module invalidation
mapping, and a standalone `harness comprehend` command (`--changed`/`--all`/`--check`/
`--stats`) that enumerates modules through the SAME canonical reader the serve gate
uses, wires the real static + (optional) semantic halves, and stays token-free for
`--check`/`--stats` and for any environment with no provider.

---

## Observable Truths (Acceptance Criteria)

1. **[ADDED] Static extractor (concrete `ExtractStatic`).** For a TS/JS module,
   `createStaticExtractor({ projectRoot, module })` returns an `ExtractStatic` that
   produces a non-empty `interfaceContract` (exported symbols, barrel-anchored on
   `index.ts` when present, else the union of top-level exports) and a
   `dependencySlice` (imports-out, grouped by source). For a module whose files are
   all an unsupported language (e.g. `.py`), it returns **empty** static sections
   (never faked) so the resulting unit is static-degraded / semantic-only. Unit test.
2. **SC3 — incremental cost (issue AC3).** `filesToModules(files)` maps a set of
   changed files to exactly the set of owning module directories (posix `dirname`
   of each supported-extension file, de-duplicated); a `--changed` run recompiles
   **only** those modules. Test asserts `changed-module-set === recompiled-set`
   (not the repo).
3. **`--all` backfill.** `enumerateModules(projectRoot)` returns every directory
   holding ≥1 direct source file (non-recursive membership per D3, skip-dirs
   honored); an `--all` run recompiles each. Unit test on a tmp tree.
4. **Canonical-enumeration invariant (pinned).** The compile path enumerates each
   module's source through `createNodeModuleSourceReader` — the SAME reader the
   serve gate uses — so a unit written by `harness comprehend` is `serve: true`
   under `serveGate` immediately after (compile-time hash == serve-time hash).
   End-to-end test (Task 9) compiles then asserts `serveGate` serves it.
5. **SC4 — no-credential invariant.** With `comprehension.semantic: false` OR the
   resolver returning `null`, a `--changed`/`--all` run completes with **zero LLM
   calls and no credential**, emitting `semantic: absent` static units. Test with a
   null/omitted `generateSemantic`.
6. **`--check` is token-free (CI backstop primitive).** `--check` recomputes each
   committed unit's `sourceHash` via the canonical reader (reusing core `serveGate`),
   reports every source-stale unit + any unreadable/unparseable `skipped` unit,
   **never calls an LLM**, **never writes**, and exits non-zero when any unit is
   source-stale. Unit + integration test.
7. **SC6 — `--stats` savings metric.** `--stats` reports served-unit token estimate
   vs raw-source token estimate and the saved delta/percent across fresh units,
   using a self-contained char-based estimate (no harness-internal telemetry),
   token-free. Unit test asserts saved = raw − served and a positive percent for a
   representative unit.
8. **Reentrancy + budget + bounded concurrency.** The whole run is wrapped in
   `withComprehensionActive`; if `isComprehensionReentrant()` is already true on
   entry the run refuses (returns a reentrancy-refused result, no compile). Modules
   run under bounded `concurrency`; the per-run token budget lives in the phase-3
   adapter closure (shared across module calls). Unit tests: refuse-on-reentrant,
   concurrency bound respected, budget threaded from config.
9. **Command registered + config read.** `harness comprehend` is registered (via the
   auto-generated `_registry.ts`), reads `comprehension.{storage,semantic,model,
maxTokensPerRun,concurrency,ci}` from `harness.config.json` with sane defaults
   when absent, and wires the node reader → static extractor → `maybeCreateGenerateSemantic`
   → `ComprehensionStore.write`. Integration test drives the built binary path.
10. `harness validate` regresses no further than the pre-existing baseline
    (design-token warnings on untouched test fixtures — see Concerns); `check-deps`
    passes.

## NFR Targets

Performance/cost for this phase is a **token-cost** lever, not a CPU hot path: the
input-bounding, tight `maxTokens`, and per-run budget all live in the phase-3
adapter and are exercised here by wiring the budget from config (Truth 8). `--check`
and `--stats` are deliberately token-free (Truths 6–7). No `*.bench.ts` is
warranted. Security: no new untrusted-input surface (the command reads our own repo
source through our own reader and feeds our own AST-extracted contract to a provider
we resolve); `harness check-security` floor stands. _No separate NFR-tagged tasks._

---

## File Map

```
# Static extractor (cli-side adapter; core stays pure per D5)
CREATE packages/cli/src/comprehension/static-extractor.ts
CREATE packages/cli/tests/comprehension/static-extractor.test.ts

# Invalidation (diff→modules) + module enumeration
CREATE packages/cli/src/comprehension/invalidation.ts
CREATE packages/cli/tests/comprehension/invalidation.test.ts

# Minimal config surface (full schema doc = phase 6)
MODIFY packages/cli/src/config/schema.ts                 (add ComprehensionConfigSchema + wire into HarnessConfigSchema)
CREATE packages/cli/src/comprehension/config.ts          (readComprehensionConfig defaults helper)
CREATE packages/cli/tests/comprehension/config.test.ts

# Driver (IO-injected, testable) — mirrors runCheckDeps/createCheckDepsCommand split
CREATE packages/cli/src/comprehension/compile-run.ts
CREATE packages/cli/tests/comprehension/compile-run.test.ts

# Command + registration
CREATE packages/cli/src/commands/comprehend.ts
MODIFY packages/cli/src/commands/_registry.ts            (AUTO-GENERATED — via generate-barrel-exports, do not hand-edit)
CREATE packages/cli/tests/comprehension/comprehend-e2e.test.ts

# Reference-docs freshness
MODIFY docs/reference/** (generated by `pnpm run generate-docs`)
```

**No `.gitignore` change this phase.** `.harness/comprehension/` is NOT matched by
any current `.gitignore` rule (the `**/.harness/*` rules are per-subdir, not a
blanket ignore — verified), so the default `storage: "committed"` units are tracked
out of the box. The `storage: "cache"` un-ignore is an adopter/phase-5 concern.

**No `@harness-engineering/core` barrel change this phase.** Everything new is
cli-internal; it consumes already-exported core symbols (`compileModule`,
`ComprehensionStore`, `createNodeComprehensionIO`, `createNodeModuleSourceReader`,
`serveGate`, `renderServedUnit`, `computeSourceHash`, the `ExtractStatic`/
`GenerateSemantic`/`ComprehensionSourceFile` types) and phase-3 cli symbols
(`maybeCreateGenerateSemantic`, `withComprehensionActive`, `isComprehensionReentrant`).

## Skeleton

_Approved: pending (standard rigor, 10 tasks ≥ 8 → skeleton presented for sign-off)._

1. **Static extractor** — render primitives + the concrete `ExtractStatic` adapter (~2 tasks, ~10 min)
2. **Invalidation** — diff→module mapping + `--all` module enumeration (~2 tasks, ~8 min)
3. **Config surface** — minimal Zod block + defaults helper (~1 task, ~4 min)
4. **Driver** — compile/write run + `--check`/`--stats` (~2 tasks, ~10 min)
5. **Command + registration + docs** — commander wiring, barrel regen, generate-docs (~3 tasks, ~10 min)

**Estimated total:** 10 tasks, ~42 min.

## Dependencies verified (evidence)

- `@harness-engineering/cli` depends on `@harness-engineering/graph`, `intelligence`,
  and `core` (`packages/cli/package.json:37-40`). ✅ (graph confirmed available.)
- Core barrel exports `compileModule`, `ComprehensionStore`, `createNodeComprehensionIO`,
  `createNodeModuleSourceReader`, `serveGate`, `renderServedUnit`, `computeSourceHash`,
  `COMPREHENSION_ROOT`, and the `ExtractStatic`/`GenerateSemantic`/`ComprehensionSourceFile`/
  `SkippedUnit`/`ComprehensionListing` types (`packages/core/src/comprehension/index.ts`). ✅
- Phase-3 cli exports `maybeCreateGenerateSemantic(provider|null, opts)`,
  `withComprehensionActive(fn, env?)`, `isComprehensionReentrant(env?)`
  (`packages/cli/src/comprehension/generate-semantic.ts:83,95,280`). ✅
- `resolveAnalysisProvider(model?, { isClaudeCliAvailable? })` resolves the D8 chain
  and returns `unknown` (cast to `AnalysisProvider | null` at the call site)
  (`packages/cli/src/mcp/utils/analysis-provider.ts:124`). ✅
- `AnalysisProvider` type exported from intelligence barrel (`packages/intelligence/src/index.ts:46`). ✅
- `deriveChangedSurface(cwd, { since?, defaultBranch? }) → { ok, files, ... }` —
  merge-base diff, never throws (`packages/cli/src/commands/validate-scope.ts:110`). ✅
- Core `TypeScriptParser` (barrel-exported; `parseFile(path)` + `extractExports(ast)`
  - `extractImports(ast)`, AST via `@typescript-eslint/typescript-estree`) is used by
    `check-deps.ts:9` and `constraints/dependencies.ts`. ✅ (This is the chosen static
    parser — see Task 2 decision checkpoint.)
- `serveGate(unit, reader)` returns `{ serve:false, reason:'source-stale', ... }` on
  any membership/content mismatch or deleted dir — reused verbatim by `--check`
  (`packages/core/src/comprehension/serve-gate.ts:29`). ✅
- `renderServedUnit(unit)` renders the compact served form used for `--stats`
  (`packages/core/src/comprehension/render.ts:11`). ✅
- Commands are registered from the AUTO-GENERATED `_registry.ts` via
  `pnpm run generate-barrel-exports` (`packages/cli/src/commands/_registry.ts:1`,
  `package.json:37`); reference docs regenerate via `pnpm run generate-docs`
  (`package.json:32`). ✅
- Config: add a block to `HarnessConfigSchema` (`packages/cli/src/config/schema.ts:1021`);
  `loadConfig(path)` validates + returns typed `HarnessConfig`
  (`packages/cli/src/config/loader.ts:43`). ✅
- Baseline (Phase-4 VALIDATE step): `harness validate` exits non-zero ONLY on
  pre-existing design-token warnings in untouched `packages/cli/tests/**` fixtures;
  `harness check-deps` passes (2420 modules, 9 layers). Confirmed this session.

---

## Tasks

### Task 1: Static-extraction render primitives (pure)

**Depends on:** none | **Files:** `packages/cli/src/comprehension/static-extractor.ts`, `packages/cli/tests/comprehension/static-extractor.test.ts` | **Owns:** `packages/cli/src/comprehension/static-extractor.ts`
**Skills:** `ts-type-guards` (reference)

1. **Write failing tests** in `packages/cli/tests/comprehension/static-extractor.test.ts`:
   - `isStaticSupported('.ts') === true`, `isStaticSupported('.tsx'|'.js'|'.jsx'|'.mjs'|'.cjs') === true`, `isStaticSupported('.py'|'.go'|'.rs') === false`.
   - `renderInterfaceContract([{ name:'compileModule', type:'named' }, { name:'Foo', type:'named' }])` returns a string CONTAINING `compileModule` and `Foo`, one per line (deterministic sort).
   - `renderInterfaceContract([])` returns `''` (empty surface → empty section, never faked).
   - `renderDependencySlice([{ source:'node:crypto', specifiers:['createHash'] }, { source:'./types', specifiers:['SourceFile'] }])` CONTAINS `node:crypto` and `./types` and its specifiers; grouped one line per source, sorted.
   - `renderDependencySlice([])` returns `''`.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/static-extractor.test.ts`
3. **Implement** in `packages/cli/src/comprehension/static-extractor.ts` — pure render helpers + the supported-extension predicate. Model shapes on core's parser `Export`/`Import` (`{ name, type, isReExport, source? }` / `{ source, specifiers, default?, namespace?, kind }`). Only the fields used by the renderers are read, so accept a minimal structural subtype:
   - `export const STATIC_SUPPORTED_EXTENSIONS = ['.ts','.tsx','.js','.jsx','.mjs','.cjs'] as const;`
   - `export function isStaticSupported(ext: string): boolean`
   - `export function renderInterfaceContract(exports: ReadonlyArray<{ name: string }>): string` — dedup by name, sort, join `export ${name}` lines.
   - `export function renderDependencySlice(imports: ReadonlyArray<{ source: string; specifiers?: string[]; default?: string; namespace?: string }>): string` — group by source, sort, render `import { a, b } from 'source'` (fold default/namespace in). Imports-out only.
4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/static-extractor.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): add comprehension static-extraction render primitives`

### Task 2: `createStaticExtractor` — concrete language-aware `ExtractStatic`

**Depends on:** Task 1 | **Files:** `packages/cli/src/comprehension/static-extractor.ts`, `packages/cli/tests/comprehension/static-extractor.test.ts` | **Owns:** `packages/cli/src/comprehension/static-extractor.ts`
**Category:** integration (new entry point on the ExtractStatic seam) · **Skills:** `ts-type-guards` (reference)

`[checkpoint:decision]` — **Static parser source.** The spec suggests the graph
`CodeIngestor`, but it is regex-based, recurses into subdirectories (violates the D3
one-directory module boundary), and requires a `GraphStore`. **Recommendation:** use
core's barrel-exported `TypeScriptParser` (real `@typescript-eslint/typescript-estree`
AST; already used by `check-deps`/`constraints`; no `GraphStore`; iterate only the
canonical member set → non-recursive by construction). Unsupported languages degrade
to semantic-only now; a graph-backed multi-language adapter can be added incrementally
(Risks table: "extractStatic language coverage gaps"). Confirm core `TypeScriptParser`
(A, recommended) vs graph `CodeIngestor` (B), then implement.

1. **Write failing tests** (write a tmp module dir under a per-test tmpdir, Windows-safe via `node:os` + `node:path`):
   - **TS with barrel:** write `index.ts` (`export { foo } from './a';`), `a.ts` (`export function foo(){}` + `import { createHash } from 'node:crypto';`). `const extract = createStaticExtractor({ projectRoot, module: 'mod' });` `const { interfaceContract, dependencySlice } = await extract(sourceFiles);` where `sourceFiles = [{path:'index.ts',content},{path:'a.ts',content}]`. Assert `interfaceContract` is barrel-anchored (contains `foo`), `dependencySlice` contains `node:crypto`.
   - **TS without barrel:** two files, no `index.ts` → `interfaceContract` is the UNION of both files' top-level exports.
   - **Unsupported language:** a `.py` file → `interfaceContract === ''` and `dependencySlice === ''` (degrade, never faked).
   - **Membership fidelity:** `extract` iterates only the passed `sourceFiles` (no recursion) — a nested subdir file is NOT reflected in the output.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/static-extractor.test.ts`
3. **Implement** — append to `static-extractor.ts`:

   ```ts
   import * as path from 'node:path';
   import { TypeScriptParser } from '@harness-engineering/core';
   import type {
     ExtractStatic,
     ComprehensionSourceFile,
     StaticExtraction,
   } from '@harness-engineering/core';

   const BARREL_BASENAMES = [
     'index.ts',
     'index.tsx',
     'index.js',
     'index.jsx',
     'index.mjs',
     'index.cjs',
   ];

   /**
    * Concrete, language-aware ExtractStatic (D1/D5). Module-bound: reconstructs each
    * canonical member's absolute path (projectRoot/module/basename) and parses it
    * with core's AST TypeScriptParser. Public surface is barrel-anchored on index.*
    * when present, else the union of all members' top-level exports. Unsupported
    * languages yield EMPTY static sections (semantic-only), never faked. Non-recursive
    * by construction: it only visits the passed sourceFiles (the canonical D3 set).
    */
   export function createStaticExtractor(opts: {
     projectRoot: string;
     module: string;
   }): ExtractStatic {
     const parser = new TypeScriptParser();
     return async (sourceFiles: ComprehensionSourceFile[]): Promise<StaticExtraction> => {
       const supported = sourceFiles.filter((f) => isStaticSupported(path.extname(f.path)));
       if (supported.length === 0) return { interfaceContract: '', dependencySlice: '' };
       const barrel = supported.find((f) => BARREL_BASENAMES.includes(f.path));
       const surfaceFiles = barrel ? [barrel] : supported;

       const exports: Array<{ name: string }> = [];
       const imports: Array<{
         source: string;
         specifiers?: string[];
         default?: string;
         namespace?: string;
       }> = [];
       for (const f of supported) {
         const abs = path.join(opts.projectRoot, opts.module, f.path);
         const ast = await parser.parseFile(abs);
         if (!ast.ok) continue; // unparseable member: skip (degrade), never fake
         if (surfaceFiles.includes(f)) {
           const ex = parser.extractExports(ast.value);
           if (ex.ok) exports.push(...ex.value.map((e) => ({ name: e.name })));
         }
         const im = parser.extractImports(ast.value);
         if (im.ok)
           imports.push(
             ...im.value.map((i) => ({
               source: i.source,
               specifiers: i.specifiers,
               default: i.default,
               namespace: i.namespace,
             }))
           );
       }
       return {
         interfaceContract: renderInterfaceContract(exports),
         dependencySlice: renderDependencySlice(imports),
       };
     };
   }
   ```

   > If `TypeScriptParser`'s `Result` shape differs (`.ok`/`.value` vs `.error`), match
   > it exactly per `packages/core/src/shared/parsers/base.ts` — do NOT deep-import the
   > parser; use the `@harness-engineering/core` barrel. If `Export`/`Import` are not
   > barrel-exported, keep the local structural subtypes above (only `name`/`source`/
   > `specifiers` are needed) rather than importing them.

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/static-extractor.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): concrete language-aware static extractor over core AST parser`

### Task 3: `filesToModules` invalidation mapping (SC3, pure)

**Depends on:** none | **Files:** `packages/cli/src/comprehension/invalidation.ts`, `packages/cli/tests/comprehension/invalidation.test.ts` | **Owns:** `packages/cli/src/comprehension/invalidation.ts`
**Category:** integration (invalidation contract) · **Skills:** `ts-testing-types` (reference)

1. **Write failing tests** in `packages/cli/tests/comprehension/invalidation.test.ts`:
   - `filesToModules(['pkg/a/x.ts','pkg/a/y.ts','pkg/b/z.ts'])` → `['pkg/a','pkg/b']` (sorted, de-duplicated owning directories).
   - A changed file at the repo root (`README.md`, no dir) and a non-source ext (`pkg/a/data.json`) are **dropped** (only `DEFAULT_SOURCE_EXTENSIONS` count).
   - A supported file in a dir returns that dir; a Windows-style `pkg\a\x.ts` normalizes to `pkg/a`.
   - **SC3 shape:** for an arbitrary changed set S, the returned set equals `{ dirname(f) : f ∈ S, supported(f) }` — nothing repo-wide.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/invalidation.test.ts`
3. **Implement** in `packages/cli/src/comprehension/invalidation.ts`:

   ```ts
   import { DEFAULT_SOURCE_EXTENSIONS } from '@harness-engineering/core';

   /** Map changed files → their owning module DIRECTORIES (the compile unit, D3).
    *  Cost ∝ diff size (SC3): the result is exactly the set of dirs of supported
    *  changed files, never the repo. Posix-normalized, sorted, de-duplicated. */
   export function filesToModules(
     files: readonly string[],
     extensions: readonly string[] = DEFAULT_SOURCE_EXTENSIONS
   ): string[] {
     const exts = new Set(extensions);
     const mods = new Set<string>();
     for (const raw of files) {
       const rel = raw.replaceAll('\\', '/');
       const dot = rel.lastIndexOf('.');
       if (dot === -1 || !exts.has(rel.slice(dot))) continue;
       const slash = rel.lastIndexOf('/');
       if (slash === -1) continue; // root-level file has no module directory
       mods.add(rel.slice(0, slash));
     }
     return [...mods].sort();
   }
   ```

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/invalidation.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): map changed files to owning comprehension modules (SC3)`

### Task 4: `enumerateModules` — directory walk for `--all`

**Depends on:** Task 3 | **Files:** `packages/cli/src/comprehension/invalidation.ts`, `packages/cli/tests/comprehension/invalidation.test.ts` | **Owns:** `packages/cli/src/comprehension/invalidation.ts`
**Skills:** `ts-testing-types` (reference)

1. **Write failing tests** (tmp tree under `node:os` tmpdir):
   - Tree: `mod/a.ts`, `mod/sub/b.ts`, `empty/README.md`, `node_modules/pkg/c.ts`. `await enumerateModules(root)` → `['mod','mod/sub']` (each dir with ≥1 DIRECT source file; `empty` excluded — no source; `node_modules` skipped).
   - Posix-normalized, sorted, repo-relative to `root`.
   - Absent root → `[]` (no throw).
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/invalidation.test.ts`
3. **Implement** — append to `invalidation.ts`. Walk with `node:fs/promises`, skip
   `node_modules`/`dist`/`build`/`coverage`/dot-dirs, collect any directory whose
   DIRECT entries include a supported-extension file (non-recursive membership per D3):

   ```ts
   import * as fsp from 'node:fs/promises';
   import * as path from 'node:path';

   const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

   export async function enumerateModules(
     projectRoot: string,
     extensions: readonly string[] = DEFAULT_SOURCE_EXTENSIONS
   ): Promise<string[]> {
     const exts = new Set(extensions);
     const mods = new Set<string>();
     async function walk(dir: string): Promise<void> {
       let entries;
       try {
         entries = await fsp.readdir(dir, { withFileTypes: true });
       } catch {
         return;
       }
       let hasDirectSource = false;
       for (const e of entries) {
         if (e.isFile() && exts.has(path.extname(e.name))) hasDirectSource = true;
       }
       if (hasDirectSource) {
         const rel = path.relative(projectRoot, dir).replaceAll('\\', '/');
         if (rel) mods.add(rel);
       }
       for (const e of entries) {
         if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
           await walk(path.join(dir, e.name));
         }
       }
     }
     await walk(projectRoot);
     return [...mods].sort();
   }
   ```

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/invalidation.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): enumerate comprehension modules for --all backfill`

### Task 5: Minimal `comprehension` config surface + defaults helper

**Depends on:** none | **Files:** `packages/cli/src/config/schema.ts`, `packages/cli/src/comprehension/config.ts`, `packages/cli/tests/comprehension/config.test.ts` | **Owns:** `packages/cli/src/comprehension/config.ts`
**Category:** integration (config schema addition) · **Skills:** `ts-zod-integration` (reference)

1. **Write failing tests** in `packages/cli/tests/comprehension/config.test.ts`:
   - `readComprehensionConfig(undefined)` → all defaults: `{ storage:'committed', semantic:true, model:null, maxTokensPerRun:200000, concurrency:4, ci:'verify' }`.
   - `readComprehensionConfig({ comprehension: { semantic:false, concurrency:2 } } as HarnessConfig)` → overrides applied, other fields defaulted.
   - `HarnessConfigSchema.parse({ version:1, comprehension:{ storage:'cache' } })` succeeds; an invalid enum (`storage:'nope'`) fails validation.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/config.test.ts`
3. **Implement:**
   - In `packages/cli/src/config/schema.ts`, add near the other config schemas (before `HarnessConfigSchema`):
     ```ts
     export const ComprehensionConfigSchema = z.object({
       storage: z.enum(['committed', 'cache']).default('committed'),
       semantic: z.boolean().default(true),
       model: z.string().nullable().default(null),
       maxTokensPerRun: z.number().int().positive().default(200_000),
       concurrency: z.number().int().positive().default(4),
       ci: z.enum(['verify', 'refresh', 'off']).default('verify'),
     });
     export type ComprehensionConfig = z.infer<typeof ComprehensionConfigSchema>;
     ```
     Then add one field inside `HarnessConfigSchema` (near `performance`):
     ```ts
       /** Compiled-comprehension substrate settings (see docs — phase 6). */
       comprehension: ComprehensionConfigSchema.optional(),
     ```
   - In `packages/cli/src/comprehension/config.ts`, a defaults helper that never throws:
     ```ts
     import {
       ComprehensionConfigSchema,
       type ComprehensionConfig,
       type HarnessConfig,
     } from '../config/schema';
     export function readComprehensionConfig(config?: HarnessConfig | null): ComprehensionConfig {
       return ComprehensionConfigSchema.parse(config?.comprehension ?? {});
     }
     ```
4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/config.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): add minimal comprehension config schema + defaults reader`

### Task 6: `runComprehend` driver — changed/all compile+write (SC3, SC4, reentrancy, concurrency)

**Depends on:** Task 2, Task 3, Task 4 | **Files:** `packages/cli/src/comprehension/compile-run.ts`, `packages/cli/tests/comprehension/compile-run.test.ts` | **Owns:** `packages/cli/src/comprehension/compile-run.ts`
**Skills:** `ts-performance-patterns` (reference), `ts-testing-types` (reference)

1. **Write failing tests** with FAKE injected IO (in-memory store/reader, stub extractor, optional stub generateSemantic — no disk, no LLM):
   - **SC3 (changed==recompiled):** given `changedModules=['pkg/a']` and a reader that serves `pkg/a`, only `pkg/a` is compiled+written; `result.compiled === ['pkg/a']` and the store received exactly one write for `pkg/a`.
   - **`--all`:** `listModules` returns `['m1','m2']` → both compiled+written.
   - **SC4 (no provider):** with `generateSemantic` omitted, written units have `provenance.semantic === 'absent'` and NO provider interaction.
   - **Semantic present:** with a stub `generateSemantic` returning `{summary,invariants}`, written unit has `semantic === 'present'`.
   - **Reentrancy refuse:** with `env[HARNESS_COMPREHENSION_ACTIVE]='1'`, `runComprehend` returns `{ reentrancyRefused: true, compiled: [] }` and performs NO compile/write. (Restore env in `afterEach`.)
   - **Reentrancy set-during-run:** with the flag unset, the stub `generateSemantic` observes `isComprehensionReentrant() === true` DURING the run; afterwards the flag is restored (unset).
   - **Concurrency bound:** with `concurrency:2` and 5 modules, an instrumented extractor asserts peak in-flight ≤ 2.
   - **Missing module source:** a reader returning `null` for a module skips it (recorded in `result.skipped`/omitted from `compiled`), no throw.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/compile-run.test.ts`
3. **Implement** `packages/cli/src/comprehension/compile-run.ts`. Import the run-boundary
   guard from phase 3 and core `compileModule`. Signature (IO-injected):

   ```ts
   import {
     compileModule,
     type ExtractStatic,
     type GenerateSemantic,
     type ComprehensionUnit,
   } from '@harness-engineering/core';
   import { withComprehensionActive, isComprehensionReentrant } from './generate-semantic';

   export interface ComprehendRunOptions {
     mode: 'changed' | 'all';
     projectRoot: string;
     reader: {
       readModuleSource(
         module: string
       ): Promise<import('@harness-engineering/core').ComprehensionSourceFile[] | null>;
     };
     store: {
       write(unit: ComprehensionUnit): Promise<import('@harness-engineering/types').Result<void>>;
     };
     makeExtractStatic: (module: string) => ExtractStatic;
     generateSemantic?: GenerateSemantic;
     changedModules?: string[]; // required for mode:'changed'
     listModules?: () => Promise<string[]>; // required for mode:'all'
     concurrency?: number;
     env?: NodeJS.ProcessEnv;
     logger?: { warn: (m: string) => void };
   }
   export interface ComprehendRunResult {
     mode: string;
     compiled: string[];
     semanticPresent: number;
     semanticAbsent: number;
     skipped: string[];
     reentrancyRefused?: boolean;
   }
   ```

   Body: refuse if `isComprehensionReentrant(env)`; else resolve the module list
   (`changedModules` or `await listModules()`); wrap the compile loop in
   `withComprehensionActive(() => ..., env)`. Compile each module under a small
   bounded-concurrency mapper (`mapWithConcurrency(items, limit, fn)` — define + export
   it here; test peak in-flight): read source (skip `null`), build `makeExtractStatic(module)`,
   `compileModule(module, sourceFiles, { extractStatic, ...(generateSemantic ? { generateSemantic } : {}) })`,
   `store.write(unit)`, tally `semantic present/absent`.

4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/compile-run.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): comprehend driver — diff-scoped compile+write, reentrancy, bounded concurrency`

### Task 7: `runComprehend` — `--check` (token-free freshness) + `--stats` (savings)

**Depends on:** Task 6 | **Files:** `packages/cli/src/comprehension/compile-run.ts`, `packages/cli/tests/comprehension/compile-run.test.ts` | **Owns:** `packages/cli/src/comprehension/compile-run.ts`
**Skills:** `ts-testing-types` (reference)

1. **Write failing tests** (fake store `list()` + reader; NO generateSemantic in scope — assert token-free):
   - **`--check` fresh:** all committed units hash-match the reader → `{ stale: [], skipped: [] }`, `ok: true`.
   - **`--check` stale:** a unit whose reader content differs → its module in `stale`; a reader returning `null` (deleted dir) → also stale; `ok: false`.
   - **`--check` skipped:** `store.list()` reporting a `skipped` unit is surfaced in the result.
   - **`--stats`:** for a fresh unit, `raw` = estimate over the reader's raw member source, `served` = estimate over `renderServedUnit(unit)`, `saved = raw - served`, `savedPct` positive; totals aggregate across fresh units. No provider interaction anywhere.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/compile-run.test.ts`
3. **Implement** — add `runComprehendCheck(opts)` and `runComprehendStats(opts)` (or a
   `mode:'check'|'stats'` branch) to `compile-run.ts`:
   - `--check`: `const listing = await store.list();` for each `unit`, `serveGate(unit, reader)` (reuse core) → collect `module` when `serve:false`; carry `listing.skipped`. Return `{ stale, skipped, ok: stale.length === 0 }`. NEVER writes, NEVER constructs a provider.
   - `--stats`: `estimateTokens(s) = Math.ceil(s.length / 4)` (self-contained heuristic — documented as approximate, no telemetry). For each fresh unit (`serveGate` serves it), `served += estimateTokens(renderServedUnit(unit))`; `raw += estimateTokens(reader source joined)`. Return `{ rawTokens, servedTokens, savedTokens, savedPct, units }`.
4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/compile-run.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
6. **Commit:** `feat(cli): comprehend --check (token-free freshness) + --stats (savings, SC6)`

### Task 8: `createComprehendCommand` + node-adapter wiring + register command

**Depends on:** Task 2, Task 5, Task 6, Task 7 | **Files:** `packages/cli/src/commands/comprehend.ts`, `packages/cli/src/commands/_registry.ts` (auto-generated), `packages/cli/tests/comprehension/comprehend-e2e.test.ts` | **Owns:** `packages/cli/src/commands/comprehend.ts`
**Category:** integration (entry point + registration) · **Skills:** `cli-ergonomics-craft` (reference)

`[checkpoint:human-verify]` — This adds a NEW top-level CLI command (new adopter-facing
surface). After wiring + `generate-barrel-exports`, confirm `harness comprehend --help`
lists `--changed`/`--all`/`--check`/`--stats`, that a `--changed` run on a clean diff
compiles nothing, and that `--check` on an empty substrate exits 0. Then proceed to
generate-docs (Task 10).

1. **Write failing test** in `packages/cli/tests/comprehension/comprehend-e2e.test.ts`
   asserting the command factory shape (unit-level; full e2e is Task 9):
   - `createComprehendCommand()` returns a `Command` named `comprehend` with the four flags registered.
   - Default mode (no flag) resolves to `changed`.
2. **Run — observe failure:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/comprehend-e2e.test.ts`
3. **Implement** `packages/cli/src/commands/comprehend.ts` (mirror the
   `runCheckDeps`/`createCheckDepsCommand` split in `check-deps.ts`):
   - `createComprehendCommand()`: `new Command('comprehend')` with `--changed`,
     `--all`, `--check`, `--stats` boolean flags; `.action` resolves the mode
     (precedence: `--check` → `--stats` → `--all` → default `--changed`).
   - Action wiring (the node adapters):
     ```ts
     const cwd = process.cwd();
     const projectRoot = cwd;
     const cfg = resolveConfig(globalOpts.config); // Ok(path) | Err
     const config = cfg.ok
       ? loadConfig(cfg.value).ok
         ? loadConfig(cfg.value).value
         : undefined
       : undefined;
     const cconf = readComprehensionConfig(config);
     const store = new ComprehensionStore({ io: createNodeComprehensionIO() }); // root = COMPREHENSION_ROOT
     const reader = createNodeModuleSourceReader(projectRoot);
     // check / stats: token-free, no provider
     // changed / all:
     const provider = cconf.semantic
       ? await resolveAnalysisProvider(cconf.model ?? undefined)
       : null;
     const generateSemantic = maybeCreateGenerateSemantic(provider as AnalysisProvider | null, {
       maxTokensPerRun: cconf.maxTokensPerRun,
       ...(cconf.model ? { model: cconf.model } : {}),
     });
     const changedModules =
       mode === 'changed' ? filesToModules(deriveChangedSurface(cwd).files) : undefined;
     await runComprehend({
       mode,
       projectRoot,
       store,
       reader,
       makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
       ...(generateSemantic ? { generateSemantic } : {}),
       ...(changedModules ? { changedModules } : {}),
       listModules: () => enumerateModules(projectRoot),
       concurrency: cconf.concurrency,
     });
     ```
   - Print a human summary (compiled count, semantic present/absent, stale/stats) via
     the existing `OutputFormatter`/`logger`; `process.exit` non-zero for `--check`
     when stale.
   - **Register:** run `pnpm run generate-barrel-exports` to regenerate `_registry.ts`
     (adds `createComprehendCommand`). Do NOT hand-edit `_registry.ts`.
   - **Build the CLI** so the pre-commit arch hook sees the new command:
     `pnpm --filter @harness-engineering/cli build` (or repo build).
4. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/comprehend-e2e.test.ts`
5. **Run:** `node packages/cli/dist/bin/harness.js comprehend --help` (confirm flags) and `node packages/cli/dist/bin/harness.js check-deps`
6. **Run:** `node packages/cli/dist/bin/harness.js validate` (no regression beyond baseline)
7. **Commit:** `feat(cli): add harness comprehend command (--changed/--all/--check/--stats)`

### Task 9: End-to-end integration test (compile → serve → --check → --stats → null-provider)

**Depends on:** Task 8 | **Files:** `packages/cli/tests/comprehension/comprehend-e2e.test.ts` | **Owns:** `packages/cli/tests/comprehension/comprehend-e2e.test.ts`
**Category:** integration · **Skills:** `ts-testing-types` (reference)

1. **Write the integration test** (real node adapters, tmp project dir, NO LLM — omit
   `generateSemantic` / set `semantic:false` so the whole test is token-free):
   - Build a tmp module `pkg/m/{index.ts,a.ts}`; run `runComprehend({ mode:'all', ... })`
     with the real `createNodeComprehensionIO` store, `createNodeModuleSourceReader`,
     and `createStaticExtractor`. Assert a committed `_module.md` exists and parses.
   - **Pinned invariant (Truth 4):** load the written unit via `store.read('pkg/m')`
     and assert `serveGate(unit, reader).serve === true` (compile-time hash ==
     serve-time hash — the SAME canonical reader on both sides).
   - **SC2/--check stale:** mutate `a.ts` on disk, run `--check`, assert `pkg/m` is
     reported `stale` and the run exits non-zero.
   - **--stats (SC6):** on the fresh substrate, assert `savedTokens > 0` and
     `savedPct > 0`.
   - **SC4:** the entire test runs with no provider and asserts all written units are
     `semantic: absent`.
2. **Run — observe pass:** `pnpm --filter @harness-engineering/cli exec vitest run tests/comprehension/comprehend-e2e.test.ts`
3. **Run:** `node packages/cli/dist/bin/harness.js check-deps`
4. **Commit:** `test(cli): comprehend end-to-end — compile, serve-gate, --check, --stats (SC2/3/4/6)`

### Task 10: Regenerate CLI reference docs for `harness comprehend`

**Depends on:** Task 8 | **Files:** `docs/reference/**` (generated) | **Category:** integration (documentation freshness)

> Pre-push blocks on stale `docs/reference/*` ([[prepush-reference-docs-freshness]]);
> a new CLI command REQUIRES a docs regen or the push gate fails.

1. **Run:** `pnpm run generate-docs`
2. Confirm the generated reference now includes `comprehend` and its flags (git diff
   shows the new entry).
3. **Run:** `node packages/cli/dist/bin/harness.js validate` (no regression beyond baseline)
4. **Commit:** `docs(reference): regenerate CLI reference for harness comprehend`

---

## Sequencing & Parallelism

- **Wave 1 (parallel — disjoint files, all `dependsOn: none`):** Task 1
  (`static-extractor.ts`), Task 3 (`invalidation.ts`), Task 5 (`schema.ts` + `config.ts`).
- **Wave 2:** Task 2 (after 1, same file), Task 4 (after 3, same file).
- **Wave 3:** Task 6 (after 2, 3, 4).
- **Wave 4:** Task 7 (after 6, same file).
- **Wave 5:** Task 8 (after 2, 5, 6, 7 — wires everything + regenerates `_registry.ts`).
- **Wave 6 (parallel):** Task 9 (integration test) and Task 10 (generate-docs), both after 8.

`_registry.ts` is auto-generated in Task 8; treat it as an output, not a hand-edited
file, so it does not create ownership conflicts.

## Uncertainties

- **[ASSUMPTION → RESOLVED IN TASK 2]** Static parser source. Recommendation: core
  `TypeScriptParser` over graph `CodeIngestor` (real AST, barrel-exported, no
  `GraphStore`, non-recursive). Ratified at the Task-2 decision checkpoint.
- **[DECISION]** `dependencySlice` is **imports-out only** this phase. The core
  `ExtractStatic` seam receives only the module's own `sourceFiles`, so "importers-in"
  (reverse dependency edges) is structurally out of scope without a repo-wide index;
  deferred (a graph-backed enrichment, later phase). Noted in Concerns.
- **[DEFERRABLE]** The extractor RE-READS member files from disk (via
  `TypeScriptParser.parseFile`) rather than parsing the in-memory `sourceFiles.content`
  the canonical reader already loaded (core exposes no content-parse entrypoint). A
  double-read of small module dirs is negligible; a TOCTOU window between reader and
  extractor is a non-issue for diff-scoped, non-concurrent-with-edit runs. If a
  content-parse path is added to core later, switch to it.
- **[DEFERRABLE]** `storage: "cache"` gitignore un-ignore. Not needed for the default
  `committed` mode (`.harness/comprehension/` is already un-ignored). Cache-mode
  ignore is an adopter/phase-5 concern.
- **[DEFERRABLE]** `--stats` uses a `chars/4` token estimate (self-contained, no
  telemetry). A real tokenizer can replace it later without changing the contract.

## Integration Tier: medium

New adopter-facing CLI command (new entry point) + new config schema field + CLI
reference regen, all within the existing `cli` package; no new package, no new skill,
no new core barrel surface, no MCP tool. Integration requirements met by: barrel
regen (Task 8), config schema addition (Task 5), and generate-docs (Task 10).
AGENTS.md capabilities, the `docs/knowledge/` substrate entry, ADRs (D2/D7), and the
full config-surface doc are deferred to phase 6 per the Implementation Order. The
`.gitignore` un-ignore listed under Registrations Required is a NO-OP this phase
(committed path already tracked).

## Success Criteria (this phase)

- SC3: `filesToModules` gives changed-set == recompiled-set (Task 3 + Task 6 + Task 9).
- SC6: `--stats` reports served-vs-raw savings without internal telemetry (Task 7 + Task 9).
- SC4 preserved: null/`semantic:false` provider → static-only, no credential (Task 6 + Task 9).
- Pinned canonical-enumeration invariant holds: a compiled unit serves immediately
  under `serveGate` (Task 9).
- `harness comprehend` registered, config-driven, reentrancy-guarded, bounded-concurrency,
  budget-threaded (Tasks 6, 8).
- Every task is TDD (test → fail → implement → pass), ≤3 files, exact paths/code/commands.
- `harness validate` regresses no further than the pre-existing design-token baseline;
  `check-deps` passes.
