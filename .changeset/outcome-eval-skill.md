---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add `harness:outcome-eval` — an LLM-judgment skill that produces a structured, confidence-rated verdict on whether an implementation satisfied its spec.

- New `packages/intelligence/src/outcome-eval/` module: `OutcomeEvaluator` (mirrors `PeslSimulator`), a `.strict()` `verdictSchema`, a fence-aware spec-section resolver (Success Criteria → user-visible-behavior → Overview), a conservative-confidence prompt, and the false-positive-critical `deriveAuthority` mapping — authority is always derived in TypeScript and never read from the LLM. `evaluate()` is degrade-safe: provider/parse/missing-spec failures resolve to INCONCLUSIVE/advisory and never throw at the blocking gate.
- Each `evaluate()` persists exactly one `execution_outcome` node via `ExecutionOutcomeConnector` (additive, backward-compatible `metadata` pass-through), consumable by the effectiveness scorer.
- New `outcome_eval` MCP tool (`@harness-engineering/cli`) makes the skill genuinely invocable, constructing a real `AnalysisProvider` + `GraphStore` and returning the TS-derived verdict.
- Wired into the orchestrator as step 6.5 (between Code Review and Ship): a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. ADRs 0037 (tiered confidence→authority) and 0038 (execution_outcome provenance) document the decisions.
