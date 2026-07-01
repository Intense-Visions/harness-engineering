# Reference: packages / cli / 5

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/copy-craft/catalog/rubrics/signal-not-noise.ts

[`packages/cli/src/copy-craft/catalog/rubrics/signal-not-noise.ts`](/packages/cli/src/copy-craft/catalog/rubrics/signal-not-noise.ts)

**Exports:** `signalNotNoiseRubric`

## packages/cli/src/copy-craft/catalog/rubrics/specific-not-generic.ts

[`packages/cli/src/copy-craft/catalog/rubrics/specific-not-generic.ts`](/packages/cli/src/copy-craft/catalog/rubrics/specific-not-generic.ts)

**Exports:** `specificNotGenericRubric`

## packages/cli/src/copy-craft/catalog/rubrics/stranger-in-6-months.ts

[`packages/cli/src/copy-craft/catalog/rubrics/stranger-in-6-months.ts`](/packages/cli/src/copy-craft/catalog/rubrics/stranger-in-6-months.ts)

**Exports:** `strangerInSixMonthsRubric`

## packages/cli/src/copy-craft/catalog/rubrics/what-why-how-to-fix.ts

[`packages/cli/src/copy-craft/catalog/rubrics/what-why-how-to-fix.ts`](/packages/cli/src/copy-craft/catalog/rubrics/what-why-how-to-fix.ts)

**Exports:** `whatWhyHowToFixRubric`

## packages/cli/src/copy-craft/catalog/rubrics/why-not-what.ts

[`packages/cli/src/copy-craft/catalog/rubrics/why-not-what.ts`](/packages/cli/src/copy-craft/catalog/rubrics/why-not-what.ts)

**Exports:** `whyNotWhatRubric`

## packages/cli/src/copy-craft/extract/commits.ts

[`packages/cli/src/copy-craft/extract/commits.ts`](/packages/cli/src/copy-craft/extract/commits.ts)

Commit subject extractor — shells out to `git log` to capture recent commit subjects with their hashes.

**Exports:** `ExtractCommitsInput`, `ExtractCommitsResult`, `extractCommits`

## packages/cli/src/copy-craft/extract/pr-descriptions.ts

[`packages/cli/src/copy-craft/extract/pr-descriptions.ts`](/packages/cli/src/copy-craft/extract/pr-descriptions.ts)

PR description extractor — shells out to `gh pr list` + parses titles and bodies.

**Exports:** `ExtractPRDescriptionsInput`, `ExtractPRDescriptionsResult`, `extractPRDescriptions`

## packages/cli/src/copy-craft/extract/source.ts

[`packages/cli/src/copy-craft/extract/source.ts`](/packages/cli/src/copy-craft/extract/source.ts)

Source-side extractor — single TS Compiler API walk that emits items for all four source surfaces (error, log, cli-output, comment).

**Exports:** `SourceExtractInput`, `extractFromSource`

## packages/cli/src/copy-craft/phases/critique.ts

[`packages/cli/src/copy-craft/phases/critique.ts`](/packages/cli/src/copy-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (item, rubric) pair and parses 3-axis findings from the response.

**Exports:** `CritiqueInput`, `critiqueOne`

## packages/cli/src/design-craft/catalog/exemplars/linear-empty-list.ts

[`packages/cli/src/design-craft/catalog/exemplars/linear-empty-list.ts`](/packages/cli/src/design-craft/catalog/exemplars/linear-empty-list.ts)

First Phase 2 catalog exemplar — ported from the Phase 0 paper spike: docs/changes/design-pipeline/design-craft-elevator/phase-0-schema-spike/ exemplars/linear-empty-list.md Anchors the EmptyState component type for BENCHMARK scoring.

**Exports:** `RadarReference`, `ComponentType`, `ExemplarDefinition`, `linearEmptyListExemplar`

## packages/cli/src/design-craft/catalog/exemplars/linear-issue-modal.ts

[`packages/cli/src/design-craft/catalog/exemplars/linear-issue-modal.ts`](/packages/cli/src/design-craft/catalog/exemplars/linear-issue-modal.ts)

Phase 2 catalog increment — fifth exemplar.

**Exports:** `linearIssueModalExemplar`

## packages/cli/src/design-craft/catalog/exemplars/notion-empty-database.ts

[`packages/cli/src/design-craft/catalog/exemplars/notion-empty-database.ts`](/packages/cli/src/design-craft/catalog/exemplars/notion-empty-database.ts)

Phase 2 catalog increment — seventh exemplar.

**Exports:** `notionEmptyDatabaseExemplar`

## packages/cli/src/design-craft/catalog/exemplars/raycast-command-palette.ts

[`packages/cli/src/design-craft/catalog/exemplars/raycast-command-palette.ts`](/packages/cli/src/design-craft/catalog/exemplars/raycast-command-palette.ts)

Phase 2 catalog increment — third exemplar.

**Exports:** `raycastCommandPaletteExemplar`

## packages/cli/src/design-craft/catalog/exemplars/stripe-loading-state.ts

[`packages/cli/src/design-craft/catalog/exemplars/stripe-loading-state.ts`](/packages/cli/src/design-craft/catalog/exemplars/stripe-loading-state.ts)

Phase 2 catalog increment — second exemplar.

**Exports:** `stripeLoadingStateExemplar`

## packages/cli/src/design-craft/catalog/exemplars/stripe-pay-button.ts

[`packages/cli/src/design-craft/catalog/exemplars/stripe-pay-button.ts`](/packages/cli/src/design-craft/catalog/exemplars/stripe-pay-button.ts)

Phase 2 catalog increment — sixth exemplar.

**Exports:** `stripePayButtonExemplar`

## packages/cli/src/design-craft/catalog/exemplars/vercel-build-progress.ts

[`packages/cli/src/design-craft/catalog/exemplars/vercel-build-progress.ts`](/packages/cli/src/design-craft/catalog/exemplars/vercel-build-progress.ts)

Phase 2 catalog increment — eighth exemplar.

**Exports:** `vercelBuildProgressExemplar`

## packages/cli/src/design-craft/catalog/exemplars/vercel-error-state.ts

[`packages/cli/src/design-craft/catalog/exemplars/vercel-error-state.ts`](/packages/cli/src/design-craft/catalog/exemplars/vercel-error-state.ts)

Phase 2 catalog increment — fourth exemplar.

**Exports:** `vercelErrorStateExemplar`

## packages/cli/src/design-craft/catalog/patterns/fluid-type-scale.ts

[`packages/cli/src/design-craft/catalog/patterns/fluid-type-scale.ts`](/packages/cli/src/design-craft/catalog/patterns/fluid-type-scale.ts)

Phase 2 catalog increment — fifth polish pattern.

**Exports:** `fluidTypeScalePattern`
