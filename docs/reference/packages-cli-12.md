# Reference: packages / cli / 12

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/spec-craft/phases/critique.ts

[`packages/cli/src/spec-craft/phases/critique.ts`](/packages/cli/src/spec-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (file, section, rubric) triple and parses 3-axis findings from the response.

**Exports:** `CritiqueInput`, `critiqueOne`

## packages/cli/src/test-craft/catalog/rubrics/arrange-act-assert.ts

[`packages/cli/src/test-craft/catalog/rubrics/arrange-act-assert.ts`](/packages/cli/src/test-craft/catalog/rubrics/arrange-act-assert.ts)

**Exports:** `arrangeActAssertRubric`

## packages/cli/src/test-craft/catalog/rubrics/contract-not-implementation.ts

[`packages/cli/src/test-craft/catalog/rubrics/contract-not-implementation.ts`](/packages/cli/src/test-craft/catalog/rubrics/contract-not-implementation.ts)

**Exports:** `contractNotImplementationRubric`

## packages/cli/src/test-craft/catalog/rubrics/contract-not-narrative-name.ts

[`packages/cli/src/test-craft/catalog/rubrics/contract-not-narrative-name.ts`](/packages/cli/src/test-craft/catalog/rubrics/contract-not-narrative-name.ts)

**Exports:** `contractNotNarrativeNameRubric`

## packages/cli/src/test-craft/catalog/rubrics/deleting-loses-something.ts

[`packages/cli/src/test-craft/catalog/rubrics/deleting-loses-something.ts`](/packages/cli/src/test-craft/catalog/rubrics/deleting-loses-something.ts)

**Exports:** `deletingLosesSomethingRubric`

## packages/cli/src/test-craft/catalog/rubrics/explicit-failure-mode.ts

[`packages/cli/src/test-craft/catalog/rubrics/explicit-failure-mode.ts`](/packages/cli/src/test-craft/catalog/rubrics/explicit-failure-mode.ts)

**Exports:** `explicitFailureModeRubric`

## packages/cli/src/test-craft/catalog/rubrics/fixture-earns-setup-cost.ts

[`packages/cli/src/test-craft/catalog/rubrics/fixture-earns-setup-cost.ts`](/packages/cli/src/test-craft/catalog/rubrics/fixture-earns-setup-cost.ts)

**Exports:** `fixtureEarnsSetupCostRubric`

## packages/cli/src/test-craft/catalog/rubrics/meaningful-assertion.ts

[`packages/cli/src/test-craft/catalog/rubrics/meaningful-assertion.ts`](/packages/cli/src/test-craft/catalog/rubrics/meaningful-assertion.ts)

**Exports:** `meaningfulAssertionRubric`

## packages/cli/src/test-craft/catalog/rubrics/single-responsibility.ts

[`packages/cli/src/test-craft/catalog/rubrics/single-responsibility.ts`](/packages/cli/src/test-craft/catalog/rubrics/single-responsibility.ts)

**Exports:** `singleResponsibilityRubric`

## packages/cli/src/test-craft/extract/framework.ts

[`packages/cli/src/test-craft/extract/framework.ts`](/packages/cli/src/test-craft/extract/framework.ts)

Framework detection — inspects import + global signatures to classify a test file as vitest / jest / mocha / playwright.

**Exports:** `detectFramework`

## packages/cli/src/test-craft/extract/source-pair.ts

[`packages/cli/src/test-craft/extract/source-pair.ts`](/packages/cli/src/test-craft/extract/source-pair.ts)

Source-pair resolver — best-effort heuristic to map a test file to its source file under test.

**Exports:** `SourcePairResult`, `resolveSourceFile`

## packages/cli/src/test-craft/extract/tests.ts

[`packages/cli/src/test-craft/extract/tests.ts`](/packages/cli/src/test-craft/extract/tests.ts)

Per-test extractor — walks a test file's AST via TS Compiler API and captures every `it(...)` / `test(...)` block with its nesting, skip/todo/only flags, and body text.

**Exports:** `ExtractTestsInput`, `extractTests`

## packages/cli/src/test-craft/phases/critique.ts

[`packages/cli/src/test-craft/phases/critique.ts`](/packages/cli/src/test-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (test, rubric) pair and parses 3-axis findings from the response.

**Exports:** `CritiqueInput`, `critiqueOne`

## packages/cli/tests/integration/\_helpers/init-fixture.ts

[`packages/cli/tests/integration/_helpers/init-fixture.ts`](/packages/cli/tests/integration/_helpers/init-fixture.ts)

Shared scaffold for the design × roadmap integration tests (init-design-roadmap-matrix.test.ts × 6, init-design-roadmap-yes-yes-e2e.test.ts × 1).

**Exports:** `InitFixtureScenario`, `InitFixtureHandle`, `scaffoldInitFixture`
