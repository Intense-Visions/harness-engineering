---
slug: "lift-packages-cli-branch-coverage-above-the-article-s-bar"
milestone: "v5.0 — Enforcement Hardening"
order: 7
---

### Lift packages/cli branch coverage above the article's bar

- **Status:** planned
- **Spec:** —
- **Summary:** `coverage-baselines.json:14-19` — packages/cli currently 64.42% branches and 77.73% lines on the user-facing surface. The article: "if the team can't honestly say a green build is enough to push to production, the test suite isn't a harness — it's a comfort blanket." 64% branches on the CLI entry point doesn't pass that bar. Target ≥80% branches over the next quarter. Tighten the V8 variance tolerance for cli specifically (0.1% not 0.5%). Source: Pass 1 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#544
