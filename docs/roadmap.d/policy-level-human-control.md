---
slug: "policy-level-human-control"
milestone: "v5.0 — Enforcement Hardening"
order: 102
---

### Move human control from per-change review to declared policy

- **Status:** planned
- **Spec:** —
- **Summary:** Per-change human oversight has an arithmetic ceiling. At the throughput a single operator already sustains, skimming every pull request at five minutes each consumes over three hours a day before any work happens; at twice that rate it exceeds a working day. Every review-side item on this roadmap — `risk-tiered-review-gate`, `pre-merge-brief` — reduces the volume a human reads, but the model stays "a person looks at changes." The next model is "a person declares constraints and the machine proves conformance": acceptance criteria, invariants, forbidden transitions and risk classifications authored once per surface, enforced on every change, with human attention spent on *changing the policy* rather than on reading diffs. Build: a declarative policy surface per repository, versioned and reviewable like code; mechanical conformance checks bound to it; and an escalation path that surfaces only changes the policy cannot adjudicate. Prerequisite for any operating point where nobody can read the day's output.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1534
