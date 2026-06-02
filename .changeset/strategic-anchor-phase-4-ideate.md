---
'@harness-engineering/cli': patch
---

Add `harness-ideate` pre-brainstorm ideation skill across all 4 platforms (claude-code, cursor, codex, gemini-cli). The skill generates ranked candidate ideas grounded in `STRATEGY.md` (when present) and writes a single artifact to `docs/ideation/<slug>-YYYY-MM-DD.md`. Ranking formula: `(impact × confidence) ÷ effort` with the 1/2/3 mapping; strategy-alignment bonus (max +0.75) applied only as a bounded tiebreaker when adjacent base scores differ by ≤ 0.05 — mirrors the `harness-roadmap-pilot` tiebreaker shape. Wires the strategic-anchor flow into init (`initialize-harness-project` Phase 3 step 5c, yes/no/later prompt), brainstorming (Phase 1 step 0a STRATEGY.md grounding + Phase 2 EVALUATE contradiction handling), and roadmap-pilot (Phase 2 step 1a strategy-alignment tiebreaker). Phases 7 (knowledge graph) and 8 (ADRs + AGENTS.md) of the strategic-anchor spec ship in follow-up PRs.
