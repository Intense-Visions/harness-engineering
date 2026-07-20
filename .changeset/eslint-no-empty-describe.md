---
'@harness-engineering/eslint-plugin': minor
---

Add the `no-empty-describe` rule: flags `describe(...)` blocks whose callback
body has no statements, so an empty test container can't slip into the suite
and read as passing coverage. Object-name-gated on the `describe` identifier.
