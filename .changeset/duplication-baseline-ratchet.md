---
'@harness-engineering/cli': minor
---

Duplication now has a recorded baseline. `harness cleanup -t duplication --update-baseline` records the current clone classes to `.harness/duplication/baseline.json`, and later runs (and `detect_entropy`, as `duplicationBaseline` in detailed mode and `advisory.duplication.baseline` in summary mode) report the movement against it: classes added, removed and grown, keyed on the detector's content fingerprint (`fingerprint:tokenCount`) rather than a raw count, plus the rank-total delta. A missing baseline is reported as `no-baseline`, never as a zero delta. The delta is advisory: it is never summed into `totalIssues`, the `--findings-json` contract or the exit code (spec decision D4 / ADR 0134). Whether a regression should ever gate is left as an explicit follow-up decision.
