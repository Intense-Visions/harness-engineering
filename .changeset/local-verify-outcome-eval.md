---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): local verify stage delegates impl-vs-spec judgment to outcome_eval

A staged local workflow's verify stage was told to run `run_code_review` /
`run_ci_checks` — "do the tests pass?" — but nothing checked whether the
implementation actually SATISFIES the spec. That let a diff whose behavior
contradicts the spec through (observed: a rule whose own test marked a
spec-invalid case as valid; tests were internally consistent but wrong).

The LOCAL verify-stage prompt now instructs `harness__outcome_eval` with the
spec path, the accumulated `git diff`, and the test output — an LLM judge (the
reasoner, via the local analysis provider) that reads the spec's acceptance
criteria and emits SATISFIED / NOT_SATISFIED, where a high-confidence
NOT_SATISFIED is blocking and its `unmetCriteria` are folded into the findings.
A new `specPath` render variable exposes the design spec's path; only the LOCAL
verify branch references it (the default template and other stages are
unchanged).
