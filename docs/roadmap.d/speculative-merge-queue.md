---
slug: "speculative-merge-queue"
milestone: "Fleet Family — Batch Orchestration"
order: 141
---

### Speculative merge queue with batch bisection

- **Status:** planned
- **Spec:** —
- **Summary:** Every high-throughput engineering organisation lands changes through an optimistic merge queue — changes are tested in speculative batches against the projected future state of the trunk, batches that pass land atomically, and failures bisect to the culprit — because serial land-and-verify caps landing throughput at (verification latency × queue depth) and pre-merge-only testing admits semantic conflicts between concurrently-green changes. Everything in the fleet family assumes landings scale; nothing on the roadmap provides the landing mechanism. Build or integrate the queue: speculative batching (test change-sets against trunk + everything queued ahead), batch bisection on failure (log-time culprit isolation), priority lanes honoring the admission controller's declared allocation, and hooks so the harness's own verdict machinery is the queue's gate rather than a second CI system. Prefer integrating the platform-native queue where one exists and wrapping it with harness verdicts; build the speculative layer only where the platform lacks it. This is the most glaring field-standard-elsewhere gap on the roadmap: the 1000x items raise how much can be produced; this is what lets it land.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1647
