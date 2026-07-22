---
'@harness-engineering/core': patch
---

fix(harness-strength): STRENGTH-003 resolves a variable skip list (`--skip "$SKIP"`)

The skip-list auditor matched only a literal `--skip a,b,c`, so a hook using the drift-free
`SKIP="a,b,c"` + `--skip "$SKIP"` single-source form went unaudited — silencing the review-time
signal that flags a growing/hollow local gate. The matcher now captures quoted/bare/variable
tokens and, for a `$VAR`/`${VAR}` reference, resolves the matching `VAR="a,b,c"` assignment in
the same file (unresolvable → skipped gracefully). Literal-match path unchanged.
