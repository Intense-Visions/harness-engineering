---
'@harness-engineering/cli': minor
---

Add a real `--severity <error|warning|info>` flag to `harness validate` and
`harness check-perf`, mirroring `harness check-security`.

Persona CI workflows pass a persona-declared `--severity <level>` to their
command steps, but only `check-security` accepted the flag — `validate` and
`check-perf` hard-errored on it despite both already carrying a per-finding
severity model. Both commands now honor the threshold: when `--severity` is set,
findings below it are excluded from BOTH the report and the pass/fail verdict
(the command fails only when a finding at or above the threshold exists);
findings below the threshold never fail the gate.

Default behavior is unchanged. When `--severity` is omitted, every finding is
still reported and the verdict fails only on error-severity findings (for
`validate`, the hard checks that carry no explicit severity continue to fail as
before) — warnings and info are reported but never flip the verdict.

Widening the persona generator's flag whitelist so personas can declare these
thresholds is a follow-up; this change is the command capability only.
