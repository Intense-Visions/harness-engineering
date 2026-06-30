# Reference: packages / cli / 1

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/align/classifier/pre-flight.ts

[`packages/cli/src/align/classifier/pre-flight.ts`](/packages/cli/src/align/classifier/pre-flight.ts)

Pre-flight classifier — decides per-finding whether a codemod can safely apply or whether to downgrade to a suggestion.

**Exports:** `Classification`, `ClassifyInput`, `classifyFinding`

## packages/cli/src/align/classifier/token-import.ts

[`packages/cli/src/align/classifier/token-import.ts`](/packages/cli/src/align/classifier/token-import.ts)

Token import discovery — scans a source file for an existing token import line in one of three recognized forms: 1.

**Exports:** `TokenImportInfo`, `findTokenImport`

## packages/cli/src/align/codemods/common.ts

[`packages/cli/src/align/codemods/common.ts`](/packages/cli/src/align/codemods/common.ts)

Shared helpers for align-design-system codemods.

**Exports:** `renderTokenReference`, `sourceLine`, `replaceLine`

## packages/cli/src/align/codemods/t001-hex.ts

[`packages/cli/src/align/codemods/t001-hex.ts`](/packages/cli/src/align/codemods/t001-hex.ts)

DRIFT-T001 codemod — replace a hex literal with a token reference.

**Exports:** `CodemodResult`, `CodemodFailure`, `applyT001Codemod`

## packages/cli/src/align/codemods/t002-font-family.ts

[`packages/cli/src/align/codemods/t002-font-family.ts`](/packages/cli/src/align/codemods/t002-font-family.ts)

DRIFT-T002 codemod — replace a font-family string with a token reference.

**Exports:** `CodemodResult`, `CodemodFailure`, `applyT002Codemod`

## packages/cli/src/align/codemods/t003-px-spacing.ts

[`packages/cli/src/align/codemods/t003-px-spacing.ts`](/packages/cli/src/align/codemods/t003-px-spacing.ts)

DRIFT-T003 codemod — replace a px spacing literal with a token reference.

**Exports:** `CodemodResult`, `CodemodFailure`, `applyT003Codemod`

## packages/cli/src/align/findings/outcome.ts

[`packages/cli/src/align/findings/outcome.ts`](/packages/cli/src/align/findings/outcome.ts)

FixOutcome — emitted by align-design-system for each DRIFT-\* finding it processes.

**Exports:** `FixDiff`, `FixSuggestion`, `FixOutcome`, `AlignSummary`, `AlignCatalog`, `AlignMode`, `AlignMeta`, `AlignDesignSystemOutput`

## packages/cli/src/align/revert/inverse.ts

[`packages/cli/src/align/revert/inverse.ts`](/packages/cli/src/align/revert/inverse.ts)

Inverse-application — given a recorded FixDiff (line + before/after text), reverse it on the current source.

**Exports:** `InverseResult`, `applyInverse`

## packages/cli/src/align/suggestions/p-primitives.ts

[`packages/cli/src/align/suggestions/p-primitives.ts`](/packages/cli/src/align/suggestions/p-primitives.ts)

DRIFT-P\* suggestion emitter — precise per-primitive replacement guidance.

**Exports:** `emitPrimitiveSuggestion`

## packages/cli/src/align/suggestions/t004-deprecated.ts

[`packages/cli/src/align/suggestions/t004-deprecated.ts`](/packages/cli/src/align/suggestions/t004-deprecated.ts)

DRIFT-T004 suggestion — emit a precise migration suggestion for a deprecated token reference.

**Exports:** `emitT004Suggestion`

## packages/cli/src/audit/component-anatomy/catalog/conventions/button.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/button.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/button.ts)

Button convention — port of the Phase 0 schema-spike paper spec.

**Exports:** `buttonConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/checkbox.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/checkbox.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/checkbox.ts)

Checkbox convention — Phase 2 catalog expansion (tri-state form-control member of the Input / Select / Switch / Checkbox / Radio family).

**Exports:** `checkboxConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/dialog.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/dialog.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/dialog.ts)

Dialog convention — Phase 2 catalog expansion (component #4 of 20).

**Exports:** `dialogConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/empty-state.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/empty-state.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/empty-state.ts)

EmptyState convention — Phase 2 catalog expansion (component #3 of 20).

**Exports:** `emptyStateConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/input.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/input.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/input.ts)

Input convention — Phase 2 catalog expansion (component #2 of 20).

**Exports:** `inputConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/select.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/select.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/select.ts)

Select convention — Phase 2 catalog expansion (component #5 of 20).

**Exports:** `selectConvention`

## packages/cli/src/audit/component-anatomy/catalog/conventions/switch.ts

[`packages/cli/src/audit/component-anatomy/catalog/conventions/switch.ts`](/packages/cli/src/audit/component-anatomy/catalog/conventions/switch.ts)

Switch convention — Phase 2 catalog expansion (binary form-control member of the Input / Select / Switch / Checkbox / Radio family).

**Exports:** `switchConvention`

## packages/cli/src/audit/component-anatomy/findings/finding.ts

[`packages/cli/src/audit/component-anatomy/findings/finding.ts`](/packages/cli/src/audit/component-anatomy/findings/finding.ts)

Anatomy finding types.

**Exports:** `AnatomyFindingCode`, `Severity`, `AnatomyFinding`
