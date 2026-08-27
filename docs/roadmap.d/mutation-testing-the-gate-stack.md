---
slug: "mutation-testing-the-gate-stack"
milestone: "v5.0 — Enforcement Hardening"
order: 122
---

### Prove the gates catch anything: inject faults and measure escape rate

- **Status:** planned
- **Spec:** —
- **Summary:** The entire trust model rests on gates — coverage floors, review agents, security scans, conformance checks — and nothing measures whether the gates *work*. A 96% CI pass rate is equally consistent with "changes are good" and "gates are blind." Mutation testing answers this for test suites; apply it to the whole gate stack: periodically inject known-bad changes — a subtle logic inversion, a leaked secret pattern, a removed permission check, an invariant violation — through the same pipeline real changes take, in a marked-and-quarantined mode that can never merge, and report gate escape rate per fault class. This is the immune-system principle: a defence that never sees an attack atrophies undetected. Output: "the review stage catches 9 of 10 injected logic faults but 2 of 10 permission-check removals" — which redirects gate investment from vibes to measurement, and gives `machine-pre-review-for-untrusted-changes` a calibrated confidence number instead of an asserted one. Design constraint stated up front: injected faults are cryptographically marked, quarantined at dispatch, and excluded from every throughput metric, so the instrument cannot contaminate the thing it measures.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1554
