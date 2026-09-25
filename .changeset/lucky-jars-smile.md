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
