---
slug: "value-per-spend-routing"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 110
---

### Route by value per unit spend, not cost per change

- **Status:** planned
- **Spec:** —
- **Summary:** `cost-per-merged-pr-attribution` makes spend visible per change, and `adaptive-model-routing` picks the cheapest capable backend for a given task. Neither asks whether the work was worth doing. Once compute is a material line item rather than a personal quota, the governing question stops being "what did this change cost" and becomes "what did this outcome return" — and the harness needs the ability to decline work whose expected value does not justify its spend. Build on `outcome-eval`, which already gates spec satisfaction: attribute spend to *intents* and join it to realised outcome signal, expose expected-value estimates at selection time so `roadmap-pilot` and the fleet SELECT phases can rank on return rather than effort, and make declining an item on economic grounds a first-class, logged decision. The failure mode this prevents is specific and cheap to fall into: driving cost per change down while raising total spend on work nobody needed.
- **Blockers:** Depends on `cost-per-merged-pr-attribution` and `intent-as-the-unit-of-record`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1542
