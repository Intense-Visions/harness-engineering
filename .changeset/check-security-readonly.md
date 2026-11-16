---
'@harness-engineering/cli': patch
---

`harness check-security` no longer appends a snapshot to the tracked `.harness/security/timeline.json` on every run (#2330). A plain scan is now read-only; pass `--record` to append the scan to the security trend ledger deliberately.
