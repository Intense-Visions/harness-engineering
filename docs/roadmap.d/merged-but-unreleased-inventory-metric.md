---
slug: "merged-but-unreleased-inventory-metric"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 94
---

### Track merged-but-unreleased inventory as a first-class metric

- **Status:** planned
- **Spec:** —
- **Summary:** A dogfood consumer with **1,132 merged pull requests has 0 GitHub releases and 0 tags**, alongside **138 pending changesets** — every one an unshipped unit of declared change. The release pipeline is configured and active (`release.yml`, plus several per-target deploy workflows) and 30 deployments exist across preview and production environments, so this is not a broken pipeline but an unmeasured one: merge throughput rose without release throughput following, and nothing in the harness noticed. Merged is not shipped, and a throughput claim built on merge counts is inflated by exactly this gap. Build: pending-changeset count and age, merged-but-unreleased PR count, and time-from-merge-to-release as tracked signals per surface, with a threshold that warns when inventory outgrows release cadence. Cheap to compute, and it converts a silent accumulation into a visible one.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1526
