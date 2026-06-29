---
slug: "shard-the-roadmap-into-per-row-files-with-a-generated-aggregate-view"
milestone: "Intake"
order: 0
---

### Shard the roadmap into per-row files with a generated aggregate view

- **Status:** done
- **Spec:** docs/changes/roadmap-shard-store/proposal.md
- **Summary:** Shard docs/roadmap.md into per-row docs/roadmap.d/<slug>.md files (the sole authoritative source) with a generated merge=ours aggregate view, eliminating branch/worktree/PR contention by construction. A RoadmapStore abstraction lets sharded and monolith modes coexist (new projects sharded by default; existing adopters migrate via reversible `harness roadmap shard`). The conflict-free single-shard writeback unlocks auto-done on PR merge via a CI Action plus a `harness roadmap reconcile` fallback, keyed off the External-ID each row already carries. Invariant R: only the regenerator reads roadmap.md; all tools read the shard directory.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** —
- **Updated-At:** 2026-06-27T00:00:00.000Z
