---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(core): check-harness-strength honors core.hooksPath and never reads partial coverage as solid

Two companion defects in the STRENGTH auditor:

**Hook discovery ignored `core.hooksPath` (#1012).** `buildProjectContext` read a
single hardcoded `.husky/pre-commit` and `resolveHookFiles` searched only
`.husky` / `.claude/hooks` / `.harness/hooks`. A repo wiring hooks via
`.githooks/` + `git config core.hooksPath .githooks` (a common non-husky
convention) therefore had `ctx.preCommit === null`, silently disabling
**STRENGTH-002 (regression-baseline)** and **STRENGTH-003 (skip-discipline)** —
the two patterns most specifically about pre-commit behavior — while still
scoring `solid`. Discovery now resolves `core.hooksPath` from the repo-local
`.git/config` (file-based, so the auditor stays child_process-free and
unit-testable), includes that directory in `resolveHookFiles`, and sets
`ctx.preCommit` from `<resolvedHooksDir>/pre-commit` (falling back to `.husky`
then `.git/hooks`).

**Non-evaluable patterns scored as a clean solid (#1013).** When a rule could
not be evaluated (required input absent) it contributed nothing to the score and
nothing to the output, so "we could not audit this" read identically to "we
audited this and it was clean" — a repo where every pattern abstained scored
100/100 `solid`. The auditor now:

- reports `summary.rulesApplicable` (the coverage denominator) and
  `summary.skipped: [{ id, gearPiece, reason }]` (the named abstentions);
- withholds `solid` when coverage is partial, using a new `incomplete` tier so a
  clean score across only some applicable patterns no longer reads as a full
  pass (weaker tiers already signal detected problems and are unchanged);
- the CLI prints `coverage: N/M patterns evaluated` and lists each skipped
  pattern, so the gap is visible and actionable rather than invisible.
