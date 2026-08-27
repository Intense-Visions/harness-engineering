---
slug: "cross-boundary-collision-and-duplicate-detection"
milestone: "Parallel Execution & State"
order: 117
---

### Treat in-flight internal lanes and inbound contributions as one index

- **Status:** planned
- **Spec:** —
- **Summary:** `concurrent-change-coordination-at-scale` proposes region leases so internal lanes avoid collision. External contributors cannot participate in that protocol and should not have to — which produces two failures that only appear when both directions run at volume. First, **wasted contribution**: an internal lane rewrites a region an external pull request targets, and the contributor's work is invalidated by velocity they could not observe. On a project taking in hundreds of pull requests a day, that is a goodwill cost, not just a rework cost. Second, **duplicated effort**: an internal fleet generates a fix while a contributor submits the same fix, and neither queue knows about the other. Build: one index spanning in-flight internal lanes, the internal ranked queue and the inbound contribution queue; collision warnings surfaced to contributors *early* (ideally at issue-claim time, before they write anything); and duplicate detection that matches an inbound pull request against internal work-in-progress, not only against other inbound items.
- **Blockers:** Depends on `concurrent-change-coordination-at-scale` and `semantic-duplicate-detection-at-backlog-scale`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1549
