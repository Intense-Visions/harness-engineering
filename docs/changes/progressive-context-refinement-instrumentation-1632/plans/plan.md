# Plan: Refinement-request instrumentation (progressive-context demand signal)

**Date:** 2026-08-31 | **Spec:** `docs/changes/progressive-context-refinement-instrumentation-1632/proposal.md` | **Tasks:** 7 | **Time:** ~30 min | **Integration Tier:** medium

## Goal

Add a measurement layer that logs every refinement request (`code_outline` / `code_search` / `code_unfold`) tagged with a progressive-domain context class, and aggregates the log into a per-class demand signal exposed via `harness mcp refinement-demand`. Zero behavioral change to the three existing tools.

## Scope

This is the scoped instrumentation half of #1632. **DEFERRED — do NOT plan or build:** the progressive-by-default contract for every context class, and the prefetch/batching policy. Those are follow-up slices that consume this slice's demand log.

## Observable Truths (Acceptance Criteria)

1. **Each refinement request is logged with a context class.** When `handleCodeOutline` / `handleCodeSearch` / `handleCodeUnfold` succeeds, one JSONL line is appended to `.harness/metrics/refinement-events.jsonl` carrying `operation`, `contextClass`, and a stamped `timestamp`; the three wired operations classify as `file-content`. (Testable: invoke a handler against a fixture, assert the line exists and classifies `file-content`.)
2. **Aggregation produces refinement-frequency-per-context-class.** `aggregateDemand` / `readRefinementDemand` returns one `ClassDemand` per class with `count` and `frequency = count/total` (0 when total is 0). (Testable: feed a known mix, assert exact counts and frequencies.)
3. **A never-read class ranks last.** `aggregateDemand` enumerates ALL classes; untouched classes appear at the bottom with `count: 0, frequency: 0`, sorted count-desc then canonical class order. (Testable: seed only `file-content` + `knowledge`; assert `history` and `telemetry` sort last with zero counts.)
4. **Instrumentation is non-fatal.** An unwritable metrics dir never throws and never changes a tool's response. (Testable: point the writer at an unwritable path; assert no throw and unchanged handler result.)
5. **Read surface is wired.** `harness mcp refinement-demand [--json]` is registered under `createMcpCommand()` and prints the ranked per-class demand (`--json` emits `RefinementDemandReport`).

## File Map

- CREATE `packages/core/src/context/refinement-demand.ts`
- CREATE `packages/core/tests/context/refinement-demand.test.ts`
- MODIFY `packages/core/src/context/index.ts` (add exports)
- CREATE `packages/cli/src/mcp/tools/refinement-telemetry.ts`
- CREATE `packages/cli/tests/mcp/tools/refinement-telemetry.test.ts`
- MODIFY `packages/cli/src/mcp/tools/code-nav.ts` (add `recordRefinement` on success in 3 handlers)
- MODIFY `packages/cli/tests/mcp/tools/code-nav-handlers.test.ts` (add logging-on-success assertion)
- MODIFY `packages/cli/src/commands/mcp.ts` (add `createMcpRefinementDemandCommand`, register in `createMcpCommand`)
- CREATE `packages/cli/tests/commands/mcp-refinement-demand.test.ts`
- REGEN `docs/reference/*` via `pnpm run generate-docs` (new subcommand)

## Repo conventions (apply to every task)

- **Build the CLI before committing.** The pre-commit arch hook runs the _built_ CLI. After code changes and before `git commit`, run `pnpm build` (turbo builds core + cli). Editing source alone leaves `dist/` stale.
- **NEVER use `--no-verify`.** All gates must pass honestly.
- **Core barrel is automatic.** `packages/core/src/index.ts` already does `export * from './context'`, so adding exports to `context/index.ts` flows to the core barrel with **no** `generate-core-barrel` allowlist edit.
- **Single-file test runs:** core → `pnpm --filter @harness-engineering/core exec vitest run tests/context/<file>`; cli → `pnpm --filter @harness-engineering/cli exec vitest run <path-relative-to-package>`.

## Tasks

### Task 1: Core demand module — types, table, classifier, `aggregateDemand` (TDD, test first)

**Files:** `packages/core/tests/context/refinement-demand.test.ts` | **DependsOn:** none

1. Create the test file `packages/core/tests/context/refinement-demand.test.ts`. Import from `../../src/context/refinement-demand`. Cover:
   - `REFINEMENT_CONTEXT_CLASSES` equals `['file-content','history','telemetry','knowledge']` (canonical order).
   - `OPERATION_CONTEXT_CLASS` maps `outline|search|unfold → file-content`, `expand-diff → history`, `expand-rationale → knowledge`, `expand-telemetry → telemetry`.
   - `classifyRefinement('unfold')` returns `'file-content'`; `classifyRefinement('expand-telemetry')` returns `'telemetry'`.
   - `aggregateDemand([])` returns `{ total: 0, byClass: [...4 classes...] }` each with `count: 0, frequency: 0`, in canonical order.
   - Truth 2: a known mix (e.g. 3×`file-content`, 1×`knowledge`) yields `total: 4`, `file-content` `count 3 frequency 0.75`, `knowledge` `count 1 frequency 0.25`, and exact frequencies.
   - Truth 3: seed only `file-content` + `knowledge`; assert `history` and `telemetry` appear LAST with `count: 0`, and that ties break by canonical class order (e.g. two zero classes stay in canonical order).
   - Sort is count-desc primary, canonical-order tiebreak.
2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/context/refinement-demand.test.ts` — observe failure (module missing).
3. Create `packages/core/src/context/refinement-demand.ts` implementing exactly the spec's data structures (proposal §"Data structures"): `RefinementContextClass`, `REFINEMENT_CONTEXT_CLASSES`, `RefinementOperation`, `OPERATION_CONTEXT_CLASS` (const `Record`), `RefinementRequest`, `classifyRefinement`, `ClassDemand`, `RefinementDemandReport`, `aggregateDemand`. Pure/IO-free. `aggregateDemand` enumerates every class from `REFINEMENT_CONTEXT_CLASSES`, counts by `request.contextClass`, computes `frequency = total === 0 ? 0 : count / total`, and sorts `byClass` by count desc then index in `REFINEMENT_CONTEXT_CLASSES`.
4. Run the test again — observe pass.
5. Run: `harness validate` (or `pnpm --filter @harness-engineering/core typecheck` if `harness` unavailable in worktree).
6. Commit: `feat(core): add refinement-demand taxonomy and aggregateDemand`

### Task 2: Export the core module via `context/index.ts`

**Files:** `packages/core/src/context/index.ts` | **DependsOn:** Task 1

1. Add to `packages/core/src/context/index.ts` a documented export block mirroring the existing style:
   - Value exports: `REFINEMENT_CONTEXT_CLASSES`, `OPERATION_CONTEXT_CLASS`, `classifyRefinement`, `aggregateDemand`.
   - Type exports: `RefinementContextClass`, `RefinementOperation`, `RefinementRequest`, `ClassDemand`, `RefinementDemandReport`.
2. No allowlist edit needed (core barrel re-exports `./context` via `export *`).
3. Run: `pnpm --filter @harness-engineering/core build` then `node -e "const c=require('./packages/core/dist/index.js'); console.log(typeof c.aggregateDemand, typeof c.classifyRefinement)"` — expect `function function`.
4. Run: `harness validate` (or core `typecheck`).
5. Commit: `feat(core): re-export refinement-demand from context barrel`

### Task 3: CLI telemetry writer/reader (TDD, test first)

**Files:** `packages/cli/tests/mcp/tools/refinement-telemetry.test.ts` | **DependsOn:** Task 2

1. Create `packages/cli/tests/mcp/tools/refinement-telemetry.test.ts`, mirroring `skill-telemetry.test.ts` (temp-dir helper with `mkdtempSync` + `afterEach` cleanup). Import `recordRefinement`, `readRefinementDemand`, `REFINEMENT_EVENTS_FILE` from `../../../src/mcp/tools/refinement-telemetry`. Cover:
   - `REFINEMENT_EVENTS_FILE` contains `metrics` and `refinement-events.jsonl`.
   - `recordRefinement(dir, { operation: 'outline', target: 'x.ts' })` writes one JSONL line at `<dir>/.harness/metrics/refinement-events.jsonl` with `operation: 'outline'`, `contextClass: 'file-content'` (derived), and a string `timestamp`.
   - Explicit `contextClass` override wins: `recordRefinement(dir, { operation: 'unfold', contextClass: 'knowledge' })` records `contextClass: 'knowledge'`.
   - Successive calls append (multiple lines).
   - Truth 4 non-fatal: `recordRefinement('/proc/nonexistent-unwritable', { operation: 'search' })` (or a path guaranteed unwritable) does NOT throw.
   - `readRefinementDemand` on a missing file returns the all-zero 4-class report (`total: 0`).
   - `readRefinementDemand` after seeding a known mix returns the aggregated report; a malformed/garbage line is skipped without throwing (parse-tolerant).
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/refinement-telemetry.test.ts` — observe failure.
3. Create `packages/cli/src/mcp/tools/refinement-telemetry.ts` copying the `skill-telemetry.ts` contract verbatim: `REFINEMENT_EVENTS_FILE = join('.harness','metrics','refinement-events.jsonl')`; `recordRefinement(projectPath, input)` — derive `contextClass = input.contextClass ?? classifyRefinement(input.operation)`, build `{ operation, contextClass, target?, timestamp: new Date().toISOString() }`, `mkdirSync(recursive)` + `appendFileSync`, ALL wrapped in `try/catch {}` (silent). `readRefinementDemand(projectPath)` — read the file if present (return `aggregateDemand([])` on missing/empty), split lines, `JSON.parse` each inside try/catch skipping bad lines, collect valid `RefinementRequest`s, return `aggregateDemand(requests)`. Import `classifyRefinement`, `aggregateDemand`, and the types from `@harness-engineering/core`.
4. Run the test again — observe pass.
5. Run: `harness validate` (or cli `typecheck`).
6. Commit: `feat(cli): add refinement telemetry writer/reader`

### Task 4: Wire `recordRefinement` into the 3 code-nav handlers (TDD, test first)

**Files:** `packages/cli/tests/mcp/tools/code-nav-handlers.test.ts`, `packages/cli/src/mcp/tools/code-nav.ts` | **DependsOn:** Task 3

1. Add a `describe('refinement instrumentation')` block to `packages/cli/tests/mcp/tools/code-nav-handlers.test.ts`. Because the writer uses `root = process.cwd()`, drive the test through cwd:
   - In `beforeEach`, `mkdtempSync` a temp project dir and `process.chdir(tmp)`; in `afterEach`, restore the original cwd and `rmSync` the temp dir.
   - Write an absolute fixture source file (e.g. a small `.ts` with an exported function) — either inside the temp dir or reuse a `packages/core/tests/fixtures/code-nav` fixture via absolute path.
   - Call `handleCodeOutline({ path: <fixtureAbs> })`; assert the result is NOT an error AND `<tmp>/.harness/metrics/refinement-events.jsonl` exists with one line whose `operation` is `'outline'` and `contextClass` is `'file-content'`.
   - (Optional, same pattern) assert `handleCodeSearch` logs `'search'` and `handleCodeUnfold` logs `'unfold'`.
   - Assert the error path does NOT log: `handleCodeOutline({ path: '/nonexistent/xyz' })` leaves no new line.
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/code-nav-handlers.test.ts` — observe failure.
3. Edit `packages/cli/src/mcp/tools/code-nav.ts`: add a static import `import { recordRefinement } from './refinement-telemetry.js';` at the top. In each handler, AFTER a successful result is computed and immediately before returning the success `content` (NOT in the `catch`/error branches):
   - `handleCodeOutline` (both the `isFile()` and `isDirectory()` success returns): `recordRefinement(process.cwd(), { operation: 'outline', target: input.path });`
   - `handleCodeSearch` (success return): `recordRefinement(process.cwd(), { operation: 'search', target: input.query });`
   - `handleCodeUnfold` (both the `symbol` and `startLine/endLine` success returns): `recordRefinement(process.cwd(), { operation: 'unfold', target: input.symbol ?? input.path });`
     The recorder is non-fatal by its own try/catch (belt-and-suspenders with placement after the result). Do NOT alter what any handler returns.
4. Run the test again — observe pass. Also rerun the full `code-nav-handlers.test.ts` and `code-nav.test.ts` to confirm no behavioral regression.
5. Run: `harness validate`.
6. Commit: `feat(cli): record refinement demand from code-nav handlers`

### Task 5: `harness mcp refinement-demand [--json]` subcommand (TDD, test first)

**Files:** `packages/cli/tests/commands/mcp-refinement-demand.test.ts`, `packages/cli/src/commands/mcp.ts` | **DependsOn:** Task 3

1. Create `packages/cli/tests/commands/mcp-refinement-demand.test.ts`, mirroring `mcp-list-capabilities.test.ts`. Test the pure formatter (export a `formatRefinementDemand(report)` alongside the command, as `mcp.ts` does for `formatContextReport`):
   - Given a `RefinementDemandReport` with a ranked mix, the human format lists every class with count + frequency, ranked, and a total line.
   - A zero-count class renders at the bottom with `0`.
   - Assert the command object built by `createMcpRefinementDemandCommand()` has name `refinement-demand` and a `--json` option.
2. Run: `pnpm --filter @harness-engineering/cli exec vitest run tests/commands/mcp-refinement-demand.test.ts` — observe failure.
3. Edit `packages/cli/src/commands/mcp.ts`:
   - Add `export function formatRefinementDemand(report): string` rendering the ranked per-class table (reuse the local `padEnd` helper), mirroring `formatContextReport`'s style.
   - Add `export function createMcpRefinementDemandCommand(): Command` mirroring `createMcpContextReportCommand()`: `new Command('refinement-demand')`, `.description(...)`, `.option('--json', ...)`, `.action` that reads `opts` via `optsWithGlobals()`, dynamically imports `readRefinementDemand` from `../mcp/tools/refinement-telemetry.js`, calls it with `process.cwd()`, then `console.log(JSON.stringify(report, null, 2))` under `--json` else `console.log(formatRefinementDemand(report))`.
   - In `createMcpCommand()`, add `command.addCommand(createMcpRefinementDemandCommand());` next to the existing `createMcpContextReportCommand()` registration.
4. Run the test again — observe pass.
5. Run: `harness validate`.
6. Commit: `feat(cli): add harness mcp refinement-demand subcommand`

### Task 6: Regenerate CLI reference docs (integration)

**Files:** `docs/reference/*` (generated) | **DependsOn:** Task 5 | **Category:** integration

1. Build first so the generator sees the new subcommand: `pnpm build`.
2. Run: `pnpm run generate-docs`.
3. Verify the new subcommand appears in the regenerated `harness mcp` reference (grep `refinement-demand` under `docs/reference/`). This clears the pre-push reference-docs freshness gate.
4. Run: `harness validate`.
5. Commit: `docs(cli): regenerate reference for harness mcp refinement-demand`

### Task 7: Full build, validate, and verify (integration)

**Files:** (no source edits) | **DependsOn:** Task 6 | **Category:** integration

1. Run `pnpm build` (turbo — builds core + cli so the pre-commit arch hook runs the current CLI).
2. Run the affected suites: `pnpm --filter @harness-engineering/core exec vitest run tests/context/refinement-demand.test.ts` and `pnpm --filter @harness-engineering/cli exec vitest run tests/mcp/tools/refinement-telemetry.test.ts tests/mcp/tools/code-nav-handlers.test.ts tests/commands/mcp-refinement-demand.test.ts`.
3. Manual smoke: from the worktree root, run `node packages/cli/dist/bin/harness.js mcp refinement-demand --json` — expect an all-zero 4-class `RefinementDemandReport` (or seeded counts if `.harness/metrics/refinement-events.jsonl` exists).
4. Run `harness validate`. NEVER `--no-verify`.
5. Write `provenance.json` (per the change's convention) and open the PR with `Refs #1632`.

## Sequencing & Dependencies

- Task 1 → Task 2 (module before its barrel export).
- Task 2 → Task 3 (writer imports the core exports).
- Task 3 → Task 4 and Task 3 → Task 5 (both depend on the writer/reader; **Tasks 4 and 5 are independent of each other** — different files, may proceed in parallel).
- Tasks 4 & 5 → Task 6 (docs regen needs the registered subcommand).
- Task 6 → Task 7 (final verify).

## Notes / Constraints carried from the spec

- **D1:** name is `RefinementContextClass` (domain axis), distinct from the existing `ContextClass` (loading axis) in `attribution.ts`. Do not conflate or reuse.
- **D3:** pure logic in core, IO in cli — copy `skill-telemetry.ts` contract verbatim (non-fatal, append-only JSONL, timestamp on write).
- **D5:** read surface is a CLI subcommand, not a new MCP tool — no tool-tier/capability churn.
- Instrumentation is strictly additive: no change to any handler's returned `content` or `isError`.
