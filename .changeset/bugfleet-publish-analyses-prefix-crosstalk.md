---
'@harness-engineering/cli': patch
---

Resolve analyses to the longest matching feature prefix instead of the first match. When one roadmap feature's slug prefixed another's (`cool-feature` vs `cool-feature-v2`), the shorter-named feature swallowed the longer one's analyses and the comment was posted to the wrong tracker issue — then marked published, so it was never corrected.
