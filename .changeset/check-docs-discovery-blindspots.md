---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Fix `check-docs` / `cleanup` file-discovery blind spots (#1146).

Three independent blind spots made these gates report on an unrepresentative
slice of a repo — and, in the degenerate case, a confident 100% green over zero
files:

- **`.mjs` / `.cjs` were invisible.** `checkDocCoverage` discovered source with
  `**/*.{ts,js,tsx,jsx}`; it now includes `.mjs`/`.cjs`, matching the entropy
  analyzer. Every ESM-first repo was previously invisible to docs coverage.
- **Dot-directories were never traversed.** The shared `findFiles` now passes
  `dot: true`, so first-party source under a dot-directory (`.canary/`,
  `.config/`, …) is discovered. The genuine ignore list (`.git`,
  `node_modules`, the `.harness` runtime, virtualenvs, build/tooling caches)
  stays excluded. This also cures false `NOT_FOUND` drift findings from
  `cleanup --type drift`, whose exports index is built from the same discovery.
- **A zero-file scan reported 100%.** `checkDocCoverage` now reports a `scanned`
  denominator and never returns a confident 100% when it read nothing; the
  `check-docs` command surfaces the abstention explicitly (distinct exit code,
  `x/y files documented` denominator on every run), mirroring the
  `check-security` precedent.

Additionally, `check-docs` now honors `entropy.excludePatterns` from
`harness.config.json` (previously hardcoded), so config governs it identically
to the `harness ci check` path.
