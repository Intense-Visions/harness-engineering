---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

An arch allowance file that cannot be applied (not valid JSON, or not matching the
allowance schema) is no longer dropped silently. `loadArchAllowances` still skips it —
a malformed allowance must not break the gate — but now records it in
`coverage.skipped` with a reason. `harness ci check` reports each one as an arch
warning, and `harness check-arch` prints a warning and returns it as
`skippedAllowances` in `--json` output.

Before this, a skipped allowance looked exactly like no allowance: the regression it was
written to acknowledge came back as a gate failure with nothing pointing at the file.
That is how the zod 4 exhaustive-record change went unnoticed downstream.
