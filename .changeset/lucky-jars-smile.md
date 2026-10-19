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

**This is breaking for anyone whose gate runs these commands.** On this repository the
default `check-design --mode full` audit went from `audit-anatomy (0 findings)` and
exit 0 to 3,083 findings (2 error-severity, 3,081 warn) over 4,121 files, and exit 1.
An adopter whose design gate is green today can go red on the first run after
upgrading, with no change to their code. To stage the adoption, scope the run
explicitly with `--files`, narrow it with `design.exclude` / `analysis.exclude`, or
turn the verifier off with `design.audit.componentAnatomy.enabled: false`.

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
previously returned a clean zero-file result. `harness validate` already degrades a
throwing verifier to a warning issue; `harness check-design` records it under
`verifiersFailed` and exits 2 (degraded).
