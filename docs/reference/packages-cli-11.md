# Reference: packages / cli / 11

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/shared/craft/llm/contracts.ts

[`packages/cli/src/shared/craft/llm/contracts.ts`](/packages/cli/src/shared/craft/llm/contracts.ts)

Pure type contracts for the craft LLM provider family.

**Exports:** `LlmCallCost`, `VisionInput`, `LlmProvider`

## packages/cli/src/shared/craft/llm/in-session.ts

[`packages/cli/src/shared/craft/llm/in-session.ts`](/packages/cli/src/shared/craft/llm/in-session.ts)

InSessionLlmProvider — collects prompts instead of calling an LLM.

**Exports:** `PromptDeferredError`, `DeferredPrompt`, `InSessionLlmProvider`

## packages/cli/src/shared/craft/llm/lazy-local-adapter.ts

[`packages/cli/src/shared/craft/llm/lazy-local-adapter.ts`](/packages/cli/src/shared/craft/llm/lazy-local-adapter.ts)

Lazy resolver for `local` / `pi` backends that declare a prefer-and- fallback model list.

**Exports:** `LazyLocalAdapterOptions`, `LazyLocalAdapter`

## packages/cli/src/shared/craft/llm/orchestrator-md.ts

[`packages/cli/src/shared/craft/llm/orchestrator-md.ts`](/packages/cli/src/shared/craft/llm/orchestrator-md.ts)

Synchronous reader for agent.backends declared in harness.orchestrator.md.

**Exports:** `findOrchestratorMd`, `readBackendsFromOrchestratorMd`

## packages/cli/src/shared/craft/llm/provider.ts

[`packages/cli/src/shared/craft/llm/provider.ts`](/packages/cli/src/shared/craft/llm/provider.ts)

Shared LLM provider adapter for the craft skill family.

**Exports:** `MockLlmProvider`, `CraftLlmMode`, `CraftLlmResolution`, `resolveCraftLlmConfig`, `resolveCraftLlmMode`, `getProvider`

## packages/cli/src/shared/craft/runs/store.ts

[`packages/cli/src/shared/craft/runs/store.ts`](/packages/cli/src/shared/craft/runs/store.ts)

Persists in-session craft runs to disk so a two-step MCP flow (collect → finalize) can resume across separate tool calls.

**Exports:** `CraftRunState`, `saveRunState`, `loadRunState`, `deleteRunState`, `pruneOldRuns`

## packages/cli/src/shared/state-events.ts

[`packages/cli/src/shared/state-events.ts`](/packages/cli/src/shared/state-events.ts)

Single compose point for the event-sourced core-state read/write path.

**Exports:** `readHarnessState`, `isEmptyHarnessState`, `emitCoreEvent`, `emitUserInputCaptured`, `emitApprovalRequested`, `emitApprovalResolved`, `readAuditTimeline`

## packages/cli/src/shared/verifier.ts

[`packages/cli/src/shared/verifier.ts`](/packages/cli/src/shared/verifier.ts)

Verifier&lt;F, Cat, Meta&gt; — formal interface for harness check-design's composed verifier shape.

**Exports:** `VerifierSeverity`, `VerifierSummary`, `Verifier`

## packages/cli/src/slash-commands/render-cursor-command.ts

[`packages/cli/src/slash-commands/render-cursor-command.ts`](/packages/cli/src/slash-commands/render-cursor-command.ts)

Render a slash command for Cursor's plugin `commands/` directory.

**Exports:** `renderCursorCommand`

## packages/cli/src/spec-craft/catalog/rubrics/honest-rationalizations.ts

[`packages/cli/src/spec-craft/catalog/rubrics/honest-rationalizations.ts`](/packages/cli/src/spec-craft/catalog/rubrics/honest-rationalizations.ts)

**Exports:** `honestRationalizationsRubric`

## packages/cli/src/spec-craft/catalog/rubrics/joints.ts

[`packages/cli/src/spec-craft/catalog/rubrics/joints.ts`](/packages/cli/src/spec-craft/catalog/rubrics/joints.ts)

**Exports:** `jointsRubric`

## packages/cli/src/spec-craft/catalog/rubrics/load-bearing.ts

[`packages/cli/src/spec-craft/catalog/rubrics/load-bearing.ts`](/packages/cli/src/spec-craft/catalog/rubrics/load-bearing.ts)

**Exports:** `loadBearingRubric`

## packages/cli/src/spec-craft/catalog/rubrics/non-goals-honesty.ts

[`packages/cli/src/spec-craft/catalog/rubrics/non-goals-honesty.ts`](/packages/cli/src/spec-craft/catalog/rubrics/non-goals-honesty.ts)

**Exports:** `nonGoalsHonestyRubric`

## packages/cli/src/spec-craft/catalog/rubrics/sharpness.ts

[`packages/cli/src/spec-craft/catalog/rubrics/sharpness.ts`](/packages/cli/src/spec-craft/catalog/rubrics/sharpness.ts)

**Exports:** `sharpnessRubric`

## packages/cli/src/spec-craft/catalog/rubrics/stranger-in-6-months.ts

[`packages/cli/src/spec-craft/catalog/rubrics/stranger-in-6-months.ts`](/packages/cli/src/spec-craft/catalog/rubrics/stranger-in-6-months.ts)

**Exports:** `strangerInSixMonthsRubric`

## packages/cli/src/spec-craft/catalog/rubrics/two-readers.ts

[`packages/cli/src/spec-craft/catalog/rubrics/two-readers.ts`](/packages/cli/src/spec-craft/catalog/rubrics/two-readers.ts)

**Exports:** `twoReadersRubric`

## packages/cli/src/spec-craft/extract/discover.ts

[`packages/cli/src/spec-craft/extract/discover.ts`](/packages/cli/src/spec-craft/extract/discover.ts)

Spec discovery — finds proposal + ADR files under a project root.

**Exports:** `SpecKind`, `DiscoveredSpec`, `discoverSpecs`

## packages/cli/src/spec-craft/extract/sections.ts

[`packages/cli/src/spec-craft/extract/sections.ts`](/packages/cli/src/spec-craft/extract/sections.ts)

Markdown section parser — splits a spec by H2 (`## ...`) into named sections.

**Exports:** `ParsedSection`, `parseSections`, `canonicalize`
