---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): distill gate-failure feedback so retries see the actual assertion diffs

The enforced local gate threads its failure output into the next retry's prompt so
the model can fix what broke. That output was truncated head+tail at 4000 chars —
which, for a modern test runner with many files, keeps the passing-file tree (head)
and the summary tally (tail) but drops the failing tests' `Expected`/`Received`
assertion diffs, which sit in the MIDDLE. Observed live (a local run reached
264/267 passing and could not close 3 specific failures across 7 gated retries
because it only ever saw the failures' NAMES, never why they failed).

`distillGateFailure` extracts the failure-relevant regions instead — tsc
`error TS…` lines, per-test failure markers plus their following assertion diffs,
and lint error rows — always preserving the trailing summary, and dropping the
passing noise. Framework-general (tsc / eslint / vitest / jest) and degrades
gracefully: output with no recognizable failure markers falls back to the prior
head+tail behavior, and small output is returned verbatim. Extracted to a dedicated
`workflow/gate-feedback` module (`truncateGateOutput` re-exported for surface
stability).
