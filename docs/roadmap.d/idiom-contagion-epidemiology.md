---
slug: "idiom-contagion-epidemiology"
milestone: "v5.0 — Enforcement Hardening"
order: 133
---

### Idiom contagion — epidemiology for code patterns (R0, tracing, ring vaccination)

- **Status:** planned
- **Spec:** —
- **Summary:** Agents write code by copying the surrounding codebase: the codebase is the few-shot prompt for its own future, so every idiom in it has a reproduction number. Define and measure R0 per idiom — the average number of new sites an existing site spawns per window — from clone/similarity detection joined with commit provenance (which files were in context when the new site was written gives the transmission path: contact tracing). The epidemiological threshold does real work here: if a bad idiom's R0 > 1, fixing instances is mathematically futile — the fix rate must exceed the spawn rate forever. The correct intervention is ring vaccination: identify the high-centrality exemplar files agents most often read and copy from, fix the idiom there first, and quarantine the pattern at the source with a generated lint rule so new transmission stops. Symmetrically, R0 measurement identifies which *good* idioms spread on their own and which need seeding. Nobody treats exemplar health as the dominant quality lever; at generation scale it provably is, because the marginal author is a copier by construction.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1612
