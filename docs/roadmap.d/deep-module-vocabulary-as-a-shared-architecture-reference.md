---
slug: "deep-module-vocabulary-as-a-shared-architecture-reference"
milestone: "Intake"
order: 56
---

### Deep-module vocabulary as a shared architecture reference

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 2 of ADR-0133. Harness enforces layer boundaries mechanically (enforce-architecture, ESLint rules, baselines) but its tier-1/2 skills have no shared vocabulary for module *quality*: whether a module is deep (small interface, large hidden implementation) or shallow, where the seams are, and how much leverage and locality a change has. mattpocock's codebase-design defines one vocabulary (module, interface, depth, seam, adapter, leverage, locality), plus a "deletion test" (what breaks if this module is deleted? if nothing meaningful, it is shallow) and a "design it twice" exercise. tdd and improve-codebase-architecture both reuse it. Deliverables: (1) a single shared reference document (location decided in brainstorming: a knowledge doc under docs/knowledge/ ingested into the graph, so skills point at one source of truth instead of copying it); (2) pointers from architecture-advisor, harness-refactoring, code-craft, hotspot-detector remediation and the seams step in harness-tdd; (3) evaluate a mechanical depth signal (e.g. exported-surface vs implementation-size ratio per module from the code graph), reported in codebase-health-analyst or entropy as advisory, never blocking until proven; (4) code-craft rubric entries citing the vocabulary. Serves the Ceiling-raising track. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2248
