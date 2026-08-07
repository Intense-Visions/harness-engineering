---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
---

Fix two `harness knowledge-pipeline` correctness bugs where the command produced
confident, unactionable verdicts (#1110, #1111).

**Coverage abstains on a zero denominator (#1110).** `CoverageScorer` graded a
domain `F` whenever it had no linkable code (`0/0`), so "no graph / no data" and
"genuinely bad coverage" were indistinguishable — a fresh checkout with no graph
scored worse than a real assessment. Domains with no linkable-code denominator
are now reported as `measured: false` / grade `N/A` and excluded from the
aggregate; an entirely empty graph yields `graphPresent: false` and an `N/A`
overall grade. The `--coverage` output prints an explicit "no graph — run
`harness graph scan`" escalation instead of a grade, and per-domain `0/0` lines
render `N/A` rather than `F (0/100)`. A first-run drift score (all findings
`new`) is now labelled so `1.00` is not misread as "everything drifted".

**Test files and fixtures are excluded from extraction (#1111).** The code-signal
extractors walked `tests/`, `fixtures/`, `expected/`, and snapshot trees, staging
test titles and golden-file data as `business_rule`/`business_term` gaps — so the
gap report's "undocumented" count was dominated by test artifacts. `ExtractionRunner`
now applies a default exclude set (test files and fixture/golden/snapshot trees,
mirroring the existing `security.exclude` / `entropy.excludePatterns` conventions),
extendable via a new `knowledge.extractionExclude` config field. Staged entries
now carry their source `path` so a finding is attributable without grepping the
repo. First-party source is untouched.
