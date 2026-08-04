---
'@harness-engineering/core': patch
---

fix(review): stop the security floor tier emitting fabricated criticals (#984)

The no-LLM security floor was reporting blocking `critical` findings for strings
that cannot reach any sink. Three false-positive classes, all observed on real PRs:

- **Prose using a SQL keyword as an English word.** A `commander` help string —
  `'never create a ticket for a row lacking an externalId … ' +` — was reported
  as critical CWE-89 because "create" whole-word-matches `CREATE` and the
  literal is followed by `+`. Same class as issue #657, whose string-boundary
  fix was necessary but not sufficient.
- **Test fixtures.** A test proving a detector fires must contain the vulnerable
  shape as data, so any PR touching a security test self-flagged.
- **Comment bodies.** A JSDoc documenting the shape a rule detects necessarily
  contains it; the rule's own JSDoc was reported as a critical CWE-89.

The fixes:

- **SQL: ordered statement shapes.** A statement keyword alone is not evidence
  of SQL. The pattern now requires an ordered shape (`SELECT … FROM`,
  `INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, `CREATE/ALTER/DROP TABLE`,
  `UNION SELECT`) inside a concatenated string literal or an interpolated
  template literal. The vocabulary deliberately mirrors `SQL_QUERY_SHAPE` in
  `finding-integrity.ts`, so nothing the floor emits is downgraded by the
  Phase 5.75 integrity invariant (#989) — one definition of "looks like SQL",
  not two. The template alternative does not require a closing backtick, so the
  opening line of a multi-line template query still fires.
- **Comment-only lines are skipped; comment PREFIXES are not.** `/**/ eval(x)`,
  `*/ eval(x)`, and generator members (`*run() { … }`) execute and are scanned;
  a trailing `//` comment is stripped without truncating at a URL's `://`.
- **Guards are code-scoped.** Test-file markers (`.test.`, `.spec.`, …) and JS
  comment syntax apply only to files with code extensions, so `.env.test.local`
  and a key in a Markdown bullet are still scanned. The secrets detector keeps
  its deliberately wider file scope.

Known, test-pinned limitations (a heuristic floor, not a proof of absence): a
SQL shape split across concatenated literals or lines does not fire (loosening
to line level would resurrect the prose class), nested quotes are not spanned
(pre-existing), and a bare clause fragment (`` `WHERE id = ${id}` ``) no longer
fires. The LLM review tier above the floor covers those shapes.

50 tests pin both directions — every guard has a must-fire case proving it
cannot over-suppress, plus a cross-layer test asserting detector output
survives `enforceFindingIntegrity` undowngraded.
