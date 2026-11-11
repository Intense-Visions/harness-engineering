---
'@harness-engineering/cli': patch
---

`harness init` now adds `cache/` to the generated `.harness/.gitignore`. Core writes
regenerated caches there (OSV advisories, CI verdicts, LiteLLM pricing, insights impact),
and an untracked-but-unignored `.harness/cache/` fails a whole-tree `format:check` on
unrelated changes. Re-running `harness init` on an existing project appends the entry
without touching custom lines.
