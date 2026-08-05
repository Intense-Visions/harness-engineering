---
'@harness-engineering/cli': minor
---

Honor persona-declared CI triggers (#663). `generateCIWorkflow` gains a
`runner: 'workspace'` mode (build-from-source `node …/harness.js`, node 22) and
an `advisory` mode (`continue-on-error`); the adopter-facing `npx harness`
default is unchanged. New `harness persona sync-workflows [--check]` regenerates
and drift-guards the committed `.github/workflows/persona-*.yml` files that make
persona `on_pr` / `on_commit` / `scheduled` triggers real. Only the CLI-command
tier is emitted (skill/LLM steps remain served by `required-review.yml`).
