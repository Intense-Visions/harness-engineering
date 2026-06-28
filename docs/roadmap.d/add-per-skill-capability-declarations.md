---
slug: "add-per-skill-capability-declarations"
milestone: "v5.0 — Trust & Security Model"
order: 2
---

### Add per-skill capability declarations

- **Status:** planned
- **Spec:** —
- **Summary:** Skills are markdown files; the agent reads them and may take any action the user permitted Claude Code. No skill manifest declares "this skill needs Bash + Edit + WebFetch and nothing else." Add a `capabilities:` manifest field to skill.yaml declaring tool/network/file requirements. The orchestrator/agent enforces it as bounds. Closes the article's gear #4 ("bounded, observable, reversible") at the skill grain — currently it only applies at the orchestrator-workspace grain, and only when the daemon is running. Source: Pass 6 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#558
