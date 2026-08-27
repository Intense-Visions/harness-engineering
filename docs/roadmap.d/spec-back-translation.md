---
slug: "spec-back-translation"
milestone: "v5.0 — Enforcement Hardening"
order: 140
---

### Back-translation — independent spec re-derivation from the finished implementation

- **Status:** planned
- **Spec:** —
- **Summary:** Translation quality control has a mechanism verification lacks: back-translation — an independent translator, blind to the source, translates the target text back, and diffing the back-translation against the original source exposes meaning drift that forward-checking misses, because the forward checker reads the target through the source's frame. The analog: after implementation, an independent agent — blind to the spec and to the author's context — derives from the finished artifact alone what it believes the spec must have been (behavior, constraints honored, edge cases handled, apparent intent), and that derived spec is diffed against the actual one. Divergences are precise findings: intent present in the spec but absent from the derived version was not implemented (or not legibly); behavior in the derived version absent from the spec is unrequested scope or an accident; constraints missing from the derivation were not made structural. This catches what tests and forward review structurally miss — tests check what the author thought to check, forward review reads the code through the spec's frame — and it doubles as a legibility gate: an implementation from which competent blind re-derivation cannot recover the intent will also defeat every future maintainer. Deference note: it is expensive, so tier policy reserves it for high-stakes work, per the standards-of-review economics.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1662
