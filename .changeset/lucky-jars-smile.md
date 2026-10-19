---
'@harness-engineering/cli': major
---

`audit_anatomy` no longer reports a clean audit of zero files.

`runAudit` defaulted its candidate set to `input.files ?? []`, so every caller that
omitted a `files` scope — `harness check-design`, `harness validate`, the
`design-pipeline` orchestrator, and the `audit_anatomy` MCP tool — got a scan loop
that never executed: `summary.totalFiles` stayed `0`, `findings` stayed empty, and
the run rendered as a pass. The published contract said the opposite; `-f, --files`
is documented as "Defaults to all project source files". It has been wrong since the
verifier shipped.

The default is now the project's source files, resolved by the same
`collectDesignScanFiles` helper `detect-design-drift` and `audit-brand-compliance`
now share, honouring `design.exclude` and `analysis.exclude`. One `check-design` run,
one file set. A resolved scope of zero files throws instead of returning a clean
result — a zero-file audit is an abstention, never a pass.

**This is breaking for anyone whose gate runs these commands.** Measured on this
repository with a freshly built CLI, the `audit-anatomy` verifier inside
`check-design --mode full` went from `audit-anatomy (0 findings)` over 0 files to
3,094 findings (2 error-severity, 3,092 warn). An adopter whose design gate is green
today can go red on the first run after upgrading, with no change to their code. To
stage the adoption, scope the run explicitly with `--files` (explicit paths — see the
glob note below), narrow it with `design.exclude` / `analysis.exclude`, or turn the
verifier off with `design.audit.componentAnatomy.enabled: false`.

This repository's own `check-design` exit code does **not** change: it was already 1
before this PR, because `detect-design-drift` emits 212 error-severity findings on
its own. The anatomy findings are additive here. An adopter whose only error-severity
findings would come from anatomy is the one who flips 0 → 1.

Major rather than patch: the fix is small, but the observable contract of a command
that gates CI changes from pass to fail, and `runAudit` gained a throw where it
previously always resolved.

## Sibling sweep: the explicit-scope door, and candidate counts

The same defect had a second door and two more verifiers, all fixed here.

Every design verifier skips a candidate it cannot open. Closing the omitted-scope
door left that skip intact, so a scope that resolved to nothing _readable_ still
rendered as a pass: `-f, --files` was documented as "file/glob" but no verifier has
ever expanded a glob, so `--files 'src/**/*.tsx'` audited zero files and reported
zero findings. A typo'd path did the same. All three verifiers now abstain when they
read no files, not just when they resolve no candidates. The flag's help no longer
claims glob support it does not have.

`detect-design-drift` and `audit-brand-compliance` also reported `totalFiles` as the
_candidate_ count rather than the count of files they read, so a scope of one
nonexistent path reported "1 file scanned, 0 findings" for a file never opened.
`totalFiles` is now bytes read, not paths offered.

Also breaking for the same reason as above: `detect-design-drift` and
`audit-brand-compliance` now throw over a project with no design surface where they
previously returned a clean zero-file result. `harness check-design` records a throwing verifier
under `verifiersFailed` and exits 2 (degraded).

`harness validate` used to catch the throw into a severity-`warning` issue, which
left `valid: true`, `complete: true` and exit 0 over an audit that applied no rule —
the same defect one layer up. All three design abstentions now go through
`result.unavailableChecks`, the channel `roadmapHealth` already uses, which forces
`complete: false` and the incomplete-run exit code. `harness validate` on a project
with no design surface therefore changes from exit 0 to the incomplete-run exit code.

## Also breaking: audit-brand-compliance's scope shrank

`audit-brand-compliance` never honoured any exclude config — its private `collectFiles`
walked the project and returned everything. Sharing `collectDesignScanFiles` means it
now honours `design.exclude ∪ analysis.exclude` like its two siblings. That is the
point of the extraction (one `check-design` run, one file set), but it is a scope
_reduction_ for brand specifically: an adopter who excludes a directory and relies on
`BRAND-T001` / `BRAND-V001` firing inside it will stop seeing those findings. On this
repository brand reports 0 findings either way, so the change is not observable here.
