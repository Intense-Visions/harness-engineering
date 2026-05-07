---
'@harness-engineering/cli': patch
---

fix(hooks): block-no-verify only matches argv-token flags, not substrings (#285)

The block-no-verify PreToolUse hook previously did a naive substring test for
`--no-verify` against the entire Bash command, so it blocked commits whose
message body, heredoc, or shell comment merely _mentioned_ the flag. The
detector now strips quoted strings, heredoc bodies, and shell comments before
testing, and matches `--no-verify` and `git commit -n` only when they appear
as standalone argv tokens.
