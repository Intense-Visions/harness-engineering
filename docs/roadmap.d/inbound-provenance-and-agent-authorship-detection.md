---
slug: "inbound-provenance-and-agent-authorship-detection"
milestone: "v5.0 — Trust & Security Model"
order: 118
---

### Provenance across the trust boundary

- **Status:** planned
- **Spec:** —
- **Summary:** `emit-provenance-trailer-from-agent-commits` makes internally produced agent work self-declaring. External contributors do not run the harness, so inbound work carries whatever provenance its author chose — usually none. As agent-assisted contribution becomes common, a project receiving hundreds of pull requests a day cannot distinguish a reviewed human change from unreviewed machine output, and the tier distinction that governs internal gate selection is unavailable at exactly the boundary where trust matters most. Build both halves: a declared, verifiable provenance convention contributors can opt into (and that `contributor-trust-tiering` can reward with lighter gates and faster CI), plus heuristic detection for undeclared agent authorship used only to *select verification depth*, never to reject a contribution or judge a contributor. State that constraint in the design: a false positive that gates a change harder is acceptable, and one that closes a change is not.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits` and `contributor-trust-tiering`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1550
