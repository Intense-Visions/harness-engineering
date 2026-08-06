---
'@harness-engineering/cli': patch
---

Dogfood the Holiday Confidence KPI in this repo: register the tracking command
and wire a scheduled workflow that records the measure at each release point, so
the "if the senior disappears for two weeks, what holds?" signal is exercised on
our own history rather than only shipped for adopters.
