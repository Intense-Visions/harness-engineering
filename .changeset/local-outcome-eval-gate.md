---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): the local enforced gate's outcome-eval now actually fires

The staged local gate (`runLocalWorkflowGate`) already had a blocking
spec-vs-diff `outcome-eval` step — the harness's own verifier judgment — but it
silently no-op'd on every fully-local run for two reasons, so a diff that passes
the tests yet contradicts the spec shipped anyway:

1. **No provider.** The eval provider came only from `resolveComplexityProvider`,
   which builds nothing unless `intelligence.enabled` is true. A fully-local run
   leaves the intelligence pipeline off, so the provider was `undefined` → skip.
   Now, for the local caller, it falls back to the reasoner via the startup-derived
   analysis env (`HARNESS_ANALYSIS_*`, from the thinking-mode backend) — the same
   `OpenAICompatibleAnalysisProvider` the intelligence factory would build — so the
   gate judges on-device without the full pipeline.

2. **No spec.** The step keyed on `issue.spec`, but the local model rarely
   registers the roadmap Spec field. It now falls back to the conventional
   `docs/changes/<slug>/proposal.md` the design stage writes, and no-ops only when
   neither a spec file nor a provider resolves.

This is the right layer for the judgment: an **orchestrator-run gate**, not a
model-invoked MCP tool — codex cannot call MCP tools (it shell-execs the names),
so the verify-stage prompt instruction to run `outcome_eval` was inert and is
removed. A high-confidence `NOT_SATISFIED` blocks and re-dispatches, exactly like
the Claude/AMR path.
