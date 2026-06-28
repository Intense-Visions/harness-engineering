---
slug: "craft-pipeline-sub-project-4-code-craft"
milestone: "Craft Pipeline"
order: 2
---

### craft-pipeline sub-project #4: code-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for code quality / readability — the ceiling counterpart to harness-entropy-cleaner (dead code, drift), harness-architecture-enforcer (boundaries, deps), complexity thresholds (cyclomatic, cognitive). Ceiling questions: is this code as simple as it could be? does this function tell a story? is this abstraction earned or premature? are these conditionals load-bearing or accidental? is there an obvious-in-retrospect simplification? does the code reveal intent? Possibly the largest-scope craft skill — touches every PR. Follows ADRs 0018-0021. Has overlap with #1 naming-craft (defers naming-specific findings) and #2 docs-craft (defers doc-comment findings). Exemplars: well-cited "good code" from notable codebases (Linear's, Stripe's open work, Vercel's, Anthropic's SDK code).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#379
