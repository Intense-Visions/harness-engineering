---
slug: "reproduction-command-gate-in-harness-debugging"
milestone: "Intake"
order: 52
---

### Reproduction-command gate in harness-debugging

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. In harness-debugging, reproduction is Step 3 of INVESTIGATE (agents/skills/claude-code/harness-debugging/SKILL.md:94), after entropy analysis and error reading. Nothing requires a runnable artifact before hypothesizing. mattpocock's diagnosing-bugs makes it the core gate ("Build the right feedback loop, and the bug is 90% fixed"; "No red-capable command, no Phase 2"): a single command, already run at least once, that is red on this bug, deterministic, fast, and agent-runnable. It ranks ten loop types from failing test to HITL script, and adds "tighten the loop" and "raise the reproduction rate" for non-deterministic bugs. Deliverables: (1) a FEEDBACK-LOOP gate before HYPOTHESIZE that records the repro command and its observed red output in the debug session (manage_state evidence), with an explicit escalation path when none can be built; (2) a sibling reference file (progressive disclosure, so the body does not grow) holding the ranked loop-type ladder, tightening techniques, and the non-determinism playbook; (3) a HITL loop script template for human-in-the-loop repros (KEY=VALUE capture output the agent can parse); (4) a rule that the regression test lands at a correct seam, and that a missing seam is reported as a finding; (5) bug-fleet's per-area hunt reuses the same gate artifact. Mirror across all four platform trees. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2244
