---
'@harness-engineering/core': patch
---

Fix a hardcoded-secret false positive in the review security floor. A `NAME=` inside a quoted grep pattern, such as `KEY=$(grep '^API_KEY=' .env | cut -d= -f2)`, no longer gets the pattern's closing quote read as the opening of a secret value. Unterminated values that open outside any string are still flagged, and so are closed literals embedded in another string. When a match is skipped, the scan continues along the rest of the line.
