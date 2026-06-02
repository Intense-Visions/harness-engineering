---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add review depth calibration + adversarial / framework-aware reviewers to `harness-code-review`. New `Phase 3.5: CALIBRATE DEPTH` selects Quick / Standard / Deep from diff size and a canonical risk-keyword list, then dispatches three conditional subagents alongside the existing 4 base agents:

- `adversarial` — assumption violations, composition failures, abuse cases (and at Deep, cascade chains)
- `typescript-strict` — type holes that disable the checker, refactor regression, complexity growth
- `frontend-races` — lifecycle cleanup gaps, hook timing, concurrent interactions, stale-response races

`ReviewFinding` gains two optional additive fields: `subagent` (which subagent produced it) and a widened `confidence` union that accepts both the legacy `'high'|'medium'|'low'` and new numeric anchors `25|50|75|100`. Phase 6 dedup uses confidence as a tiebreaker when severity ties. New `--depth quick|standard|deep` CLI/MCP flag overrides calibration. Reference files: `references/confidence-rubric.md`, `references/risk-keywords.md`. ADR-0034.
