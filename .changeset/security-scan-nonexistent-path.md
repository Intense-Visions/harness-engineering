---
'@harness-engineering/cli': patch
---

fix(cli): `run_security_scan` no longer reports a clean scan for a path it never read (#2622). A nonexistent or non-directory `path` is now an `isError` result naming the path; a directory with zero scannable files carries `abstained: true` plus an `abstentionReason`, and the health snapshot treats it as not measured rather than a pass. A zero-file scan is never recorded to `.harness/security/timeline.json`, from either the MCP tool or `harness check-security --record`.
