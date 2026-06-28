---
'@harness-engineering/cli': patch
---

Wire up `harness review-ci --comment` to actually post the verdict to the pull request (it previously logged a "not yet wired (Phase 3 stub)" warning). When `--comment` is set, the command now renders the verdict as a Markdown summary — assessment, finding counts, and a list of blocking + other findings — and posts it as a comment on the current branch's PR via `gh pr comment` (piped over stdin so long verdicts never hit the shell arg-length limit). A comment is used rather than a `--request-changes` review so it works in every context, including when the same actor authored the PR and in CI where the bot is not the author; the gate's exit code remains the authoritative merge blocker. If posting fails (no PR, no `gh`, auth error) the command warns and still exits with the verdict's code rather than crashing.

Also fixes verdict-artifact output, which never worked: `review-ci`'s own `--json <path>` option was silently shadowed by the root program's global `--json` flag (commander routed the value to the parent, so the file was never written). The global `--json` now streams the verdict artifact to stdout (suppressing the human summary so the output stays valid, pipeable JSON), and a new `--out <path>` writes the artifact to a file.
