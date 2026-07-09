---
slug: "speed-up-the-entropy-cleanup-maintenance-check-165s-sweep-long-pole"
milestone: "Maintenance: Lint & Deps"
order: 10
---

### Speed up the entropy/cleanup maintenance check (~165s sweep long-pole)

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from the on-demand maintenance pipeline (#687). **Problem:** the `entropy` maintenance task runs `cleanup` (all entropy types), which takes ~165s on this monorepo — the long pole of `harness maintenance run --all`. It fits within the 300s per-check budget but dominates sweep wall-clock. **Proposal:** profile/optimize `cleanup` / entropy detection (incremental scan, caching, or scoping). Pre-existing command perf, not introduced by #687. **Workaround today:** `harness maintenance run --skip entropy`, and it only runs weekly on the cron schedule.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#692
