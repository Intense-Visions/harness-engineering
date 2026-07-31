---
'@harness-engineering/core': patch
---

fix(review): stop the SQL-injection heuristic firing on prose that uses a SQL keyword as a word

The security review agent's CWE-89 heuristic reported a **critical** SQL-injection
finding for a `commander` help string:

```
'never create a ticket for a row lacking an externalId (report the skip instead) — ' +
```

There is no SQL there. The pattern matches case-insensitively, so the ordinary
English word "create" whole-word-matched the `CREATE` keyword, and the literal is
followed by `+`. Whole-word matching already spared inflected forms
("created"/"updated"); the bare stem was the hole. This is the same class of
false positive as issue #657 — whose string-boundary fix was necessary but not
sufficient — and it produced a `critical` finding with `trustScore: 49` on a PR
containing no database code at all.

A statement keyword alone is not evidence of SQL. Real queries pair one with a
**structural companion** token (`SELECT … FROM`, `INSERT INTO`, `UPDATE … SET`,
`DELETE FROM`, `CREATE`/`ALTER`/`DROP TABLE`, `… JOIN`, `… VALUES`); prose
essentially never does. Both the concatenation and template-literal alternatives
now require a keyword **and** a companion inside the same literal.

Every genuine injection shape still fires (verified by parametrized tests for
`INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, and an interpolated
`SELECT … JOIN … WHERE`), and the prose class is gone — including a regression
test pinned to the verbatim line that blocked the PR. The pre-existing
nested-quote blind spot (`"INSERT INTO t VALUES ('" + name + "')"`, which the
`[^"']` class cannot span) is now documented as a known limitation rather than
left implicit; it was not introduced by this change.
