---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Wire outcome-eval in as an automatic, blocking post-execution spec-satisfaction gate.

- Add `harness outcome-eval-ci`: a headless, CI-runnable surface of the outcome-eval gate. It resolves the spec (explicit `--spec` or auto-discovered from the diff), the diff range, and optional captured test output; runs the `OutcomeEvaluator`; persists the `execution_outcome` node to `.harness/graph`; and turns the TypeScript-derived ship authority into an exit code — blocking (exit 1) only on a high-confidence `NOT_SATISFIED` under `--block-on blocking` (the default). Degrade-safe: no resolvable spec, no analysis provider, an empty diff, or a persistence failure yields an `INCONCLUSIVE`/advisory verdict and exit 0.
- Enrich `OutcomeEvaluator` persistence: the `execution_outcome` node now carries the full verdict (`rationale`, `authority`, `unmetCriteria`) plus an optional `commit` sha, so a sha-keyed consumer (the pre-merge brief) can reconstruct and surface the verdict. `OutcomeEvalInput` gains an optional `commit` field; the `outcome_eval` MCP tool threads it through. All additive — a node written without a commit keeps the prior shape aside from the new verdict fields. `authority` on the node is the TS-derived value, never read from the LLM.
