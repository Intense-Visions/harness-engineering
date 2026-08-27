---
slug: "rejection-ledger-negative-knowledge"
milestone: "Intake"
order: 49
---

### Rejection ledger — durable negative knowledge that stops re-proposal

- **Status:** planned
- **Spec:** —
- **Summary:** Decision records capture what was chosen; nothing captures what was refuted and why, so generators re-propose dead ideas at exactly the rate they generate. At high generation rates the dominant ideation waste is re-derivation of already-refuted approaches — each round of ideation, brainstorming, or inbound triage re-litigates proposals that died months ago, and the refutation is buried in a closed PR thread nobody will find. Build the rejection ledger: a first-class store of refuted approaches, each entry carrying the approach's semantic fingerprint, the refutation (the specific reason it fails), the premises the refutation depends on, and provenance. Ideation and intake query it by semantic match before proposing; a hit surfaces the prior refutation instead of re-exploring. Critically, refutations expire: each entry's premises are linked to detectable conditions (a dependency version, a constraint, a scale threshold), and when a premise no longer holds the entry is flagged for re-evaluation rather than silently blocking a now-viable idea — negative knowledge decays like any other and must be tended, not hoarded.
- **Blockers:** Depends on `semantic-duplicate-detection-at-backlog-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1620
