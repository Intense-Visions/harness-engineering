# Reference: packages / intelligence

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/intelligence/src/acceptance-eval/authority.ts

[`packages/intelligence/src/acceptance-eval/authority.ts`](/packages/intelligence/src/acceptance-eval/authority.ts)

Pure mapping from (measurability, confidence) to gate authority.

**Exports:** `deriveAcceptanceAuthority`

## packages/intelligence/src/acceptance-eval/evaluator.ts

[`packages/intelligence/src/acceptance-eval/evaluator.ts`](/packages/intelligence/src/acceptance-eval/evaluator.ts)

**Exports:** `AcceptanceEvaluatorOptions`, `AcceptanceEvaluator`

## packages/intelligence/src/adapters/canary.ts

[`packages/intelligence/src/adapters/canary.ts`](/packages/intelligence/src/adapters/canary.ts)

Canary adapter — a total, gracefully-degrading boundary around the deterministic `canary` test CLI (`canary-test-cli`, declared as an optionalDependency).

**Exports:** `CanaryDegradeReason`, `CanaryProbe`, `frameworkRecommendationSchema`, `FrameworkRecommendation`, `canaryFindingSchema`, `canaryFindingsSchema`, `CanaryFinding`, `CanaryAdapter`

## packages/intelligence/src/outcome-eval/authority.ts

[`packages/intelligence/src/outcome-eval/authority.ts`](/packages/intelligence/src/outcome-eval/authority.ts)

Pure mapping from (verdict, confidence) to ship authority.

**Exports:** `deriveAuthority`

## packages/intelligence/src/outcome-eval/evaluator.ts

[`packages/intelligence/src/outcome-eval/evaluator.ts`](/packages/intelligence/src/outcome-eval/evaluator.ts)

**Exports:** `OutcomeEvaluatorOptions`, `OutcomeEvaluator`

## packages/intelligence/src/outcome-eval/section-resolver.ts

[`packages/intelligence/src/outcome-eval/section-resolver.ts`](/packages/intelligence/src/outcome-eval/section-resolver.ts)

Result of resolving the judgment section from a spec's markdown.

**Exports:** `ResolvedSection`, `resolveSection`
