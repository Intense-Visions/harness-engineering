---
slug: "irt-capability-difficulty-model"
milestone: "Fleet Family — Batch Orchestration"
order: 143
---

### Item-response model — joint task-difficulty and agent-ability estimation

- **Status:** planned
- **Spec:** —
- **Summary:** Psychometrics solved a problem routing now has: you cannot grade test-takers without knowing question difficulty, or calibrate questions without knowing taker ability — item response theory estimates both jointly on one latent scale from outcome data alone, yielding per-(taker, item) success probabilities. Routing today uses folklore equivalents: model tiers assumed ordered, task difficulty guessed from labels, success rates confounded by who attempted what (a model that only gets hard tasks looks bad). Fit an IRT model over the outcome history: tasks as items (difficulty, discrimination), agent/model configurations as takers (ability), outcomes as responses — producing calibrated success probabilities per (configuration, task) pair on a common scale. The consequences are immediately load-bearing: routing sends work where predicted success crosses threshold at least cost; the difficulty scale prices tasks for decomposition (an item too hard for every configuration must be split); ability drift over model updates is measurable on a stable scale (feeding the sentinel); and the confounding that poisons naive success rates is handled by construction, because difficulty and ability are estimated jointly. Guard: refit cadence and identifiability checks (sparse response matrices need anchoring items) are part of the deliverable, not an afterthought.
- **Blockers:** Depends on `bandit-allocation-with-sequential-stopping`, `model-update-regression-sentinel`, and `unattended-work-decomposition`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1657
