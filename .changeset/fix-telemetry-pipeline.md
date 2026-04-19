---
'@harness-engineering/cli': patch
---

Fix telemetry pipeline and hook path resolution

- Fix identity field lowercasing in telemetry wizard: project name, team, and alias now preserve original casing
- Add `hooks/` and `security/` to `.harness/.gitignore` template so generated artifacts are never committed
- Add CLI command telemetry: every `harness` CLI invocation writes an adoption record to `adoption.jsonl`, flushed to PostHog on the next invocation
- Fix hook path resolution: use `git rev-parse --show-toplevel` so hooks resolve correctly when Claude Code CWD is a subdirectory
- Untrack `.harness/security/timeline.json` (runtime artifact committed before gitignore rule existed)
