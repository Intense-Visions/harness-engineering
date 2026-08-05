---
'@harness-engineering/types': patch
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

Give maintenance checks a standard machine-parseable findings contract (#691).

`harness maintenance run` (and the cron orchestrator) previously recovered each
task's findings COUNT by regex-scanning free-text check output
(`N findings|issues|violations|errors`, plus a keyword fallback). That is
fragile: checks like `check-docs` (doc-drift) and `cleanup` (entropy) emit no
clean count — so doc-drift reported a uniform "1 finding" — and any wording
change could silently break the count.

A new shared envelope (`@harness-engineering/types`:
`MaintenanceFindingsContract` + `formatFindingsContract` / `parseFindingsContract`)
lets a check subcommand emit its count as structured data
(`{"findings":N,"check":"...","v":1}`) under a `--findings-json` flag. The
runner's shared spawn/parse core (`runHarnessCheck`) now prefers that envelope
over the regex on both clean and non-zero exits, and labels the source
(`findingsSource: 'contract' | 'regex'`). The legacy regex remains the fallback
for checks not yet migrated.

Migrated built-in checks: `check-arch`, `check-deps`, `check-docs`, `cleanup`,
`check-security`, `cross-check` (their registry `checkCommand`s now pass
`--findings-json`). Fully additive and backward-compatible — the flag defaults
off for interactive CLI use and unmigrated checks are unchanged.
