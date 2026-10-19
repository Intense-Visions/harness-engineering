---
slug: "seam-negotiation-in-harness-tdd"
milestone: "Intake"
order: 55
---

### Seam negotiation in harness-tdd

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. harness-tdd (agents/skills/claude-code/harness-tdd/SKILL.md) never mentions seams: nothing records which boundaries are tested before RED, so tests drift toward implementation-coupled or tautological assertions. mattpocock's tdd [UNVERIFIED]: "Test only at pre-agreed seams. Before writing any test, write down the seams under test and confirm them with the user", with a one-line "what it catches and what it misses" for each seam. It also names three anti-patterns (implementation-coupled, tautological, horizontal slicing) and keeps refactoring out of the red-green loop, leaving it to review. Deliverables: (1) a SEAMS step before the first RED that writes the seam list with catch/miss lines; in interactive mode it is confirmed with the human, in autonomous/autopilot mode it is recorded as a decision in session state and surfaced at the plan checkpoint, not blocking; (2) a sibling reference file with good-test vs bad-test examples and mocking guidance (only at system boundaries), so the body doesn't grow; (3) test-craft reuses the seam vocabulary in its critique; (4) harness-planning tasks may carry their declared seams so execution doesn't re-derive them. Keep consistent with the canary test-authoring agents' conventions. Mirror across all four platform trees. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2245
