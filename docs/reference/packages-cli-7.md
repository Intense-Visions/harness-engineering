# Reference: packages / cli / 7

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/design-craft/phases/benchmark.ts

[`packages/cli/src/design-craft/phases/benchmark.ts`](/packages/cli/src/design-craft/phases/benchmark.ts)

BENCHMARK phase implementation.

**Exports:** `BenchmarkTarget`, `BenchmarkArgs`, `parseBenchmarkResponse`, `runBenchmark`

## packages/cli/src/design-craft/phases/critique.ts

[`packages/cli/src/design-craft/phases/critique.ts`](/packages/cli/src/design-craft/phases/critique.ts)

CRITIQUE phase implementation.

**Exports:** `CritiqueTarget`, `CritiqueArgs`, `parseFindingResponse`, `runCritique`, `VisionCritiqueTarget`, `VisionCritiqueArgs`, `runVisionCritique`

## packages/cli/src/design-craft/phases/polish.ts

[`packages/cli/src/design-craft/phases/polish.ts`](/packages/cli/src/design-craft/phases/polish.ts)

POLISH phase implementation.

**Exports:** `PolishTarget`, `PolishArgs`, `parsePolishResponse`, `patternIsPlausible`, `runPolish`

## packages/cli/src/design-pipeline/phases/audit.ts

[`packages/cli/src/design-pipeline/phases/audit.ts`](/packages/cli/src/design-pipeline/phases/audit.ts)

Phase 4: AUDIT — invoke registered rule-based verifiers generically via the Verifier<F> registry.

**Exports:** `AuditInput`, `runAudit`

## packages/cli/src/design-pipeline/phases/detect.ts

[`packages/cli/src/design-pipeline/phases/detect.ts`](/packages/cli/src/design-pipeline/phases/detect.ts)

Phase 2: DETECT — invoke detect-design-drift, populate context.driftFindings.

**Exports:** `DetectInput`, `runDetect`

## packages/cli/src/design-pipeline/phases/fill.ts

[`packages/cli/src/design-pipeline/phases/fill.ts`](/packages/cli/src/design-pipeline/phases/fill.ts)

Phase 5: FILL — two action sub-phases: 5a.

**Exports:** `FillInput`, `runFill`

## packages/cli/src/design-pipeline/phases/freshen.ts

[`packages/cli/src/design-pipeline/phases/freshen.ts`](/packages/cli/src/design-pipeline/phases/freshen.ts)

Phase 1: FRESHEN — read-only check of input freshness.

**Exports:** `FreshenInput`, `runFreshen`

## packages/cli/src/drift/findings/finding.ts

[`packages/cli/src/drift/findings/finding.ts`](/packages/cli/src/drift/findings/finding.ts)

Drift finding types — emitted by detect-design-drift (design-pipeline #1).

**Exports:** `DriftFinding`, `severityFor`

## packages/cli/src/drift/resolvers/component-registry.ts

[`packages/cli/src/drift/resolvers/component-registry.ts`](/packages/cli/src/drift/resolvers/component-registry.ts)

Parse design-system/DESIGN.md `## Component Registry` section.

**Exports:** `ComponentRegistry`, `loadComponentRegistry`

## packages/cli/src/drift/resolvers/tokens.ts

[`packages/cli/src/drift/resolvers/tokens.ts`](/packages/cli/src/drift/resolvers/tokens.ts)

Load and parse design-system/tokens.json (W3C DTCG format).

**Exports:** `TokenSet`, `TokenPathIndex`, `loadTokenSet`, `loadTokenPathIndex`

## packages/cli/src/drift/rules/primitive-adoption-rule.ts

[`packages/cli/src/drift/rules/primitive-adoption-rule.ts`](/packages/cli/src/drift/rules/primitive-adoption-rule.ts)

DRIFT-P\* — Primitive adoption detection.

**Exports:** `PrimitiveAdoptionRuleInput`, `runPrimitiveAdoptionRule`

## packages/cli/src/drift/rules/token-bypass-rule.ts

[`packages/cli/src/drift/rules/token-bypass-rule.ts`](/packages/cli/src/drift/rules/token-bypass-rule.ts)

DRIFT-T\* — Token bypass detection.

**Exports:** `TokenBypassRuleInput`, `runTokenBypassRule`

## packages/cli/src/git/merge-driver-setup.ts

[`packages/cli/src/git/merge-driver-setup.ts`](/packages/cli/src/git/merge-driver-setup.ts)

Runs a `git` subcommand.

**Exports:** `GitRunner`, `defaultGitRunner`, `MergeDriverSetupResult`, `configureMergeOursDriver`

## packages/cli/src/knowledge-craft/catalog/rubrics/carries-forward-decision.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/carries-forward-decision.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/carries-forward-decision.ts)

**Exports:** `carriesForwardDecisionRubric`

## packages/cli/src/knowledge-craft/catalog/rubrics/deleting-loses-something.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/deleting-loses-something.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/deleting-loses-something.ts)

**Exports:** `deletingLosesSomethingRubric`

## packages/cli/src/knowledge-craft/catalog/rubrics/earns-graph-place.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/earns-graph-place.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/earns-graph-place.ts)

**Exports:** `earnsGraphPlaceRubric`

## packages/cli/src/knowledge-craft/catalog/rubrics/load-bearing-fact.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/load-bearing-fact.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/load-bearing-fact.ts)

**Exports:** `loadBearingFactRubric`

## packages/cli/src/knowledge-craft/catalog/rubrics/specific-not-generic.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/specific-not-generic.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/specific-not-generic.ts)

**Exports:** `specificNotGenericRubric`
