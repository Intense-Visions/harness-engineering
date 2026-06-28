---
slug: "craft-pipeline-sub-project-8-cli-ergonomics"
milestone: "Craft Pipeline"
order: 4
---

### craft-pipeline sub-project #8: cli-ergonomics

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for CLI quality — for projects that ship CLIs (including harness itself). NO rule-based floor counterpart. Ceiling questions: does this CLI discover itself? are flag names consistent across subcommands? is help text earning its space or just listing flags? does the output respect the user's terminal (width, color, structure)? does the error path teach what to do next? would a power-user pipe this output to grep/awk and get useful results? would a beginner not piping anywhere understand what happened? Follows ADRs 0018-0021. Exemplars: gh, fly, rg, eza, fd, bun, Linear CLI, the Stripe CLI, mise.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#383
