---
'@harness-engineering/cli': minor
---

Add **naming-craft** — first member of the craft-pipeline initiative (sub-project #1 of 10). LLM-judgment skill that critiques identifier names (variables, functions, types, files) against a curated rubric catalog seeded from Martin / Beck / Karlton.

**Three decisions locked in the spec:**

1. **v1 identifier kinds: variables + functions + types + files.** Covers ~80% of naming value in TS codebases. Modules / branches / commit subjects deferred to v1.x (different infrastructure; commit subjects belong to copy-craft #5).
2. **Convention source: catalog-only + derived-from-code.** No project input required. Universal rubrics ship in the default catalog; case convention (camelCase / snake_case / PascalCase) is sampled from the project's existing identifiers via majority-rule (>50% threshold). Below threshold → silent skip of convention-conformance rubric.
3. **Living catalog H (ADR 0020).** Mirrors design-craft's catalog pattern. Seed rubrics with `contribution` / `signal` / `version` fields reserved for future growth mechanism.

**6 seed rubrics** (one file per rubric, matches design-craft layout):

- `NAME-R001` predictive power (Martin)
- `NAME-R002` concreteness (Martin / Beck)
- `NAME-R003` verb/noun honesty (Beck)
- `NAME-R004` convention conformance (Karlton)
- `NAME-R005` scope match (Beck)
- `NAME-R006` encoded measure / unit (Pragmatic Programmer)

**Honors ADRs 0018-0021:**

- ADR 0018 (LLM-judgment skill pattern): confidence is first-class on every finding; LlmProvider records cost telemetry.
- ADR 0019 (3-axis output): tier × impact × confidence emitted on every finding, never collapsed to single severity.
- ADR 0020 (living catalog H): every finding carries `cite.rubricId` for catalog usage signal; rubric `signal`/`contribution`/`version` fields ship reserved.

**Cross-cutting:** other craft skills (docs-craft / test-craft / code-craft) will call `critiqueNamesInFile(file, opts)` — exported entry point that operates on a single file without project re-walk. Pre-computed convention can be passed through to avoid re-sampling per consumer.

**Reuses design-craft infrastructure:** imports `LlmProvider` + `MockLlmProvider` + `derivePriority` directly. Extraction to `packages/cli/src/shared/llm/` deferred until a second non-design craft skill needs differences (v2 decision).

**Surface area:**

- `harness naming-craft` CLI command (`--files` / `--kinds` / `--max-files` / `--max-identifiers-per-file` / `--json` / `--verbose`)
- `naming_craft` MCP tool (count 73 → 74)
- 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
- New `craft.naming.{enabled, maxFiles, maxIdentifiersPerFile}` config block under a new top-level `craft.*` namespace
- Cross-cutting API: `runNamingCraft(input)` + `critiqueNamesInFile(file, opts)`

**Tests:** 22 new unit + integration tests across extractor, convention sampler, classifier, critique phase, and end-to-end pipeline (with mock LLM provider). 801 tests pass across the cli suite. Smoke-tested end-to-end on a fixture file: 23 findings emitted from 6 rubrics × ~5 identifiers; convention sampler correctly derives `camelCase` for variables/functions and `null` for types (single type sample insufficient for majority).

**Long-term trajectory:**

- v1.x: module / branch / commit-subject naming; POLISH phase; per-project rubric overrides; per-language (Python / Go / Rust) idiom catalogs; `align-naming` sibling FIX skill once safe-rename heuristics mature.
- v2: extract shared craft infrastructure (`LlmProvider` + 3-axis types + `derivePriority`) to `packages/cli/src/shared/craft/` when a second non-design craft skill lands; cross-craft convergence inside the (future) craft-pipeline orchestrator with shared `pipeline.namingFindings` field.
- v3: aesthetic-intent-aware naming — when project has declared `harness-design` aesthetic intent, naming critique matches identifier verbosity to that aesthetic (terse for minimalist, descriptive for verbose).
