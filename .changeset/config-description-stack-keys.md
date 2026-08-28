---
'@harness-engineering/cli': minor
---

Recognize top-level `description` and `stack` keys in `harness.config.json`. Both are descriptive project metadata harness does not consume, but adopters (and co-tenant tools) commonly declare them at the config root — a human `description` and a plural `stack` block (`languages`, `frameworks`, `buildTools`, `testRunners`, `packageManager`). Previously the schema-strip loader dropped them with `⚠ ignored unknown key` warnings (#862), where the obvious way to silence the warning is to delete real metadata. They are now first-class optional keys: `stack` is a typed superset of the singular `template.language` / `template.framework` / `template.tooling.*` fields and is `.passthrough()` so forward-compat facets (e.g. `orms`, `clouds`) are preserved rather than warned.
