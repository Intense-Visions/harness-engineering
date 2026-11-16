---
'@harness-engineering/core': patch
---

fix(autonomy): serialize auto-decision log appends so a concurrent writer can no longer leave a blank line in `auto-decisions.jsonl`. The cut-short-line repair read the log's tail and then wrote; on Linux another writer's line still being copied looked cut short, so the repair's newline landed after it as an empty line. The tail check and the write now run under a per-log `O_EXCL` lock file with stale-lock recovery; a lock that cannot be taken fails the append as `AUTO_DECISION_WRITE_FAILED` (the skill pauses). (#2535)
