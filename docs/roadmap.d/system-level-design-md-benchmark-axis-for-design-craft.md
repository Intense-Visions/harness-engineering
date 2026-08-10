---
slug: "system-level-design-md-benchmark-axis-for-design-craft"
milestone: "Intake"
order: 33
---

### System-level DESIGN.md benchmark axis for design-craft

- **Status:** planned
- **Spec:** —
- **Summary:** Add a whole-system design-language benchmark axis to `harness:design-craft` BENCHMARK, seeded from the 73 real-world `DESIGN.md` files in `VoltAgent/awesome-design-md` (107.5k stars, MIT — corpus is free to use). This is NOT corpus expansion: the existing `catalog/exemplars/` holds 50 **component-level** exemplars (EmptyState, LoadingState, ErrorState, Modal, Button — 10 each) carrying reference markup and per-exemplar reference scores that feed the machine-computed `awardBar` (dimensionFloor 80, fraction 0.95). The awesome-design-md files are whole design languages with no component markup and no reference scores, so dropping them into the existing corpus would leave `awardBar` with nothing to compute and silently return `indeterminate`. Scope as a second, differently-shaped axis with its own scoring contract, keeping the existing 5-dim radar (philosophicalCoherence, hierarchy, craftExecution, function, innovation) for component-level work. Serves the Ceiling-raising via LLM judgment track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 6.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1273
