---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Gates no longer leave side effects behind (#2474):

- `ensureHarnessGitignore` (run on every MCP server start and by `init`) no longer appends a bare `metrics/` rule to an existing `.harness/.gitignore`. Rules are compared by the directory they cover, so `metrics/` counts as present when `metrics/*` is there, and no rule is appended over a `!dir/...` un-ignore. The template now writes `metrics/*`.
- The health snapshot runs the security scan with `record: false`, so dispatching skills no longer appends to the tracked `.harness/security/timeline.json`. The `run_security_scan` MCP tool still records by default.
- `check-arch --update-baseline --reason` merges into the branch's existing allowance instead of replacing its reason. Violation ids that were already acknowledged keep their recorded reason (new `violationReasons` map), and the top-level `reason` keeps every distinct justification.
