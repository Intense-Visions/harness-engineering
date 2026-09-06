---
'@harness-engineering/cli': patch
---

Fold `tierOverrides` into the skills-index cache key. The on-disk index was keyed on skill.yaml mtimes alone, so a changed override map was invisible to the cache: editing `tierOverrides` in harness config was inert until an unrelated skill.yaml mtime changed, and the first caller's overrides were served to callers that passed none.
