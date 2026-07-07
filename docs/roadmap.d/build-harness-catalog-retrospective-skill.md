---
slug: "build-harness-catalog-retrospective-skill"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 0
---

### Build harness:catalog-retrospective skill

- **Status:** done
- **Spec:** —
- **Summary:** Monthly retrospective that reads `.harness/metrics/adoption.jsonl` (1319 records in dogfood across 80+ days, captures skill+session+startedAt+duration+outcome+phasesReached) and produces a structured report: top-10-most-invoked, top-10-failing, top-10-abandoned-mid-workflow, skills inactive 90+ days. Compounding-via-learning at the catalog grain — the loop the article calls Honnold's "internal harness" applied to the skill catalog. Feeds into catalog cleanup items below. Source: Pass 5 #6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#536
