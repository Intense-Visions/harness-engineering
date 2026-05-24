---
'@harness-engineering/cli': minor
'@harness-engineering/graph': minor
---

Design-pipeline coordination commits — wire up the Phase 1 vertical-slice MCP tools end-to-end.

**MCP server registration** — `mcp__harness__audit_anatomy` and `mcp__harness__design_craft` are now registered in `TOOL_DEFINITIONS` / `TOOL_HANDLERS` and discoverable to MCP clients (previously exported but unregistered).

**`harness.config.json` schema extensions** — adds optional `design.audit.componentAnatomy.*` (gates audit-component-anatomy + the harness-accessibility deferral; controls catalog scoping, fast-mode behavior) and `design.craft.*` (gates harness-design-craft; controls fast/deep mode, autoCapture B' behavior, LLM provider, catalog scoping, signal feedback threshold). All fields optional with sensible defaults; omitting either block uses built-in defaults. Zero impact on existing configs.

**`DesignConstraintAdapter.recordFindings()`** — generic finding-ingestion entry point that both audit-component-anatomy (ANAT-\*) and harness-design-craft (CRAFT-\*) call to persist findings as graph state. Idempotent (re-running produces no duplicate edges). Per finding: lazy `design_constraint` node creation + `violates_design` edge from file to constraint with per-finding metadata (line, severity, message, evidence, runId). Uses existing graph taxonomy — no NodeType/EdgeType additions.

**`harness-accessibility` deferral patch** — Phase 1 step 2.6 added: when `design.audit.componentAnatomy.enabled = true` (default), A11Y-010 (interactive without accessible label) and A11Y-050 (input/select/textarea without label) are deferred to audit-component-anatomy for components in its catalog. Same i18n-style deduplication pattern proven in step 2.5. Catalog set loaded via `getCatalogTypes()` from audit-component-anatomy's public export — zero rule-content duplication.

**Deferred to a follow-up commit:** `harness validate` fast-mode hook for audit-anatomy (the largest individual coordination item; requires touching the validate command path). The other coordination items are surgical extensions that close the loop on Phase 1 without requiring validate changes.
