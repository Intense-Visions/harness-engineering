---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): enforce doc coverage in the local/codex gate

The enforced local gate ran only `typecheck + lint + test`, so the autopilot's
definition of "done" was narrower than a real ship: a new public module (e.g. a new
ESLint rule) passed the gate yet failed the repo's own doc-drift check in real CI,
because the harness counts a source file documented only when a `docs/` markdown
references its basename. The gate could green work that a real merge blocks.

Add a diff-relative doc-coverage step after verify: it fails when a change ADDS a
public source file (under a package `src/`, excluding tests / barrels / type-only
decls / config) whose basename is not referenced anywhere under `docs/`. Conservative
by design — only newly-added files, lenient "mention" match, and fail-OPEN on any scan
error — so it forces ship-ready docs without spurious blocks. The staged-workflow
prompt now also tells the model to document new public modules as part of the change.
