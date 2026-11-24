---
'@harness-engineering/core': patch
---

Fix a hardcoded-secret false positive in both the review security floor and the SEC-SEC-002 scanner rule. When `NAME=` sits inside an already-open string, as in `KEY=$(grep '^API_KEY=' .env | cut -d= -f2)`, and the quote after `=` is that same quote character, the quote now counts as closing the grep pattern rather than opening a secret value. Literals nested in a string of the other quote type, unterminated literals outside any string, and later literals on the same line are still flagged.
