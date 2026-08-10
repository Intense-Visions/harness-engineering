---
slug: "preventive-over-build-ladder-constraint"
milestone: "Intake"
order: 35
---

### Preventive over-build ladder constraint

- **Status:** planned
- **Spec:** —
- **Summary:** Add a preventive simplicity constraint that fires BEFORE code is written, closing a real gap: `harness:code-craft` already asks whether each abstraction earns its keep and whether code is as simple as it could be, but it is post-hoc critique on an existing diff. Mechanism adopted from `DietrichGebert/ponytail` (99.4k stars, MIT): a seven-rung ladder stopped at the first rung that holds — YAGNI, already in this codebase, standard library, native platform feature, installed dependency, one-liner, then minimum code that works — with the ladder running only after the problem is understood and the real flow traced. Also worth taking: root-cause-over-symptom (fix the shared function once rather than per-caller), and marking deliberate corner-cuts with a comment naming the ceiling and upgrade path. Must resolve authority against `code-craft` so an always-loaded rule and a craft skill cannot give contradictory guidance on the same diff. Adopt on mechanism, not evidence: ponytail's ~22% token / ~27% speed claims are self-measured, n=4, Haiku 4.5 only, on FastAPI+React repos. Serves the Ceiling-raising track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 4.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1275
