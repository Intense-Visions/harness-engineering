---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): give local DOCUMENT stages a larger deadline than other local stages

A local DOCUMENT stage (produces `spec`/`plan`) runs on the reasoning backend, which
faithfully follows the skill's multi-phase process and over-explores — gathering context
across many turns before writing its artifact. The flat 600s local deadline
(`LOCAL_STAGE_DEADLINE_MS`) could guillotine it mid-exploration, so the captured output was
a narration fragment rather than a finished spec/plan. Document stages now default to
`LOCAL_DOCUMENT_STAGE_DEADLINE_MS` (1200s) while execution/verify/review keep 600s; an
explicit `stageDeadlineMs` on the workflow decl still overrides, and cloud stages are
unchanged.
