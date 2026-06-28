---
slug: "ship-golden-build-reference-state-primitive"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 6
---

### Ship golden-build reference-state primitive

- **Status:** planned
- **Spec:** —
- **Summary:** The "Anatomy of an AI-Native Org" companion article lists four required gear pieces: "specifications, evaluation suites, golden builds, and agent-review patterns." The project has the first, partial second, fourth — but no golden build primitive. The existing baselines (`coverage-baselines.json`, `benchmark-baselines.json`, arch baselines) are **metric baselines, not build baselines**. A golden build is the canonical known-good reference state (last passing main with a full eval pass) that all proposed changes are validated against — closer to an immutable release-tag concept than a metric snapshot. Ship: (a) `harness golden-build promote` command that snapshots a verified-passing state to `.harness/golden/`, (b) `harness golden-build verify` that compares the working tree against the most recent golden, (c) CI integration that auto-promotes a golden build on every green main merge, (d) `harness golden-build diff` for reviewing what's drifted since the last golden. Closes the gap between "metrics didn't regress" and "the project as a whole is still the project we trust." Source: Pass 8 (Anatomy of AI-Native Org companion article).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#567
