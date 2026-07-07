---
slug: "extend-skill-effectiveness-scorer-to-skill-grain-not-just-personas"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 1
---

### Extend skill-effectiveness scorer to skill grain (not just personas)

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/intelligence/src/effectiveness/scorer.ts` currently scores personas using graph-attributed `execution_outcome` nodes. Extend the same Bayesian approach to score skills using `.harness/metrics/adoption.jsonl` data (skill+outcome+duration+phasesReached). Identify failing skills and skills abandoned mid-workflow. Feed into `harness:catalog-retrospective`. Closes the gap: the project has 1319 adoption records but no loop that uses them to improve the catalog. Source: Pass 5 #4.
- **Blockers:** Build harness:catalog-retrospective skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#550
