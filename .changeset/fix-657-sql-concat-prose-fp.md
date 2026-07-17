---
'@harness-engineering/core': patch
---

fix(review): SQL_CONCAT_PATTERN no longer flags prose as CWE-89 (#657)

The security floor reviewer's `SQL_CONCAT_PATTERN` matched a bare SQL keyword
followed anywhere on the line by `+ <word>`, so arithmetic-style prose such as
the markdown heading `UPDATE (medium + large tiers)` fired a `critical` CWE-89
"SQL injection" finding. Because `required-review` blocks on `critical` and the
floor tier runs without LLM adjudication when no `ANTHROPIC_API_KEY` is present,
a single prose false positive hard-blocked unrelated PRs (hit PR #656).

The pattern now requires the SQL keyword to live **inside a quoted string
literal or template literal** that is actually concatenated (`… " + userId`) or
interpolated (`` `SELECT … ${userId}` ``) — the genuine injection shape. Prose
keyword-plus-`+` no longer matches, while genuine
`db.query("SELECT * FROM users WHERE id = " + userId)` still flags CWE-89. As a
bonus the template-literal alternative now also catches a keyword that precedes
its `${…}` interpolation (previously only keyword-after-interpolation matched).
