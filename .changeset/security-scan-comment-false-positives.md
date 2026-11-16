---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(security): `harness check-security` code-pattern rules no longer match text inside JS/TS/Go comments (a comment naming `__proto__` or `createHash('sha1')` is not a finding), and `SEC-DES-001` is suppressed when the `JSON.parse` result is handed to a schema `.safeParse`/`.parse` call within five lines. Secret rules and `SEC-CRY-002` still scan comments. On this repo the scan drops from 12 false findings to 3.
