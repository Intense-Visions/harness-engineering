---
'@harness-engineering/core': patch
---

fix(harness-strength): scale the strength score by audit coverage so partial
coverage no longer reads as 100/100 (#1761).

Follow-up to #1013, which added the `incomplete` tier and a coverage line but
left the score computed as `100 - sum(findings)` — a term with no coverage
component, so a repo where most patterns abstained still scored a bare `100/100`
with a green tick. The tier and coverage line were annotations _around_ an
unchanged number rather than a correction _to_ it, and `100/100` is what survives
a CI log tail or a screenshot.

The auditor now scales the findings score by `evaluable / applicable` via a new
pure `scoreWithCoverage` helper: 2 of 7 patterns evaluated cleanly scores 29, a
repo where every pattern abstains scores 0, and full coverage remains the
identity so a complete clean audit still earns 100. The tier continues to key
off the findings-only score, keeping the coverage penalty on the number
orthogonal to the `incomplete`/`at-risk`/`theatre` tier.
