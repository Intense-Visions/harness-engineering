---
'@harness-engineering/cli': patch
---

fix(cli): the Cursor tool-picker prompt now derives the recommended-tool count from `CURSOR_CURATED_TOOLS.length` instead of a hardcoded "25", so the message no longer under-reports the 26 pre-selected tools.
