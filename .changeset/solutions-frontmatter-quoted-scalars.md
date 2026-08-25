---
'@harness-engineering/graph': patch
---

Fix `ingestSolutions` rejecting every solution doc whose frontmatter uses quoted scalars.

`parseSolutionFrontmatter` is a hand-rolled key/value parser and never stripped
surrounding quotes, so `last_updated: '2026-05-06'` reached
`SolutionDocFrontmatterSchema` as `'2026-05-06'` with its quotes attached, failed
the `ISO_DATE` regex, and the document was skipped as malformed. Same for
`module`, `problem_type` and quoted `tags` items.

Quoted scalars are valid YAML and are the form the shipped
`docs/solutions/assets/resolution-template.md` prescribes, so a project that
followed the template had **none** of its post-mortems ingested. The two readers
of the same corpus disagreed: `harness validate` parses with `gray-matter`, which
unquotes, so a quoted date passed validation and then failed ingest. Measured on
a real project, the corpus went from 1 of 7 files readable to 6 of 7 (the
remaining one is the template itself, whose `<YYYY-MM-DD>` placeholder is
deliberately not a date).

The bug was invisible because every fixture in `tests/fixtures/solutions/`
happened to use bare scalars, while `SolutionDocFrontmatterSchema`'s own unit
test passes a plain object and so never exercises parsing at all. A
`quoted-scalars.md` fixture (both quote styles) plus two regression tests now
cover it, and `tests/fixtures/solutions/**` is prettier-ignored so the double
quotes — the actual test input — survive formatting.

Not switched to `gray-matter`: a real YAML parser resolves a bare `2026-05-06`
to a `Date`, which `z.string()` rejects, so that would fix the quoted form by
breaking the bare one every existing doc uses. Unquoting is additive — both
forms now parse.
