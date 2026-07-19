---
'@harness-engineering/cli': patch
---

Fix #896: craft skills now emit a one-line diagnostic so an empty result is
distinguishable from "ran clean". The shared summary reports the resolved
provider/mode and files scanned vs. skipped (with a reason such as an
unsupported language producing 0 analyzable files), and `HARNESS_CRAFT_LLM`
naming a backend absent from `agent.backends` now errors explicitly instead of
silently degrading to in-session.
