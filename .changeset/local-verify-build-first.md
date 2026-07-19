---
'@harness-engineering/orchestrator': patch
---

Fix two defects that prevented a fully-local staged unit from ever shipping through
the enforced convergence gate:

1. **Local staged gate skipped without AMR.** `settleWorkflowSuccess` derives
   `isLocal` (whether to run the acceptance gate + ship) from
   `runs[last].decision?.backendName`, but the workflow engine only populated
   `run.decision` on the adaptive-router path. On the identity-fallback path — used
   whenever `routing.policy` is absent, i.e. the default (AMR-off) config —
   `run.decision` was left unset, so `isLocal` was underivable and the entire
   gate+ship block was skipped. The unit completed all stages, went to `in_review`,
   never shipped, and looped via reconciliation re-dispatch. The engine now
   synthesizes the identity-path decision (backend name + type) via a new
   `stageDecisionFor` context seam, with no extra decision-bus emission.

2. **Local verify gate did not build changed packages first.** A package whose
   lint/test consume its own compiled output (e.g. an eslint-plugin whose flat
   config dogfoods its built `dist`) false-failed with `Cannot find module` on a
   freshly `pnpm install`ed-but-unbuilt worktree — blocking correct code on a stale
   dist. The per-package `build→typecheck→lint→test` loop is extracted into an
   injectable `verifyChangedPackages` helper with unit coverage for build-first
   ordering and short-circuit-on-failure.
