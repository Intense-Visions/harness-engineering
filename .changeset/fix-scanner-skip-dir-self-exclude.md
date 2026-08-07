---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

Fix documentation-coverage scanner self-excluding when the checkout's own
absolute path contains a skip-dir segment (notably `.claude`).

`checkDocCoverage` matched its exclude globs against each file's absolute path
as well as its scan-root-relative path. When the default skip-dir globs include
`**/.claude/**` and the checkout lives under `<repo>/.claude/worktrees/<agent>/`
(where `isolation: worktree` agents run), every file's absolute path contained
`/.claude/` and matched, dropping all files. The denominator collapsed to zero,
which — since the zero-denominator became a loud failure — produced
deterministic false "stale docs" failures on those checkouts (CI was unaffected
because CI checkouts are not nested under a skip-dir).

The exclude globs now match the scan-root-relative path only, so the checkout's
own path prefix can no longer self-match. A skip directory that genuinely lives
inside the scanned tree is still excluded.
