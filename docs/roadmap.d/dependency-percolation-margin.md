---
slug: "dependency-percolation-margin"
milestone: "v3.0 Graph Intelligence"
order: 6
---

### Percolation margin — the global structural safety threshold of the dependency graph

- **Status:** planned
- **Spec:** —
- **Summary:** Percolation theory has a sharp result: on a graph, below a critical connectivity a failure stays in a small component; above it, a giant connected component exists and one failure can reach most of the system — and the transition is abrupt, not gradual. Blast-radius analysis (existing) is per-change; percolation is the *global* complement: how close is the dependency graph, as a whole, to the threshold where any single defect percolates? Compute bond percolation on the import/dependency graph (edges weighted by coupling strength and failure-transmission likelihood), report the distance-to-threshold as a standing safety margin, and — the actionable half — rank the specific edges whose removal most increases the margin (high-betweenness bridges between clusters). Refactoring stops being taste: 'these three edges keep us subcritical' is a targeting statement with a number attached, and the margin trend over time is an early-warning indicator that coupling growth is approaching the cliff — which matters at generation scale because agents add edges faster than humans ever did, and a sharp-threshold property is exactly the kind of thing that goes unnoticed until it is crossed.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1608
