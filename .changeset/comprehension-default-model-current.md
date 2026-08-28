---
'@harness-engineering/cli': patch
---

Comprehension's default semantic model is now `claude-haiku-4-5` (the current
cheap/fast Haiku alias) instead of the retired `claude-3-5-haiku-latest`, which
reached end-of-life 2026-02-19 and emitted deprecation warnings on every semantic
generation. Uses the bare non-dated alias so it auto-tracks the latest Haiku
snapshot; override via `comprehension.model` for other providers.
