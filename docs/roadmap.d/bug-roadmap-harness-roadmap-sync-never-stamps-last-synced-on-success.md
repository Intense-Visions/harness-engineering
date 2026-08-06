---
slug: "bug-roadmap-harness-roadmap-sync-never-stamps-last-synced-on-success"
milestone: "Intake"
order: 31
---

### bug(roadmap): harness roadmap sync never stamps last_synced on success

- **Status:** done
- **Spec:** .changeset/roadmap-writeback-slug-fix.md
- **Summary:** `fullSync` (packages/core/src/roadmap/sync-engine.ts) pushes, pulls, and writes back changed rows, but never sets `roadmap.frontmatter.lastSynced`. Because `applyRoadmapDiff` only writes frontmatter when it differs, a successful `harness roadmap sync --apply` leaves `_meta.md`'s `last_synced` untouched — so the field stays stale even though a sync just completed. This is the exact "`last_synced` 22 days behind `last_manual_edit`" symptom the sync command's own docstring cites as its reason for existing, and it undermines the human-always-wins staleness heuristic and any observability keyed on last_synced. Confirmed live 2026-08-04: `--apply` reported 104 patches / 0 errors yet `last_synced` remained at the pre-run value (manually corrected afterward). **Fix:** stamp `frontmatter.lastSynced = now` in `fullSync` before writeback (guard against `Date.now()` in test seams as elsewhere), and cover it with a test asserting last_synced advances on a no-op-diff successful sync.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1037