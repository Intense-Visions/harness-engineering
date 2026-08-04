---
slug: "lmlm-dashboard-direct-install-evict"
milestone: "Intake"
order: 3
---

### LMLM: dashboard direct install/evict (optional)

- **Status:** planned
- **Spec:** —
- **Summary:** Surfaced by the LMLM Phases 4–9 wiring PR (decision D-P8-2). The spec's Pool card listed "install/evict actions," but the dashboard Pool card shipped **read-only** because no HTTP install/evict route exists — Phase 7 (D-Q2) deliberately kept pool mutation to a single write path (proposal approve/reject + CLI) to avoid a duplicate write surface. Pool changes are fully doable today via the Recommendations card's approve/reject and the CLI. If direct one-click install/evict from the dashboard is wanted, it needs a new backend spec: HTTP install/evict routes on the live `PoolManager` with auth + the D10/S1 in-use guard, plus the reconciled write-path story. Low priority — the proposal-driven flow (D1 pool-bounded autonomy) is the intended model.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#999