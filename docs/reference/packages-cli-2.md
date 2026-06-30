# Reference: packages / cli / 2

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/audit/component-anatomy/parsers/anatomy-tags.ts

[`packages/cli/src/audit/component-anatomy/parsers/anatomy-tags.ts`](/packages/cli/src/audit/component-anatomy/parsers/anatomy-tags.ts)

Build a {@link ConventionRule} override from `@anatomy-*` JSDoc tags.

**Exports:** `buildAnatomyRuleFromJsDoc`

## packages/cli/src/audit/component-anatomy/parsers/ast.ts

[`packages/cli/src/audit/component-anatomy/parsers/ast.ts`](/packages/cli/src/audit/component-anatomy/parsers/ast.ts)

TypeScript Compiler API wrapper — definition-side parser for the audit-component-anatomy skill.

**Exports:** `Button`, `ParsedComponent`, `parseComponentDefinition`, `parseComponentDefinitionFromSource`

## packages/cli/src/audit/component-anatomy/parsers/design-overrides.ts

[`packages/cli/src/audit/component-anatomy/parsers/design-overrides.ts`](/packages/cli/src/audit/component-anatomy/parsers/design-overrides.ts)

Parser for the optional `## Component Anatomy Overrides` section of DESIGN.md.

**Exports:** `parseAnatomyOverrides`

## packages/cli/src/audit/component-anatomy/parsers/design-registry.ts

[`packages/cli/src/audit/component-anatomy/parsers/design-registry.ts`](/packages/cli/src/audit/component-anatomy/parsers/design-registry.ts)

Parser for the optional `## Component Registry` section of DESIGN.md.

**Exports:** `RegistryEntry`, `parseComponentRegistry`, `findDesignMd`

## packages/cli/src/audit/component-anatomy/parsers/jsdoc.ts

[`packages/cli/src/audit/component-anatomy/parsers/jsdoc.ts`](/packages/cli/src/audit/component-anatomy/parsers/jsdoc.ts)

Minimal JSDoc tag reader for the anatomy resolvers.

**Exports:** `extractLeadingJsDoc`, `readJsDocTag`, `readJsDocTagValue`

## packages/cli/src/audit/component-anatomy/resolvers/component-type.ts

[`packages/cli/src/audit/component-anatomy/resolvers/component-type.ts`](/packages/cli/src/audit/component-anatomy/resolvers/component-type.ts)

Component-type resolver — implements Decision #3 (proposal.md).

**Exports:** `Button`, `resolveComponentType`

## packages/cli/src/audit/component-anatomy/resolvers/source-of-truth.ts

[`packages/cli/src/audit/component-anatomy/resolvers/source-of-truth.ts`](/packages/cli/src/audit/component-anatomy/resolvers/source-of-truth.ts)

Source-of-truth resolver — implements Decision #1 (proposal.md).

**Exports:** `resolveAnatomyRules`

## packages/cli/src/audit/component-anatomy/rules/convention-rule.ts

[`packages/cli/src/audit/component-anatomy/rules/convention-rule.ts`](/packages/cli/src/audit/component-anatomy/rules/convention-rule.ts)

Convention rule types — drive `ANAT-D*` (definition) findings.

**Exports:** `AnatomyPart`, `ConventionSource`, `ConventionRule`

## packages/cli/src/audit/component-anatomy/rules/convention-runner.ts

[`packages/cli/src/audit/component-anatomy/rules/convention-runner.ts`](/packages/cli/src/audit/component-anatomy/rules/convention-runner.ts)

Convention rule runner — executes a ConventionRule against a parsed component definition and emits `ANAT-D*` findings for missing required parts.

**Exports:** `runConventionRule`

## packages/cli/src/audit/component-anatomy/rules/pattern-rule.ts

[`packages/cli/src/audit/component-anatomy/rules/pattern-rule.ts`](/packages/cli/src/audit/component-anatomy/rules/pattern-rule.ts)

Pattern rule types — drive `ANAT-P*` (pattern-presence) findings.

**Exports:** `TreeSitterCapture`, `PatternRule`

## packages/cli/src/brand/findings/finding.ts

[`packages/cli/src/brand/findings/finding.ts`](/packages/cli/src/brand/findings/finding.ts)

Brand finding types — emitted by audit-brand-compliance.

**Exports:** `BrandFindingCode`, `BrandSeverity`, `BrandStrictness`, `BrandFinding`, `severityFor`

## packages/cli/src/brand/resolvers/design-md-brand.ts

[`packages/cli/src/brand/resolvers/design-md-brand.ts`](/packages/cli/src/brand/resolvers/design-md-brand.ts)

Parse `design-system/DESIGN.md` `## Brand Rules` section into a structured BrandRules object.

**Exports:** `BrandVoice`, `BrandAssetUseRule`, `BrandAssetLogoVariation`, `BrandAssets`, `BrandRules`, `loadBrandRules`

## packages/cli/src/brand/resolvers/token-extensions.ts

[`packages/cli/src/brand/resolvers/token-extensions.ts`](/packages/cli/src/brand/resolvers/token-extensions.ts)

Walk `design-system/tokens.json` for `$extensions.harness.brand` metadata.

**Exports:** `BrandTokenInfo`, `BrandTokenIndex`, `loadBrandTokenIndex`

## packages/cli/src/brand/rules/forbidden-phrases-rule.ts

[`packages/cli/src/brand/rules/forbidden-phrases-rule.ts`](/packages/cli/src/brand/rules/forbidden-phrases-rule.ts)

BRAND-V001 — Forbidden phrases in UI copy.

**Exports:** `ForbiddenPhrasesRuleInput`, `runForbiddenPhrasesRule`

## packages/cli/src/brand/rules/token-misuse-rule.ts

[`packages/cli/src/brand/rules/token-misuse-rule.ts`](/packages/cli/src/brand/rules/token-misuse-rule.ts)

BRAND-T\* — Token misuse detection.

**Exports:** `TokenMisuseRuleInput`, `runTokenMisuseRule`

## packages/cli/src/commands/align-design-system.ts

[`packages/cli/src/commands/align-design-system.ts`](/packages/cli/src/commands/align-design-system.ts)

`harness align-design-system` — CLI entry for the align skill (design-pipeline sub-project #1, align half).

**Exports:** `createAlignDesignSystemCommand`

## packages/cli/src/commands/backfill-skill-provenance.ts

[`packages/cli/src/commands/backfill-skill-provenance.ts`](/packages/cli/src/commands/backfill-skill-provenance.ts)

Hermes Phase 4 one-shot migration: stamp `provenance: user-authored` on every existing catalog skill so the audit trail is complete from day one.

**Exports:** `BackfillResult`, `runBackfillSkillProvenance`, `createBackfillSkillProvenanceCommand`

## packages/cli/src/commands/check-design.ts

[`packages/cli/src/commands/check-design.ts`](/packages/cli/src/commands/check-design.ts)

CONVENTION (informal, extract to Verifier&lt;F&gt; interface on the 3rd check-\* command): Verifier output: { findings: F[], summary: { ..., bySeverity, byCode, durationMs }, ...

**Exports:** `runCheckDesign`, `createCheckDesignCommand`
