---
slug: "skill-md-instruction-density-check"
milestone: "Planning & Process"
order: 10
---

### SKILL.md Instruction-Density Check

- **Status:** backlog
- **Spec:** —
- **Summary:** HumanLayer's own RPI→CRISPY postmortem found their planning prompts exceeded a ~150-200 instruction-follow budget frontier models reliably honor — the specific failure that forced a full workflow rebuild. harness-autopilot and harness-brainstorming SKILL.md bodies run 300-470+ lines each; the progressive-disclosure packing already observed in run_skill output (context-budget levels, partial section loading) is promising evidence this repo doesn't share RPI's failure mode, but it has never been confirmed with a measured instruction count the way HumanLayer did after getting burned. Add an instruction-density estimate per loaded packing level to skill-authoring guidance and/or harness validate. Adapted from HumanLayer's RPI→CRISPY postmortem. Adoption #2 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-2]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1404
