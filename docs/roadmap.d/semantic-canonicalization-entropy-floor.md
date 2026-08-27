---
slug: "semantic-canonicalization-entropy-floor"
milestone: "v5.0 — Enforcement Hardening"
order: 136
---

### Semantic canonicalization — an entropy floor for generated artifacts

- **Status:** planned
- **Spec:** —
- **Summary:** Formatters ended formatting debates by making one canonical form mechanical; generated code re-opens the entropy at a deeper level — equivalent logic arrives in gratuitously different shapes (member ordering, import structure, naming patterns, error-handling idioms, test scaffolding), and every downstream system pays for the variance. Push canonicalization one level past formatting: define canonical forms for the semantic-shape choices that don't carry meaning (declaration ordering rules, structural idioms, naming patterns per construct class), enforce them mechanically at generation time and in the gate stack, and let every downstream consumer collect the dividend — diffs shrink to intent, clone detection sharpens (idiom epidemiology depends on it), context dictionaries train better, dedup and caching improve, and review attention lands on meaning instead of shape. Compression theory 101: canonicalize before you compress — variance that carries no information is pure cost everywhere it flows. Scope honestly: only choices that are semantically free get canonicalized; anything where shape carries meaning stays untouched, and the rule catalog is versioned so canon changes are migrations, not churn.
- **Blockers:** Depends on `idiom-contagion-epidemiology` and `trained-context-dictionaries`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1646
