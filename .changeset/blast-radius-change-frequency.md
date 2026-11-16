---
'@harness-engineering/graph': patch
---

`compute_blast_radius` now weights cascade edges by the target file's change frequency. `CascadeSimulator` always built `CompositeProbabilityStrategy` with empty change-frequency and coupling maps, so the documented 30% change-frequency signal never contributed. The default strategy now counts the commits `GitIngestor` records per file (shared with `GraphComplexityAdapter`) and max-normalizes them to 0..1. Graphs with no ingested git history keep the previous edge-type-only weights. Coupling stays unweighted pending a design decision (#2545).
