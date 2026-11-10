---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix: `check-deps` cycle chains now close on their first node (`b -> a -> b`, not `b -> a -> a`) and render in repo-relative paths matching the finding header (#2329). The `detectCircularDeps` `cycle` array itself was wrong, so arch `circular-deps` violation ids for existing cycles change once.
