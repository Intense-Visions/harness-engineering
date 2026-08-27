---
slug: "typicality-triage-for-changes"
milestone: "v5.0 — Enforcement Hardening"
order: 129
---

### Route changes by how unusual they are

- **Status:** planned
- **Spec:** —
- **Summary:** Every gate treats every change as equally novel, which at high volume wastes verification depth on the thousandth routine change and under-spends it on the first weird one. Immune systems solve this with negative selection: learn the shape of "self," escalate what does not match. Build the software version: an inexpensive typicality model over the change stream — surfaces touched together, diff shape, size distribution, dependency deltas, authoring pattern — scoring each change against the repository's own history, with atypical changes routed to deeper verification tiers (more reviewers, full gate, human eyes) and typical ones to the cheap path. This is the dial that lets `verification-by-construction`'s tiered gate allocate its budget by information content rather than uniformly. Two constraints from the failure modes: novelty selects verification depth, never rejection (an unusual change is often the most valuable one); and the model must be periodically re-fit as the codebase's "self" legitimately drifts, or yesterday's architecture migration becomes permanently suspicious.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1561
