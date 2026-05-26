# test-craft v1

> Fourth member of the craft-pipeline initiative (sub-project #3 of 10). LLM-judgment skill for test quality — the ceiling counterpart to harness-tdd (procedural), coverage thresholds, and test-pattern scaffolding skills (which enforce structure). Tests are often the worst-written code in a codebase precisely because the rule-based floor is so easy to clear. Critiques per-`it`/`test` block across vitest / jest / mocha / playwright, with optional source-pairing for contract-vs-implementation rubrics. Imports shared craft infrastructure from `packages/cli/src/shared/craft/`.

## Overview

**Project:** test-craft (v1)
**Initiative:** craft-pipeline (sub-project #3 of 10 — fourth non-design craft skill)
**Date:** 2026-05-26
**Estimated effort:** ~1 week, single PR
**Composes with:** harness-tdd (rule-based procedural floor), copy-craft (test names are prose-in-code surface adjacency), naming-craft (test identifier naming)

### What this ships

A new skill + CLI command + MCP tool that:

1. Discovers test files across vitest / jest / mocha / playwright.
2. Detects framework per-file via import + global-pattern signatures.
3. Walks the TS AST to extract every `it(...)` / `test(...)` block with its nesting (`describe` chain), name, body, and skipped/todo status.
4. Optionally resolves the source file under test via convention heuristics (`foo.test.ts` → `foo.ts` / `../src/foo.ts`).
5. Invokes an LLM critique per (test block, rubric) pair with 8 seed rubrics from the test-quality canon.
6. Emits 3-axis `TestFinding`s (tier × impact × confidence per ADR 0019).

### What this does NOT ship

- **No coverage analysis.** That's the rule-based floor. test-craft is ceiling-only.
- **No autofix.** Sibling `align-test` deferred to v2.
- **No TS type-test (`.test-d.ts`) critique.** Type-test rubrics are different (signal = type narrowing, not runtime behaviour); v1.x.
- **No fixture / helper file critique.** Test-file scoping only. Helpers + factories are v1.x once a `kind` heuristic ships.
- **No B' bootstrap.** Same posture as the rest of the craft family.
- **No graph persistence.** Phase 1 MVP.
- **No language support beyond TS/JS.** v1.x.
- **No snapshot-test critique.** Snapshots have different quality criteria (correctness checked at runtime, not in source). v1.x.

### What problem this solves

The harness codebase has ~880 tests across cli/core/orchestrator/graph. `harness-tdd` enforces TDD process; coverage thresholds enforce reachability. Neither says anything about whether a test is well-named, whether the assertion is meaningful, or whether deleting the test would lose anything. test-craft puts the test-quality canon (Beck on test names, Fowler on test smells, Kent C. Dodds on test scope) into the loop with concrete per-test findings: "this test asserts what the implementation does, not what the contract requires"; "this fixture's 47-line `beforeEach` is heavier than every assertion combined"; "this test name 'works correctly' would survive any refactor that breaks it."

## Decisions

| #   | Decision             | Lock                                                      | Rationale                                                                                                                                                                                                                                                                                                             |
| --- | -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 framework scope   | **All test frameworks (vitest, jest, mocha, playwright)** | User picked the bold scope. Each framework needs its own import-detection signature; once detected, the AST extraction is uniform (all use `describe`/`it`/`test` calls). Cost is the discovery layer; runtime cost stays the same.                                                                                   |
| 2   | Critique granularity | **Per-`it`/`test` block**                                 | Localized findings pin to a specific test; `describe`-scoped findings can't tell which assertion is weak. Higher LLM call count but maps to actionable fix scope.                                                                                                                                                     |
| 3   | Source pairing       | **Resolve source file when possible (best-effort)**       | Enables contract-vs-implementation rubrics that distinguish "tests the behavior" from "tests the structure." Best-effort heuristics (sibling, `../src/`, `../../src/`); skip silently when no source found (still emits non-source-dependent findings). Bigger prompts when source resolves; cost trade-off accepted. |

## Scope

### In-scope

- **Framework detection per file.** Inspect imports + globals:
  - **vitest** — `import { ... } from 'vitest'`
  - **jest** — `import { ... } from '@jest/globals'` or jest globals
  - **mocha** — `import 'mocha'` or mocha globals
  - **playwright** — `import { test, expect } from '@playwright/test'`
  - Fallback when nothing matches: treat as vitest (most common in TS projects)
- **Test discovery.** Glob `**/*.{test,spec}.{ts,tsx,js,jsx}` under project root; skip `node_modules`, `dist`, `build`, `coverage`, dotdirs. Honor `--files` for explicit scoping.
- **Per-test AST extraction.** Walk TS Compiler API and find `CallExpression`s whose callee is `it` / `test` / framework-specific (e.g., `test.skip`, `it.only`). For each:
  - **name** — first string-literal argument
  - **nesting** — chain of enclosing `describe(...)` calls (lexical scope walk)
  - **body** — text of the callback (truncated to 1500 chars in prompt)
  - **skipped** — `it.skip` / `test.skip` flagged as skipped
  - **todo** — `it.todo` / `test.todo` flagged as todo (skipped from critique)
  - **only** — `it.only` / `test.only` flagged in metadata
- **Source pairing (best-effort).** For each test file, try in order:
  - `<dir>/<basename>.ts` (sibling — strip `.test`/`.spec`)
  - `<dir>/../src/<basename>.ts` (vitest/co-located → src)
  - `<dir>/../../src/<basename>.ts` (tests/ peer → ../src)
  - `<dir>/../../packages/*/src/<basename>.ts` (monorepo)
  - Skip silently if no match. Source content (truncated to 2000 chars) passed as LLM context.
- **8 seed rubrics**:
  - `TEST-R001` **contract-not-narrative-name** — test name describes the contract ("returns null when input is empty"), not the implementation ("loops correctly")
  - `TEST-R002` **meaningful-assertion** — `expect(x).toBe(true)` after a setup that obviously makes it true is tautology; assertions should prove something non-trivial
  - `TEST-R003` **arrange-act-assert** — clear three-act structure; not interleaved setup/assertion lines
  - `TEST-R004` **fixture-earns-setup-cost** — heavy `beforeEach` / factory cost must be justified by what the test verifies
  - `TEST-R005` **single-responsibility** — one assertion target per `it`; multiple unrelated assertions split poorly when they break
  - `TEST-R006` **deleting-loses-something** — would removing this test lose specific coverage, or is it redundant with another test?
  - `TEST-R007` **contract-not-implementation** — test the documented behavior, not the internal structure (which refactors freely)
  - `TEST-R008` **explicit-failure-mode** — the assertion's failure message should narrate what went wrong (custom messages, descriptive matchers, etc.)
- **3-axis `TestFinding`** matching the shared craft shape: tier × impact × confidence + cite + derived priority + target.
- **Cross-cutting API:** `critiqueTestsInFile(file, opts)` exported for future craft skills + harness-tdd integration.
- **CLI:** `harness test-craft`.
- **MCP tool:** `test_craft` (count 77 → 78).
- **4-platform skill markdown.**
- **Config block:** `craft.test.{enabled, maxFiles, maxTestsPerFile, frameworks}`.

### Out-of-scope (v1)

- No coverage analysis.
- No autofix.
- No `.test-d.ts` type tests (v1.x).
- No fixture / helper / mock files (v1.x).
- No snapshot-test rubrics (v1.x).
- No B' bootstrap.
- No graph persistence.
- No non-TS/JS language support.
- No cross-test consistency rubrics ("does this suite's pattern match the rest of the codebase?").

## Inputs

- **Project root path** (CLI / MCP arg).
- **harness.config.json** — `craft.test.{enabled, maxFiles, maxTestsPerFile, frameworks}`.
- **TS Compiler API** for AST extraction.
- **LLM provider** (MockLlmProvider in v1; same posture as naming/spec/copy-craft).

## Outputs

```ts
type TestFramework = 'vitest' | 'jest' | 'mocha' | 'playwright' | 'unknown';

interface TestFinding {
  /** Stable code in TEST-R\d{3} namespace. */
  code: string;
  phase: 'critique';
  tier: 'foundational' | 'polish' | 'aspirational';
  impact: 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';
  target: {
    file: string;
    line: number;
    /** The test name (first string literal argument to it/test). */
    testName: string;
    /** Chain of enclosing describe blocks, outermost first. */
    nesting: string[];
    framework: TestFramework;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

interface TestCraftOutput {
  findings: TestFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider: string; model: string; count: number; costUsd: number };
    catalog: { rubricsApplied: string[] };
    counts: {
      filesScanned: number;
      testsExtracted: number;
      testsSkippedToOnly: number; // tests skipped because .skip/.todo
      sourcePaired: number; // tests where source file was resolved
    };
    frameworksDetected: Record<TestFramework, number>;
    runId: string;
  };
}
```

## Technical Design

### Module layout

```
packages/cli/src/test-craft/
  findings/
    schema.ts                          # TestFinding, TestCraftOutput, TestFramework
  catalog/
    rubrics/
      contract-not-narrative-name.ts   # TEST-R001
      meaningful-assertion.ts          # TEST-R002
      arrange-act-assert.ts            # TEST-R003
      fixture-earns-setup-cost.ts      # TEST-R004
      single-responsibility.ts         # TEST-R005
      deleting-loses-something.ts      # TEST-R006
      contract-not-implementation.ts   # TEST-R007
      explicit-failure-mode.ts         # TEST-R008
    index.ts                           # rubric registry
  extract/
    framework.ts                       # detectFramework(source) → TestFramework
    tests.ts                           # walk AST → ExtractedTest[]
    source-pair.ts                     # resolveSourceFile(testFile) → string | null
  phases/
    critique.ts                        # LLM critique loop per (test, rubric)
  index.ts                             # runTestCraft + critiqueTestsInFile
packages/cli/src/mcp/tools/
  test-craft.ts                        # MCP tool wrapper
packages/cli/src/commands/
  test-craft.ts                        # CLI command
agents/skills/{4 platforms}/test-craft/
  SKILL.md
  skill.yaml
```

### Framework detection

```ts
export function detectFramework(source: string): TestFramework {
  // Order matters: check most-specific signatures first
  if (/from\s+['"]@playwright\/test['"]/.test(source)) return 'playwright';
  if (/from\s+['"]@jest\/globals['"]/.test(source)) return 'jest';
  if (/from\s+['"]vitest['"]/.test(source)) return 'vitest';
  if (/^import\s+['"]mocha['"]/m.test(source)) return 'mocha';
  // Vitest is the default when nothing matches — the most common case in this repo.
  return 'vitest';
}
```

Fallback to `vitest` rather than `unknown` to keep findings flowing in projects that use globals (jest with `globals: true` config). Real `unknown` only emitted when extraction itself fails.

### Per-test AST extraction

```ts
interface ExtractedTest {
  file: string;
  line: number;
  testName: string;
  nesting: string[]; // outermost → innermost
  body: string; // truncated callback text
  framework: TestFramework;
  skipped: boolean; // .skip
  todo: boolean; // .todo — excluded from critique
  only: boolean; // .only — flagged but still critiqued
}
```

Walk uses `ts.forEachChild` recursively, maintaining a `describe` stack. For each `CallExpression`:

- Resolve the callee chain: `it`, `test`, `it.skip`, `it.only`, `it.todo`, `test.skip`, `test.only`, `test.todo`, framework-specific (`test.describe` for Playwright is handled as a describe block).
- If callee matches a recognized test invocation:
  - Extract first arg as test name (must be a string literal; otherwise skip with a debug note)
  - Capture current `nesting` stack
  - Capture the second arg (callback) text as body
- If callee is `describe(...)`:
  - Push name onto nesting stack
  - Recurse into callback
  - Pop on exit

### Source pairing

```ts
export function resolveSourceFile(testFile: string): string | null {
  const dir = path.dirname(testFile);
  const base = path.basename(testFile).replace(/\.(?:test|spec)\.(?:tsx?|jsx?)$/, '');
  const ext = /\.tsx$/.test(testFile) ? '.tsx' : '.ts';
  const candidates = [
    path.join(dir, base + ext),
    path.join(dir, '..', 'src', base + ext),
    path.join(dir, '..', '..', 'src', base + ext),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
```

When source resolves, the file content (truncated to 2000 chars) is added to the LLM prompt under a `Source under test:` block. This enables TEST-R007 (contract-not-implementation) to actually compare the test's assertions against the function's public surface.

### Critique phase

Per (test, rubric) pair:

1. Build prompt with rubric + test (name + nesting + body) + optional source (truncated) + framework label.
2. LLM returns fenced JSON: `null` (rubric doesn't apply / test is fine) OR `{ tier, impact, confidence, message }`.
3. On non-null: emit `TestFinding` with `cite.rubricId` (ADR 0020).

Skipped tests (`.skip`) are critiqued (the implementation still has signal). Todo tests (`.todo`) are excluded — no body to critique.

## Surface area

### CLI

```
harness test-craft [options]
  --files <files...>             Optional file/glob scope
  --frameworks <names...>        Restrict to: vitest / jest / mocha / playwright
  --max-files <n>                Cap file count (default: 100)
  --max-tests-per-file <n>       Cap per-file test critique (default: 20)
  --no-source-pair               Skip source-pairing resolution
  --json
  --verbose / --quiet
```

Exit codes:

- `0` — no foundational-tier findings
- `1` — at least one foundational-tier finding
- `2` — crashed

### MCP tool

`test_craft` — count 77 → 78.

### Config

```ts
craft.test: {
  enabled: boolean;
  maxFiles: number;          // default 100
  maxTestsPerFile: number;   // default 20
  frameworks?: TestFramework[];  // default: all four (+ unknown discovery)
  sourcePair?: boolean;      // default true
}
```

## Rationalizations to reject

| Rationalization                                               | Why it's wrong                                                                                                                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Critique fixture / helper files too"                         | Different rubric vocabulary needed (helpers earn their cost when reused; fixtures via 'data is the right shape' not 'assertion is meaningful'). v1.x with per-file kind detection.                      |
| "Defer source-pairing until v1.x to simplify v1"              | User locked source-pairing. Best-effort + silent-skip is the honest answer; rubrics that need source are richer; rubrics that don't still work without it.                                              |
| "Add coverage analysis to fail tests that don't add coverage" | That's the floor (`vitest --coverage`). test-craft is ceiling-only.                                                                                                                                     |
| "Run all 8 rubrics on every test regardless of framework"     | Rubrics are framework-agnostic in v1; framework is captured in `target` for downstream reporting + later v1.x per-framework rubric extensions. v1 doesn't need rubric-framework mapping.                |
| "Make per-test prompt cheaper by skipping nesting"            | Nesting carries critical context: `describe('isReady > when offline > does NOT throw', ...)`. The contract for the test is its nesting chain.                                                           |
| "Skip `.skip` tests because they're not running"              | The implementation still has signal — a `.skip`'d test with a bad name predicts a bad rewrite when it's eventually un-skipped. Critique runs; finding includes `skipped: true` metadata for downstream. |
| "Use a unified CRAFT-T\d{3} code namespace"                   | Per-skill (TEST-R\d{3}) keeps debugging local. Convergence is v2 if it pays off.                                                                                                                        |
| "Extract test names via regex instead of TS API"              | Regex misses computed names, dynamic `it.each`, nested templates. TS API is correct and we already have the dependency.                                                                                 |

## Success criteria

**Framework detection (5)**

1. `detectFramework('import { test } from "@playwright/test"')` → `'playwright'`
2. ...`'@jest/globals'` → `'jest'`
3. ...`'vitest'` → `'vitest'`
4. ...mocha import → `'mocha'`
5. Unknown imports default to `'vitest'` (most common)

**Test extraction (8)**

6. Extracts `it('returns null', () => {...})` with testName='returns null', framework set
7. Extracts `test('does X', () => {})` (alias)
8. Captures nesting from enclosing `describe('A', () => describe('B', () => it('c', ...)))` → nesting=['A','B']
9. `it.skip(...)` extracted with skipped=true
10. `it.todo('not implemented')` extracted with todo=true (excluded from critique)
11. `it.only(...)` extracted with only=true (still critiqued)
12. Non-string test names (computed) skip silently
13. Body text captured (truncated to 1500 chars)

**Source pairing (5)**

14. `foo.test.ts` next to `foo.ts` → resolves to sibling
15. `tests/foo.test.ts` with `../src/foo.ts` → resolves
16. `packages/cli/tests/foo.test.ts` with `packages/cli/src/foo.ts` → resolves via `../src/`
17. Tests with no matching source skip silently (return null)
18. `summary.counts.sourcePaired` counts resolves

**Catalog + critique (10)**

19. 8 seed rubrics ship at `catalog/rubrics/<id>.ts`
20. `runTestCraft({ path })` walks tests + emits TestCraftOutput
21. Mock LLM produces valid TestFinding with cite.rubricId
22. 3-axis preserved (ADR 0019)
23. derived.priority via shared/craft
24. Per-file cap honored
25. Project file cap honored
26. LLM `null` response → no finding
27. Cost telemetry populated
28. `summary.frameworksDetected` records per-framework counts

**Cross-cutting (2)**

29. `critiqueTestsInFile(file, opts)` exported and works on single file
30. Accepts `frameworks` filter

**Surface area (5)**

31. New MCP tool `test_craft` (count 77 → 78)
32. New CLI command `harness test-craft`
33. 4-platform skill markdown
34. New config block `craft.test.*` validates
35. Auto-doc regenerates with test_craft + test-craft skill entries

**Plugins (1)**

36. Plugin slash-commands pre-generated (`.claude-plugin` + `.cursor-plugin`) to avoid the CI drift failure pattern

## Long-term trajectory

- **v1.x — fixture / helper / mock file critique** with per-kind rubric vocabularies (helper "reused N times", fixture "data shape matches contract").
- **v1.x — `.test-d.ts` type-test rubrics** (type-narrowing signal, vitest's `expectTypeOf` patterns).
- **v1.x — snapshot test rubrics** (correctness criteria, snapshot rot detection).
- **v1.x — per-framework rubric extensions** (Playwright's `test.step`, vitest's `bench`, jest's `describe.each`).
- **v1.x — cross-test consistency rubrics** ("this suite's pattern doesn't match the rest of the codebase").
- **v1.x — `align-test` sibling FIX skill** for safe-to-apply rewrites (test renames where intent is clear).
- **v2 — integration with `harness-tdd`** so freshly-authored tests get craft critique inline.
- **v3 — execution-aware critique** (run the test, capture failure messages, critique their clarity).

## Risks + mitigations

| Risk                                                                               | Mitigation                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM cost balloons on large test suites                                             | Per-file cap (default 20 tests) + project cap (default 100 files). Cost reported in summary.llmCalls.costUsd.                                                                                      |
| Framework detection misfires on a project using jest with globals (no import)      | Vitest default fallback covers this; jest globals are AST-compatible with vitest extraction (same describe/it shape).                                                                              |
| Source pairing finds the wrong source for ambiguous test names                     | Best-effort; first match wins. If wrong, the LLM gets misleading context but rubrics are still per-test (most still work). v1.x adds disambiguation via `harness.config.json` test→source mapping. |
| Test names with template-string interpolation skipped silently                     | v1 logs them in `summary.counts.testsSkippedToOnly` (renamed if real-world signal demands). v1.x adds template-literal handling.                                                                   |
| Heavy `beforeEach` not captured in body extraction (only test callback body shown) | LLM prompt includes nesting chain + (when paired) source; missing fixture context means TEST-R004 (fixture-earns-setup-cost) is less precise — accept for v1.                                      |
| Per-framework idioms not respected (e.g., Playwright's `test.step`)                | v1 doesn't distinguish; v1.x adds framework-specific extraction extensions.                                                                                                                        |

## Open questions deferred to implementation

- **Body truncation length.** Spec says 1500 chars (matches copy-craft's snippet cap). Tunable per-config.
- **Source-pair max content size.** Spec says 2000 chars; balance between context richness and prompt cost.
- **`it.each` / `test.each` handling.** v1 captures the parent `it.each(...)` invocation with a generic name like `each: <pattern>`. Per-iteration critique deferred to v1.x.
  EOF
