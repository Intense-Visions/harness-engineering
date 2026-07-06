---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(adoption): add `harness:catalog-retrospective` skill and `harness adoption retrospective` command. Reads `.harness/metrics/adoption.jsonl` and reports top-invoked, top-failing, and abandoned-mid-workflow skills, flags ever-invoked stale skills, and surfaces catalog telemetry coverage, writing a dated report to `docs/retrospectives/<date>.md`. Core adds `getCatalogRetrospectiveReport` / `renderRetrospectiveMarkdown` / `isAbandonedMidWorkflow`.
