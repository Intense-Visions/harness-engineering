---
'@harness-engineering/cli': minor
---

Add **test-craft** — fourth member of the craft-pipeline initiative (sub-project #3 of 10). LLM-judgment skill for test quality across **vitest / jest / mocha / playwright**. Per-`it`/`test` block critique with best-effort source pairing for contract-vs-implementation rubrics. Tests are often the worst-written code in a codebase precisely because the rule-based floor (coverage threshold) is so easy to clear.

**Three decisions locked:**

1. **All four frameworks** (vitest / jest / mocha / playwright). Each framework has its own import-detection signature; once detected, the AST extraction is uniform (all use `describe`/`it`/`test` calls). Discovery cost is the framework-detection layer; runtime cost stays the same.
2. **Per-`it`/`test` block critique.** Localized findings pin to a specific test (vs `describe`-scoped). Higher LLM call count but maps to actionable fix scope.
3. **Source pairing (best-effort).** Resolves `foo.test.ts` → `foo.ts` (sibling), `../src/foo.ts`, or `../../src/foo.ts`. Skip silently when no match; non-source-dependent rubrics still fire. Enables contract-vs-implementation rubrics that need the function's public surface.

**8 seed rubrics** from the test-quality canon:

| Rubric                                  | Source                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `TEST-R001` contract-not-narrative-name | Kent C. Dodds + Beck                                            |
| `TEST-R002` meaningful-assertion        | Fowler "Refactoring" + xUnit Patterns (Meszaros)                |
| `TEST-R003` arrange-act-assert          | Bill Wake "3A" + xUnit Patterns                                 |
| `TEST-R004` fixture-earns-setup-cost    | xUnit Patterns                                                  |
| `TEST-R005` single-responsibility       | Beck + Fowler (test smells: Eager Test)                         |
| `TEST-R006` deleting-loses-something    | Kent C. Dodds, "Write tests. Not too many. Mostly integration." |
| `TEST-R007` contract-not-implementation | Beck + Fowler + "Testing Trophy"                                |
| `TEST-R008` explicit-failure-mode       | xUnit Patterns + general folklore                               |

**Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal.

**Cross-cutting:** `critiqueTestsInFile(file, opts)` exported (honours framework filter and source-pairing toggle). Future craft skills + `harness-tdd` integration can invoke per-file test critique without a project walk.

**Surface area:**

- `harness test-craft` CLI command (`--files` / `--frameworks` / `--max-files` / `--max-tests-per-file` / `--no-source-pair` / `--json`)
- `test_craft` MCP tool (count 77 → 78)
- 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
- New `craft.test.{enabled, maxFiles, maxTestsPerFile, frameworks, sourcePair}` config block
- Plugin slash-command files pre-generated for `.claude-plugin` and `.cursor-plugin`

**Extractor handles** `.skip` (kept and critiqued — implementation has signal), `.only` (flagged in metadata, still critiqued), `.todo` (excluded — no body). Non-string-literal test names (computed / template) skip silently.

**Tests:** 35+ new tests across framework detection (5 frameworks), per-test extraction (skip/only/todo + nesting + body), source-pair resolver (sibling/peer/monorepo + truncation + null), critique phase, end-to-end pipeline. 912 tests pass across the cli suite. Smoke-tested end-to-end against the harness cli package: 13 tests extracted from 3 files, all source-paired correctly; 104 findings emitted (13 × 8 rubrics ≈ correct); mock provider's deterministic low-confidence response preserves ADR 0019 honesty.

**Long-term trajectory:**

- v1.x: fixture/helper/mock file critique; `.test-d.ts` type tests; snapshot rubrics; per-framework rubric extensions (Playwright `test.step`, vitest `bench`); cross-test consistency rubrics; `align-test` sibling FIX skill.
- v2: integration with `harness-tdd` so fresh tests get critique inline.
- v3: execution-aware critique (run the test, capture failure messages, critique their clarity).
