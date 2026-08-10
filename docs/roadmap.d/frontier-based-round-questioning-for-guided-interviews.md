---
slug: "frontier-based-round-questioning-for-guided-interviews"
milestone: "Intake"
order: 36
---

### Frontier-based round questioning for guided interviews

- **Status:** planned
- **Spec:** —
- **Summary:** Adopt frontier/round-based questioning as a shared interview primitive across `harness:product-advisor`, `harness:product-requirements`, `harness:strategy` and `harness:pulse`, which today all interview strictly one question at a time. Mechanism from `mattpocock/skills` `grilling` (211.2k stars, MIT): model the subject as a design tree of decisions; the frontier is the set of decisions whose prerequisites are all settled; each round asks the whole frontier and nothing else, so no answer within a round can invalidate another question in it. Cited effect ~13 questions in ~3 rounds. The highest-value half is the **facts-vs-decisions split** — the skill dispatches sub-agents to settle questions the environment can answer and blocks only on genuine human decisions — which harness's interviews do not do at all. Constraints: one-at-a-time must remain a supported opt-out rather than a regression (the source concedes the round design is "genuinely contested" and that some users read better sequentially), and the frontier is model judgment rather than a computed graph, so mis-grouped questions need a reopen path. Complements the shipped Question-File Interview Mode (#582), which addressed durability/async capture rather than round structure. Serves the Full-lifecycle reach track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.75).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1276
