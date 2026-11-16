---
'@harness-engineering/cli': patch
---

fix(cli): migrate legacy `.harness/.gitignore` rules that hid the security ledger and hooks (#2135)

Projects scaffolded before #270 still carried a bare `security/` and `hooks/` in
`.harness/.gitignore`. A directory-suffix ignore stops git descending, so a later
`!security/timeline.json` could never re-include the trend ledger, and the merge
treated `security/` as already covering `security/*`, so it never healed.
`ensureHarnessGitignore` (run on `harness init` and MCP start) now rewrites exactly
those two lines: `security/` becomes `security/*` + `!security/timeline.json`, and
`hooks/` is dropped so the team-policy hook scripts are committed. Every other
rule, including user-added ones, is preserved.
