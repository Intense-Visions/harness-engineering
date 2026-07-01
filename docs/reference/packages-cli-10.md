# Reference: packages / cli / 10

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/naming-craft/extract/convention.ts

[`packages/cli/src/naming-craft/extract/convention.ts`](/packages/cli/src/naming-craft/extract/convention.ts)

Convention sampler — derives the project's dominant naming convention per identifier kind via majority-rule over a sample of up to 500 identifiers.

**Exports:** `sampleConventions`, `classify`

## packages/cli/src/naming-craft/extract/identifiers.ts

[`packages/cli/src/naming-craft/extract/identifiers.ts`](/packages/cli/src/naming-craft/extract/identifiers.ts)

Identifier extraction via TS Compiler API.

**Exports:** `ExtractedIdentifier`, `extractIdentifiers`

## packages/cli/src/naming-craft/findings/derived.ts

[`packages/cli/src/naming-craft/findings/derived.ts`](/packages/cli/src/naming-craft/findings/derived.ts)

Re-export design-craft's derived priority computation.

## packages/cli/src/naming-craft/llm/provider.ts

[`packages/cli/src/naming-craft/llm/provider.ts`](/packages/cli/src/naming-craft/llm/provider.ts)

Re-export design-craft's LLM provider infrastructure.

## packages/cli/src/naming-craft/phases/critique.ts

[`packages/cli/src/naming-craft/phases/critique.ts`](/packages/cli/src/naming-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (identifier, rubric) pair and parses 3-axis findings from the response.

**Exports:** `CritiqueInput`, `CRITIQUE_SYSTEM_PROMPT`, `critiqueOne`, `parseFindingFromRaw`, `BuildPromptInput`, `buildPrompt`

## packages/cli/src/security-craft/catalog/rubrics/assumed-adversary-realistic.ts

[`packages/cli/src/security-craft/catalog/rubrics/assumed-adversary-realistic.ts`](/packages/cli/src/security-craft/catalog/rubrics/assumed-adversary-realistic.ts)

**Exports:** `assumedAdversaryRealisticRubric`

## packages/cli/src/security-craft/catalog/rubrics/authz-before-action.ts

[`packages/cli/src/security-craft/catalog/rubrics/authz-before-action.ts`](/packages/cli/src/security-craft/catalog/rubrics/authz-before-action.ts)

**Exports:** `authzBeforeActionRubric`

## packages/cli/src/security-craft/catalog/rubrics/data-flow-annotated.ts

[`packages/cli/src/security-craft/catalog/rubrics/data-flow-annotated.ts`](/packages/cli/src/security-craft/catalog/rubrics/data-flow-annotated.ts)

**Exports:** `dataFlowAnnotatedRubric`

## packages/cli/src/security-craft/catalog/rubrics/defense-in-depth.ts

[`packages/cli/src/security-craft/catalog/rubrics/defense-in-depth.ts`](/packages/cli/src/security-craft/catalog/rubrics/defense-in-depth.ts)

**Exports:** `defenseInDepthRubric`

## packages/cli/src/security-craft/catalog/rubrics/fail-closed-not-open.ts

[`packages/cli/src/security-craft/catalog/rubrics/fail-closed-not-open.ts`](/packages/cli/src/security-craft/catalog/rubrics/fail-closed-not-open.ts)

**Exports:** `failClosedNotOpenRubric`

## packages/cli/src/security-craft/catalog/rubrics/least-authority-honored.ts

[`packages/cli/src/security-craft/catalog/rubrics/least-authority-honored.ts`](/packages/cli/src/security-craft/catalog/rubrics/least-authority-honored.ts)

**Exports:** `leastAuthorityHonoredRubric`

## packages/cli/src/security-craft/catalog/rubrics/secret-handling-shape.ts

[`packages/cli/src/security-craft/catalog/rubrics/secret-handling-shape.ts`](/packages/cli/src/security-craft/catalog/rubrics/secret-handling-shape.ts)

**Exports:** `secretHandlingShapeRubric`

## packages/cli/src/security-craft/catalog/rubrics/trust-boundary-respected.ts

[`packages/cli/src/security-craft/catalog/rubrics/trust-boundary-respected.ts`](/packages/cli/src/security-craft/catalog/rubrics/trust-boundary-respected.ts)

**Exports:** `trustBoundaryRespectedRubric`

## packages/cli/src/security-craft/extract/discover.ts

[`packages/cli/src/security-craft/extract/discover.ts`](/packages/cli/src/security-craft/extract/discover.ts)

Source-file discovery — walks packages/STAR/src/ recursively (where STAR is each package directory), returns TS/JS source files only.

**Exports:** `discoverSourceFiles`

## packages/cli/src/security-craft/phases/critique.ts

[`packages/cli/src/security-craft/phases/critique.ts`](/packages/cli/src/security-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (file, signal, rubric) triple where the rubric's appliesToSignals includes the signal's kind.

**Exports:** `CritiqueInput`, `critiqueOne`

## packages/cli/src/shared/craft/findings/axes.ts

[`packages/cli/src/shared/craft/findings/axes.ts`](/packages/cli/src/shared/craft/findings/axes.ts)

Shared 3-axis primitives for the craft skill family (ADR 0019).

**Exports:** `Tier`, `Impact`, `Confidence`

## packages/cli/src/shared/craft/findings/derived.ts

[`packages/cli/src/shared/craft/findings/derived.ts`](/packages/cli/src/shared/craft/findings/derived.ts)

Extracted from packages/cli/src/design-craft/findings/derived.ts on the 2nd-non-design-craft-consumer trigger (spec-craft).

**Exports:** `derivePriority`

## packages/cli/src/shared/craft/llm/adapters.ts

[`packages/cli/src/shared/craft/llm/adapters.ts`](/packages/cli/src/shared/craft/llm/adapters.ts)

Adapters that wrap the intelligence-package AnalysisProvider surface (AnthropicAnalysisProvider, ClaudeCliAnalysisProvider) into the LlmProvider.callText contract used by craft phases.

**Exports:** `AnalysisProviderAdapter`, `adaptClaudeCli`, `adaptAnthropic`, `adaptOpenAICompatible`
