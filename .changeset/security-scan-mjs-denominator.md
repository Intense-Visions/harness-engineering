---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/dashboard': patch
---

Fix `check-security` scanning no `.mjs`/`.cjs` files, and report the scan
denominator (#1084).

The scan glob was `**/*.{ts,tsx,js,jsx,go,py,java,rb}`, so an ESM-only Node
project got a scan that matched none of its source and a gate that passed because
it read nothing — indistinguishable, in the output, from a genuinely clean run. In
the repo where this surfaced, 144 tracked `.mjs` sources went unread while a
security ledger recorded `securityScore: 100`; a planted AWS key was detected in
`.ts` and `.py` and invisible in the byte-identical `.mjs`.

The glob was duplicated across `check-security`, the CI check-orchestrator, and
the dashboard's security gatherer, and the copies had drifted (the orchestrator's
also omitted `java`/`rb`). It now has one home,
`core/src/security/scan-targets.ts` (exported as `SECURITY_SCAN_GLOB` /
`SECURITY_SCAN_EXTENSIONS` / `SECURITY_SCAN_DEFAULT_IGNORE`), with `mts`/`cts`
added alongside `mjs`/`cjs`.

`check-security` now also reports what it read: text output appends the
files-scanned and rules-applied counts, JSON output gains `scannedNothing` and
`stats`, and a zero-file scan emits an explicit ABSTAINED issue instead of
presenting as clean. New `--fail-on-empty` makes that abstention blocking for CI
gates; the default stays non-blocking so repos with legitimately no scannable
source are not reddened by the upgrade.

Behaviour change to expect: projects containing `.mjs`/`.cjs`/`.mts`/`.cts`
sources will see findings that were previously invisible, including in
`harness ci check` and the dashboard's security panel.
