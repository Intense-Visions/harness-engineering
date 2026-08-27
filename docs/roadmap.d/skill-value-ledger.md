---
slug: "skill-value-ledger"
milestone: "v5.0 — Catalog Rationalization"
order: 10
---

### Skill P&L — measured realized value per skill and gate

- **Status:** planned
- **Spec:** —
- **Summary:** The catalog is curated by opinion: skills and gates enter by being written and leave rarely, and nothing measures whether an entry earns its context cost. Give every catalog entry a P&L: invocations, downstream outcome deltas (did runs that used it succeed/land/avoid rework at a different rate than matched runs that didn't), and cost (tokens, latency, human interruptions). Rank the catalog by realized value; flag entries whose measured value is indistinguishable from zero for deprecation review; and let dispatch/recommendation weight by the ledger instead of by description quality. Attribution is the hard part and must be honest: most invocations are confounded, so the ledger reports effect estimates with uncertainty (matched comparison or the observational-causal toolkit), and 'insufficient evidence' is a first-class verdict — an entry is deprecated for measured worthlessness, never for measurement absence. This is the economics layer on top of catalog metadata tiering: metadata says what an entry claims to be; the ledger says what it demonstrably does.
- **Blockers:** Depends on `value-per-spend-routing`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1621
