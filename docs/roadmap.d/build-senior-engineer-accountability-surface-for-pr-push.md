---
slug: "build-senior-engineer-accountability-surface-for-pr-push"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 8
---

### Build senior-engineer accountability surface for PR push

- **Status:** done
- **Spec:** docs/changes/senior-accountability-surface/proposal.md
- **Summary:** "The Tests We Skipped" companion article: _"the person who writes the code is the person who pushes it to production. Full stop."_ In the agent-shipping flow, the agent writes; the senior engineer pushes (merges). The accountability does not transfer to the agent — it stays with the human who clicks merge. The project today does not produce a senior-facing "you are pushing X; here's what you should look at before approving" surface. Build: (a) `harness:pre-merge-brief` skill that produces a senior-facing digest on every PR with the diff summary, multi-persona review verdict, outcome-eval result (when available), signal-deltas, and a "things specifically worth your eyes" section, (b) GitHub Action that posts this as a PR comment, (c) optional gating that the merge button requires the senior to acknowledge the brief. Closes the "harness for the human too" mandate Ajey states explicitly. The same gear that protects the agent also protects the senior who's accountable. Source: Pass 8 (The Tests We Skipped companion article).
- **Blockers:** Build harness:outcome-eval skill, Ship the 5-signal dashboard panel and signals.md doc
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#569
