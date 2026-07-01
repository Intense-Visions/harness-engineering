# Reference: packages / cli / 8

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/knowledge-craft/catalog/rubrics/stranger-in-6-months.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/stranger-in-6-months.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/stranger-in-6-months.ts)

**Exports:** `strangerInSixMonthsRubric`

## packages/cli/src/knowledge-craft/catalog/rubrics/truth-not-derivable.ts

[`packages/cli/src/knowledge-craft/catalog/rubrics/truth-not-derivable.ts`](/packages/cli/src/knowledge-craft/catalog/rubrics/truth-not-derivable.ts)

**Exports:** `truthNotDerivableRubric`

## packages/cli/src/knowledge-craft/extract/discover.ts

[`packages/cli/src/knowledge-craft/extract/discover.ts`](/packages/cli/src/knowledge-craft/extract/discover.ts)

Knowledge entry discovery — walks docs/knowledge/ recursively, EXCLUDING `decisions/` (which is spec-craft's territory) and any user-supplied extra exclude dirs.

**Exports:** `KNOWLEDGE_ROOT`, `DEFAULT_EXCLUDED_DIRS`, `DiscoveredEntry`, `discoverKnowledgeEntries`

## packages/cli/src/knowledge-craft/phases/critique.ts

[`packages/cli/src/knowledge-craft/phases/critique.ts`](/packages/cli/src/knowledge-craft/phases/critique.ts)

CRITIQUE phase — invokes the LLM provider per (file, rubric) pair and parses 3-axis findings from the response.

**Exports:** `CritiqueInput`, `critiqueOne`

## packages/cli/src/mcp/tool-types.ts

[`packages/cli/src/mcp/tool-types.ts`](/packages/cli/src/mcp/tool-types.ts)

Shared MCP tool type definitions.

**Exports:** `ToolDefinition`

## packages/cli/src/mcp/tools/acceptance-eval.ts

[`packages/cli/src/mcp/tools/acceptance-eval.ts`](/packages/cli/src/mcp/tools/acceptance-eval.ts)

MCP tool: `mcp__harness__acceptance_eval`.

**Exports:** `AcceptanceEvalToolInput`, `acceptanceEvalDefinition`, `resolveTestContent`, `handleAcceptanceEval`

## packages/cli/src/mcp/tools/align-design-system.ts

[`packages/cli/src/mcp/tools/align-design-system.ts`](/packages/cli/src/mcp/tools/align-design-system.ts)

MCP tool: `mcp__harness__align_design_system`.

**Exports:** `alignDesignSystemDefinition`, `handleAlignDesignSystem`

## packages/cli/src/mcp/tools/audit-anatomy.ts

[`packages/cli/src/mcp/tools/audit-anatomy.ts`](/packages/cli/src/mcp/tools/audit-anatomy.ts)

MCP tool: `mcp__harness__audit_anatomy`.

**Exports:** `AuditAnatomyInput`, `AuditAnatomyOutput`, `auditAnatomyDefinition`, `ToolResponse`, `runAudit`, `handleAuditAnatomy`, `__internal__`

## packages/cli/src/mcp/tools/audit-brand.ts

[`packages/cli/src/mcp/tools/audit-brand.ts`](/packages/cli/src/mcp/tools/audit-brand.ts)

MCP tool: `mcp__harness__audit_brand`.

**Exports:** `auditBrandDefinition`, `handleAuditBrand`

## packages/cli/src/mcp/tools/canary.ts

[`packages/cli/src/mcp/tools/canary.ts`](/packages/cli/src/mcp/tools/canary.ts)

MCP surface for the optional canary test CLI, backed by the CanaryAdapter in @harness-engineering/intelligence.

**Exports:** `canaryProbeDefinition`, `canaryRecommendFrameworkDefinition`, `handleCanaryProbe`, `handleCanaryRecommendFramework`

## packages/cli/src/mcp/tools/compound.ts

[`packages/cli/src/mcp/tools/compound.ts`](/packages/cli/src/mcp/tools/compound.ts)

**Exports:** `acquireCompoundLockDefinition`, `handleAcquireCompoundLock`, `releaseCompoundLockDefinition`, `handleReleaseCompoundLock`, `_resetCompoundLockHandlesForTests`

## packages/cli/src/mcp/tools/copy-craft.ts

[`packages/cli/src/mcp/tools/copy-craft.ts`](/packages/cli/src/mcp/tools/copy-craft.ts)

MCP tool: `mcp__harness__copy_craft`.

**Exports:** `copyCraftDefinition`, `handleCopyCraft`

## packages/cli/src/mcp/tools/design-pipeline.ts

[`packages/cli/src/mcp/tools/design-pipeline.ts`](/packages/cli/src/mcp/tools/design-pipeline.ts)

MCP tool: `mcp__harness__run_design_pipeline`.

**Exports:** `designPipelineDefinition`, `handleDesignPipeline`

## packages/cli/src/mcp/tools/detect-drift.ts

[`packages/cli/src/mcp/tools/detect-drift.ts`](/packages/cli/src/mcp/tools/detect-drift.ts)

MCP tool: `mcp__harness__detect_drift`.

**Exports:** `detectDriftDefinition`, `handleDetectDrift`

## packages/cli/src/mcp/tools/gateway-tools.ts

[`packages/cli/src/mcp/tools/gateway-tools.ts`](/packages/cli/src/mcp/tools/gateway-tools.ts)

Phase 2 Task 11: MCP wrappers around the new bridge primitives served by the orchestrator's Gateway API.

**Exports:** `triggerMaintenanceJobDefinition`, `handleTriggerMaintenanceJob`, `listGatewayTokensDefinition`, `handleListGatewayTokens`

## packages/cli/src/mcp/tools/insights-summary.ts

[`packages/cli/src/mcp/tools/insights-summary.ts`](/packages/cli/src/mcp/tools/insights-summary.ts)

Hermes Phase 1 — MCP `insights_summary` tool.

**Exports:** `insightsSummaryDefinition`, `handleInsightsSummary`

## packages/cli/src/mcp/tools/knowledge-craft.ts

[`packages/cli/src/mcp/tools/knowledge-craft.ts`](/packages/cli/src/mcp/tools/knowledge-craft.ts)

MCP tool: `mcp__harness__knowledge_craft`.

**Exports:** `knowledgeCraftDefinition`, `handleKnowledgeCraft`

## packages/cli/src/mcp/tools/naming-craft.ts

[`packages/cli/src/mcp/tools/naming-craft.ts`](/packages/cli/src/mcp/tools/naming-craft.ts)

MCP tools for naming-craft (craft-pipeline #1): `naming_craft` — runs the skill.

**Exports:** `namingCraftDefinition`, `namingCraftFinalizeDefinition`, `handleNamingCraft`, `handleNamingCraftFinalize`
