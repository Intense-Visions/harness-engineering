---
slug: "machine-pre-review-for-untrusted-changes"
milestone: "v5.0 — Enforcement Hardening"
order: 114
---

### Establish safety on untrusted changes before spending human attention

- **Status:** planned
- **Spec:** —
- **Summary:** At high inbound volume a maintainer cannot afford to be the first reader. Measured on openclaw/openclaw, roughly 350 pull requests arrive daily and **1,274 were closed unmerged in 30 days — about 12% rejected** — so a material share of maintainer attention is spent discovering that a change should not land. The harness already owns the review machinery (`harness-code-reviewer`, the adversarial and security reviewers, `outcome-eval`); none of it is pointed at inbound work from outside the project. Build: a pre-review pass that runs before a human looks — scope conformance against declared project boundaries, duplicate-of-existing-PR detection, test and gate conformance, security review of the diff, and a machine verdict with cited evidence attached to the pull request. Success is measured as maintainer decisions avoided, not reviews produced. Pairs with `contributor-trust-tiering`, which decides how much verification an untrusted change earns.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1546
