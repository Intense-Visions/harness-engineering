---
'@harness-engineering/cli': minor
---

Honor persona-declared CI triggers. `harness persona sync-workflows` regenerates
and drift-guards the committed `.github/workflows/persona-*.yml` files that make
persona `on_pr` / `on_commit` / `scheduled` triggers real (CLI-command tier only;
skill/LLM steps are served elsewhere).

- Adopter-first: defaults to the published CLI via `npx` with a portable header,
  and refuses to run when the project has no `agents/personas/` (never writes the
  bundled personas into `node_modules`). `--runner workspace --advisory`
  reproduces the build-from-source, non-blocking dogfood shape.
- `--severity` is appended only to commands that accept it (`validate`,
  `check-perf`, `check-security`) — previously it was blanket-appended and made
  most emitted steps hard-error.
- A persona only gets a workflow when its CI tier adds something `harness ci
check` does not already run (a scheduled sweep, or a command outside the
  `ci check` aggregate), so redundant per-PR duplicate jobs are not emitted.
