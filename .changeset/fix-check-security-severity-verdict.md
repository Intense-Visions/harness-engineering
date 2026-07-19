---
'@harness-engineering/cli': patch
---

Fix #915: `check-security --severity` now bounds the pass/fail verdict, not just the report. The verdict was hardcoded to fail only on `error` findings, so `--severity warning`/`info` filtered the displayed findings but could never fail the gate, while lower-severity findings appeared to leak into higher-severity gates. The command now fails only when a finding at or above the requested severity exists — info findings never fail a `--severity error` gate, and a requested threshold actually gates at that level.
