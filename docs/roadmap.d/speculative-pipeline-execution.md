---
slug: "speculative-pipeline-execution"
milestone: "Fleet Family — Batch Orchestration"
order: 140
---

### Speculative pipeline execution — branch prediction on human decisions

- **Status:** planned
- **Spec:** —
- **Summary:** CPUs are fast because branch predictors exploit the predictability of code: predict the branch, execute speculatively, squash cheaply on mispredict — and misprediction is safe because speculation never retires architectural state. Human decision points in the pipeline (approvals, batch confirmations, priority picks) are the stalls of this system, and they are predictable: the typicality work already implies most approvals are foregone conclusions. Build the speculative executor: predict the human's decision per decision-class from history, begin the next pipeline stage speculatively in isolation (worktree/sandbox — speculation never retires: no push, no merge, no external effect), and on the actual decision either commit the pre-built work (latency hidden) or squash it (bounded waste). Track prediction accuracy per decision-class as a first-class metric with two payoffs: latency hiding where predictions are good, and — the more interesting one — an evidence-based promotion path: a decision class predicted correctly at 99%+ over a large sample is a documented candidate for policy-level auto-approval, converting 'can we automate this gate?' from argument into measurement. Budget-bound the speculation (it consumes real compute) and never speculate past irreversible or externally-visible actions.
- **Blockers:** Depends on `policy-level-human-control` and `typicality-triage-for-changes`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1622
