---
'@harness-engineering/graph': patch
---

Fix `GraphComplexityAdapter` change frequency so complexity hotspots measure real git churn (#2022). It previously counted inbound `references` edges (diagram/Slack/Figma doc links), while `GitIngestor` records commits as `triggered_by` edges from the file to the commit, so `hotspotScore` was structurally 0 on any repo with only git history. It now counts distinct commits touching the file, and the result carries an additive `changeFrequencyMeasured` flag that is `false` when no git history was ingested, so a 0 reads as "not measured" rather than "no churn". `ConflictPredictor` no longer labels a file "high-churn" when churn was not measured or is 0.
