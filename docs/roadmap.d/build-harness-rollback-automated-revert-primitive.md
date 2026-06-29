---
slug: "build-harness-rollback-automated-revert-primitive"
milestone: "v5.0 — Enforcement Hardening"
order: 6
---

### Build harness:rollback automated-revert primitive

- **Status:** planned
- **Spec:** —
- **Summary:** When a shipped PR fails post-merge eval (harness:outcome-eval) or triggers a defined signal threshold, automatically open a revert PR with full context. The article's "circuit breaker / automated rollback — a mechanism that physically stops the fall before it hits the ground." Currently the project has no automated rollback primitive — only human-mediated PR review. Needs a "revert ready" classification system and a trust model for auto-merging reverts. Source: Pass 2 #7.
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#533
