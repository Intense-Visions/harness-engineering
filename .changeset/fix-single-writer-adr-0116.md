---
'@harness-engineering/cli': patch
---

docs(comprehension): record the single-writer decision as ADR 0116 and correct
dangling `ADR 0110` references. The decision shipped in #1728/#1729 was drafted
as "ADR 0110", but number 0110 was concurrently taken on `main` by an unrelated
adr-fleet decision (`0110-skill-run-execution-vs-separate-dispatcher`) and the
single-writer ADR file was never committed. This adds the real
`0116-single-writer-semantic-comprehension.md` and updates every `ADR 0110`
reference in the comprehension source, tests, plan/provenance artifacts, and
changesets to `ADR 0116` (including one `comprehension.ci: off` log line).
No behavior change.
