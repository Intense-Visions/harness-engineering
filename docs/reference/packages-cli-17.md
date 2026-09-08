# Reference: packages / cli / 17

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/cli/src/mcp/context-surface.ts

[`packages/cli/src/mcp/context-surface.ts`](/packages/cli/src/mcp/context-surface.ts)

Measures the harness's real always-loaded context surface for `harness mcp context-report` — MCP tool schemas counted per exposure tier (core/standard/all), plus AGENTS.md, the hook configuration, and the four platform skill trees (classified invoked-only because skill bodies load lazily).

**Exports:** `toolDefinitionText`, `mcpToolEntries`, `skillTreeEntries`, `agentsMdEntry`, `hooksEntry`, `GatherContextSurfaceOptions`, `gatherContextSurface`

## packages/cli/src/mcp/middleware/context-budget.ts

[`packages/cli/src/mcp/middleware/context-budget.ts`](/packages/cli/src/mcp/middleware/context-budget.ts)

Wraps MCP tool handlers so each response is measured against an adopter-declared `mcp.contextBudget.maxTokens` and, when over, gets a steer notice appended pointing at graph-scoped retrieval. Authority is WARN, never reject; with no budget configured the handler is returned unwrapped, and any error in the check falls open to the raw result.

**Exports:** `ContextBudgetMiddlewareOptions`, `wrapWithContextBudget`, `applyContextBudget`

## packages/cli/src/mcp/middleware/version-guard.ts

[`packages/cli/src/mcp/middleware/version-guard.ts`](/packages/cli/src/mcp/middleware/version-guard.ts)

Applies the toolchain version-skew guard at the MCP dispatch boundary, where the CLI's commander `preAction` hook never runs. Calls the one shared evaluator so the two surfaces cannot diverge; a refusal returns an `isError` result and the tool never runs, a warning prepends the notice and proceeds, and any error deciding falls open to the unwrapped handler.

**Exports:** `VersionGuardMiddlewareOptions`, `wrapWithVersionGuard`, `applyVersionGuard`

## packages/cli/src/mcp/tool-capabilities.ts

[`packages/cli/src/mcp/tool-capabilities.ts`](/packages/cli/src/mcp/tool-capabilities.ts)

Resolves the per-tool read/write/exec scopes, network flag, and trust tag that `harness mcp list-capabilities` reports — preferring each tool's authored declaration and falling back to a name-prefix heuristic (labelled `source: 'heuristic'`) for any tool not yet declared.

**Exports:** `ToolScope`, `ToolTrust`, `CapabilitySource`, `ToolCapability`, `NETWORK_TOOL_NAMES`, `deriveScope`, `deriveToolCapability`, `deriveToolCapabilities`

## packages/cli/src/mcp/tool-capability-declarations.ts

[`packages/cli/src/mcp/tool-capability-declarations.ts`](/packages/cli/src/mcp/tool-capability-declarations.ts)

The authored, evidence-based capability table keyed by registered tool name — the audit surface answering "what can an agent do through the MCP server?". Values were derived by reading each handler rather than inferring from its name, which is why entries such as `run_ci_checks` declare `read` where the name heuristic would guess `exec`. A new tool must be added here or the capability-coverage test fails.

**Exports:** `TOOL_CAPABILITY_DECLARATIONS`

## packages/cli/src/mcp/tools/adr-store.ts

[`packages/cli/src/mcp/tools/adr-store.ts`](/packages/cli/src/mcp/tools/adr-store.ts)

Self-contained filesystem read/write seam for Architecture Decision Records under `docs/knowledge/decisions/NNNN-<slug>.md` — frontmatter parsing, slugification, worktree-root resolution, and collision-free number allocation as `max(existing) + 1`. Backs the `manage_adr` tool; deliberately not exported through core because only that tool consumes it.

**Exports:** `AdrStatus`, `AdrTier`, `AdrFrontmatter`, `AdrSummary`, `AdrRecord`, `AdrStoreError`, `resolveWorktreeRoot`, `slugify`, `listAdrs`, `allocateNextNumber`, `readAdr`, `CreateAdrInput`, `createAdr`, `UpdateAdrInput`, `updateAdr`

## packages/cli/src/mcp/tools/adr.ts

[`packages/cli/src/mcp/tools/adr.ts`](/packages/cli/src/mcp/tools/adr.ts)

The `manage_adr` tool — action-dispatch CRUD (create/read/update/list) over the ADR store, opening a substrate previously reachable only through prose skills to any MCP caller. Mutates files on disk: `create` writes a new numbered record at status `proposed`, `update` patches frontmatter fields and body sections without ever reusing a number.

**Exports:** `manageAdrDefinition`, `handleManageAdr`

## packages/cli/src/mcp/tools/api-craft.ts

[`packages/cli/src/mcp/tools/api-craft.ts`](/packages/cli/src/mcp/tools/api-craft.ts)

The `api_craft` / `api_craft_finalize` tool pair for LLM-judgment critique of API design. In the default in-session mode it discovers OpenAPI documents and route handlers, persists run-state, and returns prompts for the calling agent to answer without invoking an LLM; `api_craft_finalize` consumes those responses and returns findings. Inline mode instead runs end-to-end against the configured provider.

**Exports:** `apiCraftDefinition`, `apiCraftFinalizeDefinition`, `handleApiCraft`, `handleApiCraftFinalize`, `runApiCraft`, `collectApiCraftPrompts`, `finalizeApiCraft`, `ApiCraftInput`, `ApiCraftOutput`, `CollectPromptsOutput`, `FinalizeApiCraftInput`

## packages/cli/src/mcp/tools/cli-ergonomics-craft.ts

[`packages/cli/src/mcp/tools/cli-ergonomics-craft.ts`](/packages/cli/src/mcp/tools/cli-ergonomics-craft.ts)

The `cli_ergonomics_craft` / `cli_ergonomics_craft_finalize` pair, critiquing command and flag naming, help text, error actionability, and default safety — the one craft skill with no rule-based floor twin. Same two-step in-session contract as the other craft tools: discover command definitions and return prompts, then finalize the agent's responses into findings.

**Exports:** `cliErgonomicsCraftDefinition`, `cliErgonomicsCraftFinalizeDefinition`, `handleCliErgonomicsCraft`, `handleCliErgonomicsCraftFinalize`, `runCliErgonomicsCraft`, `collectCliErgonomicsCraftPrompts`, `finalizeCliErgonomicsCraft`, `CliErgonomicsCraftInput`, `CliErgonomicsCraftOutput`, `CollectPromptsOutput`, `FinalizeCliErgonomicsCraftInput`

## packages/cli/src/mcp/tools/code-craft.ts

[`packages/cli/src/mcp/tools/code-craft.ts`](/packages/cli/src/mcp/tools/code-craft.ts)

The `code_craft` / `code_craft_finalize` pair, critiquing code readability above the rule-based floor — intent-revealing naming, honest control flow, single-altitude functions, abstractions that earn their keep. Walks the project and returns prompts in-session; the finalize half parses the agent's responses into CodeFindings.

**Exports:** `codeCraftDefinition`, `codeCraftFinalizeDefinition`, `handleCodeCraft`, `handleCodeCraftFinalize`, `runCodeCraft`, `collectCodeCraftPrompts`, `finalizeCodeCraft`, `CodeCraftInput`, `CodeCraftOutput`, `CollectPromptsOutput`, `FinalizeCodeCraftInput`

## packages/cli/src/mcp/tools/docs-craft.ts

[`packages/cli/src/mcp/tools/docs-craft.ts`](/packages/cli/src/mcp/tools/docs-craft.ts)

The `docs_craft` / `docs_craft_finalize` pair, critiquing whether documentation actually teaches — reader-shaped ordering, examples that earn their place, live prose — as the ceiling above the existence/freshness/coverage floor this very index feeds. Discovers docs and returns prompts in-session; finalize turns the responses into DocsCraftOutput.

**Exports:** `docsCraftDefinition`, `docsCraftFinalizeDefinition`, `handleDocsCraft`, `handleDocsCraftFinalize`, `runDocsCraft`, `collectDocsCraftPrompts`, `finalizeDocsCraft`, `DocsCraftInput`, `DocsCraftOutput`, `CollectPromptsOutput`, `FinalizeDocsCraftInput`

## packages/cli/src/mcp/tools/docs-publish.ts

[`packages/cli/src/mcp/tools/docs-publish.ts`](/packages/cli/src/mcp/tools/docs-publish.ts)

The `docs_publish` tool — draft-first publishing to an external docs provider through the connector named in `harness.config.json`, dispatching four operations (`draft`, `attach-media`, `verify-render`, `page-tree`). Makes outbound network calls and errors out when no connector is configured.

**Exports:** `docsPublishDefinition`, `handleDocsPublish`

## packages/cli/src/mcp/tools/edit-file.ts

[`packages/cli/src/mcp/tools/edit-file.ts`](/packages/cli/src/mcp/tools/edit-file.ts)

The `edit_file` tool — an exact-string replace primitive for agents whose native editing is unreliable (a local model driven through Codex CLI has no working `apply_patch` and otherwise falls back to shell redirection that clobbers files). Refuses missing or ambiguous matches without writing rather than guessing, and never creates files.

**Exports:** `editFileDefinition`, `handleEditFile`

## packages/cli/src/mcp/tools/get-comprehension.ts

[`packages/cli/src/mcp/tools/get-comprehension.ts`](/packages/cli/src/mcp/tools/get-comprehension.ts)

The `get_comprehension` serve/recompile tool — returns a module's committed compiled comprehension unit through the LLM-free serve gate (no credential needed to serve), and recompiles only that one module when the unit is source-stale or `forceRecompile` is passed. Never throws: every failure is a structured `isError` envelope.

**Exports:** `getComprehensionDefinition`, `GetComprehensionStore`, `GetComprehensionReader`, `ServeOrRecompileDeps`, `GetComprehensionOutcome`, `serveOrRecompile`, `handleGetComprehension`

## packages/cli/src/mcp/tools/instruction-density.ts

[`packages/cli/src/mcp/tools/instruction-density.ts`](/packages/cli/src/mcp/tools/instruction-density.ts)

Advisory audit that walks a project for `SKILL.md` files, measures imperative instruction count at every context-budget packing level, and reports one finding per skill whose highest loaded level exceeds the budget. Non-blocking by contract — `harness validate` surfaces these at warning severity. Symlinked platform mirrors are deduplicated so a skill is counted once.

**Exports:** `InstructionDensityFinding`, `InstructionDensityAuditOptions`, `InstructionDensityAuditResult`, `runInstructionDensityAudit`

## packages/cli/src/mcp/tools/parallelization.ts

[`packages/cli/src/mcp/tools/parallelization.ts`](/packages/cli/src/mcp/tools/parallelization.ts)

The `plan_parallelization` tool — builds a task DAG from declared `dependsOn` plus glob-aware file/`owns` overlap, groups it into waves, and annotates each wave with conflict severity and a fire/serialize decision. Requires a loadable graph store and reports cycles and an ownership forecast rather than silently dropping tasks.

**Exports:** `planParallelizationDefinition`, `handlePlanParallelization`

## packages/cli/src/mcp/tools/put-comprehension.ts

[`packages/cli/src/mcp/tools/put-comprehension.ts`](/packages/cli/src/mcp/tools/put-comprehension.ts)

The `put_comprehension` write-back tool — lets the agent already working a module attach the semantic half it authored (summary plus invariants) onto that module's compiled static unit, then re-serves the enriched unit. Provider-neutral by construction: it resolves no provider and names no model. Refuses to write when the static unit is missing or source-stale, and validates the payload against the same schema the provider path uses.

**Exports:** `putComprehensionDefinition`, `PutComprehensionStore`, `PutComprehensionReader`, `AttachSemanticDeps`, `SemanticPayload`, `MAX_SUMMARY_CHARS`, `MAX_INVARIANTS`, `MAX_INVARIANT_CHARS`, `PutComprehensionOutcome`, `attachSemantic`, `handlePutComprehension`

## packages/cli/src/mcp/tools/refinement-telemetry.ts

[`packages/cli/src/mcp/tools/refinement-telemetry.ts`](/packages/cli/src/mcp/tools/refinement-telemetry.ts)

Filesystem half of the progressive-context demand signal: appends one JSONL line per served refinement request (`code_outline` / `code_search` / `code_unfold`) tagged with its context class, and reads the log back as a ranked per-class demand report. Non-fatal by contract — write errors are swallowed so telemetry never blocks an MCP response.

**Exports:** `REFINEMENT_EVENTS_FILE`, `recordRefinement`, `readRefinementDemand`

## packages/cli/src/mcp/tools/uat-signoff.ts

[`packages/cli/src/mcp/tools/uat-signoff.ts`](/packages/cli/src/mcp/tools/uat-signoff.ts)

The `uat_signoff` tool — durably records a human's user-acceptance decision for a `docs/changes/<slug>/` change as one `execution_outcome` graph node. Unlike acceptance-eval and outcome-eval it runs no LLM and derives no authority: the human is the authority and the write is advisory record-only, additive to the existing graph, and never blocking.

**Exports:** `UatSignoffToolItem`, `UatSignoffToolInput`, `uatSignoffDefinition`, `handleUatSignoff`

## packages/cli/src/mcp/utils/analysis-provider.ts

[`packages/cli/src/mcp/utils/analysis-provider.ts`](/packages/cli/src/mcp/utils/analysis-provider.ts)

Shared provider resolver for the LLM-judgment tools (`acceptance_eval`, `outcome_eval`) and comprehension's semantic generation, walking a strictly additive precedence chain: Anthropic API key, then a local OpenAI-compatible endpoint, then a `claude`-CLI subscription step, then null. Every environment that resolved a provider before resolves the same one; the newly covered case is no key, no local endpoint, `claude` on PATH.

**Exports:** `ClaudeCliDetectOpts`, `isCliAvailable`, `isClaudeCliAvailable`, `AnalysisCliConfig`, `ProviderKind`, `AnalysisEndpoint`, `resolveProviderKind`, `resolveAnalysisProvider`

## packages/cli/src/mcp/utils/waypoint-emission.ts

[`packages/cli/src/mcp/utils/waypoint-emission.ts`](/packages/cli/src/mcp/utils/waypoint-emission.ts)

Opt-in Waypoint `sdlc.*` verdict emission for MCP handlers — spools an event surfacing an already-persisted outcome-eval, acceptance-eval, or UAT verdict, and derives the graded work item's slug from its spec path. Emission, never new judgment: each helper is fire-and-forget, a memoized no-op unless `waypoint.sink` is configured, and never throws or alters the handler's response.

**Exports:** `specSlug`, `emitOutcomeVerdictEvent`, `emitAcceptanceVerdictEvent`, `emitUatSignoffEvent`
