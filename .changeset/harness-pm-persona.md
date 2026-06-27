---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add the harness-pm persona plus the acceptance-eval skill, MCP tool, and intelligence module — the upstream twin of outcome-eval that gates specs on measurable acceptance criteria. acceptance-eval resolves a spec's acceptance section, critiques observability/testability/completeness (advisory `criteriaFindings`), flags user-visible behaviors with no covering test (advisory `coverageFindings`), and emits a confidence-rated `AcceptanceVerdict` (`MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE`). Merge authority is derived in TypeScript via `deriveAcceptanceAuthority` and never read from the LLM: a high-confidence `NOT_MEASURABLE` blocks; every other verdict is advisory. Exposed as the `mcp__harness__acceptance_eval` MCP tool and the `harness-pm` persona (triggered `on_pr` for `docs/changes/**`).
