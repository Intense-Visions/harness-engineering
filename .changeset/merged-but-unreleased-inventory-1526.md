---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(release-inventory): track merged-but-unreleased inventory as a first-class
metric (#1526).

Adds a pure `release-inventory` module to `core` that computes the
merged-but-unreleased inventory — pending changesets (count + age) and unreleased
commits/merges (count + age) sitting between the last release and HEAD — against
an explicit release-channel denominator (git tags matching a configurable
pattern, default `v*`). A zero-release repo reports `status: "unbounded"` rather
than omitting the metric, and the threshold fires when inventory outgrows release
cadence. Exposed as a report-only `harness release-inventory` command (`--json`,
`--strict`), with an optional `releaseInventory` config block for thresholds.

Every result carries its denominator (`shippedDefinition`) so the number is
interpretable. Measurement only — the default exit code is 0; `--strict` opts a
breach into a non-zero exit. Dashboard/digest surfacing is a follow-up.
